'use client';

import { useId } from 'react';

import type { AccumDetailRow } from '@gh-radar/shared';

import { useChartWidth } from '@/hooks/use-chart-width';
import {
  ACCUM_CHART,
  bucketBarsOf,
  bucketMaxOf,
  cumPathOf,
  cumRangeOf,
  dayBoundsOf,
  dayMaxPxOf,
  gapBandOf,
  orderCirclesOf,
  priceAxisWidthOf,
  pricePathOf,
  pricePointsOf,
  priceRangeOf,
  shadeOf,
  xOfView,
  yOfCum,
  yOfPrice,
  type View,
} from '@/lib/accum-chart';
import { fmtEok, kstHm } from '@/lib/teamflow-report';

/**
 * 매집감지 상세 3판 차트 — 정적 레이어 (Phase 34 · UI-SPEC A6 · D-14 ~ D-18 · D-17 순수 SVG).
 *
 * - 래퍼 `div` 폭을 `useChartWidth` 로 재고(측정 전 · jsdom = 640) `viewBox="0 0 {W} 472"` 를 그 폭과 **1:1** — 글자 11px 고정.
 * - 세 판(가격 · 순매수 누적 · 10분 팀 매수/매도)이 같은 x(ms) 창 `view` 를 공유한다. 창은 부모가 준다(34-07 이 확대/이동 훅으로 바꾼다).
 * - 레이어(아래 → 위 · UI-SPEC A6): ① 등록 전 음영 · 15:30~16:00 빈 띠 ② 판 아래선 ③ 누적 0선 · 계단 ④ 10분 막대 쌍
 *   ⑤ 가격 선 ⑦ 주문 원(큰 원 → 작은 원 → first). 데이터 레이어는 그림 영역 `clipPath` 안, 축 글자는 밖.
 *   불투명도(DOM `fill-opacity` · `stroke-opacity`): 원 채움 .55 · 테두리 .9 · first 채움 .9 · 10분 막대 .7.
 * - 팀 체결 없음(해당 배열이 빔)이면 누적 판 · 10분 판 가운데 「팀 체결 없음」 — 가격 선 · 0선 · 축 · 빈 띠는 그대로.
 * - `payload` 가 없거나 `price.idx` 가 비면 그리지 않는다(null — 대체 문구 「그날 체결 자료 없음」 은 34-07).
 * - 폰에서는 `<title>` 툴팁이 뜨지 않는다 — v1 은 KPI 줄 · 사이클 표 · 손익 줄 글자가 수치를 맡는다(D-15 「<title> 또는 동급」).
 */

const { R, TOP, H1, GAP, H2, H3, H } = ACCUM_CHART;
/** 누적 판 위끝 · 10분 판 위끝 · 세 판 아래끝. */
const C_TOP = TOP + H1 + GAP;
const B_TOP = C_TOP + H2 + GAP;
const PLOT_BOTTOM = B_TOP + H3;

export function AccumChart({ row, view }: { row: AccumDetailRow; view: View }) {
  const [ref, W] = useChartWidth<HTMLDivElement>();
  const rawId = useId();
  const payload = row.payload;
  if (payload === null || payload.price.idx.length === 0) return null;

  const clipId = `accum-clip-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const L = priceAxisWidthOf(dayMaxPxOf(payload.price, payload.orders));
  const right = W - R;
  const midX = (L + right) / 2;
  const x = xOfView(view, L, W);
  const bounds = dayBoundsOf(payload.price.t0_ms);

  const points = pricePointsOf(payload.price);
  const yP = yOfPrice(priceRangeOf(points, payload.orders, view));
  const priceD = pricePathOf(points, view, x, yP);

  const yC = yOfCum(cumRangeOf(payload.day_cum_net));
  const cumD = cumPathOf(payload.day_cum_net, x, yC, bounds.T2000);
  const zeroY = yC(0);

  const bars = bucketBarsOf(payload.buckets, view, x, bounds.T0, B_TOP, H3, bucketMaxOf(payload.buckets));
  const circles = orderCirclesOf(payload.orders, view, x, yP);
  const gap = gapBandOf(bounds, x);
  const shade = shadeOf(row, payload, bounds.T0);

  const noCum = payload.day_cum_net.t_ms.length === 0;
  const noBuckets = payload.buckets.length === 0;

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
          {/* ① 등록 전 음영 · 15:30~16:00 빈 띠(세 판 전체 높이) */}
          {shade && (
            <rect
              data-slot="accum-shade"
              x={x(shade.t0)}
              y={TOP}
              width={Math.max(0, x(shade.t1) - x(shade.t0))}
              height={PLOT_BOTTOM - TOP}
              fill="var(--accum-shade)"
            />
          )}
          <rect
            data-slot="accum-gap"
            x={gap.x}
            y={TOP}
            width={Math.max(0, gap.w)}
            height={PLOT_BOTTOM - TOP}
            fill="var(--accum-gap)"
          />

          {/* ③ 누적 판 0선 · 계단 */}
          <line
            data-slot="accum-cum-zero"
            x1={L}
            x2={right}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--faint)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          {cumD !== '' && (
            <path
              data-slot="accum-cum-path"
              d={cumD}
              fill="none"
              stroke="var(--team)"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          )}

          {/* ④ 10분 막대 쌍 — 칸마다 투명 히트 rect + <title> */}
          {bars.map((b) => (
            <g key={b.slot} data-slot="accum-bucket">
              <title>{b.title}</title>
              <rect x={b.hit.x} y={b.hit.y} width={Math.max(0, b.hit.w)} height={b.hit.h} fill="transparent" />
              {b.buy && (
                <rect x={b.buy.x} y={b.buy.y} width={b.buy.w} height={b.buy.h} fill="var(--up)" fillOpacity={0.7} />
              )}
              {b.sell && (
                <rect x={b.sell.x} y={b.sell.y} width={b.sell.w} height={b.sell.h} fill="var(--down)" fillOpacity={0.7} />
              )}
            </g>
          ))}

          {/* ⑤ 가격 선 */}
          <path
            data-slot="accum-price-path"
            d={priceD}
            fill="none"
            stroke="var(--fg-2)"
            strokeWidth={1.25}
            strokeLinejoin="round"
          />

          {/* ⑦ 주문 원 — 큰 원 → 작은 원 → first(맨 위) */}
          {circles.map((c, i) => {
            const color = c.side === 'B' ? 'var(--up)' : 'var(--down)';
            return (
              <circle
                key={i}
                cx={c.cx}
                cy={c.cy}
                r={c.r}
                fill={color}
                fillOpacity={c.first ? 0.9 : 0.55}
                stroke={c.first ? 'var(--fg)' : color}
                strokeOpacity={c.first ? 1 : 0.9}
                strokeWidth={c.first ? 1.5 : 0.75}
              >
                <title>{c.title}</title>
              </circle>
            );
          })}
        </g>

        {/* ② 판 아래선 */}
        <line x1={L} x2={right} y1={TOP + H1} y2={TOP + H1} stroke="var(--border-subtle)" />
        <line x1={L} x2={right} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke="var(--border-subtle)" />

        {/* 빈 판 글자 */}
        {noCum && (
          <text x={midX} y={C_TOP + H2 / 2 + 4} textAnchor="middle" fill="var(--faint)" fontWeight={400}>
            팀 체결 없음
          </text>
        )}
        {noBuckets && (
          <text x={midX} y={B_TOP + H3 / 2 + 4} textAnchor="middle" fill="var(--faint)" fontWeight={400}>
            팀 체결 없음
          </text>
        )}
      </svg>
    </div>
  );
}
