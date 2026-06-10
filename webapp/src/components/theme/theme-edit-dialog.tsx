'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-context';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { createClient } from '@/lib/supabase/client';
import {
  addThemeStock,
  createUserTheme,
  deleteUserTheme,
  forkSystemTheme,
  isThemeStockLimitError,
  removeThemeStock,
  updateUserTheme,
} from '@/lib/theme-api';
import type { Market, ThemeStockMember, ThemeWithStats } from '@gh-radar/shared';

/**
 * ThemeEditDialog — UI-SPEC §S4 유저 테마 CRUD 모달 (shadcn Dialog).
 *
 * 진입 모드:
 *   - create: 새 테마 (이름 + 종목 add). 저장 시 createUserTheme → 종목 add.
 *   - edit:   기존 유저 테마 (이름 수정 + 종목 add/remove 즉시 반영) + [삭제].
 *   - fork:   시스템 테마 복사 — forkSystemTheme 로 스냅샷 후 새 유저 테마 edit 모드로 전환.
 *
 * 종목 검색은 Phase 6 command(useDebouncedSearch) 재사용. 50-limit(P0001)은
 * isThemeStockLimitError 로 식별해 인라인 안내. 비로그인 시 로그인 유도.
 *
 * 모든 색/간격은 globals.css 토큰만. 데이터 변경 성공 시 onSaved(theme) 로 부모에
 * "현재 테마 스냅샷"을 넘겨 낙관적 갱신(즉시 반영) → 부모가 이어서 refresh 로 실 통계
 * reconcile. 삭제는 onDeleted(id) 로 구분 신호(부모가 목록에서 즉시 제거/라우팅).
 */

const LIMIT_MESSAGE = '테마당 종목은 최대 50개까지 추가할 수 있습니다.';
const THEME_LIMIT_MESSAGE = '테마는 최대 50개까지 만들 수 있습니다.';
const GENERIC_ERROR = '저장에 실패했습니다. 잠시 후 다시 시도해주세요.';

export type ThemeEditMode =
  | { kind: 'create' }
  | { kind: 'edit'; theme: ThemeWithStats }
  | { kind: 'fork'; systemTheme: ThemeWithStats };

export interface ThemeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ThemeEditMode;
  /**
   * 저장/생성/종목 변경 등 데이터 변경 후 호출 — 변경 직후의 유저 테마 스냅샷을 넘긴다.
   * 부모는 이 스냅샷으로 목록을 낙관적 갱신(즉시 반영)한 뒤 refresh 로 실 통계 reconcile.
   */
  onSaved: (theme: ThemeWithStats) => void;
  /**
   * 삭제 시 호출 — 삭제된 테마 id 를 넘긴다. 목록 부모는 즉시 제거(낙관적),
   * 상세 페이지 부모는 라우팅 처리(id 무시 가능).
   */
  onDeleted?: (id: string) => void;
}

interface StockChip {
  code: string;
  name: string;
  /** 검색 결과/멤버의 정확한 마켓 — 낙관적 렌더에서 KOSDAQ 오표기 방지(WR-F-02). */
  market: Market;
}

function memberToChip(m: ThemeStockMember): StockChip {
  return { code: m.code, name: m.name, market: m.market };
}

/** StockChip → ThemeStockMember (시세는 reconcile 전이라 0 폴백 — refresh 가 실값 채움). */
function chipToMember(chip: StockChip): ThemeStockMember {
  return {
    code: chip.code,
    name: chip.name,
    // 검색 결과의 정확한 market 유지 — 하드코딩 'KOSPI' 제거(WR-F-02).
    market: chip.market,
    price: 0,
    changeRate: 0,
    tradeAmount: 0,
    source: 'user',
  };
}

export function ThemeEditDialog({
  open,
  onOpenChange,
  mode,
  onSaved,
  onDeleted,
}: ThemeEditDialogProps) {
  const { user } = useAuth();

  // 편집 중인 유저 테마 id — create 는 첫 저장 후 채워짐, edit/fork 는 즉시.
  const [themeId, setThemeId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [stocks, setStocks] = useState<StockChip[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // fork 스냅샷 1회 실행 가드(WR-F-01) — onSaved 인라인 화살표가 부모 리렌더(폴링 setState)로
  // 매번 신원이 바뀌어도 fork effect 가 재실행되어 유저 테마/theme_stocks 가 중복 복사되는 것을 막는다.
  const forkStartedRef = useRef(false);

  const { results, loading: searching } = useDebouncedSearch(query, 300);

  // 모달이 닫히면 fork 가드 해제 — 다음 오픈 시 1회 fork 허용.
  useEffect(() => {
    if (!open) forkStartedRef.current = false;
  }, [open]);

  // 모달 오픈/모드 변경 시 초기화.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setQuery('');
    setConfirmDelete(false);
    if (mode.kind === 'edit') {
      setThemeId(mode.theme.id);
      setName(mode.theme.name);
      setStocks((mode.theme.stocks ?? []).map(memberToChip));
    } else if (mode.kind === 'fork') {
      // fork 는 오픈 시 비동기로 스냅샷 생성(아래 effect) — 임시로 시스템 테마 이름 표시.
      setThemeId(null);
      setName(mode.systemTheme.name);
      setStocks((mode.systemTheme.stocks ?? []).map(memberToChip));
    } else {
      setThemeId(null);
      setName('');
      setStocks([]);
    }
  }, [open, mode]);

  // fork: 오픈 즉시 스냅샷 생성 → 새 유저 테마 id 확보(이후 add/remove 가 즉시 반영).
  useEffect(() => {
    if (!open || mode.kind !== 'fork' || !user) return;
    // 1회 실행 가드(WR-F-01) — onSaved 신원 변경으로 effect 가 재실행돼도 중복 fork 차단.
    if (forkStartedRef.current) return;
    forkStartedRef.current = true;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const supabase = createClient();
        const newId = await forkSystemTheme(supabase, user.id, mode.systemTheme.id);
        if (cancelled) return;
        setThemeId(newId);
        // fork 스냅샷: 복사된 멤버 = 시스템 테마의 active 멤버(mode.systemTheme.stocks).
        // stocks state 가 아닌 mode 직접 참조 — 이 effect 는 open 시 1회만 (deps 에
        // stocks 미포함; add/remove 로 인한 재실행 방지).
        const forkedChips = (mode.systemTheme.stocks ?? []).map(memberToChip);
        onSaved({
          id: newId,
          name: mode.systemTheme.name,
          description: mode.systemTheme.description,
          isSystem: false,
          ownerId: user.id,
          sources: ['user'],
          top3AvgChangeRate: null,
          statsUpdatedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          stockCount: forkedChips.length,
          stocks: forkedChips.map(chipToMember),
        });
      } catch (err) {
        if (cancelled) return;
        setError(
          isThemeStockLimitError(err) ? THEME_LIMIT_MESSAGE : GENERIC_ERROR,
        );
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, user, onSaved]);

  /**
   * 변경 직후의 유저 테마 스냅샷을 구성한다(낙관적 갱신용). id·chips 를 명시 인자로 받아
   * setState 직후의 최신값을 정확히 반영(state 클로저 stale 회피). 통계(top3avg)는
   * null — 부모 refresh 가 실값으로 reconcile.
   */
  const buildOptimisticTheme = useCallback(
    (id: string, chips: StockChip[]): ThemeWithStats => {
      const now = new Date().toISOString();
      return {
        id,
        name: name.trim() || '새 테마',
        description: null,
        isSystem: false,
        ownerId: user?.id ?? null,
        sources: ['user'],
        top3AvgChangeRate: null,
        statsUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
        stockCount: chips.length,
        stocks: chips.map(chipToMember),
      };
    },
    [name, user],
  );

  const ensureThemeId = useCallback(async (): Promise<string | null> => {
    if (themeId) return themeId;
    if (!user) return null;
    const supabase = createClient();
    const trimmed = name.trim() || '새 테마';
    const newId = await createUserTheme(supabase, user.id, trimmed);
    setThemeId(newId);
    onSaved(buildOptimisticTheme(newId, stocks));
    return newId;
  }, [themeId, user, name, stocks, onSaved, buildOptimisticTheme]);

  const handleAddStock = useCallback(
    async (chip: StockChip) => {
      if (!user) return;
      if (stocks.some((s) => s.code === chip.code)) {
        setQuery('');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const id = await ensureThemeId();
        if (!id) return;
        const supabase = createClient();
        await addThemeStock(supabase, id, chip.code);
        const nextStocks = [...stocks, chip];
        setStocks(nextStocks);
        setQuery('');
        onSaved(buildOptimisticTheme(id, nextStocks));
      } catch (err) {
        setError(isThemeStockLimitError(err) ? LIMIT_MESSAGE : GENERIC_ERROR);
      } finally {
        setBusy(false);
      }
    },
    [user, stocks, ensureThemeId, onSaved, buildOptimisticTheme],
  );

  const handleRemoveStock = useCallback(
    async (code: string) => {
      if (!themeId || !user) {
        // 아직 생성 전(create)인 경우 로컬에서만 제거.
        setStocks((prev) => prev.filter((s) => s.code !== code));
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const supabase = createClient();
        await removeThemeStock(supabase, themeId, code);
        const nextStocks = stocks.filter((s) => s.code !== code);
        setStocks(nextStocks);
        onSaved(buildOptimisticTheme(themeId, nextStocks));
      } catch {
        setError(GENERIC_ERROR);
      } finally {
        setBusy(false);
      }
    },
    [themeId, user, stocks, onSaved, buildOptimisticTheme],
  );

  const handleSave = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (themeId) {
        await updateUserTheme(supabase, themeId, { name: name.trim() || '새 테마' });
        onSaved(buildOptimisticTheme(themeId, stocks));
      } else {
        // ensureThemeId 가 생성 직후 onSaved(스냅샷) 를 이미 발행 — 중복 호출 안 함.
        await ensureThemeId();
      }
      onOpenChange(false);
    } catch (err) {
      setError(isThemeStockLimitError(err) ? THEME_LIMIT_MESSAGE : GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }, [
    user,
    themeId,
    name,
    stocks,
    ensureThemeId,
    onSaved,
    onOpenChange,
    buildOptimisticTheme,
  ]);

  const handleDelete = useCallback(async () => {
    if (!themeId || !user) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      await deleteUserTheme(supabase, themeId);
      onOpenChange(false);
      // 삭제는 onSaved(upsert) 대신 onDeleted(id) 로 — 부모가 목록에서 즉시 제거/라우팅.
      onDeleted?.(themeId);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }, [themeId, user, onOpenChange, onDeleted]);

  const titleText =
    mode.kind === 'edit'
      ? '테마 편집'
      : mode.kind === 'fork'
        ? '시스템 테마 복사'
        : '새 테마 만들기';

  const canDelete = mode.kind === 'edit' && !!themeId;
  const trimmedQuery = query.trim();
  const showEmpty =
    !searching && trimmedQuery.length > 0 && results.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
          <DialogDescription>
            테마 이름과 종목을 구성하세요. 변경은 즉시 저장됩니다.
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <div
            role="alert"
            className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--muted)] p-4 text-[length:var(--t-sm)] text-[var(--muted-fg)]"
          >
            테마를 만들려면 로그인이 필요합니다.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* 테마 이름 */}
            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
                테마 이름
              </span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 내 급등관심"
                maxLength={60}
                disabled={busy}
              />
            </label>

            <Separator />

            {/* 종목 추가 (command 검색) */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
                종목 추가
              </span>
              <div className="overflow-hidden rounded-[var(--r)] border border-[var(--border)]">
                <Command shouldFilter={false}>
                  <CommandInput
                    value={query}
                    onValueChange={setQuery}
                    placeholder="종목명 또는 종목코드를 입력하세요"
                  />
                  {trimmedQuery.length > 0 && (
                    <CommandList>
                      {searching && (
                        <div className="px-3 py-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
                          검색 중…
                        </div>
                      )}
                      {showEmpty && (
                        <CommandEmpty>
                          &quot;{query}&quot; 에 해당하는 종목이 없습니다
                        </CommandEmpty>
                      )}
                      {results.length > 0 && (
                        <CommandGroup>
                          {results.map((s) => (
                            <CommandItem
                              key={s.code}
                              value={s.code}
                              onSelect={() =>
                                void handleAddStock({
                                  code: s.code,
                                  name: s.name,
                                  market: s.market,
                                })
                              }
                              className="flex items-center gap-3 px-3 py-2"
                            >
                              <span className="flex-1 text-[length:var(--t-sm)]">
                                {s.name}
                              </span>
                              <span className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                                {s.code}
                              </span>
                              <Badge variant="outline">{s.market}</Badge>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  )}
                </Command>
              </div>
            </div>

            {/* 현재 종목 리스트 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
                현재 종목 ({stocks.length})
              </span>
              {stocks.length === 0 ? (
                <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
                  아직 추가된 종목이 없습니다.
                </p>
              ) : (
                <ul className="m-0 flex max-h-40 list-none flex-col gap-1 overflow-y-auto p-0">
                  {stocks.map((s) => (
                    <li
                      key={s.code}
                      className="flex items-center justify-between gap-2 rounded-[var(--r-sm)] bg-[var(--muted)] px-3 py-1.5"
                    >
                      <span className="flex items-center gap-2 text-[length:var(--t-sm)]">
                        <span className="text-[var(--fg)]">{s.name}</span>
                        <span className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                          {s.code}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveStock(s.code)}
                        disabled={busy}
                        aria-label={`${s.name} 제거`}
                        className="inline-flex size-6 items-center justify-center rounded-[var(--r-sm)] text-[var(--muted-fg)] hover:text-[var(--destructive)]"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="text-[length:var(--t-sm)] text-[var(--destructive)]"
              >
                {error}
              </p>
            )}

            {/* 삭제 확인 */}
            {confirmDelete ? (
              <div className="flex flex-col gap-2 rounded-[var(--r)] border border-[color-mix(in_oklch,var(--destructive)_40%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] p-3">
                <p className="text-[length:var(--t-sm)] text-[var(--destructive)]">
                  테마 삭제: &apos;{name}&apos; 테마를 삭제할까요? 되돌릴 수 없습니다.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy}
                  >
                    취소
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleDelete()}
                    disabled={busy}
                  >
                    삭제
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {user && !confirmDelete && (
          <DialogFooter className="sm:justify-between">
            {canDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="text-[var(--destructive)]"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                삭제
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                저장
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
