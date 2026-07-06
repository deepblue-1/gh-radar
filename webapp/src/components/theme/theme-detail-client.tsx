'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Copy, Pencil, RefreshCw } from 'lucide-react';

import { ScannerCardList } from '@/components/scanner/scanner-card-list';
import { ScannerEmpty } from '@/components/scanner/scanner-empty';
import { ScannerError } from '@/components/scanner/scanner-error';
import { ScannerSkeleton } from '@/components/scanner/scanner-skeleton';
import { ScannerTable } from '@/components/scanner/scanner-table';
import { Button } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useIsThemeAdmin } from '@/hooks/use-is-theme-admin';
import { createClient } from '@/lib/supabase/client';
import {
  fetchMyThemeDetail,
  fetchSystemThemeDetail,
} from '@/lib/theme-api';
import { cn } from '@/lib/utils';
import type { StockWithProximity } from '@/lib/scanner-api';
import type { ThemeStockMember, ThemeWithStats } from '@gh-radar/shared';

import { ThemeEditDialog, type ThemeEditMode } from './theme-edit-dialog';
import { ThemeSourceBadges } from './theme-source-badge';

/**
 * ThemeDetailClient — UI-SPEC §S2 테마 상세.
 *
 * - 시스템 테마: Express fetchSystemThemeDetail (read-only). 유저 테마: Supabase
 *   fetchMyThemeDetail (RLS owner-only) — 시스템 404 시 폴백 조회.
 * - 헤더: 테마명 h1 + 출처 뱃지 + 종목수 + 상위3평균 + 뒤로가기. 유저 테마면 [편집].
 * - 본문: ThemeStockMember[] → StockWithProximity 매핑 후 lg+ ScannerTable /
 *   <lg ScannerCardList **재사용**. 행 클릭 → /stocks/[code](scanner Link 내장) + ⭐.
 * - states: scanner-skeleton/empty/error 재사용. 모든 색은 globals.css 토큰만.
 */

type ThemeDetail = ThemeWithStats & { stocks: ThemeStockMember[] };

export interface ThemeDetailClientProps {
  id: string;
}

/** ThemeStockMember → StockWithProximity (scanner-table props). watchlist rowToStock 톤. */
function memberToStock(m: ThemeStockMember): StockWithProximity {
  return {
    code: m.code,
    name: m.name,
    market: m.market,
    price: m.price,
    changeAmount: 0,
    changeRate: m.changeRate,
    volume: 0,
    tradeAmount: m.tradeAmount,
    open: 0,
    high: 0,
    low: 0,
    marketCap: 0,
    upperLimit: 0,
    lowerLimit: 0,
    updatedAt: new Date().toISOString(),
    upperLimitProximity: 0,
  };
}

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function changeColor(v: number | null): string {
  if (v == null || v === 0) return 'text-[var(--flat)]';
  return v > 0 ? 'text-[var(--up)]' : 'text-[var(--down)]';
}

export function ThemeDetailClient({ id }: ThemeDetailClientProps) {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = useIsThemeAdmin();
  const [theme, setTheme] = useState<ThemeDetail | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<ThemeEditMode | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setIsRefreshing(true);
    try {
      let detail: ThemeDetail;
      try {
        // 시스템 테마 우선 (Express service-role).
        detail = await fetchSystemThemeDetail(id);
      } catch (err) {
        // 시스템 404 → 유저 테마(Supabase RLS owner-only) 폴백.
        if (err instanceof ApiClientError && err.status === 404) {
          const supabase = createClient();
          detail = await fetchMyThemeDetail(supabase, id);
        } else {
          throw err;
        }
      }
      if (!mountedRef.current) return;
      setTheme(detail);
      setError(undefined);
    } catch (err) {
      if (!mountedRef.current) return;
      // 고정 카피 — 내부 메시지 미노출(T-10-07-04). state 유지(stale-but-visible).
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!mountedRef.current) return;
      setIsRefreshing(false);
      setIsInitialLoading(false);
    }
  }, [id]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // 등락률 내림차순 정렬(급등 종목이 위로) — 서버는 DB 순서로 반환하므로 표시 정렬은
  // 클라이언트에서. 시세 부재 종목(changeRate=0)은 자연히 하단. 시스템 테마 랭킹이
  // top3avg desc 인 것과 동일 방향.
  const stocks = useMemo(
    () =>
      (theme?.stocks ?? [])
        .map(memberToStock)
        .sort((a, b) => b.changeRate - a.changeRate),
    [theme],
  );

  const backLink = (
    <Link
      href="/themes"
      className="inline-flex items-center gap-1 text-[length:var(--t-sm)] text-[var(--muted-fg)] hover:text-[var(--fg)]"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      테마 목록
    </Link>
  );

  if (isInitialLoading && !theme) {
    return (
      <section className="flex flex-col gap-4">
        {backLink}
        <ScannerSkeleton />
      </section>
    );
  }

  if (!theme && error) {
    return (
      <section className="flex flex-col gap-4">
        {backLink}
        <ScannerError
          error={new Error('테마를 불러오지 못했습니다. 새로고침해주세요.')}
          onRetry={() => void load()}
          retrying={isRefreshing}
        />
      </section>
    );
  }

  if (!theme) {
    return (
      <section className="flex flex-col gap-4">
        {backLink}
        <ScannerSkeleton />
      </section>
    );
  }

  const isUserTheme = !theme.isSystem;

  return (
    <section aria-label={`${theme.name} 테마`} className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/themes"
              aria-label="테마 목록으로 돌아가기"
              className="inline-flex items-center text-[length:var(--t-h2)] text-[var(--muted-fg)] hover:text-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-sm py-2 pr-1"
            >
              ←
            </Link>
            <h1 className="text-[length:var(--t-h2)] font-bold tracking-[-0.01em] text-[var(--fg)]">
              {theme.name}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            <ThemeSourceBadges sources={theme.sources} />
            <span className="mono">{theme.stockCount}종목</span>
            <span className="text-[var(--border)]">·</span>
            <span className="flex items-center gap-1">
              상위 3종목 평균
              <span
                className={cn(
                  'mono font-bold',
                  changeColor(theme.top3AvgChangeRate),
                )}
              >
                {fmtPct(theme.top3AvgChangeRate)}
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isUserTheme ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDialogMode({ kind: 'edit', theme });
                setDialogOpen(true);
              }}
            >
              <Pencil className="size-4" aria-hidden="true" />
              편집
            </Button>
          ) : (
            <>
              {/* 시스템 테마: 로그인 사용자는 내 테마로 복사(fork), 운영자는 편집(시스템 분기) */}
              {user && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDialogMode({ kind: 'fork', systemTheme: theme });
                    setDialogOpen(true);
                  }}
                >
                  <Copy className="size-4" aria-hidden="true" />
                  내 테마로 복사
                </Button>
              )}
              {isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDialogMode({ kind: 'edit', theme });
                    setDialogOpen(true);
                  }}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  편집
                </Button>
              )}
            </>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={isRefreshing}
            aria-label="새로고침"
            aria-busy={isRefreshing || undefined}
          >
            <RefreshCw
              className={cn('size-4', isRefreshing && 'animate-spin')}
              aria-hidden="true"
            />
            새로고침
          </Button>
        </div>
      </header>

      {stocks.length === 0 ? (
        <div
          role="status"
          className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-6 text-center"
        >
          <p className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
            이 테마에 표시할 종목이 없습니다
          </p>
          {(isUserTheme || isAdmin) && (
            <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
              [편집]에서 종목을 추가해 보세요.
            </p>
          )}
        </div>
      ) : (
        <>
          <ScannerTable stocks={stocks} isRefreshing={isRefreshing} />
          <ScannerCardList stocks={stocks} isRefreshing={isRefreshing} />
        </>
      )}

      {/* stale-but-visible: data 있을 때 에러 병기 */}
      {error && theme && (
        <p
          role="alert"
          className="text-[length:var(--t-caption)] text-[var(--destructive)]"
        >
          최근 갱신 실패 — 이전 데이터를 표시 중입니다.
        </p>
      )}

      {dialogMode && (
        <ThemeEditDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={dialogMode}
          // fork → 새 내 테마로 이동, edit(유저/시스템) → 현재 테마 재조회로 reconcile.
          onSaved={(saved) => {
            if (dialogMode.kind === 'fork') router.push(`/themes/${saved.id}`);
            else void load();
          }}
          // 유저 삭제 / 시스템 hide 모두 이 테마가 더 이상 존재하지 않음 → 목록으로.
          onDeleted={() => router.push('/themes')}
        />
      )}
    </section>
  );
}
