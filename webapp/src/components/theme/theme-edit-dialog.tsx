'use client';

import { useCallback, useEffect, useState } from 'react';
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
  addSystemThemeStock,
  addThemeStock,
  createUserTheme,
  deleteUserTheme,
  excludeSystemThemeStock,
  hideSystemTheme,
  isThemeStockLimitError,
  removeThemeStock,
  updateSystemTheme,
  updateUserTheme,
} from '@/lib/theme-api';
import type { Market, ThemeStockMember, ThemeWithStats } from '@gh-radar/shared';

/**
 * ThemeEditDialog — UI-SPEC §S4 유저 테마 CRUD 모달 (shadcn Dialog).
 *
 * 진입 모드 (themeId 없음=지연 생성 / 있음=즉시 반영):
 *   - create: 새 테마. 이름·종목을 로컬로 구성 후 [생성] 클릭 시 createUserTheme → 종목 일괄 add.
 *   - fork:   시스템 테마 복사. 오픈 시 시스템 테마 이름·active 종목을 로컬 복제(DB 쓰기 없음) →
 *             [생성] 클릭 시 create 와 동일하게 유저 테마 생성 + 종목 일괄 add. (열자마자 생성 X)
 *   - edit:   기존 유저/시스템 테마. 이름 수정 + 종목 add/remove 즉시 반영 + [삭제]. system 은 admin RLS.
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

  // 시스템 테마 편집 모드 — add/remove/save/delete 핸들러가 시스템 전용 lib(manual_override/
  // hidden, RLS admin 게이트)로 분기. user 테마 경로(기존)와 구분. fork/create 는 항상 false.
  const isSystemEdit = mode.kind === 'edit' && mode.theme.isSystem;

  // 편집 중인 유저 테마 id — create 는 첫 저장 후 채워짐, edit/fork 는 즉시.
  const [themeId, setThemeId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [stocks, setStocks] = useState<StockChip[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { results, loading: searching } = useDebouncedSearch(query, 300);

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
      // fork = 시스템 테마 내용을 로컬로 복제(이름 + active 종목). 이 시점엔 DB 쓰기 없음 —
      // 사용자가 편집 후 '생성' 버튼을 눌렀을 때만 handleSave 가 유저 테마 생성 + 종목 일괄 추가.
      setThemeId(null);
      setName(mode.systemTheme.name);
      setStocks((mode.systemTheme.stocks ?? []).map(memberToChip));
    } else {
      setThemeId(null);
      setName('');
      setStocks([]);
    }
  }, [open, mode]);

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

  const handleAddStock = useCallback(
    async (chip: StockChip) => {
      if (!user) return;
      if (stocks.some((s) => s.code === chip.code)) {
        setQuery('');
        return;
      }
      // 아직 생성 전(create/fork): DB 쓰기 없이 로컬에서만 구성 — '생성' 시 일괄 반영.
      if (!themeId) {
        if (stocks.length >= 50) {
          setError(LIMIT_MESSAGE);
          return;
        }
        setStocks((prev) => [...prev, chip]);
        setQuery('');
        return;
      }
      // 기존 테마(편집): 즉시 반영.
      setBusy(true);
      setError(null);
      try {
        const supabase = createClient();
        if (isSystemEdit) {
          await addSystemThemeStock(supabase, themeId, chip.code);
        } else {
          await addThemeStock(supabase, themeId, chip.code);
        }
        const nextStocks = [...stocks, chip];
        setStocks(nextStocks);
        setQuery('');
        onSaved(buildOptimisticTheme(themeId, nextStocks));
      } catch (err) {
        setError(isThemeStockLimitError(err) ? LIMIT_MESSAGE : GENERIC_ERROR);
      } finally {
        setBusy(false);
      }
    },
    [user, stocks, themeId, onSaved, buildOptimisticTheme, isSystemEdit],
  );

  const handleRemoveStock = useCallback(
    async (code: string) => {
      if (!themeId || !user) {
        // 아직 생성 전(create/fork)인 경우 로컬에서만 제거 — '생성' 시 반영.
        setStocks((prev) => prev.filter((s) => s.code !== code));
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const supabase = createClient();
        if (isSystemEdit) {
          await excludeSystemThemeStock(supabase, themeId, code);
        } else {
          await removeThemeStock(supabase, themeId, code);
        }
        const nextStocks = stocks.filter((s) => s.code !== code);
        setStocks(nextStocks);
        onSaved(buildOptimisticTheme(themeId, nextStocks));
      } catch {
        setError(GENERIC_ERROR);
      } finally {
        setBusy(false);
      }
    },
    [themeId, user, stocks, onSaved, buildOptimisticTheme, isSystemEdit],
  );

  const handleSave = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (themeId) {
        // 기존 테마(편집): 이름만 갱신 — 종목은 add/remove 시 이미 즉시 반영됨.
        const patch = { name: name.trim() || '새 테마' };
        if (isSystemEdit) {
          await updateSystemTheme(supabase, themeId, patch);
        } else {
          await updateUserTheme(supabase, themeId, patch);
        }
        onSaved(buildOptimisticTheme(themeId, stocks));
      } else {
        // create/fork(지연 생성): '생성' 누른 이 시점에 유저 테마 생성 + 로컬 종목 일괄 추가.
        const newId = await createUserTheme(
          supabase,
          user.id,
          name.trim() || '새 테마',
        );
        // 재시도 시 중복 테마 생성 방지 — 생성 성공 후 즉시 id 고정.
        setThemeId(newId);
        for (const chip of stocks) {
          await addThemeStock(supabase, newId, chip.code);
        }
        onSaved(buildOptimisticTheme(newId, stocks));
      }
      onOpenChange(false);
    } catch (err) {
      if (isThemeStockLimitError(err)) {
        // 동일 P0001 — 테마수 초과 vs 종목수 초과를 message 로 구분(Plan 07 계약).
        const msg = (err as { message?: string }).message ?? '';
        setError(msg.includes('stock') ? LIMIT_MESSAGE : THEME_LIMIT_MESSAGE);
      } else {
        setError(GENERIC_ERROR);
      }
    } finally {
      setBusy(false);
    }
  }, [
    user,
    themeId,
    name,
    stocks,
    onSaved,
    onOpenChange,
    buildOptimisticTheme,
    isSystemEdit,
  ]);

  const handleDelete = useCallback(async () => {
    if (!themeId || !user) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (isSystemEdit) {
        // 시스템 테마 "삭제" = soft-delete(hidden). norm_key tombstone 유지로 worker 재생성 차단.
        await hideSystemTheme(supabase, themeId);
      } else {
        await deleteUserTheme(supabase, themeId);
      }
      onOpenChange(false);
      // 삭제는 onSaved(upsert) 대신 onDeleted(id) 로 — 부모가 목록에서 즉시 제거/라우팅.
      onDeleted?.(themeId);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }, [themeId, user, onOpenChange, onDeleted, isSystemEdit]);

  const titleText =
    mode.kind === 'edit'
      ? isSystemEdit
        ? '시스템 테마 편집'
        : '테마 편집'
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
            {themeId
              ? '테마 이름과 종목을 구성하세요. 변경은 즉시 저장됩니다.'
              : '테마 이름과 종목을 구성한 뒤 [생성]을 누르면 추가됩니다.'}
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
                  {isSystemEdit
                    ? `'${name}' 시스템 테마를 목록에서 숨길까요? worker 재동기화로 되살아나지 않습니다.`
                    : `테마 삭제: '${name}' 테마를 삭제할까요? 되돌릴 수 없습니다.`}
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
                {themeId ? '저장' : '생성'}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
