/**
 * 틱 뷰어 봉 차트 순수 기하 (Phase 42 · D-01 순수 SVG · `lib/ticks/tick-chart.ts` 는 가져다 쓰되 고치지 않는다).
 *
 * ① 판 치수 — `CANDLE_CHART`(데스크톱 420 · 폰 303 · 42-UI-SPEC 「봉 차트 치수」). `candlePanelsOf` 는 `TickPanels` 와 같은
 *   키(`y1a` ~ `y4b` · `H`)에 봉 영역 아래 `yCb` · 수익률 판 `yRa` · `yRb` 를 더한다 — 기존 판 함수(`teamDayStairsOf` ·
 *   `teamBucketsOf` · `turnoverPathsOf` · 원 판정)가 이름으로만 읽으므로 새 y 에서 고치지 않고 돈다(RESEARCH Pattern 1).
 * ② 봉 집계 — 차트 시간축과 같은 **수신 시각**을 08:00 정시에 맞물린 1분 칸으로 묶는다(단일가 체결은 수신 시각의 봉에 든다).
 *   거름은 넷째 판 `turnoverSeriesOf` 와 같다(중복 수신 · 가격 0 · 수량 0 · 08:00 전 · 20:00 뒤 제외) — 그래서 봉 거래대금 합 =
 *   누적 거래대금 증가분. 세션마다 한 번(WeakMap · 당일 증분은 `appendTickBytes` 가 새 세션 객체를 만들어 자연히 다시 집계).
 * ③ 누적 평단(D-15) — 매집감지 보고서 `payload.avg_px` 계단(과거 날짜 · 등록 종목만 · 당일 화면은 없음). `px ≤ 0` 에서 끊는다.
 *   가격 범위를 넓히지 않는다(D-16 — 범위 밖 가장자리 글자는 42-04).
 * ④ 컴포넌트(`components/ticks/candle-chart.tsx` · `candle-price-layer.tsx`)는 그리기만 하고 기하는 여기서 테스트가 잠근다.
 */

import type { AccumReportPayload, TickOpenResponse } from '@gh-radar/shared';

import { avgPxPointsOf, type PricePoint, type View } from '@/lib/accum-chart';

import {
  tickBoundsOf,
  turnoverSeriesOf,
  yOfTickPrice,
  type TickBounds,
  type TickPanels,
  type TickPriceRange,
} from './tick-chart';
import type { TickSession } from './tick-session';

// ---------------------------------------------------------------------------
// 판 치수
// ---------------------------------------------------------------------------

/**
 * 봉 차트 판 치수(D-07 · D-12) — 데스크톱 7 + 160(봉 128 + 거래대금 32) + 7 + 50 + 7 + 70 + 7 + 40 + 7 + 50 + 15 = 420 ·
 * 폰 0 + 110(88 + 22) + 7 + 36 + 7 + 50 + 7 + 28 + 7 + 36 + 15 = 303. 좌 · 우 축 폭은 선 차트와 같다(`TICK_CHART.R` ·
 * `priceAxisWidthOf`).
 */
export const CANDLE_CHART = {
  desktop: { TOP: 7, H1: 160, AMT: 32, GAP: 7, HR: 50, H2: 70, H3: 40, H4: 50, LB: 15, H: 420 },
  phone: { TOP: 0, H1: 110, AMT: 22, GAP: 7, HR: 36, H2: 50, H3: 28, H4: 36, LB: 15, H: 303 },
} as const;

export type CandleDims = (typeof CANDLE_CHART)['desktop'] | (typeof CANDLE_CHART)['phone'];

/** 판 y 경계 — `TickPanels` + 봉 영역 아래(`yCb` = 거래대금 막대 위끝) · 수익률 판 [yRa, yRb]. */
export interface CandlePanels extends TickPanels {
  yCb: number;
  yRa: number;
  yRb: number;
}

/** 가격 → 수익률 → 순매수 → 10분 → 누적 거래대금 → 시각 눈금 띠 순. */
export function candlePanelsOf(d: CandleDims): CandlePanels {
  const y1a = d.TOP;
  const y1b = y1a + d.H1;
  const yRa = y1b + d.GAP;
  const yRb = yRa + d.HR;
  const y2a = yRb + d.GAP;
  const y2b = y2a + d.H2;
  const y3a = y2b + d.GAP;
  const y3b = y3a + d.H3;
  const y4a = y3b + d.GAP;
  const y4b = y4a + d.H4;
  return { y1a, y1b, yCb: y1b - d.AMT, yRa, yRb, y2a, y2b, y3a, y3b, y4a, y4b, H: y4b + d.LB };
}

/** 봉 차트 층 컴포넌트가 받는 공통 틀(뒤 플랜의 수익률 · 아래 판 층도 같은 틀을 받는다). */
export interface CandleFrame {
  /** viewBox 폭(측정 폭 1:1). */
  W: number;
  P: CandlePanels;
  /** 왼쪽 가격 축 폭 = 그림 영역 왼끝. */
  L: number;
  /** 그림 영역 오른끝(W − R). */
  xr: number;
  plotW: number;
  phone: boolean;
  view: View;
  x: (t: number) => number;
  bounds: TickBounds;
  /** 열린 계단의 오른끝(세션 마지막 수신 · 없으면 20:00). */
  endMs: number;
}

// ---------------------------------------------------------------------------
// 봉 집계
// ---------------------------------------------------------------------------

export type CandleUnit = 1 | 5 | 10 | 15 | 30 | 60;
export const CANDLE_UNITS: readonly CandleUnit[] = [1, 5, 10, 15, 30, 60];
export const CANDLE_MIN_MS = 60_000;
/** 08:00 ~ 20:00 = 720분. */
export const CANDLE_DAY_MIN = 720;

/** 봉 열(같은 길이 n · 봉 시작 오름차순 · 체결 없는 칸은 봉이 없다). */
export interface Candles {
  unit: CandleUnit;
  n: number;
  /** 봉 시작 ms(= T0 + k × 단위). */
  t0: Float64Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  /** 거래대금 Σ(가격 × 수량). */
  amt: Float64Array;
}

/** 세션마다 1분봉 하나 + 상위 단위별 집계(세션 · 단위당 1회 — SC-7). */
const candleCache = new WeakMap<TickSession, { base: Candles; byUnit: Map<CandleUnit, Candles> }>();

/**
 * 1분봉 — 넷째 판 누적 계열(`turnoverSeriesOf` · 세션마다 1회 캐시)의 점을 그대로 돈다. 그 점들이 이미 같은 거름(중복 수신 ·
 * 가격 0 · 수량 0)을 거친 수신순 A3 이고 수신 ms(`t`)와 수신순 자리(`pos`)를 갖고 있어, BigInt 시각 변환을 다시 하지 않는다(IN-03).
 */
function buildBase(session: TickSession): Candles {
  const { T0 } = tickBoundsOf(session.date);
  const { recvOrder, a3Of, a3 } = session;
  const tv = turnoverSeriesOf(session);
  const t0 = new Float64Array(CANDLE_DAY_MIN);
  const o = new Float64Array(CANDLE_DAY_MIN);
  const h = new Float64Array(CANDLE_DAY_MIN);
  const l = new Float64Array(CANDLE_DAY_MIN);
  const c = new Float64Array(CANDLE_DAY_MIN);
  const amt = new Float64Array(CANDLE_DAY_MIN);
  let n = 0;
  let lastK = -1;
  for (let m = 0; m < tv.n; m++) {
    const j = a3Of[recvOrder[tv.pos[m]!]!]!;
    const px = a3.px[j]!;
    const q = a3.qty[j]!;
    const k = Math.floor((tv.t[m]! - T0) / CANDLE_MIN_MS);
    if (k < 0 || k >= CANDLE_DAY_MIN) continue;
    // 수신순이라 k 는 감소하지 않는다
    if (k !== lastK) {
      t0[n] = T0 + k * CANDLE_MIN_MS;
      o[n] = px;
      h[n] = px;
      l[n] = px;
      c[n] = px;
      amt[n] = 0;
      n += 1;
      lastK = k;
    }
    const i = n - 1;
    if (px > h[i]!) h[i] = px;
    if (px < l[i]!) l[i] = px;
    c[i] = px;
    amt[i] = amt[i]! + px * q;
  }
  const s = (a: Float64Array) => a.subarray(0, n);
  return { unit: 1, n, t0: s(t0), o: s(o), h: s(h), l: s(l), c: s(c), amt: s(amt) };
}

/**
 * 1분봉 → 상위 단위 — 1분봉 i 의 칸 = floor((t0[i] − T0) / 단위 ms) · 같은 칸이면 시가 = 첫 · 고 max · 저 min · 종가 = 마지막 ·
 * 거래대금 합 · 봉 시작 = T0 + 칸 × 단위 ms(08:00 정시에 맞물린다 — 60분봉 = 정시 시작).
 */
function rollUp(base: Candles, unit: CandleUnit, T0: number): Candles {
  const u = unit * CANDLE_MIN_MS;
  const t0 = new Float64Array(base.n);
  const o = new Float64Array(base.n);
  const h = new Float64Array(base.n);
  const l = new Float64Array(base.n);
  const c = new Float64Array(base.n);
  const amt = new Float64Array(base.n);
  let n = 0;
  let lastK = -1;
  for (let i = 0; i < base.n; i++) {
    const k = Math.floor((base.t0[i]! - T0) / u);
    if (k !== lastK) {
      t0[n] = T0 + k * u;
      o[n] = base.o[i]!;
      h[n] = base.h[i]!;
      l[n] = base.l[i]!;
      c[n] = base.c[i]!;
      amt[n] = base.amt[i]!;
      n += 1;
      lastK = k;
      continue;
    }
    const j = n - 1;
    if (base.h[i]! > h[j]!) h[j] = base.h[i]!;
    if (base.l[i]! < l[j]!) l[j] = base.l[i]!;
    c[j] = base.c[i]!;
    amt[j] = amt[j]! + base.amt[i]!;
  }
  const s = (a: Float64Array) => a.subarray(0, n);
  return { unit, n, t0: s(t0), o: s(o), h: s(h), l: s(l), c: s(c), amt: s(amt) };
}

function cacheOf(session: TickSession) {
  let hit = candleCache.get(session);
  if (hit === undefined) {
    const base = buildBase(session);
    hit = { base, byUnit: new Map<CandleUnit, Candles>([[1, base]]) };
    candleCache.set(session, hit);
  }
  return hit;
}

/**
 * 세션 → 그 단위 봉(세션 · 단위당 한 번 · 같은 세션 · 단위면 같은 객체). 상위 단위는 1분봉에서 묶는다(RESEARCH Pattern 2) —
 * 가격 · 수량이 정수라 Σ(가격 × 수량) 를 다시 더해도 직접 합과 비트까지 같다.
 */
export function candlesOf(session: TickSession, unit: CandleUnit): Candles {
  const hit = cacheOf(session);
  let out = hit.byUnit.get(unit);
  if (out === undefined) {
    out = rollUp(hit.base, unit, tickBoundsOf(session.date).T0);
    hit.byUnit.set(unit, out);
  }
  return out;
}

/** 세션 → 1분봉(`candlesOf(session, 1)` 과 같은 객체). */
export function candleBaseOf(session: TickSession): Candles {
  return candlesOf(session, 1);
}

/** 시각 t 가 든 봉 색인 — 칸 `[t0, t0 + 단위)` 안이면 그 색인 · 빈 칸 · 첫 봉 앞 · 마지막 봉 뒤면 −1. */
export function candleIdxAt(c: Candles, t: number): number {
  const i = upperBound(c.t0, c.n, t) - 1;
  if (i < 0) return -1;
  return t < c.t0[i]! + c.unit * CANDLE_MIN_MS ? i : -1;
}

/** 봉 단위 글자 — 자동 「5분봉(자동)」 · 고정 「15분봉」(UI-SPEC 문구 표). */
export function candleUnitLabelOf(unit: CandleUnit, auto: boolean): string {
  return auto ? `${unit}분봉(자동)` : `${unit}분봉`;
}

/** 정렬된 a 에서 v 초과인 첫 색인. */
function upperBound(a: Float64Array, n: number, v: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid]! <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 보기 창과 칸 `[t0, t0 + 단위)` 가 겹치는 봉 색인 [a, b). */
function visibleIdxOf(c: Candles, view: View): [number, number] {
  const u = c.unit * CANDLE_MIN_MS;
  // t0 + u > view.t0 ⇔ t0 > view.t0 − u
  const a = upperBound(c.t0, c.n, view.t0 - u);
  const b = upperBound(c.t0, c.n, view.t1);
  return [a, Math.max(a, b)];
}

/**
 * 보기 창 가격 범위 — 겹치는 봉들의 최저 저가 ~ 최고 고가 · 겹치는 봉이 없으면 창 앞 마지막 봉 종가 하나 · 그것도 없으면 첫 봉
 * 종가 · 봉이 0개면 [0, 1]. 여유 = `tickPriceRangeOf` 와 같은 식. 이동평균 · 누적 평단은 범위를 넓히지 않는다(D-16).
 */
export function candleRangeOf(c: Candles, view: View): TickPriceRange {
  if (c.n === 0) return { min: 0, max: 1, lo: 0, hi: 1 };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const [a, b] = visibleIdxOf(c, view);
  if (b > a) {
    for (let i = a; i < b; i++) {
      if (c.l[i]! < min) min = c.l[i]!;
      if (c.h[i]! > max) max = c.h[i]!;
    }
  } else {
    const v = a > 0 ? c.c[a - 1]! : c.c[0]!;
    min = v;
    max = v;
  }
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.005 || 1;
  return { min, max, lo: min - pad, hi: max + pad };
}

/** 가격 → y(봉 영역 [y1a, yCb] 안 · 위아래 3px 여유 — `yOfTickPrice` 규칙 그대로). */
export function candleYOf(range: TickPriceRange, P: CandlePanels): (px: number) => number {
  return yOfTickPrice(range, { ...P, y1b: P.yCb });
}

// ---------------------------------------------------------------------------
// 봉 경로
// ---------------------------------------------------------------------------

/** 몸통 최대 폭(px · 목업 상한). */
export const CANDLE_BODY_MAX_PX = 14;
/** 몸통 폭 = 칸 폭 × 이 비율(최대 폭 안). */
export const CANDLE_BODY_RATIO = 0.7;
/** 칸 폭이 이보다 좁으면 몸통 없이 꼬리만. */
export const CANDLE_WICK_ONLY_PX = 3;

/** 방향별 경로 넷 — 오름(종가 ≥ 시가) · 내림(종가 < 시가). 봉마다 요소를 만들지 않는다(RESEARCH Pattern 8). */
export interface CandlePaths {
  upBody: string;
  downBody: string;
  upWick: string;
  downWick: string;
}

const f1 = (v: number) => v.toFixed(1);

/**
 * 보기 창과 겹치는 봉만 — 칸 폭 `slot = x(t0 + 단위) − x(t0)` · 몸통 폭 = min(14, slot × 0.7) · slot < 3 이면 꼬리만 · 몸통 높이 최소
 * 1px · 꼬리 = 칸 가운데 `M x,y(h) V y(l)` · 몸통 = `M … h w v hh h −w Z` 이어 붙임.
 */
export function candlePathsOf(
  c: Candles,
  view: View,
  x: (t: number) => number,
  y: (px: number) => number,
): CandlePaths {
  const out: CandlePaths = { upBody: '', downBody: '', upWick: '', downWick: '' };
  const u = c.unit * CANDLE_MIN_MS;
  const [a, b] = visibleIdxOf(c, view);
  for (let i = a; i < b; i++) {
    const xs = x(c.t0[i]!);
    const slot = x(c.t0[i]! + u) - xs;
    const cx = xs + slot / 2;
    const o = c.o[i]!;
    const cl = c.c[i]!;
    const up = cl >= o;
    const wick = `M${f1(cx)},${f1(y(c.h[i]!))}V${f1(y(c.l[i]!))}`;
    if (up) out.upWick += wick;
    else out.downWick += wick;
    if (slot < CANDLE_WICK_ONLY_PX) continue;
    const bw = Math.min(CANDLE_BODY_MAX_PX, slot * CANDLE_BODY_RATIO);
    const top = y(Math.max(o, cl));
    const hh = Math.max(1, y(Math.min(o, cl)) - top);
    const body = `M${f1(cx - bw / 2)},${f1(top)}h${f1(bw)}v${f1(hh)}h${f1(-bw)}Z`;
    if (up) out.upBody += body;
    else out.downBody += body;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 누적 평단(D-15)
// ---------------------------------------------------------------------------

/**
 * 누적 평단 점 — 당일 화면 · accum null(미등록) · `avg_px` 가 null(2026-10-21 이전 행) · 키 없음(옛 RPC) · 모양 어긋남이면 [].
 * 모양 방어는 `avgPxPointsOf` 가 흡수한다(RESEARCH Pitfall 10).
 */
export function cumAvgPointsOf(accum: TickOpenResponse['accum'] | null | undefined, isToday: boolean): PricePoint[] {
  if (isToday || accum == null) return [];
  return avgPxPointsOf({ avg_px: accum.avg_px } as Pick<AccumReportPayload, 'avg_px'>);
}

/**
 * 누적 평단 계단 경로(`avgPxPathOf` 규칙을 y 주입형으로) — 다음 점까지 수평 · 값이 바뀌는 점에서 수직 · T0(08:00) 전 점은 T0 에
 * 붙인다(T0 전 점이 여럿이면 마지막 점만) · `px ≤ 0` 이면 열린 조각을 그 점까지 닫고 끊는다 · 열린 마지막 조각의 끝 =
 * max(endMs, 마지막 점). 클램프하지 않는다 — 범위 밖은 클립이 자르고 가장자리 글자(D-16 · 42-04)가 대신한다.
 */
export function cumAvgPathOf(
  pts: readonly PricePoint[],
  x: (t: number) => number,
  y: (px: number) => number,
  T0: number,
  endMs: number,
): string {
  let d = '';
  let open = false;
  let lastTx: number | null = null;
  for (let k = 0; k < pts.length; k++) {
    const [t, p] = pts[k]!;
    const next = pts[k + 1];
    if (t < T0 && next !== undefined && next[0] < T0) continue;
    const tx = Math.max(t, T0);
    lastTx = tx;
    const xs = f1(x(tx));
    if (p <= 0) {
      if (open) d += `H${xs}`;
      open = false;
    } else if (open) {
      d += `H${xs}V${f1(y(p))}`;
    } else {
      d += `M${xs},${f1(y(p))}`;
      open = true;
    }
  }
  if (open && lastTx !== null) d += `H${f1(x(Math.max(endMs, lastTx)))}`;
  return d;
}

// ---------------------------------------------------------------------------
// 자동 단위(D-09 · SC-2)
// ---------------------------------------------------------------------------

/** 자동 단위의 최소 칸 폭(px). */
export const CANDLE_AUTO_MIN_PX = 4;

/** 칸 폭 `(단위 ÷ 보기 창) × 그림 폭` 이 4px 이상인 가장 작은 단위 · 아무것도 아니면 60(RESEARCH Code Example 2). */
export function autoUnitOf(span: number, plotW: number): CandleUnit {
  for (const u of CANDLE_UNITS) if (((u * CANDLE_MIN_MS) / span) * plotW >= CANDLE_AUTO_MIN_PX) return u;
  return 60;
}

// ---------------------------------------------------------------------------
// 거래대금 막대(D-06)
// ---------------------------------------------------------------------------

/** 방향별 막대 경로 둘 + 보기 창 안 최대 거래대금(높이 기준 · 창에 봉이 없으면 0). */
export interface AmountBars {
  up: string;
  down: string;
  max: number;
}

/**
 * 가격 판 아래 [yCb, y1b] 영역 — 보기 창과 겹치는 봉만 · 높이 = 거래대금 ÷ 창 안 최대 × (영역 − 2) · 아래 끝 = y1b · x · 폭 =
 * 몸통 규칙(꼬리만 구간이면 `max(1, 칸 폭 × 0.7)`) · 방향 = 종가 ≥ 시가.
 */
export function amountBarsOf(c: Candles, view: View, x: (t: number) => number, P: CandlePanels): AmountBars {
  const out: AmountBars = { up: '', down: '', max: 0 };
  const [a, b] = visibleIdxOf(c, view);
  for (let i = a; i < b; i++) if (c.amt[i]! > out.max) out.max = c.amt[i]!;
  if (!(out.max > 0)) return out;
  const u = c.unit * CANDLE_MIN_MS;
  const hMax = P.y1b - P.yCb - 2;
  for (let i = a; i < b; i++) {
    const xs = x(c.t0[i]!);
    const slot = x(c.t0[i]! + u) - xs;
    const cx = xs + slot / 2;
    const bw =
      slot < CANDLE_WICK_ONLY_PX
        ? Math.max(1, slot * CANDLE_BODY_RATIO)
        : Math.min(CANDLE_BODY_MAX_PX, slot * CANDLE_BODY_RATIO);
    const hh = (c.amt[i]! / out.max) * hMax;
    const bar = `M${f1(cx - bw / 2)},${f1(P.y1b - hh)}h${f1(bw)}v${f1(hh)}h${f1(-bw)}Z`;
    if (c.c[i]! >= c.o[i]!) out.up += bar;
    else out.down += bar;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 보이는 값 · 가장자리 글자(D-16 · UI-SPEC S5)
// ---------------------------------------------------------------------------

/** 이동평균 값 중 보기 창과 겹치는 봉의 유한 값(봉 순서). */
export function maVisibleOf(c: Candles, values: Float64Array, view: View): number[] {
  const [a, b] = visibleIdxOf(c, view);
  const out: number[] = [];
  for (let i = a; i < Math.min(b, values.length); i++) {
    const v = values[i]!;
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** 누적 평단 계단 중 보기 창에 보이는 값 — 창 앞에서 이어 들어온 값(창 시작 이하 마지막 점) + 창 안 점 · `px ≤ 0` 은 끊김이라 뺀다. */
export function cumAvgVisibleOf(pts: readonly PricePoint[], view: View): number[] {
  const out: number[] = [];
  let carry: number | null = null;
  for (const [t, p] of pts) {
    if (t <= view.t0) carry = p;
    else if (t < view.t1) {
      if (carry !== null) {
        if (carry > 0) out.push(carry);
        carry = null;
      }
      if (p > 0) out.push(p);
    } else break;
  }
  if (carry !== null && carry > 0) out.push(carry);
  return out;
}

/** 가장자리 글자 입력 — 누적 평단 먼저 · 이동평균은 칩 순서로 넘긴다. */
export interface EdgeLabelInput {
  key: string;
  /** 「누적 평단」 · 「단순 5」 · 「일 20」. */
  name: string;
  fill: string;
  /** 보기 창 안 보이는 값(`maVisibleOf` · `cumAvgVisibleOf`). */
  vis: readonly number[];
  /** 보기 창 안 마지막 점(글자 값) · 없으면 `vis` 의 마지막. */
  last: number | null;
}

export interface EdgeLabel {
  key: string;
  text: string;
  x: number;
  /** 글자 기준선. */
  y: number;
  anchor: 'start' | 'end';
  fill: string;
  side: 'below' | 'above';
}

/** 한 가장자리에 쌓는 최대 개수(넘치면 마지막 자리 「외 n개」). */
export const EDGE_LABEL_MAX = { desktop: 5, phone: 3 } as const;
/** 가장자리 글자 줄 간격(px). */
export const EDGE_LABEL_STEP = 13;

const INT_FMT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

/**
 * 범위 밖 선의 가장자리 글자(D-16) — 보이는 값 하나라도 [lo, hi] 안이면 선을 그린다(글자 없음). 한 점도 안 들어오면 선 대신
 * 「{이름} {값} ▾/▴」 · 숨김 집합에 그 key. 쪽 = 보이는 마지막 값이 hi 위면 위 · 아니면 아래(글자 값 = `last`). 아래 밖 ▾ = 왼쪽 `L + 4` · 첫 기준선
 * `yCb − 4` · 위로 13 · 위 밖 ▴ = 오른쪽 끝 정렬 `xr − 4` · 첫 기준선 데스크톱 `y1a + 24` · 폰 `y1a + 11` · 아래로 13. 한 가장자리
 * 데스크톱 5 · 폰 3 까지 · 넘치면 마지막 자리에 「외 {n}개 ▾/▴」(`--muted-fg` · key `more-below` / `more-above`).
 * 가격 범위는 넓히지 않는다.
 */
export function edgeLabelsOf(
  items: readonly EdgeLabelInput[],
  range: Pick<TickPriceRange, 'lo' | 'hi'>,
  frame: Pick<CandleFrame, 'P' | 'L' | 'xr' | 'phone'>,
): { labels: EdgeLabel[]; hidden: ReadonlySet<string> } {
  const hidden = new Set<string>();
  const sides: Record<'below' | 'above', { it: EdgeLabelInput; v: number }[]> = { below: [], above: [] };
  for (const it of items) {
    if (it.vis.length === 0) continue;
    if (it.vis.some((v) => v >= range.lo && v <= range.hi)) continue;
    const end = it.vis[it.vis.length - 1]!;
    hidden.add(it.key);
    sides[end > range.hi ? 'above' : 'below'].push({ it, v: it.last ?? end });
  }
  const { P, L, xr, phone } = frame;
  const max = phone ? EDGE_LABEL_MAX.phone : EDGE_LABEL_MAX.desktop;
  const labels: EdgeLabel[] = [];
  for (const side of ['below', 'above'] as const) {
    const list = sides[side];
    const arrow = side === 'below' ? '▾' : '▴';
    const x = side === 'below' ? L + 4 : xr - 4;
    const anchor = side === 'below' ? 'start' : 'end';
    const yAt = (k: number) =>
      side === 'below' ? P.yCb - 4 - k * EDGE_LABEL_STEP : P.y1a + (phone ? 11 : 24) + k * EDGE_LABEL_STEP;
    const shown = list.length > max ? max - 1 : list.length;
    for (let k = 0; k < shown; k++) {
      const { it, v } = list[k]!;
      labels.push({ key: it.key, text: `${it.name} ${INT_FMT.format(v)} ${arrow}`, x, y: yAt(k), anchor, fill: it.fill, side });
    }
    if (shown < list.length) {
      labels.push({
        key: `more-${side}`,
        text: `외 ${list.length - shown}개 ${arrow}`,
        x,
        y: yAt(shown),
        anchor,
        fill: 'var(--muted-fg)',
        side,
      });
    }
  }
  return { labels, hidden };
}
