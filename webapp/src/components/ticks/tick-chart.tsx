'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';

import type { TickOpenResponse } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { useChartGestures, useChartView } from '@/hooks/use-chart-view';
import { useChartWidth } from '@/hooks/use-chart-width';
import { panBy, priceAxisWidthOf, type View } from '@/lib/accum-chart';
import { kstClock } from '@/lib/limitup-report';
import {
  OWN_MARK_R,
  TICK_CHART,
  bucketMaxOfModel,
  ownMarkAt,
  ownMarksOf,
  type OwnMark,
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
  marketCapOf,
  msOfNs,
  priceSeriesOf,
  pricePathDecimated,
  tOfTick,
  tickBoundsOf,
  tickPanelsOf,
  tickPriceRangeOf,
  tickTicksOf,
  turnoverPathsOf,
  turnoverSeriesOf,
  xOfTick,
  yOfTickPrice,
} from '@/lib/ticks/tick-chart';
import {
  nearestTickCircleOf,
  tickBandAt,
  tickCirclesOf,
  tickHoverWithOwn,
  tickOrderHoverOf,
  pct1,
  type TickHover,
} from '@/lib/ticks/tick-chart-tip';
import type { OwnModel } from '@/lib/ticks/own-model';
import { fmtAmountC } from '@/lib/ticks/tick-format';
import type { TickSession } from '@/lib/ticks/tick-session';
import { createTouchInspect, touchTipTopOf } from '@/lib/touch-inspect';
import { cn } from '@/lib/utils';

import { TickChartBand } from './tick-chart-band';

/**
 * 틱 뷰어 타임라인 차트 (Phase 37 D-00 ① · 스케치 019 D · 매집감지 상세 차트와 같은 레이어 순서 + 스케치 022 A 넷째 판 · 순수 SVG ·
 * viewBox 1:1 · 글자 11px).
 *
 * ① 레이어(아래 → 위): 장전 음영(08:00~09:00) · 빈 띠(15:30~16:00) · VI 띠(`--vi` 옅게 · 진행 중이면 끝까지) → 시각 격자 →
 *   ② 당일 팀 순매수 판 0선 · 누적(이월 포함) 회색 계단(왼쪽 회색 축 · 0 포함 독립 범위 · pos_net 있을 때만 — D-09) ·
 *   당일 보라 계단(오른쪽 보라 축 · 하루 범위 고정) → ③ 10분 팀 매수/매도 막대 쌍 → ① 가격 선(열별 4점 솎음) · 팀 평단
 *   `--up` 점점선(잔량 있을 때만) · 팀 주문 원 전부(매수 빨강 · 매도 파랑 · 크기 = 금액 · 큰 원 먼저) →
 *   ④ 누적 거래대금 회색 영역(왼쪽 축 = 시총 대비 % · 시총 = 기준가 × 상장주식수 · 모르면 금액) + 누적 팀 비중 보라 선(오른쪽 축
 *   0 ~ 창 안 최대 5% 올림 · 2026-11-03 사용자 요청) → 현재 틱 커서(네 판 관통 + 아래 시각 라벨). 커서가 든 주문의 원은 --fg 고리.
 *   범례(머리): pos_net 없음 「누적 자료 없음(매집감지 미등록)」 · NXT 「매집감지 포지션(KRX+NXT 합산)」(Open Question 3) ·
 *   당일 화면은 누적 선 없음(D-09). NXT 도 팀 레이어를 그린다(그 거래소 런 팀 · D-13).
 * ② 조작 — 휠 = 확대/축소 · 끌기 = 이동(`useChartGestures` · 최소 창 10초) · 클릭 = 그 시각 이후 첫 틱(`onSeekMs`) ·
 *   주문 원 클릭 = 그 주문 마지막 조각(`onJumpRec`) · `+` `−` `0` 키(← → 는 커서 이동이라 차트가 가로채지 않는다) ·
 *   「1분」「10초」 버튼 = 커서 중심 창 · 커서가 창 밖으로 나가면 창이 커서를 가운데로 따라간다.
 * ③ 높이 — 측정 폭 < 600 이면 폰 208 · 아니면 데스크톱 287(`height` 로 강제 가능). 폰은 판 제목 글자를 생략한다.
 * ④ 고정 띠 B + 가격 판 원 옆 상자(스케치 028 ① · 2026-11-04 채택 · `lib/ticks/tick-chart-tip.ts`) — 판별로 따로 뜨던 툴팁 대신
 *   머리 아래 · 차트 위에 높이 고정 띠 4칸(`TickChartBand` · 가격 | 당일 팀 | 10분 | 누적). 마우스가 그림 영역 위면 그 시각 값,
 *   벗어나면 현재 틱 값. 떠다니는 상자는 가격 판 팀 주문 원(씨앗 + 가로 ± 5px 묶음) · 우리 점 위에서만 뜬다.
 *   반올림 x 나 상자 대상이 바뀔 때만 상태를 바꾸고, 창이 움직이거나 끌기 중 · 포인터가 나가면 지운다. 묶음 원은 고리 1.5 · 고른 원은 2.5.
 *   원 · 막대의 네이티브 `<title>` 은 뺐다(상자와 겹친다 · VI 띠 title 은 남는다). 폰은 길게 누르기(300ms) 살펴보기
 *   (`createTouchInspect`) — 그동안 한 손가락 끌기는 창을 옮기지 않고, 손을 떼도 그 자리로 커서를 옮기지 않는다.
 * ⑤ 우리 체결 · 근거(Phase 38 D-08 · D-10 — `own` 이 있을 때만 · 가격 판만) — 팀 원 위에 ○ 조건 근거(빈 원 · `--mine` 테두리) →
 *   ◇ 짝 없음 · 대기(빈 ◇ 실선) → ◆ 우리 체결(채움 `--mine` · 추정이면 빈 ◆ 점선 3 2). 구간 띠 · 주문 시각 눈금은 그리지
 *   않는다(D-08). 클릭은 우리 점(반지름 + 3px)이 팀 원보다 먼저: ◆ = 그 A3 행(`onOwnJump(rec)`) · ◇ = 그 짝 없음 줄
 *   (`onOwnFillLine(fillId)`) · ○ = 근거 행 + 되돌아가기 주문(`onOwnJump(rec, orderId)`).
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
  /** 종목 상장주식수(열기 응답 `stock.listing_shares`) — 시총 대비 축 · 툴팁. 없으면 금액 축. */
  listingShares?: number | null;
  /** 판 높이 강제(287 데스크톱 · 208 폰) — 생략하면 측정 폭으로 고른다. */
  height?: 287 | 208;
  /** 우리 체결 모델(Phase 38) — 없으면 우리 점 · 범례 없음. */
  own?: OwnModel | null;
  /** ◆ 클릭 = 그 A3 rec · ○ 클릭 = 근거 rec + 되돌아가기 주문 id(`back`). */
  onOwnJump?: (rec: number, back?: number) => void;
  /** ◇(짝 없음 · 대기) 클릭 — 그 체결 id(줄 rec 는 뷰어가 rows 로 푼다). */
  onOwnFillLine?: (fillId: number) => void;
  className?: string;
}

/** 클릭으로 볼 끌기 문턱(px) — 이보다 많이 움직였으면 끌기(이동)였다. */
const CLICK_SLOP_PX = 4;
/** SVG 위아래 래퍼 여백(py-1) — 툴팁 상자 자리 보정. */
const WRAP_PAD_Y = 4;

/** 터치 앵커 — svg 상자 기준 client 오프셋 + 그때 상자 크기(viewBox 변환용). */
type TouchAnchor = { x: number; y: number; bw: number; bh: number };

function anchorOf(el: Element, clientX: number, clientY: number): TouchAnchor {
  const box = el.getBoundingClientRect();
  return { x: clientX - box.left, y: clientY - box.top, bw: box.width, bh: box.height };
}
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

/** 우리 체결 ◆(채움 `--mine`) · 추정 빈 ◆ 점선 · 짝 없음 · 대기 빈 ◇ 실선 — 2R 정사각을 45° 돌린다(목업 B `dia`). */
function OwnDiamond({ m, i, r }: { m: OwnMark; i: number; r: number }) {
  const common = {
    'data-slot': 'tick-own-mark',
    'data-own-i': i,
    'data-kind': m.kind,
    'data-rec': m.rec,
    x: m.cx - r,
    y: m.cy - r,
    width: 2 * r,
    height: 2 * r,
    transform: `rotate(45 ${m.cx} ${m.cy})`,
    stroke: 'var(--mine)',
    strokeWidth: 1.6,
    vectorEffect: 'non-scaling-stroke' as const,
    className: 'cursor-pointer',
  };
  if (m.kind === 'est') return <rect {...common} fill="var(--card)" strokeDasharray="3 2" />;
  return <rect {...common} fill={m.kind === 'fill' ? 'var(--mine)' : 'var(--card)'} />;
}

export function TickChart({
  session,
  accum = null,
  isToday = false,
  cursorRec,
  onSeekMs,
  onJumpRec,
  listingShares = null,
  height,
  own = null,
  onOwnJump,
  onOwnFillLine,
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

  const phone = height === undefined ? W < TICK_CHART.PHONE_MAX_W : height === TICK_CHART.phone.H;
  const dims = phone ? TICK_CHART.phone : TICK_CHART.desktop;
  const P = tickPanelsOf(dims);
  const L = priceAxisWidthOf(series.maxPx);
  const xr = W - TICK_CHART.R;
  const plotW = Math.max(1, xr - L);
  // 터치 살펴보기 중이면 true — 한 손가락 끌기가 창을 옮기지 않고(훅) 페이지 스크롤을 막는다(touchmove)
  const inspectRef = useRef(false);
  // 이번 누름이 살펴보기였으면 뗄 때 클릭(시각 점프)으로 치지 않는다
  const inspectedRef = useRef(false);
  const { dragging } = useChartGestures(svgRef, { L, W, R: TICK_CHART.R }, ctl, inspectRef);
  // 마우스 자리(viewBox 좌표 · 그림 영역 안만) + 그 자리 가격 판 상자 대상(없으면 null)
  const [hoverState, setHover] = useState<{ mx: number; my: number; vk: string; box: TickHover | null } | null>(null);
  // 창이 움직이면 원 자리가 바뀐다 — 그 창에서 고른 대상만 보인다
  const vk = `${view.t0}|${view.t1}`;
  const hover = hoverState !== null && hoverState.vk === vk && !dragging ? hoverState : null;

  const [touchPt, setTouchPt] = useState<TouchAnchor | null>(null);
  const [tracker] = useState(() =>
    createTouchInspect({
      onStart: (p) => {
        const el = svgRef.current;
        if (!el) return;
        inspectRef.current = true;
        inspectedRef.current = true;
        setTouchPt(anchorOf(el, p.clientX, p.clientY));
      },
      onEnd: () => {
        inspectRef.current = false;
        setTouchPt(null);
      },
    }),
  );
  useEffect(() => () => tracker.dispose(), [tracker]);

  // 살펴보기 중 페이지 스크롤 억제 — React onTouchMove 는 passive 라 비수동 네이티브 리스너로 막는다(매집감지 차트와 같은 이유)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const fn = (e: TouchEvent) => {
      if (inspectRef.current && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', fn, { passive: false });
    return () => el.removeEventListener('touchmove', fn);
  }, []);

  // 터치 툴팁 높이 — 그리기 전에 재서 손가락 위 자리를 잡는다
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipH, setTipH] = useState(0);
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (el && el.dataset.touch === '1' && el.offsetHeight !== tipH) setTipH(el.offsetHeight);
  }, [touchPt, tipH]);

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
  const circles = tickCirclesOf(team, view, x, y);
  const ownR = phone ? OWN_MARK_R.phone : OWN_MARK_R.desktop;
  const marks: OwnMark[] = own !== null ? ownMarksOf(own, session, view, x, y) : [];
  // 범례 두 칸은 하루에 우리 점이 하나라도 있을 때(창과 무관 — 확대/이동으로 범례가 깜박이지 않게)
  const ownLegend = own !== null && (own.fills.length > 0 || own.orders.some((o) => o.evidenceRec >= 0));
  const turnover = turnoverSeriesOf(session);
  const mcap = marketCapOf(session.basePx, listingShares);
  const tv = turnoverPathsOf(turnover, view, x, P, plotW, endMs);
  const fmtVal = (v: number) => (mcap === null ? fmtAmountC(v) : pct1(v / mcap));
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

  // 떠다니는 상자 대상 — 가격 판 전용(팀 원 묶음 · 우리 점). 다른 판은 고정 띠가 대신한다(스케치 028 ①).
  const pickAt = (mx: number, my: number): TickHover | null => {
    if (mx < L || mx > xr || my < P.y1a || my > P.y1b) return null;
    const c = nearestTickCircleOf(circles, mx, my, P);
    const teamHover = c === null ? null : tickOrderHoverOf(team, session.basePx, circles, c, view);
    // 우리 줄은 팀 줄 뒤에 덧붙이기만(D-16 — 팀 줄 문구 · 순서 그대로)
    return own === null ? teamHover : tickHoverWithOwn(teamHover, marks, own, mx, my, P, ownR);
  };
  const inPlot = (mx: number, my: number) => mx >= L && mx <= xr && my >= P.y1a && my <= P.y4b;
  const tAt = tOfTick(view, L, xr);
  const mxOf = (a: TouchAnchor) => (a.x * W) / (a.bw || W);
  const myOf = (a: TouchAnchor) => (a.y * P.H) / (a.bh || P.H);
  const touchBox = touchPt === null ? null : pickAt(mxOf(touchPt), myOf(touchPt));
  // 보여줄 상자 — 터치 살펴보기가 마우스보다 앞선다
  const tip =
    touchBox !== null && touchPt !== null
      ? { ...touchBox, ax: mxOf(touchPt), ay: myOf(touchPt), touch: true }
      : hover !== null && hover.box !== null
        ? { ...hover.box, ax: hover.mx, ay: hover.my, touch: false }
        : null;

  // 띠 시각 — 터치(손가락 x · 그림 영역으로 자름) ?? 마우스 ?? 현재 틱. live = 터치 · 마우스 둘 다 없음.
  const touchT = touchPt === null ? null : tAt(Math.min(xr, Math.max(L, mxOf(touchPt))));
  const hoverT = touchT ?? (hover !== null ? tAt(hover.mx) : null);
  const bandT = hoverT ?? cursorMs;
  const bandLive = hoverT === null;
  const bandVal =
    bandT === null
      ? null
      : tickBandAt(
          { team, cum: cumPts, price: series, turnover, basePx: session.basePx, mcap, T0: bounds.T0 },
          bandT,
        );

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch') {
      if (!tracker.move(e)) return;
      const a = anchorOf(e.currentTarget, e.clientX, e.clientY);
      const moved = touchPt === null || Math.round(mxOf(a)) !== Math.round(mxOf(touchPt));
      if (moved || (pickAt(mxOf(a), myOf(a))?.key ?? null) !== (touchBox?.key ?? null)) setTouchPt(a);
      return;
    }
    if (dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) * W) / (rect.width || W);
    const my = ((e.clientY - rect.top) * P.H) / (rect.height || P.H);
    if (!inPlot(mx, my)) {
      if (hoverState !== null) setHover(null);
      return;
    }
    const box = pickAt(mx, my);
    // 다시 그리기는 viewBox 1px 당 많아야 한 번(휠 이동 프레임 급) — 값은 정확한 mx 로 계산한다
    if (hover !== null && Math.round(hover.mx) === Math.round(mx) && (hover.box?.key ?? null) === (box?.key ?? null)) return;
    setHover({ mx, my, vk, box });
  };

  // 고리 — 원 하나면 그 원 1.5 · 묶음이면 고른 원 밖 묶음 원마다 1.5 + 고른 원만 2.5
  const seedRim = tip?.group ? tip.circle : null;
  const rims = tip?.group ? tip.group.filter((c) => c.k !== seedRim?.k) : tip?.circle ? [tip.circle] : [];

  // 우리 점 판정 — 우리 점 요소를 눌렀으면 그 점, 아니면 가격 판 안에서 반지름 + 3px 안 가장 가까운 점(팀 원보다 먼저).
  const ownHitOf = (target: Element, clientX: number, clientY: number): OwnMark | null => {
    if (marks.length === 0) return null;
    const el = target.closest?.('[data-own-i]');
    if (el) return marks[Number(el.getAttribute('data-own-i'))] ?? null;
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    const mx = ((clientX - rect.left) * W) / rect.width;
    const my = ((clientY - rect.top) * P.H) / rect.height;
    if (my < P.y1a - 7 || my > P.y1b + 7) return null;
    return ownMarkAt(marks, mx, my, ownR);
  };
  /** 우리 점 클릭 — 그 점의 콜백이 없으면 false(아래 팀 원 · 시각 클릭으로 넘긴다). */
  const goOwn = (m: OwnMark): boolean => {
    if (m.kind === 'nofill') {
      if (!onOwnFillLine) return false;
      onOwnFillLine(m.fillIds[0]!);
      return true;
    }
    if (!onOwnJump) return false;
    if (m.kind === 'ev') onOwnJump(m.rec, m.orderId);
    else onOwnJump(m.rec);
    return true;
  };

  // 클릭 = 그 시각 첫 틱 · 원 클릭 = 그 주문 마지막 조각. 끌기(4px 넘게 움직임)는 클릭이 아니다.
  const downRef = useRef<{ x: number; y: number; orderRec: number | null; own: OwnMark | null } | null>(null);
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    inspectedRef.current = false;
    tracker.down(e);
    const el = (e.target as Element).closest?.('[data-order-rec]');
    downRef.current = {
      x: e.clientX,
      y: e.clientY,
      orderRec: el ? Number(el.getAttribute('data-order-rec')) : null,
      own: ownHitOf(e.target as Element, e.clientX, e.clientY),
    };
  };
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const down = downRef.current;
    downRef.current = null;
    if (inspectedRef.current) {
      inspectedRef.current = false;
      return;
    }
    if (down !== null && Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) return;
    const ownHit = down?.own ?? ownHitOf(e.target as Element, e.clientX, e.clientY);
    if (ownHit !== null && goOwn(ownHit)) return;
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
        <h2 className="m-0 text-[12.5px] font-bold text-[var(--fg)]">타임라인</h2>
        {!phone && (
          <span className="truncate text-[11px] text-[var(--muted-fg)]">
            가격 · 팀 평단 · 팀 주문 원 | <span className="text-[var(--team)]">당일 팀 순매수</span> · 누적 | 10분 팀
            매수/매도 | 누적 거래대금 · <span className="text-[var(--team)]">팀 비중</span> ·{' '}
            <span className="text-[var(--vi)]">VI</span>
          </span>
        )}
        {legend !== null && (
          <span data-slot="tick-chart-legend" className="truncate text-[11px] text-[var(--muted-fg)]">
            {legend}
          </span>
        )}
        {ownLegend && (
          // 우리 범례(목업 B 범례 꼴) — ◆ = 45° 돌린 채운 작은 정사각 · ○ = 테두리 원 · 민트
          <span data-slot="tick-chart-own-legend" className="flex items-center gap-2 text-[11px] text-[var(--mine-fg)]">
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <i aria-hidden="true" className="inline-block size-[7px] rotate-45 rounded-[1px] bg-[var(--mine)]" />
              우리 체결
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <i aria-hidden="true" className="inline-block size-2 rounded-full border-[1.5px] border-[var(--mine)]" />
              조건 근거
            </span>
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

      <TickChartBand band={bandVal} live={bandLive} phone={phone} />

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
          onPointerMove={onPointerMove}
          onPointerUp={(e) => tracker.end(e)}
          onPointerCancel={(e) => tracker.end(e)}
          onLostPointerCapture={(e) => tracker.end(e)}
          onPointerLeave={() => setHover(null)}
          onContextMenu={(e) => {
            if (inspectRef.current) e.preventDefault();
          }}
          onClick={onClick}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={L} y={0} width={plotW} height={P.y4b} />
            </clipPath>
            <clipPath id={`${clipId}-px`}>
              <rect x={L} y={P.y1a - 7} width={plotW} height={P.y1b - P.y1a + 14} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            {/* 장전 음영 · 빈 띠 · VI 띠 — 네 판 공통 */}
            {pre && (
              <rect data-slot="tick-pre-shade" x={pre.x} y={P.y1a} width={pre.w} height={P.y4b - P.y1a} fill="var(--accum-shade)" />
            )}
            {gap && (
              <rect data-slot="tick-gap-band" x={gap.x} y={P.y1a} width={gap.w} height={P.y4b - P.y1a} fill="var(--accum-gap)" />
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
                  height={P.y4b - P.y1a}
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
                {b.buy && <rect x={b.buy.x} y={b.buy.y} width={b.buy.w} height={b.buy.h} fill="var(--up)" fillOpacity={0.7} />}
                {b.sell && (
                  <rect x={b.sell.x} y={b.sell.y} width={b.sell.w} height={b.sell.h} fill="var(--down)" fillOpacity={0.7} />
                )}
              </g>
            ))}

            {/* ④ 누적 거래대금 영역 · 누적 팀 비중 선 */}
            {tv.area !== '' && (
              <path data-slot="tick-turnover-area" d={tv.area} fill="var(--faint)" fillOpacity={0.45} pointerEvents="none" />
            )}
            {tv.share !== '' && (
              <path
                data-slot="tick-team-share-path"
                d={tv.share}
                fill="none"
                stroke="var(--team)"
                strokeWidth={1.75}
                strokeLinejoin="round"
                pointerEvents="none"
              />
            )}

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
              {circles.map(({ o, cx: ox, cy: oy, r }) => {
                const color = o.side === 'B' ? 'var(--up)' : 'var(--down)';
                const on = o.order.id === curOrder;
                return (
                  <circle
                    key={o.order.id}
                    data-slot="tick-order-circle"
                    data-order-rec={o.lastRec}
                    data-side={o.side}
                    cx={ox}
                    cy={oy}
                    r={r}
                    fill={color}
                    fillOpacity={0.55}
                    stroke={on ? 'var(--fg)' : color}
                    strokeOpacity={0.9}
                    strokeWidth={on ? 2.5 : 1}
                    className="cursor-pointer"
                  />
                );
              })}
              {rims.map((c) => (
                <circle
                  key={`h${c.k}`}
                  data-slot="tick-order-hover"
                  cx={c.cx}
                  cy={c.cy}
                  r={c.r + 1}
                  fill="none"
                  stroke="var(--fg)"
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              ))}
              {seedRim && (
                <circle
                  data-slot="tick-order-seed"
                  cx={seedRim.cx}
                  cy={seedRim.cy}
                  r={seedRim.r + 1}
                  fill="none"
                  stroke="var(--fg)"
                  strokeWidth={2.5}
                  pointerEvents="none"
                />
              )}
              {/* 우리 점(Phase 38 D-08) — 팀 원 위 · ○ → ◇ → ◆ 순(◆ 가 맨 위) · 구간 띠 없음 */}
              {marks.map((m, i) =>
                m.kind === 'ev' ? (
                  <circle
                    key={`ev${m.rec}`}
                    data-slot="tick-own-ev-mark"
                    data-own-i={i}
                    data-rec={m.rec}
                    cx={m.cx}
                    cy={m.cy}
                    r={ownR - 1}
                    fill="var(--card)"
                    stroke="var(--mine)"
                    strokeWidth={1.6}
                    vectorEffect="non-scaling-stroke"
                    className="cursor-pointer"
                  />
                ) : (
                  <OwnDiamond key={m.kind === 'nofill' ? `nf${m.fillIds[0]}` : `f${m.rec}`} m={m} i={i} r={ownR} />
                ),
              )}
            </g>

            {/* 현재 틱 커서 — 네 판 관통 */}
            {cx !== null && (
              <line
                data-slot="tick-chart-cursor"
                x1={cx}
                x2={cx}
                y1={P.y1a}
                y2={P.y4b}
                stroke="var(--fg)"
                strokeWidth={1}
                pointerEvents="none"
              />
            )}
          </g>

          {/* 판 아래선 */}
          {[P.y1b, P.y2b, P.y3b, P.y4b].map((yy) => (
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
          {tv.area !== '' && (
            <g data-slot="tick-turnover-axis" fill="var(--muted-fg)" aria-hidden="true">
              <text x={L - 4} y={P.y4a + 9} textAnchor="end">
                {fmtVal(tv.valHi)}
              </text>
              <text x={L - 4} y={P.y4b - 1} textAnchor="end">
                {fmtVal(tv.valLo)}
              </text>
            </g>
          )}
          {tv.share !== '' && (
            <g data-slot="tick-share-axis" fill="var(--team)" aria-hidden="true">
              <text x={xr + 4} y={P.y4a + 9}>
                {Math.round(tv.shareTop * 100)}%
              </text>
              <text x={xr + 4} y={P.y4b - 1}>
                0%
              </text>
            </g>
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
                가격 · <tspan fill="var(--up)">팀 평단</tspan> · 팀 주문 원
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
              <text x={L + 4} y={P.y4a + 10} fill="var(--fg-2)">
                누적 거래대금{mcap !== null ? '(왼쪽 축 = 시총 대비)' : ''} ·{' '}
                <tspan fill="var(--team)">누적 팀 비중(오른쪽 축)</tspan>
              </text>
            </g>
          )}

          {/* 커서 시각 라벨(아래 눈금 띠) */}
          {cx !== null && (
            <g data-slot="tick-chart-cursor-label" pointerEvents="none">
              <rect
                x={Math.min(xr - curLabW, Math.max(L, cx - curLabW / 2))}
                y={P.y4b + 1}
                width={curLabW}
                height={13}
                rx={3}
                fill="var(--fg)"
              />
              <text
                x={Math.min(xr - curLabW, Math.max(L, cx - curLabW / 2)) + curLabW / 2}
                y={P.y4b + 11}
                textAnchor="middle"
                fill="var(--bg)"
                fontWeight={600}
              >
                {cursorLabel}
              </text>
            </g>
          )}
        </svg>
        {tip && (
          <div
            ref={tipRef}
            data-slot="tick-chart-tip"
            data-touch={tip.touch ? '1' : undefined}
            role="tooltip"
            className="pointer-events-none absolute z-10 rounded-[var(--r)] border border-[var(--border)] bg-[var(--popover)] px-2 py-1 text-[11px] leading-[1.45] break-keep text-[var(--popover-fg)] shadow-md tabular-nums"
            style={
              tip.touch
                ? { left: 4, maxWidth: W - 8, top: WRAP_PAD_Y + touchTipTopOf(tip.ay, tipH, P.H) }
                : {
                    maxWidth: W - 8,
                    left: tip.ax > W / 2 ? undefined : tip.ax + 12,
                    right: tip.ax > W / 2 ? W - tip.ax + 12 : undefined,
                    top: tip.ay > P.H / 2 ? undefined : WRAP_PAD_Y + tip.ay + 12,
                    bottom: tip.ay > P.H / 2 ? P.H + WRAP_PAD_Y - tip.ay + 12 : undefined,
                  }
            }
          >
            {tip.lines.map((line, i) => (
              <div key={i} className="pl-3 -indent-3">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
