'use client';

import { useMemo, type ReactNode } from 'react';

import type { PricePoint } from '@/lib/accum-chart';
import { candlePathsOf, cumAvgPathOf, type CandleFrame, type Candles } from '@/lib/ticks/candle-chart';
import type { TickPriceRange } from '@/lib/ticks/tick-chart';

/**
 * 봉 차트 가격 판 층 (Phase 42 · D-06 ~ D-08 · D-15 · UI-SPEC S5).
 *
 * 아래 → 위: 봉 영역 클립 안 꼬리(방향색 1px) → 몸통(방향색 채움) → 누적 평단 회색 긴 점선(`--muted-fg` 1.25 · "5 3" — 과거 ·
 * 등록 종목만) → 가격 판 높이 클립 안 `children` 자리(42-09 가 팀 원 · 우리 점을 넣는다 — 선 차트처럼 가격 판 높이로 자른다) →
 * 왼쪽 가격 축(창 안 최고 · 최저). 틱 선은 그리지 않는다(D-08). 거래대금 막대 · 이동평균 · 가장자리 글자 · 판 제목은 42-04.
 * 경로는 봉 · 보기 창 · x · y 가 바뀔 때만 다시 만든다(마우스 재렌더에서 재생성 0 — RESEARCH Pattern 8).
 */

export interface CandlePriceLayerProps {
  frame: CandleFrame;
  candles: Candles;
  range: TickPriceRange;
  /** 가격 → y(봉 영역 — `candleYOf`). */
  y: (px: number) => number;
  /** 누적 평단 점(`cumAvgPointsOf` — 없으면 []). */
  cumAvg: readonly PricePoint[];
  /** 차트 고유 클립 id 접두. */
  clipId: string;
  /** 가격 판 높이 클립 안에 겹치는 층(팀 원 · 우리 점 — 42-09). */
  children?: ReactNode;
}

const PX_FMT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

export function CandlePriceLayer({ frame, candles, range, y, cumAvg, clipId, children }: CandlePriceLayerProps) {
  const { P, L, plotW, view, x, bounds, endMs } = frame;
  const paths = useMemo(() => candlePathsOf(candles, view, x, y), [candles, view, x, y]);
  const cumD = useMemo(
    () => (cumAvg.length > 0 ? cumAvgPathOf(cumAvg, x, y, bounds.T0, endMs) : ''),
    [cumAvg, x, y, bounds.T0, endMs],
  );

  return (
    <g data-slot="candle-price-layer">
      <defs>
        <clipPath id={`${clipId}-candle`}>
          <rect x={L} y={P.y1a} width={plotW} height={P.yCb - P.y1a} />
        </clipPath>
        <clipPath id={`${clipId}-px`}>
          <rect x={L} y={P.y1a - 7} width={plotW} height={P.y1b - P.y1a + 14} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId}-candle)`}>
        <path
          data-slot="candle-wick-up"
          d={paths.upWick}
          fill="none"
          stroke="var(--up)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path
          data-slot="candle-wick-down"
          d={paths.downWick}
          fill="none"
          stroke="var(--down)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path data-slot="candle-body-up" d={paths.upBody} fill="var(--up)" />
        <path data-slot="candle-body-down" d={paths.downBody} fill="var(--down)" />
        {cumD !== '' && (
          <path
            data-slot="candle-cum-avg"
            d={cumD}
            fill="none"
            stroke="var(--muted-fg)"
            strokeWidth={1.25}
            strokeDasharray="5 3"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </g>

      <g clipPath={`url(#${clipId}-px)`}>
        <g data-slot="candle-price-overlay">{children}</g>
      </g>

      {/* 가격 축(왼쪽) — 창 안 최고 · 최저 */}
      <g data-slot="candle-px-axis" fill="var(--muted-fg)" aria-hidden="true">
        {candles.n > 0 && (
          <>
            <text x={L - 4} y={y(range.max) + 4} textAnchor="end">
              {PX_FMT.format(range.max)}
            </text>
            {range.min !== range.max && (
              <text x={L - 4} y={y(range.min) + 4} textAnchor="end">
                {PX_FMT.format(range.min)}
              </text>
            )}
          </>
        )}
      </g>
    </g>
  );
}
