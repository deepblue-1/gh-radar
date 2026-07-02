'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { HomeSurgeStock, HomeSurgeTheme } from '@gh-radar/shared';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

import { NewsBlock } from './news-block';

/**
 * ThemeCard — 오늘의 주도 테마 카드 (13-UI-SPEC §Component Inventory · theme-card).
 *
 * `.card-shadow` + border + `--r-lg`, hover border `--primary` tint (theme-rank-row 선례).
 * 구조:
 *   헤더 = 테마명(--t-h4 800, **버튼 → 바텀시트 B**) + 상승이유(muted 14/400)
 *          | 평균 등락(--t-h4 800 mono --up) + "평균 등락" cap
 *   소속 종목 mini-row (grid 1fr auto, change% desc, top 4 + "+N개 종목 더" **토글 A**)
 *   근거 뉴스 블록 (showLabel)
 *
 * 소속 종목 전체 보기 (Phase 13 후속):
 *   A (인라인 확장) — mini-row 의 "+N개 종목 더" 버튼 클릭 시 카드 안에서 나머지 종목 펼침/접기.
 *   B (바텀시트)   — 헤더 테마명 버튼 클릭 시 하단 시트로 전체 소속 종목(등락% desc) + 근거 뉴스.
 *   C (종목 → 상세) — 인라인/시트 양쪽 모든 종목 행이 `/stocks/{code}` next/link.
 *
 * 중첩 <a> 금지: 헤더 테마명은 button(시트 트리거), 종목 행은 Link → affordance 분리.
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

/**
 * 소속 종목 mini-row 1건 — `/stocks/{code}` 링크(C).
 * grid 1fr auto: [종목명 800 + 코드 mono caption muted] | [change% mono 800 --up 우정렬].
 * 행 사이 `--border-subtle` hairline. hover 시 종목명 --primary tint.
 */
function StockRow({ stock }: { stock: HomeSurgeStock }) {
  return (
    <Link
      href={`/stocks/${stock.code}`}
      className="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-[var(--r-sm)] py-[7px] no-underline [&+&]:border-t [&+&]:border-[var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <span className="min-w-0 truncate">
        <b className="text-[length:var(--t-sm)] font-extrabold text-[var(--fg)] group-hover:text-[var(--primary)]">
          {stock.name}
        </b>
        <span className="mono ml-[6px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          {stock.code}
        </span>
      </span>
      <span className="mono text-right text-[length:var(--t-sm)] font-extrabold text-[var(--up)]">
        {formatChange(stock.changeRate)}
      </span>
    </Link>
  );
}

export function ThemeCard({ theme }: ThemeCardProps) {
  const avg = avgChange(theme);
  // change% desc 정렬 (카드 내). 원본 불변 위해 복사.
  const sorted = [...theme.stocks].sort((a, b) => b.changeRate - a.changeRate);
  const top = sorted.slice(0, TOP_N);
  const rest = sorted.slice(TOP_N);
  const overflow = rest.length;

  // A: 인라인 확장 토글.
  const [expanded, setExpanded] = useState(false);
  // B: 바텀시트 open.
  const [sheetOpen, setSheetOpen] = useState(false);

  const avgLabel = formatChange(avg);
  const sheetDesc = theme.reason
    ? `${theme.reason} · ${theme.stocks.length}종목 · 평균 ${avgLabel}`
    : `${theme.stocks.length}종목 · 평균 ${avgLabel}`;

  return (
    <>
      <article className="card-shadow flex flex-col gap-[var(--s-3)] rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-4)] transition-colors hover:border-[color-mix(in_oklch,var(--primary)_30%,var(--border))]">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-[3px]">
            {/* B: 테마명 클릭 → 바텀시트(전체 소속 종목). button — 중첩 <a> 회피. */}
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-haspopup="dialog"
              className="group -ml-1 flex min-w-0 items-center gap-1 rounded-[var(--r-sm)] px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <span className="min-w-0 truncate text-[length:var(--t-h4)] font-extrabold tracking-[-0.01em] text-[var(--fg)] group-hover:text-[var(--primary)]">
                {theme.name}
              </span>
            </button>
            {theme.reason && (
              <span className="px-1 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
                {theme.reason}
              </span>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="mono text-[length:var(--t-h4)] font-extrabold text-[var(--up)]">
              {avgLabel}
            </div>
            <div className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              평균 등락
            </div>
          </div>
        </div>

        {/* 소속 종목 mini-row */}
        <div className="flex flex-col">
          {top.map((stock) => (
            <StockRow key={stock.code} stock={stock} />
          ))}
          {/* A: 인라인 확장분 — 토글 시에만 렌더. top 리스트와 hairline 연속. */}
          {expanded &&
            rest.map((stock) => <StockRow key={stock.code} stock={stock} />)}
          {overflow > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-[6px] self-start rounded-[var(--r-sm)] px-[2px] text-left text-[length:var(--t-caption)] text-[var(--muted-fg)] transition-colors hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {expanded ? '접기' : `+${overflow}개 종목 더`}
            </button>
          )}
        </div>

        {/* 근거 뉴스 */}
        <NewsBlock news={theme.news} showLabel />
      </article>

      {/* B: 전체 소속 종목 바텀시트 */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[80vh] gap-0 rounded-t-[var(--r-lg)]"
        >
          <SheetHeader>
            <SheetTitle className="text-[length:var(--t-h4)] font-extrabold tracking-[-0.01em]">
              {theme.name}
            </SheetTitle>
            <SheetDescription>{sheetDesc}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-[var(--s-3)] overflow-y-auto p-[var(--s-4)]">
            <div className="flex flex-col">
              {sorted.map((stock) => (
                <StockRow key={stock.code} stock={stock} />
              ))}
            </div>
            <NewsBlock news={theme.news} showLabel />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
