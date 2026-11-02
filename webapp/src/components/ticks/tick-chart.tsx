'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';

import type { TickOpenResponse } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { useChartGestures, useChartView } from '@/hooks/use-chart-view';
import { useChartWidth } from '@/hooks/use-chart-width';
import { orderRadiusOf, panBy, priceAxisWidthOf, type View } from '@/lib/accum-chart';
import { kstClock } from '@/lib/limitup-report';
import { teamCirclesOf } from '@/lib/ticks/team-model';
import {
  TICK_CHART,
  bucketMaxOfModel,
  cumNetRangeOf,
  cumPointsOf,
  cumStairsOf,
  cursorXOf,
  dayNetRangeOf,
  lastRecvMsOf,
  teamAvgPathOf,
  teamBucketsOf,
  teamDayStairsOf,
  viBandsOf,
  yOfNet,
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
import { fmtAmountC } from '@/lib/ticks/tick-format';
import type { TickSession } from '@/lib/ticks/tick-session';
import { cn } from '@/lib/utils';

/**
 * 틱 뷰어 3판 차트 (Phase 37 D-00 ① · 스케치 019 D · 매집감지 상세 차트와 같은 레이어 순서 · 순수 SVG · viewBox 1:1 · 글자 11px).
 *
 * ① 레이어(아래 → 위): 장전 음영(08:00~09:00) · 빈 띠(15:30~16:00) · VI 띠(`--vi` 옅게 · 진행 중이면 끝까지) → 시각 격자 →
 *   ② 당일 팀 순매수 판 0선 · 누적(이월 포함) 회색 계단(왼쪽 회색 축 · 0 포함 독립 범위 · pos_net 있을 때만 — D-09) ·
 *   당일 보라 계단(오른쪽 보라 축 · 하루 범위 고정) → ③ 10분 팀 매수/매도 막대 쌍 → ① 가격 선(열별 4점 솎음) · 팀 평단
 *   `--up` 점점선(잔량 있을 때만) · 팀 주문 원 ≥ 500만(매수 빨강 · 매도 파랑 · 크기 = 금액 · 큰 원 먼저 · 툴팁 <title>) →
 *   현재 틱 커서(세 판 관통 + 아래 시각 라벨). 커서가 든 주문의 원은 --fg 고리.
 *   범례(머리): pos_net 없음 「누적 자료 없음(매집감지 미등록)」 · NXT 「매집감지 포지션(KRX+NXT 합산)」(Open Question 3) ·
 *   당일 화면은 누적 선 없음(D-09). NXT 도 팀 레이어를 그린다(그 거래소 런 팀 · D-13).
 * ② 조작 — 휠 = 확대/축소 · 끌기 = 이동(`useChartGestures` · 최소 창 10초) · 클릭 = 그 시각 이후 첫 틱(`onSeekMs`) ·
 *   주문 원 클릭 = 그 주문 마지막 조각(`onJumpRec`) · `+` `−` `0` 키(← → 는 커서 이동이라 차트가 가로채지 않는다) ·
 *   「1분」「10초」 버튼 = 커서 중심 창 · 커서가 창 밖으로 나가면 창이 커서를 가운데로 따라간다.
 * ③ 높이 — 측정 폭 < 600 이면 폰 165 · 아니면 데스크톱 230(`height` 로 강제 가능). 폰은 판 제목 글자를 생략한다.
 */

export interface TickChartProps {
  session: TickSession;
  /** 열기 응답 `accum`(매집감지 등록 종목의 pos_net · 없으면 null — D-09). */
  accum?: TickOpenResponse['accum'];
  /** 당일 화면 — 누적 선을 그리지 않는다(D-09). */
  isToday?: boolean;
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

/** 누적 범례(D-09 · Open Question 3) — 당일이면 null. */
function cumLegendOf(accum: TickOpenResponse['accum'] | undefined, isToday: boolean, hasCum: boolean, nxt: boolean) {
  if (isToday) return null;
  if (accum === null || accum === undefined) return '누적 자료 없음(매집감지 미등록)';
  if (!hasCum) return '누적 자료 없음(매집감지 포지션 없음)';
  return nxt ? '누적 = 매집감지 포지션(KRX+NXT 합산)' : '누적 = 매집감지 포지션(이월 포함)';
}

const SIDE_WORD = { B: '매수', S: '매도' } as const;

export function TickChart({
  session,
  accum = null,
  isToday = false,
  cursorRec,
  onSeekMs,
  onJumpRec,
  height,
  className,
}: TickChartProps) {
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

  // 팀 레이어
  const team = session.team;
  const endMs = lastRecvMsOf(session) ?? bounds.T2000;
  const cumPts = useMemo(() => cumPointsOf(accum, isToday), [accum, isToday]);
  const hasCum = cumPts.length > 0;
  const legend = cumLegendOf(accum, isToday, hasCum, session.ex === 'NXT');
  const dayRange = useMemo(() => dayNetRangeOf(team), [team]);
  const yN = yOfNet(dayRange, P);
  const cumRange = useMemo(() => cumNetRangeOf(cumPts), [cumPts]);
  const yC = yOfNet(cumRange, P);
  const dayD = teamDayStairsOf(team, x, yN, bounds.T0, endMs);
  const cumD = hasCum ? cumStairsOf(cumPts, x, yC, bounds.T0, bounds.T2000) : '';
  const avgD = teamAvgPathOf(team, x, y, range, endMs);
  const bars = teamBucketsOf(team, view, x, bounds.T0, P);
  const bucketMax = bucketMaxOfModel(team);
  const vis = useMemo(() => viBandsOf(session), [session]);
  const circlesAll = useMemo(() => teamCirclesOf(team), [team]);
  const pad = (view.t1 - view.t0) * 0.02;
  const circles = circlesAll
    .filter((c) => c.tMs >= view.t0 - pad && c.tMs <= view.t1 + pad)
    .sort((a, b) => b.val - a.val);
  const curOrder = cursorRec >= 0 ? session.orderOfRec[cursorRec]! : -1;
  const noTeam = team.fills.length === 0;
  const band = (t0: number, t1: number) => {
    const a = Math.max(L, x(t0));
    const b = Math.min(xr, x(t1));
    return b > a ? { x: a, w: Math.max(1.5, b - a) } : null;
  };
  const pre = band(bounds.T0, bounds.T0900);
  const gap = band(bounds.T1530, bounds.T1600);
  const midX = (L + xr) / 2;

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
        {legend !== null && (
          <span data-slot="tick-chart-legend" className="truncate text-[11px] text-[var(--muted-fg)]">
            {legend}
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
            {/* 장전 음영 · 빈 띠 · VI 띠 — 세 판 공통 */}
            {pre && (
              <rect data-slot="tick-pre-shade" x={pre.x} y={P.y1a} width={pre.w} height={P.y3b - P.y1a} fill="var(--accum-shade)" />
            )}
            {gap && (
              <rect data-slot="tick-gap-band" x={gap.x} y={P.y1a} width={gap.w} height={P.y3b - P.y1a} fill="var(--accum-gap)" />
            )}
            {vis.map((v) => {
              const b = band(v.t0, v.t1);
              return b === null ? null : (
                <rect
                  key={v.t0}
                  data-slot="tick-vi-band"
                  data-open={v.open ? '1' : '0'}
                  x={b.x}
                  y={P.y1a}
                  width={b.w}
                  height={P.y3b - P.y1a}
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
                y2={P.y3b}
                stroke="var(--border-subtle)"
                strokeWidth={1}
              />
            ))}

            {/* ② 당일 팀 순매수 판 — 0선 · 누적 회색(아래) · 당일 보라(위) */}
            {!noTeam && (
              <line
                data-slot="tick-net-zero"
                x1={L}
                x2={xr}
                y1={yN(0)}
                y2={yN(0)}
                stroke="var(--faint)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            )}
            {cumD !== '' && (
              <path
                data-slot="tick-cum-path"
                d={cumD}
                fill="none"
                stroke="var(--muted-fg)"
                strokeWidth={1}
                strokeOpacity={0.7}
                pointerEvents="none"
              />
            )}
            {dayD !== '' && (
              <path
                data-slot="tick-day-path"
                d={dayD}
                fill="none"
                stroke="var(--team)"
                strokeWidth={1.75}
                pointerEvents="none"
              />
            )}

            {/* ③ 10분 팀 매수/매도 막대 쌍 */}
            {bars.map((b) => (
              <g key={b.slot} data-slot="tick-bucket">
                <title>{b.title}</title>
                {b.buy && <rect x={b.buy.x} y={b.buy.y} width={b.buy.w} height={b.buy.h} fill="var(--up)" fillOpacity={0.7} />}
                {b.sell && (
                  <rect x={b.sell.x} y={b.sell.y} width={b.sell.w} height={b.sell.h} fill="var(--down)" fillOpacity={0.7} />
                )}
              </g>
            ))}

            {/* ① 가격 선 · 팀 평단 점점선 · 팀 주문 원 — 가격 판 높이 클립 */}
            <g data-slot="tick-price-layer" clipPath={`url(#${clipId}-px)`}>
              <path
                data-slot="tick-price-path"
                d={priceD}
                fill="none"
                stroke="var(--fg-2)"
                strokeWidth={1.25}
                strokeLinejoin="round"
              />
              {avgD !== '' && (
                <path
                  data-slot="tick-team-avg-path"
                  d={avgD}
                  fill="none"
                  stroke="var(--up)"
                  strokeWidth={1.25}
                  strokeDasharray="1 2"
                  pointerEvents="none"
                />
              )}
              {circles.map((c) => {
                const color = c.side === 'B' ? 'var(--up)' : 'var(--down)';
                const on = c.order.id === curOrder;
                return (
                  <circle
                    key={c.order.id}
                    data-slot="tick-order-circle"
                    data-order-rec={c.lastRec}
                    data-side={c.side}
                    cx={x(c.tMs)}
                    cy={y(c.px)}
                    r={orderRadiusOf(c.val)}
                    fill={color}
                    fillOpacity={0.55}
                    stroke={on ? 'var(--fg)' : color}
                    strokeOpacity={0.9}
                    strokeWidth={on ? 2.5 : 1}
                    className="cursor-pointer"
                  >
                    <title>
                      {`${kstClock(c.tMs)} 팀 ${SIDE_WORD[c.side]} ${PX_FMT.format(c.qty)}주 · ${fmtAmountC(c.val)} @${PX_FMT.format(c.px)} · ${c.order.pieces}조각`}
                    </title>
                  </circle>
                );
              })}
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

          {/* ② 오른쪽 보라 축(당일 · 하루 범위) · 왼쪽 회색 축(누적 · pos_net 있을 때만) */}
          {!noTeam && (
            <g data-slot="tick-day-axis" fill="var(--team)" aria-hidden="true">
              <text x={xr + 4} y={P.y2a + 9}>
                {fmtAmountC(dayRange.max)}
              </text>
              {dayRange.min !== dayRange.max && (
                <text x={xr + 4} y={P.y2b - 1}>
                  {fmtAmountC(dayRange.min)}
                </text>
              )}
            </g>
          )}
          {hasCum && (
            <g data-slot="tick-cum-axis" fill="var(--muted-fg)" aria-hidden="true">
              <text x={L - 4} y={P.y2a + 9} textAnchor="end">
                {fmtAmountC(cumRange.max)}
              </text>
              {cumRange.min !== cumRange.max && (
                <text x={L - 4} y={P.y2b - 1} textAnchor="end">
                  {fmtAmountC(cumRange.min)}
                </text>
              )}
            </g>
          )}
          {bucketMax > 0 && (
            <text data-slot="tick-bucket-max" x={xr + 4} y={P.y3a + 9} fill="var(--muted-fg)" aria-hidden="true">
              {fmtAmountC(bucketMax)}
            </text>
          )}
          {noTeam && (
            <g fill="var(--muted-fg)" aria-hidden="true">
              <text x={midX} y={(P.y2a + P.y2b) / 2 + 4} textAnchor="middle">
                팀 체결 없음
              </text>
              <text x={midX} y={(P.y3a + P.y3b) / 2 + 4} textAnchor="middle">
                팀 체결 없음
              </text>
            </g>
          )}

          {/* 판 제목(데스크톱만 · 폰은 생략 — 스케치 019) */}
          {!phone && (
            <g fontWeight={600} aria-hidden="true">
              <text x={L + 4} y={P.y1a + 11} fill="var(--fg-2)">
                가격 · <tspan fill="var(--up)">팀 평단</tspan> · 팀 주문 원(≥500만)
              </text>
              <text x={L + 4} y={P.y2a + 10} fill="var(--team)">
                당일 팀 순매수
                {hasCum && (
                  <tspan fill="var(--muted-fg)" fontWeight={400}>
                    {' '}
                    · 누적(이월 포함 · 왼쪽 회색 축)
                  </tspan>
                )}
              </text>
              <text x={L + 4} y={P.y3a + 10} fill="var(--fg-2)">
                10분 팀 매수 / 매도
              </text>
            </g>
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
