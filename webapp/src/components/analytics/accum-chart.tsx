'use client';

import { useId, useRef } from 'react';

import type { AccumDetailRow, AccumReportPayload } from '@gh-radar/shared';

import { useChartGestures, type ChartViewControl } from '@/hooks/use-chart-view';
import { useChartWidth } from '@/hooks/use-chart-width';
import {
  ACCUM_CHART,
  bucketBarsOf,
  bucketMaxOf,
  carryLineOf,
  cumPathOf,
  cumRangeOf,
  cumTicksOf,
  cycleMarksOf,
  dayBoundsOf,
  dayMaxPxOf,
  gapBandOf,
  labelRowsOf,
  orderCirclesOf,
  priceAxisWidthOf,
  pricePathOf,
  priceClipOf,
  pricePointsOf,
  priceRangeOf,
  priceTicksOf,
  shadeOf,
  ticksOf,
  xOfView,
  yOfCum,
  yOfPrice,
  type ChartLabel,
  type View,
} from '@/lib/accum-chart';
import { fmtEok, kstHm } from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

/**
 * 매집감지 상세 3판 차트 — 정적 레이어 (Phase 34 · UI-SPEC A6 · D-14 ~ D-18 · D-17 순수 SVG).
 *
 * - 래퍼 `div` 폭을 `useChartWidth` 로 재고(측정 전 · jsdom = 640) `viewBox="0 0 {W} 472"` 를 그 폭과 **1:1** — 글자 11px 고정.
 * - 세 판(가격 · 순매수 누적 · 10분 팀 매수/매도)이 같은 x(ms) 창 `view` 를 공유한다. 창은 부모가 준다(`useChartView`).
 * - **조작(34-07 · A6):** 래퍼가 `role="group"` `tabIndex=0` 키보드 영역(←/→/+/−/0 · 접근 이름 A6)이 되고, SVG 에
 *   휠 · 끌기 · 핀치 리스너(`useChartGestures`)를 단다. SVG `touch-action: pan-y`(폰 세로 스크롤은 브라우저 · 가로 끌기 · 핀치만
 *   차트 — Pitfall 12) · `user-select: none` · 커서 grab / 끌기 중 grabbing. 포커스 링은 전역 `*:focus-visible` 상속.
 *   훅에는 그림 영역 좌우(L = `priceAxisWidthOf` · R = `ACCUM_CHART.R`)와 viewBox 폭 W 를 넘긴다 — 픽셀 → 시각 변환 기준.
 * - 레이어(아래 → 위 · UI-SPEC A6): ① 등록 전 음영 · 15:30~16:00 빈 띠 ② 시각 격자 · 판 아래선 ③ 누적 0선 · 계단
 *   ④ 10분 막대 쌍 ⑤ 가격 선 ⑥ 사이클 세로선(등록 실선 --team · 종료 점선 --muted-fg · 폭 8 히트 rect + <title>)
 *   ⑦ 주문 원(큰 원 → 작은 원 → first) ⑧ 축 글자 · 판 제목 · 시각 눈금 · 세로선 라벨(labelRowsOf) · 이월 줄.
 *   데이터 레이어는 그림 영역 `clipPath` 안, 세로선(창 안 것만 — 왼쪽 끝 선이 반쯤 잘리지 않게)과 글자는 밖. 가격 선 · 주문 원은
 *   가격 판 높이 클립(`priceClipOf`)을 한 겹 더 쓴다(WR-01 — 창 경계를 넘는 선분이 누적 · 10분 판 · 라벨 띠를 가르지 않게).
 *   불투명도(DOM `fill-opacity` · `stroke-opacity`): 원 채움 .55 · 테두리 .9 · first 채움 .9 · 10분 막대 .7.
 * - 팀 체결 없음(해당 배열이 빔)이면 누적 판 · 10분 판 가운데 「팀 체결 없음」 — 가격 선 · 0선 · 축 · 빈 띠는 그대로.
 * - `payload` 는 부모가 `payloadOf` 로 모양을 확인해 넘긴다(WR-05). 없거나 `price.idx` 가 비면 그리지 않는다(null — 대체 문구
 *   「그날 체결 자료 없음」 은 34-07).
 * - 폰에서는 `<title>` 툴팁이 뜨지 않는다 — v1 은 KPI 줄 · 사이클 표 · 손익 줄 글자가 수치를 맡는다(D-15 「<title> 또는 동급」).
 */

const { R, TOP, H1, GAP, H2, H3, H } = ACCUM_CHART;
/** 누적 판 위끝 · 10분 판 위끝 · 세 판 아래끝. */
const C_TOP = TOP + H1 + GAP;
const B_TOP = C_TOP + H2 + GAP;
const PLOT_BOTTOM = B_TOP + H3;
const PX_FMT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

export function AccumChart({
  row,
  payload,
  view,
  ctl,
}: {
  row: AccumDetailRow;
  /** 모양 확인을 거친 payload(`payloadOf` · WR-05) — row.payload 를 직접 읽지 않는다 */
  payload: AccumReportPayload | null;
  view: View;
  ctl: ChartViewControl;
}) {
  const [ref, W] = useChartWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const rawId = useId();
  const hasPrice = payload !== null && payload.price.idx.length > 0;
  const L = hasPrice ? priceAxisWidthOf(dayMaxPxOf(payload.price, payload.orders)) : priceAxisWidthOf(0);
  const { dragging } = useChartGestures(svgRef, { L, W, R }, hasPrice ? ctl : null);
  if (!hasPrice) return null;

  const clipId = `accum-clip-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const right = W - R;
  const midX = (L + right) / 2;
  const x = xOfView(view, L, W);
  const bounds = dayBoundsOf(payload.price.t0_ms);

  const points = pricePointsOf(payload.price);
  const pRange = priceRangeOf(points, payload.orders, view);
  const yP = yOfPrice(pRange);
  const pxTicks = priceTicksOf(pRange);
  const priceD = pricePathOf(points, view, x, yP);
  const pxClip = priceClipOf(L, W);

  const cRange = cumRangeOf(payload.day_cum_net);
  const yC = yOfCum(cRange);
  const cumTicks = cumTicksOf(cRange, yC);
  const cumD = cumPathOf(payload.day_cum_net, x, yC, bounds.T2000);
  const zeroY = yC(0);

  const bMax = bucketMaxOf(payload.buckets);
  const bars = bucketBarsOf(payload.buckets, view, x, bounds.T0, B_TOP, H3, bMax);
  const circles = orderCirclesOf(payload.orders, view, x, yP);
  const gap = gapBandOf(bounds, x);
  const shade = shadeOf(row, payload, bounds.T0);

  const ticks = ticksOf(view, right - L);
  const inView = (t: number) => t >= view.t0 && t <= view.t1;
  const lines: (ChartLabel & { title: string })[] = [];
  for (const m of cycleMarksOf(row, payload, bounds.T0)) {
    if (m.reg && inView(m.reg.tx)) lines.push({ id: `r${m.k}`, x: x(m.reg.tx), text: m.reg.label, kind: 'reg', title: m.reg.title });
    if (m.end && inView(m.end.tx)) lines.push({ id: `e${m.k}`, x: x(m.end.tx), text: m.end.label, kind: 'end', title: m.end.title });
  }
  const carry = carryLineOf(row);
  const labels = labelRowsOf(lines, L, right, carry);

  const noCum = payload.day_cum_net.t_ms.length === 0;
  const noBuckets = payload.buckets.length === 0;

  const name = row.name ?? row.short_code;
  const ariaLabel = `${name} 매집 상세 차트 — ${kstHm(view.t0)}~${kstHm(view.t1)} · 사이클 ${payload.cycles.length}개 · 팀 주문 ${payload.orders.t_ms.length}건 · 하루 순매수 ${fmtEok(row.day_net_krw, { signed: true })}`;

  return (
    <div
      ref={ref}
      data-slot="accum-chart-wrap"
      role="group"
      tabIndex={0}
      aria-label={`${name} 차트 보기 창 — 왼쪽·오른쪽 화살표 이동, +·− 확대/축소, 0 전체`}
      onKeyDown={ctl.onKeyDown}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={ariaLabel}
        data-slot="accum-chart"
        className={cn('block tabular-nums', dragging ? 'cursor-grabbing' : 'cursor-grab')}
        style={{ touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
        fontSize={11}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={L} y={0} width={Math.max(0, right - L)} height={H} />
          </clipPath>
          {/* 가격 레이어 전용 — 가격 판 높이만(WR-01 · 창 경계 선분이 다른 판을 가르지 않게) */}
          <clipPath id={`${clipId}-px`}>
            <rect x={pxClip.x} y={pxClip.y} width={pxClip.w} height={pxClip.h} />
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

          {/* ② 시각 격자 */}
          {ticks.map((tk) => (
            <line
              key={tk.t}
              x1={x(tk.t)}
              x2={x(tk.t)}
              y1={TOP}
              y2={PLOT_BOTTOM}
              stroke="var(--border-subtle)"
              strokeWidth={1}
            />
          ))}

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

          {/* ⑤ 가격 선 · ⑦ 주문 원 — 가격 판 높이 클립(WR-01) */}
          <g data-slot="accum-price-layer" clipPath={`url(#${clipId}-px)`}>
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
        </g>

        {/* ② 판 아래선 */}
        <line x1={L} x2={right} y1={TOP + H1} y2={TOP + H1} stroke="var(--border-subtle)" />
        <line x1={L} x2={right} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke="var(--border-subtle)" />

        {/* ⑥ 사이클 세로선 — 선마다 폭 8 투명 히트 rect + <title> */}
        {lines.map((l) => (
          <g key={l.id} data-slot="accum-cycle-line">
            <title>{l.title}</title>
            <rect x={l.x - 4} y={TOP} width={8} height={PLOT_BOTTOM - TOP} fill="transparent" />
            {l.kind === 'reg' ? (
              <line x1={l.x} x2={l.x} y1={TOP} y2={PLOT_BOTTOM} stroke="var(--team)" strokeWidth={1.5} />
            ) : (
              <line
                x1={l.x}
                x2={l.x}
                y1={TOP}
                y2={PLOT_BOTTOM}
                stroke="var(--muted-fg)"
                strokeWidth={1.25}
                strokeDasharray="4 3"
              />
            )}
          </g>
        ))}

        {/* ⑧ 축 글자(클립 밖) */}
        <g data-slot="accum-px-axis" fill="var(--muted-fg)" aria-hidden="true">
          {pxTicks.map((p) => (
            <text key={p} x={L - 6} y={yP(p) + 3} textAnchor="end">
              {PX_FMT.format(p)}
            </text>
          ))}
        </g>
        <g data-slot="accum-cum-axis" fill="var(--team)" aria-hidden="true">
          {cumTicks.map((c) => (
            <text key={c} x={right + 6} y={yC(c) + 3}>
              {fmtEok(c, { signed: true })}
            </text>
          ))}
        </g>
        {bMax > 0 && (
          <text data-slot="accum-bucket-max" x={right + 6} y={B_TOP + 8} fill="var(--muted-fg)" aria-hidden="true">
            {fmtEok(bMax)}
          </text>
        )}
        <text x={L} y={C_TOP - 8} fill="var(--team)" fontWeight={600}>
          순매수 누적
        </text>
        <text x={L} y={B_TOP - 8} fill="var(--fg-2)" fontWeight={600}>
          10분 팀 매수 / 매도
        </text>
        <g fill="var(--muted-fg)" aria-hidden="true">
          {ticks.map((tk) => (
            <text key={tk.t} x={x(tk.t)} y={ACCUM_CHART.TICK_Y} textAnchor="middle">
              {tk.label}
            </text>
          ))}
        </g>
        {labels.map((l) => (
          <text
            key={l.id}
            data-slot="accum-cycle-label"
            x={l.textX}
            y={l.y}
            textAnchor={l.anchor}
            fill={l.kind === 'reg' ? 'var(--team)' : 'var(--muted-fg)'}
            fontWeight={l.kind === 'reg' ? 600 : 400}
          >
            {l.text}
          </text>
        ))}
        {carry && (
          <text data-slot="accum-carry-line" x={L + 4} y={27} fill="var(--accum-carry)" fontWeight={600}>
            {carry}
          </text>
        )}

        {/* 빈 판 글자 */}
        {noCum && (
          <text x={midX} y={C_TOP + H2 / 2 + 4} textAnchor="middle" fill="var(--muted-fg)" fontWeight={400}>
            팀 체결 없음
          </text>
        )}
        {noBuckets && (
          <text x={midX} y={B_TOP + H3 / 2 + 4} textAnchor="middle" fill="var(--muted-fg)" fontWeight={400}>
            팀 체결 없음
          </text>
        )}
      </svg>
    </div>
  );
}
