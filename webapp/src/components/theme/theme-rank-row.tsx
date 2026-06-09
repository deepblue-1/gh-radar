import Link from 'next/link';
import { memo } from 'react';

import { cn } from '@/lib/utils';
import type { ThemeWithStats } from '@gh-radar/shared';

import { ThemeSourceBadges } from './theme-source-badge';

/**
 * ThemeRankRow — UI-SPEC §S1 변형 C 랭킹 ritem.
 *
 * grid `34px 1.1fr 1fr auto`:
 *   - 순위(.mono, top3=빨강 --up)
 *   - 테마명 + 출처 도트 + 종목수
 *   - 강도 막대: width=|avg|/maxAvg (최소 4%), 색 avg>=0 빨강(--up) / <0 파랑(--down)
 *   - 평균값(.mono, t-lg/800, 등락 색)
 * 행 전체가 `/themes/[id]` Link (전역 double-ring focus 로 키보드 포커스 가능).
 *
 * 모든 색은 globals.css 토큰만 사용 — 신규 토큰/하드코딩 금지.
 */

export interface ThemeRankRowProps {
  theme: ThemeWithStats;
  /** 1-based 순위 (top3 = 빨강 강조). */
  rank: number;
  /** 강도 막대 정규화 분모 = 전체 테마 중 max(|top3avg|). 0 이면 막대 최소폭. */
  maxAvg: number;
}

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function changeColor(v: number | null): string {
  if (v == null || v === 0) return 'text-[var(--flat)]';
  return v > 0 ? 'text-[var(--up)]' : 'text-[var(--down)]';
}

function ThemeRankRowBase({ theme, rank, maxAvg }: ThemeRankRowProps) {
  const avg = theme.top3AvgChangeRate;
  const isTop3 = rank <= 3;
  const barPct =
    avg == null || maxAvg <= 0
      ? 4
      : Math.max(4, Math.min(100, (Math.abs(avg) / maxAvg) * 100));
  const barColor = avg != null && avg < 0 ? 'bg-[var(--down)]' : 'bg-[var(--up)]';

  return (
    <Link
      href={`/themes/${theme.id}`}
      aria-label={`${theme.name} 테마 상세 보기`}
      className={cn(
        'grid grid-cols-[34px_1.1fr_1fr_auto] items-center gap-[var(--s-4)]',
        'rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-[var(--s-4)] py-[var(--s-3)]',
        'transition-colors hover:border-[color-mix(in_oklch,var(--primary)_30%,var(--border))]',
      )}
    >
      {/* 순위 */}
      <span
        className={cn(
          'mono text-center text-[length:var(--t-h3)] font-extrabold',
          isTop3 ? 'text-[var(--up)]' : 'text-[var(--muted-fg)]',
        )}
      >
        {rank}
      </span>

      {/* 테마명 + 출처 + 종목수 */}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[length:var(--t-base)] font-bold text-[var(--fg)]">
          {theme.name}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <ThemeSourceBadges sources={theme.sources} />
          <span className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            {theme.stockCount}종목
          </span>
        </span>
      </span>

      {/* 강도 막대 */}
      <span className="flex items-center">
        <span className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              barColor,
            )}
            style={{ width: `${barPct}%` }}
          />
        </span>
      </span>

      {/* 평균값 */}
      <span
        className={cn(
          'mono min-w-[72px] text-right text-[length:var(--t-lg)] font-extrabold',
          changeColor(avg),
        )}
      >
        {fmtPct(avg)}
      </span>
    </Link>
  );
}

export const ThemeRankRow = memo(ThemeRankRowBase);
