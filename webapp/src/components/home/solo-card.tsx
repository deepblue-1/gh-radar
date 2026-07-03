import Link from 'next/link';
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
 * 종목 → 상세: 카드 전체가 `/stocks/{code}` 클릭 영역 (stretched-link 패턴).
 *   NewsBlock 내부에 외부 뉴스 <a> 가 있어 카드 전체를 <Link> 로 감싸면 중첩 <a> (invalid).
 *   → 투명 오버레이 Link(absolute inset-0)로 카드 표면을 덮고, 뉴스 블록만 z-index 상향해
 *     오버레이 위로 올려 독립 클릭 유지. 링크 접근성명은 aria-label 로 제공(theme-card C 선례).
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
    <article className="group card-shadow relative flex flex-col gap-2 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] px-[var(--s-4)] py-[var(--s-3)] transition-colors hover:border-[color-mix(in_oklch,var(--primary)_30%,var(--border))]">
      {/* stretched-link: 카드 표면 전체를 덮는 투명 종목상세 링크. 뉴스 블록만 z-상향해 위로. */}
      <Link
        href={`/stocks/${single.code}`}
        aria-label={`${single.name} 종목 상세 보기`}
        className="absolute inset-0 z-10 rounded-[var(--r-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[length:var(--t-sm)] font-extrabold text-[var(--fg)] group-hover:text-[var(--primary)]">
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
      {/* 뉴스 외부 anchor 를 오버레이 링크 위로 올려 독립 클릭 유지. */}
      <div className="relative z-20">
        <NewsBlock news={single.news} showLabel={false} />
      </div>
    </article>
  );
}
