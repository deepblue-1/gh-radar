'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';

import { CARD } from '@/components/layout/page-layout';
import { useChartGestures, useChartView } from '@/hooks/use-chart-view';
import { useChartWidth } from '@/hooks/use-chart-width';
import { panBy, priceAxisWidthOf, type View } from '@/lib/accum-chart';
import { kstClock } from '@/lib/limitup-report';
import {
  TICK_CHART,
  cursorXOf,
  lastTradeMsOfSession,
  msOfNs,
  priceSeriesOf,
  pricePathDecimated,
  tOfTick,
  tickBoundsOf,
  tickPanelsOf,
  tickPriceRangeOf,
  tickTicksOf,
  xOfTick,
  yOfTickPrice,
} from '@/lib/ticks/tick-chart';
import type { TickSession } from '@/lib/ticks/tick-session';
import { cn } from '@/lib/utils';

/**
 * 틱 뷰어 3판 차트 (Phase 37 D-00 ① · 스케치 019 D · 매집감지 상세 차트와 같은 레이어 순서 · 순수 SVG · viewBox 1:1 · 글자 11px).
 *
 * ① 판 — 가격 선(열별 4점 솎음) | 당일 팀 순매수 · 누적 | 10분 팀 매수/매도(팀 레이어는 37-14 Task 2). 현재 틱 커서가 세 판을
 *   관통하고 아래 눈금 띠에 시각 라벨을 단다.
 * ② 조작 — 휠 = 확대/축소 · 끌기 = 이동(`useChartGestures` · 최소 창 10초) · 클릭 = 그 시각 이후 첫 틱(`onSeekMs`) ·
 *   주문 원 클릭 = 그 주문 마지막 조각(`onJumpRec`) · `+` `−` `0` 키(← → 는 커서 이동이라 차트가 가로채지 않는다) ·
 *   「1분」「10초」 버튼 = 커서 중심 창 · 커서가 창 밖으로 나가면 창이 커서를 가운데로 따라간다.
 * ③ 높이 — 측정 폭 < 600 이면 폰 165 · 아니면 데스크톱 230(`height` 로 강제 가능). 폰은 판 제목 글자를 생략한다.
 */

export interface TickChartProps {
  session: TickSession;
  cursorRec: number;
  /** 차트 빈 곳 클릭 — 그 시각(수신 ms) 이후 첫 틱으로. */
  onSeekMs: (ms: number) => void;
  /** 주문 원 클릭 — 그 주문 마지막 조각 rec. */
  onJumpRec: (rec: number) => void;
  /** 판 높이 강제(230 데스크톱 · 165 폰) — 생략하면 측정 폭으로 고른다. */
  height?: 230 | 165;
  className?: string;
}

/** 클릭으로 볼 끌기 문턱(px) — 이보다 많이 움직였으면 끌기(이동)였다. */
const CLICK_SLOP_PX = 4;
const PX_FMT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

/** 창 폭 글자 — 「하루 전체」 · 「n.n시간」 · 「n분」 · 「n초」. */
function fmtSpan(ms: number): string {
  if (ms >= 12 * 3600e3 - 1) return '하루 전체';
  if (ms >= 3600e3) return `${(ms / 3600e3).toFixed(1)}시간`;
  if (ms >= 60e3) return `${Math.round(ms / 60e3)}분`;
  return `${Math.round(ms / 1e3)}초`;
}

export function TickChart({ session, cursorRec, onSeekMs, onJumpRec, height, className }: TickChartProps) {
  const [wrapRef, W] = useChartWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId().replace(/:/g, '');

  const bounds = useMemo(() => tickBoundsOf(session.date), [session.date]);
  const series = priceSeriesOf(session);
  const lastTradeMs = useMemo(() => lastTradeMsOfSession(session), [session]);
  const ctl = useChartView({ bounds, lastTradeMs, minViewMs: TICK_CHART.MIN_VIEW_MS });
  const { view } = ctl;

  const phone = height === undefined ? W < TICK_CHART.PHONE_MAX_W : height === 165;
  const dims = phone ? TICK_CHART.phone : TICK_CHART.desktop;
  const P = tickPanelsOf(dims);
  const L = priceAxisWidthOf(series.maxPx);
  const xr = W - TICK_CHART.R;
  const plotW = Math.max(1, xr - L);
  const { dragging } = useChartGestures(svgRef, { L, W, R: TICK_CHART.R }, ctl);

  const cursorMs = cursorRec >= 0 ? msOfNs(session.index.recvNs[cursorRec]!) : null;

  // 커서가 창 밖이면 창이 따라간다(커서 이동 때만 — 사용자가 끌어 커서를 창 밖에 둔 것은 그대로).
  const viewRef = useRef<View>(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  });
  const { schedule } = ctl;
  useEffect(() => {
    if (cursorMs === null) return;
    const v = viewRef.current;
    if (cursorMs >= v.t0 && cursorMs <= v.t1) return;
    schedule((w) => panBy(w, cursorMs - (w.t0 + w.t1) / 2));
  }, [cursorMs, schedule]);

  const x = xOfTick(view, L, xr);
  const range = tickPriceRangeOf(series, view);
  const y = yOfTickPrice(range, P);
  const priceD = pricePathDecimated(session, view, x, y, plotW);
  const ticks = tickTicksOf(view, plotW);
  const cx = cursorXOf(view, x, cursorMs);

  // 클릭 = 그 시각 첫 틱 · 원 클릭 = 그 주문 마지막 조각. 끌기(4px 넘게 움직임)는 클릭이 아니다.
  const downRef = useRef<{ x: number; y: number; orderRec: number | null } | null>(null);
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const el = (e.target as Element).closest?.('[data-order-rec]');
    downRef.current = { x: e.clientX, y: e.clientY, orderRec: el ? Number(el.getAttribute('data-order-rec')) : null };
  };
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const down = downRef.current;
    downRef.current = null;
    if (down !== null && Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) return;
    const el = (e.target as Element).closest?.('[data-order-rec]');
    const orderRec = down?.orderRec ?? (el ? Number(el.getAttribute('data-order-rec')) : null);
    if (orderRec !== null && Number.isFinite(orderRec)) {
      onJumpRec(orderRec);
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = rect.width > 0 ? W / rect.width : 1;
    const px = (e.clientX - rect.left) * scale;
    if (px < L || px > xr) return;
    onSeekMs(tOfTick(view, L, xr)(px));
  };

  // 키 — + − 0 만 차트가 받는다(← → 는 창 키 = 커서 이동 · use-tick-cursor).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') return;
    ctl.onKeyDown(e);
  };

  /** 커서 중심 폭 w 창(커서가 없으면 지금 창 가운데). */
  const zoomTo = (w: number) => {
    const c = cursorMs ?? (view.t0 + view.t1) / 2;
    schedule(() => ({ t0: c - w / 2, t1: c + w / 2 }));
  };
  const zoomBy = (k: number) => {
    const c = cursorMs !== null && cursorMs >= view.t0 && cursorMs <= view.t1 ? cursorMs : (view.t0 + view.t1) / 2;
    schedule((v) => ({ t0: c - (c - v.t0) * k, t1: c + (v.t1 - c) * k }));
  };

  const btn =
    'rounded-full px-2 py-0.5 text-[11px] font-semibold text-[var(--fg-2)] hover:bg-[var(--muted)] focus-visible:bg-[var(--muted)]';
  const span = view.t1 - view.t0;
  const cursorLabel = cursorMs === null ? '' : kstClock(cursorMs);
  const curLabW = 58;

  return (
    <section data-slot="tick-chart" aria-label="틱 차트" className={cn(CARD, 'min-w-0 overflow-hidden', className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--border-subtle)] px-3 py-[7px]">
        <h2 className="m-0 text-[12.5px] font-bold text-[var(--fg)]">매집감지 3판</h2>
        {!phone && (
          <span className="truncate text-[11px] text-[var(--muted-fg)]">
            가격 · 팀 평단 · 팀 주문 원 | <span className="text-[var(--team)]">당일 팀 순매수</span> · 누적 | 10분 팀
            매수/매도 · <span className="text-[var(--vi)]">VI</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <span data-slot="tick-chart-span" className="mono px-1.5 text-[11px] text-[var(--muted-fg)]">
            {fmtSpan(span)}
          </span>
          <button type="button" className={btn} aria-label="확대" title="확대 (+)" onClick={() => zoomBy(0.5)}>
            ＋
          </button>
          <button type="button" className={btn} aria-label="축소" title="축소 (−)" onClick={() => zoomBy(2)}>
            －
          </button>
          <button type="button" className={btn} title="하루 전체 (0)" onClick={() => ctl.setPreset('full')}>
            전체
          </button>
          <button type="button" className={btn} onClick={() => zoomTo(60_000)}>
            1분
          </button>
          <button type="button" className={btn} onClick={() => zoomTo(10_000)}>
            10초
          </button>
        </span>
      </div>

      <div
        ref={wrapRef}
        data-slot="tick-chart-wrap"
        className="relative px-0 py-1"
        role="group"
        tabIndex={0}
        aria-label="틱 차트 보기 창 — +·− 확대/축소, 0 하루 전체, 클릭하면 그 시각으로 이동"
        onKeyDown={onKeyDown}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${P.H}`}
          width="100%"
          height={P.H}
          role="img"
          aria-label={`틱 차트 — 보기 창 ${fmtSpan(span)}${cursorLabel ? ` · 현재 틱 ${cursorLabel}` : ''}`}
          data-slot="tick-chart-svg"
          data-dims={phone ? 'phone' : 'desktop'}
          className={cn('block tabular-nums', dragging ? 'cursor-grabbing' : 'cursor-crosshair')}
          style={{ touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
          fontSize={11}
          onPointerDown={onPointerDown}
          onClick={onClick}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={L} y={0} width={plotW} height={P.y3b} />
            </clipPath>
            <clipPath id={`${clipId}-px`}>
              <rect x={L} y={P.y1a - 7} width={plotW} height={P.y1b - P.y1a + 14} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            {/* 시각 격자 */}
            {ticks.map((tk) => (
              <line
                key={tk.t}
                x1={x(tk.t)}
                x2={x(tk.t)}
                y1={P.y1a}
                y2={P.y3b}
                stroke="var(--border-subtle)"
                strokeWidth={1}
              />
            ))}

            {/* 가격 선 */}
            <g data-slot="tick-price-layer" clipPath={`url(#${clipId}-px)`}>
              <path
                data-slot="tick-price-path"
                d={priceD}
                fill="none"
                stroke="var(--fg-2)"
                strokeWidth={1.25}
                strokeLinejoin="round"
              />
            </g>

            {/* 현재 틱 커서 — 세 판 관통 */}
            {cx !== null && (
              <line
                data-slot="tick-chart-cursor"
                x1={cx}
                x2={cx}
                y1={P.y1a}
                y2={P.y3b}
                stroke="var(--fg)"
                strokeWidth={1}
                pointerEvents="none"
              />
            )}
          </g>

          {/* 판 아래선 */}
          {[P.y1b, P.y2b, P.y3b].map((yy) => (
            <line key={yy} x1={L} x2={xr} y1={yy} y2={yy} stroke="var(--border-subtle)" />
          ))}

          {/* 가격 축(왼쪽) — 창 안 최대 · 최소 */}
          <g data-slot="tick-px-axis" fill="var(--muted-fg)" aria-hidden="true">
            {series.n > 0 && (
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

          {/* 시각 눈금 */}
          <g fill="var(--muted-fg)" aria-hidden="true">
            {ticks.map((tk) => (
              <text key={tk.t} x={x(tk.t)} y={P.H - 3} textAnchor="middle">
                {tk.label}
              </text>
            ))}
          </g>

          {!phone && (
            <text x={L + 4} y={P.y1a + 11} fill="var(--fg-2)" fontWeight={600} aria-hidden="true">
              가격
            </text>
          )}

          {/* 커서 시각 라벨(아래 눈금 띠) */}
          {cx !== null && (
            <g data-slot="tick-chart-cursor-label" pointerEvents="none">
              <rect
                x={Math.min(xr - curLabW, Math.max(L, cx - curLabW / 2))}
                y={P.y3b + 1}
                width={curLabW}
                height={13}
                rx={3}
                fill="var(--fg)"
              />
              <text
                x={Math.min(xr - curLabW, Math.max(L, cx - curLabW / 2)) + curLabW / 2}
                y={P.y3b + 11}
                textAnchor="middle"
                fill="var(--bg)"
                fontWeight={600}
              >
                {cursorLabel}
              </text>
            </g>
          )}
        </svg>
      </div>
    </section>
  );
}
