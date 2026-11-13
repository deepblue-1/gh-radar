'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

import type { TickOpenResponse } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { useChartGestures, useChartView } from '@/hooks/use-chart-view';
import { useChartWidth } from '@/hooks/use-chart-width';
import { panBy, priceAxisWidthOf, type View } from '@/lib/accum-chart';
import { kstClock } from '@/lib/limitup-report';
import {
  CANDLE_CHART,
  autoUnitOf,
  candlePanelsOf,
  candleRangeOf,
  candlesOf,
  candleUnitLabelOf,
  candleYOf,
  cumAvgPointsOf,
  type CandleFrame,
  type CandleUnit,
} from '@/lib/ticks/candle-chart';
import { maKeyOf, maNameOf, maStatusOf, maValuesOf, type CandleMaValue } from '@/lib/ticks/candle-ma';
import { candleBandAt, candleCaptionOf } from '@/lib/ticks/candle-readout';
import {
  cumReturnPointsOf,
  dayReturnPointsOf,
  returnScalesOf,
  withCursorReturnPoint,
} from '@/lib/ticks/candle-returns';
import type { OwnModel } from '@/lib/ticks/own-model';
import { useCandleUnitPref, useMaConfig } from '@/lib/ticks/use-candle-prefs';
import { usePrevCloses } from '@/lib/ticks/use-prev-closes';
import { useViewSync, type ChartViewSnap } from '@/lib/ticks/use-view-sync';
import {
  OWN_MARK_R,
  TICK_CHART,
  cumNetRangeOf,
  cumPointsOf,
  cursorXOf,
  dayNetRangeOf,
  lastRecvMsOf,
  lastTradeMsOfSession,
  marketCapOf,
  msOfNs,
  ownMarkAt,
  ownMarksOf,
  priceIdxAt,
  priceSeriesOf,
  tOfTick,
  tickBoundsOf,
  tickTicksOf,
  turnoverPathsOf,
  turnoverSeriesOf,
  viBandsOf,
  xOfTick,
  yOfNet,
  yOfShare,
  type OwnMark,
} from '@/lib/ticks/tick-chart';
import {
  nearestTickCircleOf,
  tickCirclesOf,
  tickHoverWithOwn,
  tickOrderHoverOf,
  tickRangeSumOf,
  type TickHover,
} from '@/lib/ticks/tick-chart-tip';
import { fmtSignedAmountC } from '@/lib/ticks/tick-format';
import type { TickSession } from '@/lib/ticks/tick-session';
import { createTouchInspect, touchTipTopOf } from '@/lib/touch-inspect';
import { cn } from '@/lib/utils';

import { CandleChartBand } from './candle-chart-band';
import { CandleChartCaption } from './candle-chart-caption';
import { CandleChartTitle } from './candle-chart-title';
import { CandleLowerLayers } from './candle-lower-layers';
import { CandlePriceLayer } from './candle-price-layer';
import { CandleReturnLayer } from './candle-return-layer';
import { OwnDiamond, TickGroupBox } from './tick-chart';
import { TickChartRange } from './tick-chart-range';

/**
 * 틱 뷰어 봉 차트 (Phase 42 · D-01 순수 SVG · viewBox 1:1 · 글자 11px — 선 차트 `tick-chart.tsx` 와 같은 자리 · 같은 props).
 *
 * ① 판(위 → 아래): 가격(봉 + 안쪽 거래대금 막대 · 160 / 폰 110) · 수익률(50 / 36) · 당일 팀 순매수 · 10분 팀 매수/매도 · 누적
 *   거래대금 — 전체 420 / 폰 303(`CANDLE_CHART`). 틱 선은 그리지 않는다(D-08).
 * ② 레이어: 장전 음영 · 빈 띠 · VI 띠(다섯 판 공통) → 시각 격자 → 가격 판 층(`CandlePriceLayer` — 거래대금 막대 · 봉 · 이동평균 ·
 *   팀 평단 · 누적 평단 · 판 제목) → 수익률 판(`CandleReturnLayer`) → 아래 세 판(`CandleLowerLayers`) → 구간 띠 · 알약 → 마우스
 *   세로선 · 값 점 → 현재 틱 커서 → 판 아래선 · 시각 눈금 · 커서 시각 라벨. 카드 = 제목 줄(`CandleChartTitle`) → 값 띠
 *   (`CandleChartBand`) → 차트 → 구간 합계 줄 → 캡션 줄(`CandleChartCaption`) → (데스크톱) 안내 줄.
 * ②′ 결선(42-10): 봉 단위 = 기억(`useCandleUnitPref`) · 「자동」 이면 창이 바뀔 때마다 `autoUnitOf` · 이동평균 = 기억 구성 중 켜진
 *   선(칩 순서) · 일 칩이 있으면 앞 거래일 종가를 (코드, 날짜)마다 한 번(`usePrevCloses`) · 보기 창은 `useViewSync` 로 선 차트와
 *   주고받는다(D-24 — 뷰어 상태로 올리지 않는다). 봉 · 이동평균 · 수익률 점은 메모(마우스 상태 무관 · SC-7).
 * ③ 조작(D-19 · SC-6 — 선 차트 조작 골격을 그대로 복제하고 판 경계만 `CandlePanels`): 휠 = 확대/축소 · 끌기 · 핀치 = 이동
 *   (`useChartGestures` · 최소 창 10초) · 클릭 = 그 시각 이후 첫 틱(`onSeekMs` · 4px 넘게 움직였으면 끌기) · `+ − 0` 키(← → 는
 *   커서 이동이라 가로채지 않는다 · 키는 래퍼에만 — 제목 줄 조작은 래퍼 밖, Pitfall 12) · 「확대 · 축소 · 전체 · 1분 · 10초」 버튼 ·
 *   Shift+끌기 = 구간 합계(데스크톱 마우스만 · 결과는 차트 아래 `TickChartRange` · 끄는 동안 창은 안 움직인다 · Esc/✕/빈 곳 클릭 =
 *   지움 — 그 클릭은 시각 이동 아님) · 커서가 창 밖으로 나가면 창이 커서를 가운데로 따라간다.
 * ④ 마우스 세로선 + 값 점(UI-SPEC S7) — 호버 중이고 끌기 중이 아닐 때만. 가격 판 점 = 그 시각 봉의 종가(`--fg-2`) · 수익률 판
 *   당일 `--team` · 누적 `--muted-fg` · 순매수 판 매수 `--up` · 매도 `--down` · 순 `--team` · 누적 `--muted-fg` · 넷째 판 팀 비중
 *   `--team`(값은 값 띠 `candleBandAt` 하나 — 아래 판은 그 안의 선 차트 `tickBandAt` 값 그대로).
 * ⑤ 겹침(38 D-08 · D-10 · SC-4) — 팀 주문 원(매수 빨강 · 매도 파랑 · 크기 = 금액 · 커서가 든 주문 `--fg` 고리) · 우리 ○ 근거 →
 *   ◇ 짝 없음 → ◆ 체결이 `CandlePriceLayer` children(가격 판 높이 클립)에 봉 영역 y(`candleYOf`)로 겹친다. 원 · 우리 점 위 마우스
 *   (폰은 길게 누르기 `createTouchInspect` 300ms — 그동안 한 손가락 끌기는 창을 옮기지 않고 떼도 커서를 옮기지 않는다) = 원 옆 상자
 *   (묶음 표 `TickGroupBox` + 우리 줄). 클릭은 우리 점(반지름 + 3px)이 팀 원보다 먼저: ◆ = `onOwnJump(rec)` · ○ =
 *   `onOwnJump(rec, 주문 id)` · ◇ = `onOwnFillLine(체결 id)` · 원 = `onJumpRec(그 주문 마지막 조각)`. 봉은 누를 수 없다.
 * ⑥ 높이 — 측정 폭 < 600 이면 폰 303 · 아니면 데스크톱 420(`height` 로 강제 가능). 축 폭 L 은 선 차트와 같은 식이라 전환 때
 *   그림 영역이 튀지 않는다.
 */

export interface CandleChartProps {
  session: TickSession;
  /** 열기 응답 `accum`(pos_net · avg_px · 없으면 null — D-09 · D-18). */
  accum?: TickOpenResponse['accum'];
  /** 당일 화면 — 누적 선을 그리지 않는다(D-09 · D-15). */
  isToday?: boolean;
  cursorRec: number;
  /** 차트 빈 곳 클릭 — 그 시각(수신 ms) 이후 첫 틱으로. */
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
  /** 종목 코드(열기 응답 `stock.code`) — 일 이동평균 앞 거래일 종가를 받는다. 없으면 요청 없이 「종가가 모자라」 안내(D-11 · Q5). */
  stockCode?: string | null;
  /** 처음 보기 창(D-24 — 마운트 때 한 번만 · 안 주면 하루 전체). 선 차트에서 바꿔 올 때 그 창. */
  initialView?: ChartViewSnap;
  /** 보기 창이 바뀔 때마다(반영 뒤에만) — 뷰어가 렌더 없는 ref 에 쥔다. */
  onViewChange?: (v: ChartViewSnap) => void;
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

/** 창 폭 글자 — 「하루 전체」 · 「n.n시간」 · 「n분」 · 「n초」(선 차트와 같은 규칙). */
function fmtSpan(ms: number): string {
  if (ms >= 12 * 3600e3 - 1) return '하루 전체';
  if (ms >= 3600e3) return `${(ms / 3600e3).toFixed(1)}시간`;
  if (ms >= 60e3) return `${Math.round(ms / 60e3)}분`;
  return `${Math.round(ms / 1e3)}초`;
}

/** 안내 줄 키 이름(선 차트와 같은 모양). */
const KBD = 'mono rounded-[4px] bg-[var(--muted)] px-1 text-[var(--fg-2)]';

export function CandleChart({
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
  titleAddon,
  stockCode = null,
  initialView,
  onViewChange,
  className,
}: CandleChartProps) {
  const [wrapRef, W] = useChartWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId().replace(/:/g, '');

  const bounds = useMemo(() => tickBoundsOf(session.date), [session.date]);
  const series = priceSeriesOf(session);
  const lastTradeMs = useMemo(() => lastTradeMsOfSession(session), [session]);
  const ctl = useChartView({ bounds, lastTradeMs, minViewMs: TICK_CHART.MIN_VIEW_MS });
  // 보기 창 주고받기(D-24 · 선 차트와 같은 훅) — 받은 창이 반영되기 전에는 svg 를 숨긴다(하루 전체가 한 프레임 비치지 않게)
  const { pending } = useViewSync(ctl, initialView, onViewChange);
  const { view } = ctl;

  const phone = height === undefined ? W < TICK_CHART.PHONE_MAX_W : height === CANDLE_CHART.phone.H;
  const dims = phone ? CANDLE_CHART.phone : CANDLE_CHART.desktop;
  const P = useMemo(() => candlePanelsOf(dims), [dims]);
  // 축 폭은 선 차트와 같은 식(하루 최고가) — 전환 때 그림 영역이 튀지 않는다
  const L = priceAxisWidthOf(series.maxPx);
  const xr = W - TICK_CHART.R;
  const plotW = Math.max(1, xr - L);
  // 터치 살펴보기 중이면 true — 한 손가락 끌기가 창을 옮기지 않고(훅) 페이지 스크롤을 막는다(touchmove)
  const inspectRef = useRef(false);
  // 이번 누름이 살펴보기였으면 뗄 때 클릭(시각 점프)으로 치지 않는다
  const inspectedRef = useRef(false);
  // 창 이동 잠금 — 터치 살펴보기 또는 Shift 구간 끌기 동안 true(훅은 이동할 때마다 읽는다 · 훅 무변경)
  const panLockRef = useRef(false);
  const { dragging } = useChartGestures(svgRef, { L, W, R: TICK_CHART.R }, ctl, panLockRef);
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
        panLockRef.current = true;
        inspectedRef.current = true;
        setTouchPt(anchorOf(el, p.clientX, p.clientY));
      },
      onEnd: () => {
        inspectRef.current = false;
        panLockRef.current = false;
        setTouchPt(null);
      },
    }),
  );
  useEffect(() => () => tracker.dispose(), [tracker]);

  // 살펴보기 중 페이지 스크롤 억제 — React onTouchMove 는 passive 라 비수동 네이티브 리스너로 막는다(선 차트와 같은 이유)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const fn = (e: TouchEvent) => {
      if (inspectRef.current && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', fn, { passive: false });
    return () => el.removeEventListener('touchmove', fn);
  }, []);

  // 구간 합계(스케치 028 ③) — 확정 구간은 세션에 묶는다(종목 · 날짜가 바뀌면 지워진 것과 같다 · effect 없이 파생)
  const [selState, setSel] = useState<{ session: TickSession; t0: number; t1: number } | null>(null);
  const sel = selState !== null && selState.session === session ? selState : null;
  const [draft, setDraft] = useState<{ t0: number; t1: number } | null>(null);
  const rangeDownRef = useRef<{ t0: number; t1: number; clientX: number; moved: boolean } | null>(null);
  const clearRange = () => {
    setSel(null);
    setDraft(null);
  };
  const hasRange = sel !== null || draft !== null;
  // Esc = 구간 지움 — 구간이 있는 동안만 듣는다 · 입력 칸 · 이미 처리된 Esc 는 가로채지 않는다
  useEffect(() => {
    if (!hasRange) return;
    const fn = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      rangeDownRef.current = null;
      panLockRef.current = false;
      setSel(null);
      setDraft(null);
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [hasRange]);

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

  const x = useMemo(() => xOfTick(view, L, xr), [view, L, xr]);

  // 봉 단위(D-09 · SC-2) — 기억한 값 · 「자동」 이면 보기 창이 바뀔 때마다 칸 폭 4px 규칙으로 다시 고른다(고정 단위는 그대로).
  // 단위 · 창은 이 컴포넌트 안에서만 — 뷰어 상태로 올리지 않는다(휠마다 뷰어 재렌더 금지 · UI-SPEC S1).
  const [unitPref, setUnitPref] = useCandleUnitPref();
  const unit: CandleUnit = unitPref === 'auto' ? autoUnitOf(view.t1 - view.t0, plotW) : unitPref;
  const unitLabel = candleUnitLabelOf(unit, unitPref === 'auto');
  // 봉 집계는 (세션, 단위)마다 1회(42-01 캐시 — 같은 객체를 돌려준다)
  const candles = candlesOf(session, unit);
  const range = useMemo(() => candleRangeOf(candles, view), [candles, view]);
  const y = useMemo(() => candleYOf(range, P), [range, P]);
  const cumAvg = useMemo(() => cumAvgPointsOf(accum, isToday), [accum, isToday]);

  // 이동평균(D-10 · D-11 · SC-3) — 기억한 구성 중 켜진 선만 칩 순서로. 일 칩이 하나라도 있으면(켜짐 무관) 앞 거래일 종가를
  // (코드, 날짜)마다 한 번 받는다(Q2 — 칩을 켜고 꺼도 다시 받지 않는다). 받는 중 · 실패 · 코드 없음 = 일 선 값 전부 NaN(선 없음).
  const [maCfg, setMaCfg] = useMaConfig();
  const hasDayLine = maCfg.lines.some((l) => l.base === 'day');
  const prev = usePrevCloses(stockCode, session.date, hasDayLine);
  const maOn = useMemo(() => maCfg.lines.filter((l) => l.on), [maCfg]);
  const ma = useMemo<CandleMaValue[]>(
    () =>
      maOn.map((l) => ({ key: maKeyOf(l), name: maNameOf(l), color: l.color, values: maValuesOf(l, candles.c, prev) })),
    [maOn, candles, prev],
  );
  // 범례 「◆ 우리 체결 · ○ 조건 근거」 — 하루에 우리 점이 하나라도 있을 때(창과 무관 · 선 차트와 같은 식)
  const ownLegend = own !== null && (own.fills.length > 0 || own.orders.some((o) => o.evidenceRec >= 0));
  const endMs = lastRecvMsOf(session) ?? bounds.T2000;
  const frame: CandleFrame = { W, P, L, xr, plotW, phone, view, x, bounds, endMs };

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

  // 수익률 판(D-12 ~ D-14 · SC-4) — 당일(패널과 같은 `teamKpiAt` 수익률) · 누적(D-15 · 미실현) 점과 두 눈금. 마우스 · 터치 상태는
  // 키에 없다(SC-7 — 마우스 이동 재렌더는 세로선 · 점 · 띠만 바꾼다). 커서 없는 점은 창 · 폭이 바뀔 때만 만들고, 커서 점은
  // 창 안일 때만 하나 끼운다(재생 중 커서 한 칸마다 열 샘플을 다시 하지 않는다). 선 · 눈금은 이 창 안 점으로 잡는다(42-05 계약 ·
  // 창 밖 커서까지 잇는 보간 사선 없음 — 커서 x 에서 선이 패널 값을 지나는 계약은 커서가 창 안일 때만 · 창 밖 커서 값은 값 띠 ·
  // 값 점 전용) — 창 왼쪽 끝으로 이어지는 열 샘플 값은 둔다(빈 창에서 선이 사라지지 않게).
  const dayBase = useMemo(() => dayReturnPointsOf(session, view, plotW, -1), [session, view, plotW]);
  const dayScalePts = useMemo(
    () => withCursorReturnPoint(dayBase, session, view, cursorRec),
    [dayBase, session, view, cursorRec],
  );
  const cumRet = useMemo(() => cumReturnPointsOf(session, view, plotW, cumAvg), [session, view, plotW, cumAvg]);
  const scales = useMemo(() => returnScalesOf(dayScalePts, cumRet, P.yRa, P.yRb), [dayScalePts, cumRet, P]);

  // 값 점 · 값 띠 입력 — 선 차트와 같은 팀 · 누적 · 거래대금 계열(아래 판 그리기는 `CandleLowerLayers` — 같은 함수)
  const team = session.team;
  const cumPts = useMemo(() => cumPointsOf(accum, isToday), [accum, isToday]);
  const dayRange = useMemo(() => dayNetRangeOf(team), [team]);
  const yN = yOfNet(dayRange, P);
  const cumRange = useMemo(() => cumNetRangeOf(cumPts), [cumPts]);
  const yC = yOfNet(cumRange, P);
  const turnover = turnoverSeriesOf(session);
  const mcap = marketCapOf(session.basePx, listingShares);
  // 넷째 판 경로(창 안 체결 수만큼 돈다)는 여기서 한 번만 메모해 아래 판에 넘긴다 — 마우스 · 커서 재렌더에서 다시 돌지 않는다(SC-7)
  const tv = useMemo(() => turnoverPathsOf(turnover, view, x, P, plotW, endMs), [turnover, view, x, P, plotW, endMs]);

  // 카드 아래 캡션(D-17 · UI-SPEC S9) — 누적 캡션 → 켜진 선 중 그릴 수 없는 선의 이유(받는 중 · 그림 = 안내 없음)
  const captionItems = useMemo(
    () =>
      candleCaptionOf({
        accum,
        isToday,
        hasCum: cumPts.length > 0 || cumAvg.length > 0,
        nxt: session.ex === 'NXT',
        ma: maOn.map((l) => ({ name: maNameOf(l), status: maStatusOf(l, candles.n, prev) })),
      }),
    [accum, isToday, cumPts, cumAvg, session.ex, maOn, candles, prev],
  );

  // 팀 주문 원 · 우리 점 — 봉 영역 y(`candleYOf`)로 봉과 같은 시간축 · 같은 가격 눈금에 겹친다(SC-4)
  const circles = tickCirclesOf(team, view, x, y);
  const ownR = phone ? OWN_MARK_R.phone : OWN_MARK_R.desktop;
  const marks: OwnMark[] = own !== null ? ownMarksOf(own, session, view, x, y) : [];
  const curOrder = cursorRec >= 0 ? session.orderOfRec[cursorRec]! : -1;

  // 떠다니는 상자 대상 — 가격 판 전용(팀 원 묶음 · 우리 점). 다른 판은 값 띠(42-10)가 대신한다.
  const pickAt = (mx: number, my: number): TickHover | null => {
    if (mx < L || mx > xr || my < P.y1a || my > P.y1b) return null;
    const c = nearestTickCircleOf(circles, mx, my, P);
    const teamHover = c === null ? null : tickOrderHoverOf(team, circles, c, view);
    // 우리 줄은 팀 줄 뒤에 덧붙이기만(38 D-16 — 팀 줄 문구 · 순서 그대로)
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

  // 값 띠(D-20 · UI-SPEC S8) — 시각 = 터치(손가락 x · 그림 영역으로 자름) ?? 마우스 ?? 현재 틱. 현재 틱(live)이면 커서 rec 로
  // 팀 KPI 를 잘라 패널과 같은 수익률 글자 · 마우스면 그 시각 이하 마지막 가격 점 rec.
  const touchT = touchPt === null ? null : tAt(Math.min(xr, Math.max(L, mxOf(touchPt))));
  const hoverT = touchT ?? (hover !== null ? tAt(hover.mx) : null);
  const bandT = hoverT ?? cursorMs;
  const bandLive = hoverT === null;
  let bandRec = cursorRec;
  if (!bandLive && bandT !== null) {
    const pi = priceIdxAt(series, bandT);
    bandRec = pi >= 0 ? series.rec[pi]! : -1;
  }
  const bandVal =
    bandT === null
      ? null
      : candleBandAt(
          {
            session,
            candles,
            ma,
            cumAvg,
            tick: { team, cum: cumPts, price: series, turnover, basePx: session.basePx, mcap, T0: bounds.T0 },
          },
          bandT,
          bandRec,
        );

  // 세로선 · 값 점 — 호버나 터치가 있고 끌기 중이 아닐 때만 · 가격 판 = 그 시각 봉의 종가 · 수익률 판 = 당일(--team) · 누적(--muted-fg)
  const hoverLine = hoverT !== null && !dragging ? x(hoverT) : null;
  const hoverDots: { y: number; c: string }[] = [];
  if (hoverLine !== null && bandVal !== null) {
    const tb = bandVal.tick;
    if (bandVal.candle !== null) hoverDots.push({ y: y(bandVal.candle.c), c: 'var(--fg-2)' });
    if (bandVal.ret !== null) hoverDots.push({ y: scales.yDay(bandVal.ret), c: 'var(--team)' });
    if (bandVal.cumRet !== null && scales.yCum !== null) hoverDots.push({ y: scales.yCum(bandVal.cumRet), c: 'var(--muted-fg)' });
    if (tb.hasTeam) {
      hoverDots.push({ y: yN(tb.dayBuy), c: 'var(--up)' });
      hoverDots.push({ y: yN(-tb.daySell), c: 'var(--down)' });
      hoverDots.push({ y: yN(tb.dayNet), c: 'var(--team)' });
    }
    if (tb.hasCum && tb.cum !== null) hoverDots.push({ y: yC(tb.cum), c: 'var(--muted-fg)' });
    if (tv.share !== '' && tb.share !== null) hoverDots.push({ y: yOfShare(tv.shareTop, P)(tb.share), c: 'var(--team)' });
  }

  // 구간 — 끄는 중이면 그것, 아니면 확정 구간. 합계는 구간 값이 바뀔 때만 다시 센다.
  const rng = draft ?? sel;
  const rngT0 = rng?.t0 ?? null;
  const rngT1 = rng?.t1 ?? null;
  const rngSum = useMemo(
    () => (rngT0 === null || rngT1 === null ? null : tickRangeSumOf(session, rngT0, rngT1)),
    [session, rngT0, rngT1],
  );
  const rngBand = (() => {
    if (rngT0 === null || rngT1 === null || rngSum === null) return null;
    const a = Math.max(L, x(Math.min(rngT0, rngT1)));
    const b = Math.min(xr, x(Math.max(rngT0, rngT1)));
    if (b < a) return null;
    const label = `순 ${fmtSignedAmountC(rngSum.net)}`;
    const lw = Math.min(plotW, label.length * 6.4 + 10);
    const lx = Math.min(xr - lw, Math.max(L, (a + b) / 2 - lw / 2));
    return { a, b, label, lw, lx };
  })();

  /** client x → viewBox x(svg 상자 기준). */
  const vbX = (el: Element, clientX: number) => {
    const rect = el.getBoundingClientRect();
    return ((clientX - rect.left) * W) / (rect.width || W);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    // Shift 구간 끌기 — 호버 · 끌기 검사보다 먼저(창은 panLockRef 가 잡고 있다)
    const rd = rangeDownRef.current;
    if (rd !== null) {
      if (!rd.moved && Math.abs(e.clientX - rd.clientX) > CLICK_SLOP_PX) rd.moved = true;
      if (rd.moved) {
        rd.t1 = tAt(Math.min(xr, Math.max(L, vbX(e.currentTarget, e.clientX))));
        setDraft({ t0: rd.t0, t1: rd.t1 });
      }
      return;
    }
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

  // 클릭 = 그 시각 첫 틱 · 원 클릭 = 그 주문 마지막 조각. 끌기(4px 넘게 움직임)는 클릭이 아니다. 봉은 누를 수 없다.
  const downRef = useRef<{ x: number; y: number; orderRec: number | null; own: OwnMark | null } | null>(null);
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    // Shift+끌기 = 구간(데스크톱 마우스만 · 그림 영역 안에서 누를 때) — 그냥 끌기는 창 이동 그대로
    if (e.pointerType === 'mouse' && e.button === 0 && e.shiftKey && !phone) {
      const px = vbX(e.currentTarget, e.clientX);
      if (px >= L && px <= xr) {
        const t = tAt(px);
        rangeDownRef.current = { t0: t, t1: t, clientX: e.clientX, moved: false };
        panLockRef.current = true;
      }
    }
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
  /** 구간 끌기 끝 — commit(pointerup)이면 움직인 구간을 확정, 아니면(cancel · 캡처 풀림) 끄던 것만 버리고 이전 구간은 둔다. */
  const endRange = (commit: boolean) => {
    const rd = rangeDownRef.current;
    if (rd === null) return;
    rangeDownRef.current = null;
    panLockRef.current = inspectRef.current;
    if (commit && rd.moved && rd.t1 !== rd.t0) {
      setSel({ session, t0: Math.min(rd.t0, rd.t1), t1: Math.max(rd.t0, rd.t1) });
    }
    setDraft(null);
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
    // 구간이 있으면 빈 곳 클릭 = 구간 지움(이 클릭은 시각 이동이 아니다 — 스케치 028 ③)
    if (sel !== null) {
      setSel(null);
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

  const span = view.t1 - view.t0;
  const cursorLabel = cursorMs === null ? '' : kstClock(cursorMs);
  const curLabW = 58;
  const plotH = P.y4b - P.y1a;

  return (
    <section data-slot="candle-chart" aria-label="봉 차트" className={cn(CARD, 'min-w-0 overflow-hidden', className)}>
      {/* 제목 줄(D-05 · D-21 — 데스크톱 한 줄 · 폰 두 줄) · 래퍼 밖이라 키 처리와 겹치지 않는다(Pitfall 12) */}
      <CandleChartTitle
        phone={phone}
        kindSwitch={titleAddon?.(phone)}
        unitPref={unitPref}
        currentUnit={unit}
        onUnit={setUnitPref}
        ma={maCfg}
        onMa={setMaCfg}
        ownLegend={ownLegend}
        spanLabel={fmtSpan(span)}
        onZoomIn={() => zoomBy(0.5)}
        onZoomOut={() => zoomBy(2)}
        onFull={() => ctl.setPreset('full')}
        onMinute={() => zoomTo(60_000)}
        onTenSec={() => zoomTo(10_000)}
      />

      {/* 값 띠 A 4칸(제목 줄 바로 아래 · 높이 고정) — 마우스 = 그 시각 · 떼면 현재 틱 */}
      <CandleChartBand band={bandVal} live={bandLive} phone={phone} />

      <div
        ref={wrapRef}
        data-slot="candle-chart-wrap"
        className="relative px-0 py-1"
        role="group"
        tabIndex={0}
        aria-label="봉 차트 보기 창 — +·− 확대/축소, 0 하루 전체, 클릭하면 그 시각으로 이동, Shift+끌기 구간 합계"
        onKeyDown={onKeyDown}
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
          className={cn(
            'block tabular-nums',
            draft !== null ? 'cursor-col-resize' : dragging ? 'cursor-grabbing' : 'cursor-crosshair',
          )}
          style={{
            touchAction: 'pan-y',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            visibility: pending ? 'hidden' : undefined,
          }}
          fontSize={11}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => {
            endRange(true);
            tracker.end(e);
          }}
          onPointerCancel={(e) => {
            endRange(false);
            tracker.end(e);
          }}
          onLostPointerCapture={(e) => {
            endRange(false);
            tracker.end(e);
          }}
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

          {/* ① 가격 판 — 봉 · 누적 평단 · 가격 축 + children(가격 판 높이 클립) = 팀 주문 원 · 고리 · 우리 점 */}
          <CandlePriceLayer
            frame={frame}
            candles={candles}
            range={range}
            y={y}
            cumAvg={cumAvg}
            clipId={clipId}
            ma={ma}
            team={team}
            unitLabel={unitLabel}
            ownInTitle={ownLegend}
          >
            {circles.map(({ o, cx: ox, cy: oy, r }) => {
              const color = o.side === 'B' ? 'var(--up)' : 'var(--down)';
              const on = o.order.id === curOrder;
              return (
                <circle
                  key={o.order.id}
                  data-slot="candle-order-circle"
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
                data-slot="candle-order-hover"
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
                data-slot="candle-order-seed"
                cx={seedRim.cx}
                cy={seedRim.cy}
                r={seedRim.r + 1}
                fill="none"
                stroke="var(--fg)"
                strokeWidth={2.5}
                pointerEvents="none"
              />
            )}
            {/* 우리 점(Phase 38 D-08) — 팀 원 위 · ○ → ◇ → ◆ 순(◆ 가 맨 위) */}
            {marks.map((m, i) =>
              m.kind === 'ev' ? (
                <circle
                  key={`ev${m.rec}`}
                  data-slot="candle-own-ev-mark"
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
          </CandlePriceLayer>

          {/* ② 수익률 판 — 당일 · 누적 · 0% 한 줄 · 두 눈금(자기 클립) */}
          {/* 선 · 눈금 글자 = 눈금을 만든 창 안 점(창 밖 커서 점은 값 띠 · 값 점 전용) · 빈 상태 = 하루 기준(아래 판과 같은 판정) */}
          <CandleReturnLayer
            frame={frame}
            day={dayScalePts}
            noTeam={team.fills.length === 0}
            cum={cumRet}
            scales={scales}
            clipId={clipId}
          />
          {/* ③ ~ ⑤ 아래 세 판 — 순매수 · 10분 · 누적 거래대금(선 차트와 같은 함수 · 자기 클립) */}
          <CandleLowerLayers
            frame={frame}
            session={session}
            accum={accum}
            isToday={isToday}
            listingShares={listingShares}
            tv={tv}
            clipId={clipId}
          />

          <g clipPath={`url(#${clipId})`}>
            {/* 구간 띠 · 순매수 알약(스케치 028 ③ · 알약은 수익률 판 위 — 끄는 중이면 그 구간 · 아니면 확정 구간) */}
            {rngBand !== null && rngSum !== null && (
              <g data-slot="candle-range" pointerEvents="none">
                <rect
                  data-slot="candle-range-band"
                  x={rngBand.a}
                  y={P.y1a}
                  width={Math.max(1, rngBand.b - rngBand.a)}
                  height={plotH}
                  fill="var(--primary)"
                  fillOpacity={0.1}
                />
                {[rngBand.a, rngBand.b].map((xx, i) => (
                  <line
                    key={i}
                    x1={xx}
                    x2={xx}
                    y1={P.y1a}
                    y2={P.y4b}
                    stroke="var(--primary)"
                    strokeOpacity={0.55}
                  />
                ))}
                <g data-slot="candle-range-pill">
                  <rect x={rngBand.lx} y={P.yRa - 15} width={rngBand.lw} height={14} rx={7} fill="var(--primary)" />
                  <text
                    x={rngBand.lx + rngBand.lw / 2}
                    y={P.yRa - 4.5}
                    textAnchor="middle"
                    fill="var(--primary-fg)"
                    fontWeight={600}
                    fontSize={10.5}
                  >
                    {rngBand.label}
                  </text>
                </g>
              </g>
            )}

            {/* 마우스 세로선 + 그 시각 값 점 — 끌기 중이 아닐 때 */}
            {hoverLine !== null && (
              <g data-slot="candle-chart-hover" pointerEvents="none">
                <line
                  data-slot="candle-chart-hover-line"
                  x1={hoverLine}
                  x2={hoverLine}
                  y1={P.y1a}
                  y2={P.y4b}
                  stroke="var(--fg-2)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.7}
                />
                {hoverDots.map((d, i) => (
                  <circle
                    key={i}
                    data-slot="candle-chart-hover-dot"
                    cx={hoverLine}
                    cy={d.y}
                    r={3}
                    fill={d.c}
                    stroke="var(--card)"
                    strokeWidth={1.5}
                  />
                ))}
              </g>
            )}
          </g>

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

          {/* 커서 시각 라벨(아래 눈금 띠) */}
          {cx !== null && (
            <g data-slot="candle-chart-cursor-label" pointerEvents="none">
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
        {tip && (tip.table !== undefined || tip.lines.length > 0) && (
          <div
            ref={tipRef}
            data-slot="candle-chart-tip"
            data-touch={tip.touch ? '1' : undefined}
            role="tooltip"
            className={cn(
              'pointer-events-none absolute z-10 rounded-[10px] border border-[var(--border)] bg-[var(--popover)] text-[11px] leading-[1.45] break-keep text-[var(--popover-fg)] shadow-md tabular-nums',
              tip.table ? 'w-[300px] px-1 pt-0.5 pb-1' : 'px-2 py-1',
            )}
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
            {tip.table && <TickGroupBox table={tip.table} />}
            {tip.lines.map((line, i) => (
              <div key={i} data-slot="candle-chart-own-line" className={cn('pl-3 -indent-3', tip.table && 'mx-1 mt-0.5')}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 구간 결과 · 안내 — 차트 아래에만(손을 떼도 차트가 밀리지 않는다) */}
      {rngSum !== null && <TickChartRange sum={rngSum} dragging={draft !== null} onClear={clearRange} />}
      <CandleChartCaption phone={phone} ownLegend={ownLegend} items={captionItems} />
      {!phone && (
        <div
          data-slot="candle-chart-hint"
          className="border-t border-[var(--border-subtle)] px-3 pt-1.5 pb-2 text-[11px] text-[var(--muted-fg)]"
        >
          <kbd className={KBD}>Shift</kbd>+<kbd className={KBD}>끌기</kbd> 구간 합계 · <kbd className={KBD}>끌기</kbd> 창 이동 ·{' '}
          <kbd className={KBD}>휠</kbd> 확대/축소 · <kbd className={KBD}>클릭</kbd> 그 시각으로 · <kbd className={KBD}>Esc</kbd> 구간
          지움
        </div>
      )}
    </section>
  );
}
