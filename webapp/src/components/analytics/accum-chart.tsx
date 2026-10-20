'use client';

import { useId } from 'react';

import type { AccumDetailRow } from '@gh-radar/shared';

import { useChartWidth } from '@/hooks/use-chart-width';
import {
  ACCUM_CHART,
  dayMaxPxOf,
  priceAxisWidthOf,
  pricePathOf,
  pricePointsOf,
  priceRangeOf,
  xOfView,
  yOfPrice,
  type View,
} from '@/lib/accum-chart';
import { fmtEok, kstHm } from '@/lib/teamflow-report';

/**
 * 매집감지 상세 3판 차트 — 정적 레이어 (Phase 34 · UI-SPEC A6 · D-14 ~ D-18 · D-17 순수 SVG).
 *
 * - 래퍼 `div` 폭을 `useChartWidth` 로 재고(측정 전 · jsdom = 640) `viewBox="0 0 {W} 472"` 를 그 폭과 **1:1** — 글자 11px 고정.
 * - 세 판(가격 · 순매수 누적 · 10분 팀 매수/매도)이 같은 x(ms) 창 `view` 를 공유한다. 창은 부모가 준다(34-07 이 확대/이동 훅으로 바꾼다).
 * - 데이터 레이어는 그림 영역 `clipPath` 안, 축 글자는 밖. 기하는 전부 `lib/accum-chart.ts` 순수 함수.
 * - `payload` 가 없거나 `price.idx` 가 비면 그리지 않는다(null — 대체 문구 「그날 체결 자료 없음」 은 34-07).
 */
export function AccumChart({ row, view }: { row: AccumDetailRow; view: View }) {
  const [ref, W] = useChartWidth<HTMLDivElement>();
  const rawId = useId();
  const payload = row.payload;
  if (payload === null || payload.price.idx.length === 0) return null;

  const clipId = `accum-clip-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { R, TOP, H1, H } = ACCUM_CHART;
  const L = priceAxisWidthOf(dayMaxPxOf(payload.price, payload.orders));
  const right = W - R;
  const x = xOfView(view, L, W);

  const points = pricePointsOf(payload.price);
  const range = priceRangeOf(points, payload.orders, view);
  const yP = yOfPrice(range);
  const priceD = pricePathOf(points, view, x, yP);

  const name = row.name ?? row.short_code;
  const ariaLabel = `${name} 매집 상세 차트 — ${kstHm(view.t0)}~${kstHm(view.t1)} · 사이클 ${payload.cycles.length}개 · 팀 주문 ${payload.orders.t_ms.length}건 · 하루 순매수 ${fmtEok(row.day_net_krw, { signed: true })}`;

  return (
    <div ref={ref} data-slot="accum-chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={ariaLabel}
        data-slot="accum-chart"
        className="block tabular-nums"
        fontSize={11}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={L} y={0} width={Math.max(0, right - L)} height={H} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <path
            data-slot="accum-price-path"
            d={priceD}
            fill="none"
            stroke="var(--fg-2)"
            strokeWidth={1.25}
            strokeLinejoin="round"
          />
        </g>

        <line x1={L} x2={right} y1={TOP + H1} y2={TOP + H1} stroke="var(--border-subtle)" />
      </svg>
    </div>
  );
}
