"use client";

/**
 * CardGrid — `/trading` 작업대의 **카드 격자** (UI-SPEC §레이아웃 계약 9 · §접근성 「포커스 순서 —
 * 카드 격자」 · D-09 · D-28 · E6, TRADE-09). 정본은 채택 목업 `18-workbench-mockup.html`
 * `.cards`/`.stack`(CSS `:365-373` · 렌더 `renderCards()` `:1089-1096`).
 *
 * ① 정렬 규칙은 **한 가지**다 (D-09)
 *   펼친 카드는 각각 한 칸, 접힌 카드는 전부 **스택 한 칸**에 세로로(gap 8px). 렌더 순서는
 *   펼친 카드들 → 스택이고, 같은 무리 안에서는 받은 순서를 지킨다. DOM 순서가 곧 포커스 순서다.
 *   - 접힌 카드가 0장이면 스택 칸 자체가 없다.
 *   - 스택 위에 라벨이 없다(목업의 `.stack-lab` 은 채택안에서 쓰지 않는다 — 「쓸데없는 라벨링」).
 *   - 펼침/접힘은 **재렌더**다 — 움직임 효과를 두지 않는다. 헤더 클릭 한 번에 카드가 스택과 격자
 *     사이를 옮겨 간다.
 *
 * ② 열 수는 page 컨테이너(`@container/wb`, 작업대 루트가 선언) 쿼리로만 바뀐다 (D-04 · D-28)
 *   기본(폰 밴드, page <700)은 언제나 1열이고, `cols` 2/3 의 열 지정은 700 이상에서만 걸린다 —
 *   목업 `@container page (min-width:700px) { .cards[data-cols="2"] … }` 과 같은 뜻이다.
 *   이 파일은 폭을 JS 로 재지 않고, 뷰포트 브레이크포인트를 쓰지 않는다. 밴드 수치의 정본은
 *   `globals.css` §2.2b 다.
 *
 * ③ 포커스 규율 (UI-SPEC §접근성)
 *   - 접기/펼치기: 토글을 누른 헤더 버튼으로 포커스를 되찾는 일은 카드 헤더(`card-header.tsx` ③)가
 *     한다 — 스택 ↔ 격자 이동으로 카드가 다시 마운트돼도 같은 id 로 찾는다.
 *   - ✕ 로 카드가 사라지면(포커스가 함께 사라지면) 직전 렌더 순서에서 **다음 카드 헤더**로, 다음
 *     카드가 없으면 `fallbackFocusSelector`(종목 추가 검색란)로 옮긴다. 사용자가 이미 다른 곳에
 *     포커스를 두었다면 건드리지 않는다.
 *
 * ④ 빈 상태 (E6 empty · loading)
 *   카드 0장이면 격자 대신 UI-SPEC §Copywriting 의 빈 문구 2줄을 그린다. 스켈레톤이 없다 —
 *   게이트 통과 직후 64 스냅샷 전의 짧은 구간도 이 문구다.
 */

import { useLayoutEffect, useRef, type ReactNode } from "react";

import type { TradingCols } from "@/lib/breakout-list";
import { cn } from "@/lib/utils";

/** 빈 상태 제목 — UI-SPEC §Copywriting 「Empty state heading」 원문. */
export const CARD_GRID_EMPTY_HEADING = "거래할 종목이 없어요";
/** 빈 상태 본문 — UI-SPEC §Copywriting 「Empty state body」 원문. */
export const CARD_GRID_EMPTY_BODY =
  "위 검색란에서 종목을 추가하거나, 돌파 목록의 종목을 눌러 시작하세요.";

export interface CardGridItem {
  isin: string;
  open: boolean;
}

export interface CardGridProps<T extends CardGridItem> {
  cards: readonly T[];
  cols: TradingCols;
  renderCard: (card: T) => ReactNode;
  /** ✕ 로 마지막 카드가 사라졌을 때 포커스를 받을 요소(종목 추가 검색란). */
  fallbackFocusSelector?: string;
  className?: string;
}

/**
 * page(`wb`) 700 이상에서만 걸리는 열 지정 — Tailwind 가 소스를 스캔하므로 **리터럴 그대로** 둔다.
 * 1단은 기본 1열 그대로라 추가 클래스가 없다.
 */
const COLS_CLASS: Record<TradingCols, string> = {
  1: "",
  2: "@min-[700px]/wb:grid-cols-[repeat(2,minmax(0,1fr))]",
  3: "@min-[700px]/wb:grid-cols-[repeat(3,minmax(0,1fr))]",
};

/** 헤더 토글 id — `strategy-card.tsx` 의 `strategy-card-{ISIN}-toggle` 과 같은 규약. */
function toggleIdOf(isin: string): string {
  return `strategy-card-${isin.replace(/[^A-Za-z0-9_-]/g, "_")}-toggle`;
}

/** 렌더 순서(①) — 펼친 카드들 → 접힌 카드들. 같은 무리 안의 순서는 입력 순서다. */
export function renderOrderOf<T extends CardGridItem>(cards: readonly T[]): {
  open: T[];
  folded: T[];
} {
  const open: T[] = [];
  const folded: T[] = [];
  for (const c of cards) (c.open ? open : folded).push(c);
  return { open, folded };
}

export function CardGrid<T extends CardGridItem>({
  cards,
  cols,
  renderCard,
  fallbackFocusSelector,
  className,
}: CardGridProps<T>) {
  const { open, folded } = renderOrderOf(cards);
  const order = [...open, ...folded].map((c) => c.isin);

  /* ── ③ ✕ 뒤 포커스 ─────────────────────────────────────────────── */
  const prevOrder = useRef<string[]>(order);
  useLayoutEffect(() => {
    const before = prevOrder.current;
    prevOrder.current = order;
    const present = new Set(order);
    const removedAt = before.findIndex((isin) => !present.has(isin));
    if (removedAt < 0) return;
    // 사용자가 이미 다른 곳에 포커스를 두었다면 건드리지 않는다.
    const active = document.activeElement;
    if (active !== null && active !== document.body && active.isConnected) return;
    const next = before.slice(removedAt + 1).find((isin) => present.has(isin));
    const target =
      next !== undefined
        ? document.getElementById(toggleIdOf(next))
        : fallbackFocusSelector !== undefined
          ? document.querySelector<HTMLElement>(fallbackFocusSelector)
          : null;
    target?.focus();
  });

  if (cards.length === 0) {
    return (
      <div
        data-slot="card-grid-empty"
        className={cn(
          "flex min-w-0 flex-col items-center gap-1 rounded-[var(--r-lg)] border border-dashed border-[var(--border)] px-4 py-8 text-center",
          className,
        )}
      >
        <p className="m-0 text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          {CARD_GRID_EMPTY_HEADING}
        </p>
        <p className="m-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          {CARD_GRID_EMPTY_BODY}
        </p>
      </div>
    );
  }

  return (
    <div
      data-slot="card-grid"
      data-cols={String(cols)}
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-3",
        COLS_CLASS[cols],
        className,
      )}
    >
      {open.map((c) => (
        <div key={c.isin} data-slot="card-cell" className="min-w-0">
          {renderCard(c)}
        </div>
      ))}
      {folded.length > 0 && (
        <div data-slot="card-stack" className="flex min-w-0 flex-col gap-2">
          {folded.map((c) => (
            <div key={c.isin} data-slot="card-cell" className="min-w-0">
              {renderCard(c)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
