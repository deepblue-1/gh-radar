'use client';

import { useId, useMemo, useRef, type ReactNode } from 'react';

import type { TickOpenResponse } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { useChartGestures, useChartView } from '@/hooks/use-chart-view';
import { useChartWidth } from '@/hooks/use-chart-width';
import { priceAxisWidthOf } from '@/lib/accum-chart';
import { kstClock } from '@/lib/limitup-report';
import {
  CANDLE_CHART,
  candleBaseOf,
  candlePanelsOf,
  candleRangeOf,
  candleUnitLabelOf,
  candleYOf,
  cumAvgPointsOf,
  type CandleFrame,
} from '@/lib/ticks/candle-chart';
import type { OwnModel } from '@/lib/ticks/own-model';
import {
  TICK_CHART,
  cursorXOf,
  lastRecvMsOf,
  lastTradeMsOfSession,
  msOfNs,
  priceSeriesOf,
  tickBoundsOf,
  tickTicksOf,
  viBandsOf,
  xOfTick,
} from '@/lib/ticks/tick-chart';
import type { TickSession } from '@/lib/ticks/tick-session';
import { cn } from '@/lib/utils';

import { CandlePriceLayer } from './candle-price-layer';

/**
 * 틱 뷰어 봉 차트 (Phase 42 · D-01 순수 SVG · viewBox 1:1 · 글자 11px — 선 차트 `tick-chart.tsx` 와 같은 자리 · 같은 props).
 *
 * ① 판(위 → 아래): 가격(봉 + 안쪽 거래대금 막대 · 160 / 폰 110) · 수익률(50 / 36) · 당일 팀 순매수 · 10분 팀 매수/매도 · 누적
 *   거래대금 — 전체 420 / 폰 303(`CANDLE_CHART`). 틱 선은 그리지 않는다(D-08).
 * ② 레이어: 장전 음영 · 빈 띠 · VI 띠(다섯 판 공통) → 시각 격자 → 가격 판 층(`CandlePriceLayer` — 봉 · 누적 평단) → 현재 틱
 *   커서 → 판 아래선 · 시각 눈금.
 * ③ 조작: 휠 = 확대/축소 · 끌기 · 핀치 = 이동(`useChartGestures` · 최소 창 10초) · `+ − 0` 키. 클릭 점프 · 확대 버튼 ·
 *   Shift+끌기 · 길게 누르기 · 팀 원 · 우리 점은 42-09, 봉 단위 · 이동평균 · 나머지 판 · 값 띠 · 캡션은 42-04 ~ 42-10 이
 *   구조 변경 없이 채운다(트레이서 42-01 = 1분봉 + 누적 평단).
 * ④ 높이 — 측정 폭 < 600 이면 폰 303 · 아니면 데스크톱 420(`height` 로 강제 가능). 축 폭 L 은 선 차트와 같은 식이라 전환 때
 *   그림 영역이 튀지 않는다.
 */

export interface CandleChartProps {
  session: TickSession;
  /** 열기 응답 `accum`(pos_net · avg_px · 없으면 null — D-09 · D-18). */
  accum?: TickOpenResponse['accum'];
  /** 당일 화면 — 누적 선을 그리지 않는다(D-09 · D-15). */
  isToday?: boolean;
  cursorRec: number;
  /** 차트 빈 곳 클릭 — 그 시각(수신 ms) 이후 첫 틱으로(42-09). */
  onSeekMs: (ms: number) => void;
  /** 주문 원 클릭 — 그 주문 마지막 조각 rec(42-09). */
  onJumpRec: (rec: number) => void;
  /** 종목 상장주식수 — 넷째 판 시총 대비 축(42-05). */
  listingShares?: number | null;
  /** 판 높이 강제(420 데스크톱 · 303 폰) — 생략하면 측정 폭으로 고른다. */
  height?: typeof CANDLE_CHART.desktop.H | typeof CANDLE_CHART.phone.H;
  /** 우리 체결 모델(Phase 38) — 42-09 가 가격 판에 겹친다. */
  own?: OwnModel | null;
  onOwnJump?: (rec: number, back?: number) => void;
  onOwnFillLine?: (fillId: number) => void;
  /** 제목 「타임라인」 바로 뒤 덧붙임 — 차트 종류 스위치(D-05). */
  titleAddon?: (phone: boolean) => ReactNode;
  className?: string;
}

/** 창 폭 글자 — 「하루 전체」 · 「n.n시간」 · 「n분」 · 「n초」(선 차트와 같은 규칙). */
function fmtSpan(ms: number): string {
  if (ms >= 12 * 3600e3 - 1) return '하루 전체';
  if (ms >= 3600e3) return `${(ms / 3600e3).toFixed(1)}시간`;
  if (ms >= 60e3) return `${Math.round(ms / 60e3)}분`;
  return `${Math.round(ms / 1e3)}초`;
}

export function CandleChart({
  session,
  accum = null,
  isToday = false,
  cursorRec,
  height,
  titleAddon,
  className,
}: CandleChartProps) {
  const [wrapRef, W] = useChartWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId().replace(/:/g, '');

  const bounds = useMemo(() => tickBoundsOf(session.date), [session.date]);
  const lastTradeMs = useMemo(() => lastTradeMsOfSession(session), [session]);
  const ctl = useChartView({ bounds, lastTradeMs, minViewMs: TICK_CHART.MIN_VIEW_MS });
  const { view } = ctl;

  const phone = height === undefined ? W < TICK_CHART.PHONE_MAX_W : height === CANDLE_CHART.phone.H;
  const dims = phone ? CANDLE_CHART.phone : CANDLE_CHART.desktop;
  const P = useMemo(() => candlePanelsOf(dims), [dims]);
  // 축 폭은 선 차트와 같은 식(하루 최고가) — 전환 때 그림 영역이 튀지 않는다
  const L = priceAxisWidthOf(priceSeriesOf(session).maxPx);
  const xr = W - TICK_CHART.R;
  const plotW = Math.max(1, xr - L);
  // 창 이동 잠금 — 42-09 의 터치 살펴보기 · Shift 구간 끌기가 쓴다
  const panLockRef = useRef(false);
  const { dragging } = useChartGestures(svgRef, { L, W, R: TICK_CHART.R }, ctl, panLockRef);

  const x = useMemo(() => xOfTick(view, L, xr), [view, L, xr]);
  const candles = candleBaseOf(session);
  const range = useMemo(() => candleRangeOf(candles, view), [candles, view]);
  const y = useMemo(() => candleYOf(range, P), [range, P]);
  const cumAvg = useMemo(() => cumAvgPointsOf(accum, isToday), [accum, isToday]);
  const endMs = lastRecvMsOf(session) ?? bounds.T2000;
  const frame: CandleFrame = { W, P, L, xr, plotW, phone, view, x, bounds, endMs };

  const cursorMs = cursorRec >= 0 ? msOfNs(session.index.recvNs[cursorRec]!) : null;
  const cx = cursorXOf(view, x, cursorMs);
  const ticks = tickTicksOf(view, plotW);
  const vis = useMemo(() => viBandsOf(session), [session]);
  const band = (t0: number, t1: number) => {
    const a = Math.max(L, x(t0));
    const b = Math.min(xr, x(t1));
    return b > a ? { x: a, w: Math.max(1.5, b - a) } : null;
  };
  const pre = band(bounds.T0, bounds.T0900);
  const gap = band(bounds.T1530, bounds.T1600);

  const span = view.t1 - view.t0;
  const cursorLabel = cursorMs === null ? '' : kstClock(cursorMs);
  const unitLabel = candleUnitLabelOf(candles.unit, false);
  const plotH = P.y4b - P.y1a;

  return (
    <section data-slot="candle-chart" aria-label="봉 차트" className={cn(CARD, 'min-w-0 overflow-hidden', className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--border-subtle)] px-3 py-[7px]">
        <h2 className="m-0 text-[12.5px] font-bold text-[var(--fg)]">타임라인</h2>
        {titleAddon?.(phone)}
        <span data-slot="candle-chart-span" className="mono ml-auto px-1.5 text-[11px] text-[var(--muted-fg)]">
          {fmtSpan(span)}
        </span>
      </div>

      <div
        ref={wrapRef}
        data-slot="candle-chart-wrap"
        className="relative px-0 py-1"
        role="group"
        tabIndex={0}
        aria-label="봉 차트 보기 창 — +·− 확대/축소, 0 하루 전체"
        onKeyDown={ctl.onKeyDown}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${P.H}`}
          width="100%"
          height={P.H}
          role="img"
          aria-label={`봉 차트 — ${unitLabel} · 보기 창 ${fmtSpan(span)}${cursorLabel ? ` · 현재 틱 ${cursorLabel}` : ''}`}
          data-slot="candle-chart-svg"
          data-dims={phone ? 'phone' : 'desktop'}
          className={cn('block tabular-nums', dragging ? 'cursor-grabbing' : 'cursor-crosshair')}
          style={{ touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
          fontSize={11}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={L} y={0} width={plotW} height={P.y4b} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            {/* 장전 음영 · 빈 띠 · VI 띠 — 다섯 판 공통 */}
            {pre && <rect data-slot="candle-pre-shade" x={pre.x} y={P.y1a} width={pre.w} height={plotH} fill="var(--accum-shade)" />}
            {gap && <rect data-slot="candle-gap-band" x={gap.x} y={P.y1a} width={gap.w} height={plotH} fill="var(--accum-gap)" />}
            {vis.map((v) => {
              const b = band(v.t0, v.t1);
              return b === null ? null : (
                <rect
                  key={v.t0}
                  data-slot="candle-vi-band"
                  data-open={v.open ? '1' : '0'}
                  x={b.x}
                  y={P.y1a}
                  width={b.w}
                  height={plotH}
                  fill="var(--vi)"
                  fillOpacity={0.14}
                >
                  <title>{`VI ${kstClock(v.t0)} ~ ${v.open ? '진행 중' : kstClock(v.t1)}`}</title>
                </rect>
              );
            })}

            {/* 시각 격자 */}
            {ticks.map((tk) => (
              <line
                key={tk.t}
                x1={x(tk.t)}
                x2={x(tk.t)}
                y1={P.y1a}
                y2={P.y4b}
                stroke="var(--border-subtle)"
                strokeWidth={1}
              />
            ))}
          </g>

          {/* ① 가격 판 — 봉 · 누적 평단 · (42-09) 팀 원 · 우리 점 자리 · 가격 축 */}
          <CandlePriceLayer frame={frame} candles={candles} range={range} y={y} cumAvg={cumAvg} clipId={clipId} />

          {/* 현재 틱 커서 — 다섯 판 관통 */}
          {cx !== null && (
            <line
              data-slot="candle-chart-cursor"
              x1={cx}
              x2={cx}
              y1={P.y1a}
              y2={P.y4b}
              stroke="var(--fg)"
              strokeWidth={1}
              pointerEvents="none"
            />
          )}

          {/* 판 아래선 */}
          {[P.y1b, P.yRb, P.y2b, P.y3b, P.y4b].map((yy) => (
            <line key={yy} x1={L} x2={xr} y1={yy} y2={yy} stroke="var(--border-subtle)" />
          ))}

          {/* 시각 눈금 */}
          <g fill="var(--muted-fg)" aria-hidden="true">
            {ticks.map((tk) => (
              <text key={tk.t} x={x(tk.t)} y={P.H - 3} textAnchor="middle">
                {tk.label}
              </text>
            ))}
          </g>
        </svg>
      </div>
    </section>
  );
}
