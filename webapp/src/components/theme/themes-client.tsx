'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { useThemesQuery } from '@/hooks/use-themes-query';
import { cn } from '@/lib/utils';
import type { ThemeWithStats } from '@gh-radar/shared';

import { ThemeEditDialog, type ThemeEditMode } from './theme-edit-dialog';
import { ThemeRankRow } from './theme-rank-row';
import { ThemesEmpty } from './themes-empty';
import { ThemesSkeleton } from './themes-skeleton';

/**
 * ThemesClient — UI-SPEC §S1 변형 C(랭킹) + 내 테마 칩 + CRUD 진입.
 *
 * 레이아웃:
 *   - 헤더: 테마(h1) + '지금 뜨는 테마 랭킹 — 상위 3종목 평균 등락률' sub + 최근 갱신 16:00 KST
 *   - 내 테마(상단, 가로 스크롤 칩, border primary tint, [＋ 테마 만들기] CTA / empty)
 *   - 시스템 테마 랭킹(theme-rank-row, top3avg desc — 서버가 이미 정렬)
 *   - 출처 푸터(카피 계약)
 *
 * loading=themes-skeleton, error=role=alert 카드(카피). 모든 색은 globals.css 토큰만.
 */

const ERROR_MSG = '테마를 불러오지 못했습니다. 새로고침해주세요.';
const SOURCE_FOOTER =
  '출처: 네이버 금융 테마 · 알파스퀘어 · AI 보강(Claude) · 일 1회 16:00 KST 갱신';
const SORT_LABEL = '상위 3종목 평균 등락률';

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function changeColor(v: number | null): string {
  if (v == null || v === 0) return 'text-[var(--flat)]';
  return v > 0 ? 'text-[var(--up)]' : 'text-[var(--down)]';
}

/** 내 테마 칩 (가로 스크롤, border primary tint). 클릭 → /themes/[id]. */
function MyThemeChip({ theme }: { theme: ThemeWithStats }) {
  return (
    <Link
      href={`/themes/${theme.id}`}
      className="flex min-w-[180px] flex-none flex-col gap-1 rounded-[var(--r)] border border-[color-mix(in_oklch,var(--primary)_30%,var(--border))] bg-[var(--card)] px-[var(--s-4)] py-[var(--s-3)] transition-colors hover:border-[var(--primary)]"
    >
      <span className="truncate text-[length:var(--t-sm)] font-bold text-[var(--fg)]">
        {theme.name}
      </span>
      <span
        className={cn(
          'mono text-[length:var(--t-h4)] font-extrabold',
          changeColor(theme.top3AvgChangeRate),
        )}
      >
        {fmtPct(theme.top3AvgChangeRate)}
      </span>
      <span className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">
        {theme.stockCount}종목
      </span>
    </Link>
  );
}

export function ThemesClient() {
  const { systemThemes, myThemes, isLoading, isRefreshing, error, refresh } =
    useThemesQuery();
  const { user } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<ThemeEditMode>({ kind: 'create' });

  const maxAvg = useMemo(
    () =>
      systemThemes.reduce(
        (m, t) =>
          t.top3AvgChangeRate != null
            ? Math.max(m, Math.abs(t.top3AvgChangeRate))
            : m,
        0,
      ),
    [systemThemes],
  );

  const openCreate = () => {
    setDialogMode({ kind: 'create' });
    setDialogOpen(true);
  };

  return (
    <section aria-label="테마" className="flex flex-col gap-6">
      {/* 헤더 */}
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-[length:var(--t-h2)] font-bold tracking-[-0.01em] text-[var(--fg)]">
            테마
          </h1>
          <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            지금 뜨는 테마 랭킹 — {SORT_LABEL}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          <span
            className={cn(
              'block size-2 rounded-full',
              isRefreshing
                ? 'animate-ping bg-[var(--up)]'
                : 'bg-[var(--flat)]',
            )}
            aria-hidden="true"
          />
          <span className="mono tabular-nums">최근 갱신 16:00 KST</span>
        </div>
      </header>

      {/* 내 테마 섹션 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[length:var(--t-h4)] font-bold text-[var(--fg)]">
            ⭐ 내 테마
          </h2>
          {user && (
            <Button type="button" size="sm" onClick={openCreate}>
              ＋ 테마 만들기
            </Button>
          )}
        </div>
        {!user ? (
          <div
            role="status"
            className="rounded-[var(--r)] border border-dashed border-[var(--border)] bg-[var(--card)] p-4 text-[length:var(--t-sm)] text-[var(--muted-fg)]"
          >
            로그인하면 나만의 테마를 만들고 종목을 묶을 수 있어요.{' '}
            <Link href="/login" className="text-[var(--primary)] hover:underline">
              로그인
            </Link>
          </div>
        ) : myThemes.length === 0 ? (
          <ThemesEmpty onCreate={openCreate} />
        ) : (
          <div className="flex gap-[var(--s-2)] overflow-x-auto pb-1.5">
            {myThemes.map((t) => (
              <MyThemeChip key={t.id} theme={t} />
            ))}
            <button
              type="button"
              onClick={openCreate}
              className="flex min-w-[160px] flex-none items-center justify-center rounded-[var(--r)] border border-dashed border-[color-mix(in_oklch,var(--primary)_30%,var(--border))] bg-[var(--card)] px-[var(--s-4)] py-[var(--s-3)] text-[length:var(--t-sm)] text-[var(--muted-fg)] hover:text-[var(--fg)]"
            >
              ＋ 새 테마
            </button>
          </div>
        )}
      </div>

      {/* 시스템 테마 랭킹 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[length:var(--t-h4)] font-bold text-[var(--fg)]">
            시스템 테마 랭킹
          </h2>
          <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            ↓ {SORT_LABEL}
          </span>
        </div>

        {isLoading ? (
          <ThemesSkeleton />
        ) : error && systemThemes.length === 0 ? (
          <div
            role="alert"
            className="rounded-[var(--r)] border border-[color-mix(in_oklch,var(--destructive)_40%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] p-4 text-[length:var(--t-sm)] text-[var(--destructive)]"
          >
            {ERROR_MSG}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              className="ml-3"
            >
              새로고침
            </Button>
          </div>
        ) : systemThemes.length === 0 ? (
          <div
            role="status"
            className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-6 text-center text-[length:var(--t-sm)] text-[var(--muted-fg)]"
          >
            표시할 시스템 테마가 아직 없습니다.
          </div>
        ) : (
          <ul
            className={cn(
              'm-0 flex list-none flex-col gap-2 p-0',
              isRefreshing && 'opacity-90 transition-opacity',
            )}
          >
            {systemThemes.map((t, i) => (
              <li key={t.id}>
                <ThemeRankRow theme={t} rank={i + 1} maxAvg={maxAvg} />
              </li>
            ))}
          </ul>
        )}

        {/* stale-but-visible: data 있을 때 에러 병기 */}
        {error && systemThemes.length > 0 && (
          <p
            role="alert"
            className="text-[length:var(--t-caption)] text-[var(--destructive)]"
          >
            최근 갱신 실패 — 이전 데이터를 표시 중입니다.
          </p>
        )}

        <p className="mt-[var(--s-4)] border-t border-[var(--border-subtle)] pt-[var(--s-3)] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          {SOURCE_FOOTER}
        </p>
      </div>

      <ThemeEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        onSaved={() => void refresh()}
      />
    </section>
  );
}
