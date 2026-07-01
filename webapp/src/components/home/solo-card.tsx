import type { HomeSurgeSingle } from '@gh-radar/shared';

import { NewsBlock } from './news-block';

/**
 * SoloCard — 개별 급등 카드 (13-UI-SPEC §Component Inventory · solo-card).
 *
 * `.card-shadow` + border + `--r-lg`, padding `--s-3 --s-4`. 구조:
 *   헤더 = 종목명(14/800) + 코드(mono caption 400) | change%(--t-lg=18 mono 800 --up)
 *   상승이유(있으면 muted 14/400)
 *   근거 뉴스 1건 (label 없이, showLabel=false)
 *
 * 색상 규칙 (LOCKED): change% = `.mono` + `var(--up)` (RED) + weight 800.
 */
export interface SoloCardProps {
  single: HomeSurgeSingle;
}

/** 등락% 표시 — 부호 포함 소수 1자리. */
function formatChange(rate: number): string {
  const sign = rate > 0 ? '+' : '';
  return `${sign}${rate.toFixed(1)}%`;
}

export function SoloCard({ single }: SoloCardProps) {
  return (
    <article className="card-shadow flex flex-col gap-2 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] px-[var(--s-4)] py-[var(--s-3)] transition-colors hover:border-[color-mix(in_oklch,var(--primary)_30%,var(--border))]">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[length:var(--t-sm)] font-extrabold text-[var(--fg)]">
          {single.name}{' '}
          <span className="mono text-[length:var(--t-caption)] font-normal text-[var(--muted-fg)]">
            {single.code}
          </span>
        </span>
        <span className="mono shrink-0 text-[length:var(--t-lg)] font-extrabold text-[var(--up)]">
          {formatChange(single.changeRate)}
        </span>
      </div>
      {single.reason && (
        <span className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          {single.reason}
        </span>
      )}
      <NewsBlock news={single.news} showLabel={false} />
    </article>
  );
}
