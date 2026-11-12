'use client';

import { Fragment, useMemo, type ReactNode } from 'react';

import type { PricePoint } from '@/lib/accum-chart';
import {
  CANDLE_MIN_MS,
  amountBarsOf,
  candlePathsOf,
  cumAvgPathOf,
  cumAvgVisibleOf,
  edgeLabelsOf,
  maVisibleOf,
  type CandleFrame,
  type Candles,
  type EdgeLabelInput,
} from '@/lib/ticks/candle-chart';
import { maPathOf, type CandleMaValue } from '@/lib/ticks/candle-ma';
import type { TeamModel } from '@/lib/ticks/team-model';
import { teamAvgPathOf, type TickPriceRange } from '@/lib/ticks/tick-chart';

/**
 * 봉 차트 가격 판 층 (Phase 42 · D-06 ~ D-10 · D-15 ~ D-17 · UI-SPEC S5).
 *
 * 아래 → 위(겹침 순서): 거래대금 막대(가격 판 아래 1/5 · 방향색 .38) → 봉 영역 클립 안 꼬리(방향색 1px) → 몸통(방향색 채움) →
 * 이동평균(칩 순서 · 뒤 칩이 위 · `--ma-n` 1.25) → 누적 평단 회색 긴 점선(`--muted-fg` 1.25 · "5 3" — 과거 · 등록 종목만) →
 * 당일 팀 평단 점점선(`--up` 1.25 · "1 2" — `teamAvgPathOf` 그대로) → 가격 판 높이 클립 안 `children` 자리(팀 원 · 우리 점) →
 * 가장자리 글자(범위 밖 선 대신 「{이름} {값} ▾/▴」 · D-16) → 판 제목(데스크톱 · 단위 글자가 있을 때만) → 왼쪽 가격 축.
 * 틱 선은 그리지 않는다(D-08). 이동평균 · 누적 평단은 가격 범위를 넓히지 않는다(D-16 — 범위는 컨테이너가 봉만으로 잡는다).
 * 경로 · 가장자리 계산은 봉 · 보기 창 · x · y · 범위 · 이동평균 · 누적이 바뀔 때만 다시 만든다(마우스 재렌더 0 — RESEARCH Pattern 8).
 * 42-04 가 더한 props 는 모두 선택이다(컨테이너 결선 = 42-10).
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
  /** 켜진 이동평균(칩 순서 · 값은 `candles` 와 같은 색인) — 없으면 선 없음. */
  ma?: readonly CandleMaValue[];
  /** 팀 모델 — 있으면 당일 팀 평단 점점선. */
  team?: TeamModel;
  /** 판 제목 단위 글자(「5분봉(자동)」) — 있고 데스크톱일 때만 판 제목. */
  unitLabel?: string;
  /** 판 제목에 「◆ 우리 체결」(우리 모델이 있을 때). */
  ownInTitle?: boolean;
}

const PX_FMT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const NO_MA: readonly CandleMaValue[] = [];
const maColor = (n: number) => `var(--ma-${n})`;

export function CandlePriceLayer({
  frame,
  candles,
  range,
  y,
  cumAvg,
  clipId,
  children,
  ma = NO_MA,
  team,
  unitLabel,
  ownInTitle = false,
}: CandlePriceLayerProps) {
  const { P, L, xr, plotW, phone, view, x, bounds, endMs } = frame;
  const paths = useMemo(() => candlePathsOf(candles, view, x, y), [candles, view, x, y]);
  const bars = useMemo(() => amountBarsOf(candles, view, x, P), [candles, view, x, P]);

  // 가장자리 글자 — 누적 평단 먼저 · 이동평균은 칩 순서(D-16 · UI-SPEC S5)
  const edge = useMemo(() => {
    const items: EdgeLabelInput[] = [];
    if (cumAvg.length > 0) {
      const vis = cumAvgVisibleOf(cumAvg, view);
      items.push({ key: 'cum', name: '누적 평단', fill: 'var(--muted-fg)', vis, last: vis.at(-1) ?? null });
    }
    for (const m of ma) {
      const vis = maVisibleOf(candles, m.values, view);
      items.push({ key: m.key, name: m.name, fill: maColor(m.color), vis, last: vis.at(-1) ?? null });
    }
    return edgeLabelsOf(items, range, { P, L, xr, phone });
  }, [cumAvg, ma, candles, view, range, P, L, xr, phone]);

  const maLines = useMemo(() => {
    const unitMs = candles.unit * CANDLE_MIN_MS;
    const out: { key: string; color: number; d: string }[] = [];
    for (const m of ma) {
      if (edge.hidden.has(m.key)) continue;
      const d = maPathOf(candles.t0, unitMs, m.values, x, y);
      if (d !== '') out.push({ key: m.key, color: m.color, d });
    }
    return out;
  }, [ma, candles, x, y, edge]);

  const cumD = useMemo(
    () => (cumAvg.length > 0 && !edge.hidden.has('cum') ? cumAvgPathOf(cumAvg, x, y, bounds.T0, endMs) : ''),
    [cumAvg, x, y, bounds.T0, endMs, edge],
  );
  const teamD = useMemo(
    () => (team === undefined ? '' : teamAvgPathOf(team, x, y, range, endMs)),
    [team, x, y, range, endMs],
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

      {/* 거래대금 막대 — 가격 판 아래 1/5 · 축 글자 없음(D-06) */}
      <g clipPath={`url(#${clipId}-px)`} pointerEvents="none">
        <path data-slot="candle-amt-up" d={bars.up} fill="var(--up)" fillOpacity={0.38} />
        <path data-slot="candle-amt-down" d={bars.down} fill="var(--down)" fillOpacity={0.38} />
      </g>

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
        {maLines.map((m) => (
          <path
            key={m.key}
            data-slot="candle-ma-line"
            data-ma-key={m.key}
            d={m.d}
            fill="none"
            stroke={maColor(m.color)}
            strokeWidth={1.25}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
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
        {teamD !== '' && (
          <path
            data-slot="candle-team-avg"
            d={teamD}
            fill="none"
            stroke="var(--up)"
            strokeWidth={1.25}
            strokeDasharray="1 2"
            pointerEvents="none"
          />
        )}
      </g>

      <g clipPath={`url(#${clipId}-px)`}>
        <g data-slot="candle-price-overlay">{children}</g>
      </g>

      {/* 가장자리 글자 — 범위 밖 선 대신(D-16) · --card 테로 겹쳐도 읽힌다 */}
      {edge.labels.length > 0 && (
        <g data-slot="candle-edge-labels" aria-hidden="true" pointerEvents="none">
          {edge.labels.map((l) => (
            <text
              key={l.key}
              data-slot="candle-edge-label"
              x={l.x}
              y={l.y}
              fontSize={11}
              fontWeight={400}
              fill={l.fill}
              textAnchor={l.anchor}
              stroke="var(--card)"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {l.text}
            </text>
          ))}
        </g>
      )}

      {/* 판 제목(데스크톱만 · 그림 폭으로 자른다 · D-17) */}
      {!phone && unitLabel !== undefined && unitLabel !== '' && (
        <g clipPath={`url(#${clipId}-px)`} aria-hidden="true" pointerEvents="none">
          <text data-slot="candle-price-title" x={L + 4} y={P.y1a + 11} fontWeight={600} fill="var(--fg-2)">
            {unitLabel}
            {ma.length > 0 && ' · 이동평균 '}
            {ma.map((m, i) => (
              <Fragment key={m.key}>
                {i > 0 && ' · '}
                <tspan fill={maColor(m.color)}>{m.name}</tspan>
              </Fragment>
            ))}
            {' · '}
            <tspan fill="var(--up)">팀 평단</tspan>
            {cumAvg.length > 0 && (
              <>
                {' · '}
                <tspan fill="var(--muted-fg)">누적 평단(보고서)</tspan>
              </>
            )}
            {' · 팀 주문 원'}
            {ownInTitle && (
              <>
                {' · '}
                <tspan fill="var(--mine-fg)">◆ 우리 체결</tspan>
              </>
            )}
          </text>
        </g>
      )}

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
