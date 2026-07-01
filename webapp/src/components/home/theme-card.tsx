import type { HomeSurgeTheme } from '@gh-radar/shared';

import { NewsBlock } from './news-block';

/**
 * ThemeCard — 오늘의 주도 테마 카드 (13-UI-SPEC §Component Inventory · theme-card).
 *
 * `.card-shadow` + border + `--r-lg`, hover border `--primary` tint (theme-rank-row 선례).
 * 구조:
 *   헤더 = 테마명(--t-h4 800) + 상승이유(muted 14/400) | 평균 등락(--t-h4 800 mono --up)
 *          + "평균 등락" cap
 *   소속 종목 mini-row (grid 1fr auto, change% desc, top 4 + "+N개 종목 더")
 *   근거 뉴스 블록 (showLabel)
 *
 * 색상 규칙 (LOCKED): 모든 등락% = `.mono` + `var(--up)` (RED) + weight 800.
 * 하드코딩 색 금지 — globals 토큰만.
 */
export interface ThemeCardProps {
  theme: HomeSurgeTheme;
}

const TOP_N = 4;

/** 등락% 표시 — 부호 포함 소수 1자리 (+24.1% / -3.2%). 급등 화면이라 대부분 +. */
function formatChange(rate: number): string {
  const sign = rate > 0 ? '+' : '';
  return `${sign}${rate.toFixed(1)}%`;
}

/** 소속 종목 평균 등락 — 카드 헤더 metric. */
function avgChange(theme: HomeSurgeTheme): number {
  const rates = theme.stocks
    .map((s) => s.changeRate)
    .filter((r) => Number.isFinite(r));
  if (rates.length === 0) return 0;
  return rates.reduce((sum, r) => sum + r, 0) / rates.length;
}

export function ThemeCard({ theme }: ThemeCardProps) {
  const avg = avgChange(theme);
  // change% desc 정렬 (카드 내). 원본 불변 위해 복사.
  const sorted = [...theme.stocks].sort((a, b) => b.changeRate - a.changeRate);
  const top = sorted.slice(0, TOP_N);
  const overflow = sorted.length - top.length;

  return (
    <article className="card-shadow flex flex-col gap-[var(--s-3)] rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-4)] transition-colors hover:border-[color-mix(in_oklch,var(--primary)_30%,var(--border))]">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-[length:var(--t-h4)] font-extrabold tracking-[-0.01em] text-[var(--fg)]">
            {theme.name}
          </span>
          {theme.reason && (
            <span className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
              {theme.reason}
            </span>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="mono text-[length:var(--t-h4)] font-extrabold text-[var(--up)]">
            {formatChange(avg)}
          </div>
          <div className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            평균 등락
          </div>
        </div>
      </div>

      {/* 소속 종목 mini-row */}
      <div className="flex flex-col">
        {top.map((stock) => (
          <div
            key={stock.code}
            className="grid grid-cols-[1fr_auto] items-center gap-3 py-[7px] [&+&]:border-t [&+&]:border-[var(--border-subtle)]"
          >
            <span className="min-w-0 truncate">
              <b className="text-[length:var(--t-sm)] font-extrabold text-[var(--fg)]">
                {stock.name}
              </b>
              <span className="mono ml-[6px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                {stock.code}
              </span>
            </span>
            <span className="mono text-right text-[length:var(--t-sm)] font-extrabold text-[var(--up)]">
              {formatChange(stock.changeRate)}
            </span>
          </div>
        ))}
        {overflow > 0 && (
          <div className="px-[2px] pt-[6px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            +{overflow}개 종목 더
          </div>
        )}
      </div>

      {/* 근거 뉴스 */}
      <NewsBlock news={theme.news} showLabel />
    </article>
  );
}
