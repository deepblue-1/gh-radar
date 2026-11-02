/**
 * 틱 뷰어 3판 차트 순수 기하 (Phase 37 D-00 ① · 스케치 019 D · 매집감지 상세 차트 `accum-chart.ts` 와 같은 모양).
 *
 * ① 세 판 — 가격(선 · 팀 평단 · 팀 주문 원) | 당일 팀 순매수 보라 계단 + 누적(pos_net) 회색 계단 | 10분 팀 매수/매도 막대.
 *   판 높이 = 데스크톱 합 230 · 폰 165(스케치 019 D `accDims`). 그림 영역 x = [L, W − R] · 글자 11px · viewBox 1:1.
 * ② 시각 = epoch ms(수신 시각 · 커서와 같은 축). 하루 경계 = 08:00 ~ 20:00(KST) · 정규장 09:00 · 빈 띠 15:30 ~ 16:00.
 * ③ 가격 선 = 보이는 창의 A3(가격 0 제외 · 단일가 포함)를 **픽셀 열마다 첫 · 최소 · 최대 · 끝 4점**으로 솎는다 — 하루 수십만
 *   체결이어도 경로 점 수 ≤ 4 × (열 수 + 2). 이웃 점이 15분 넘게 떨어지면 끊는다(빈 띠 · 장전 공백을 잇지 않는다).
 * ④ 컴포넌트(`components/ticks/tick-chart.tsx`)는 그리기만 하고 기하는 여기서 테스트가 잠근다.
 */

import { dayStartNs } from '@gh-radar/shared';

import type { View } from '@/lib/accum-chart';
import { kstClock } from '@/lib/limitup-report';
import { kstHm } from '@/lib/teamflow-report';

import type { TickSession } from './tick-session';

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

/** 판 치수 하나(데스크톱 · 폰). TOP = 가격 판 위끝 · LB = 아래 시각 눈금 띠 · H = 전체 높이. */
export interface TickChartDims {
  TOP: number;
  H1: number;
  GAP: number;
  H2: number;
  H3: number;
  LB: number;
  H: number;
}

/**
 * 판 치수(스케치 019 D) — 데스크톱 7 + 104 + 7 + 50 + 7 + 40 + 15 = 230 · 폰 0 + 72 + 7 + 36 + 7 + 28 + 15 = 165.
 * R = 오른쪽(보라) 축 폭 · 왼쪽 축 폭 L 은 종목마다 `priceAxisWidthOf`(52 / 60).
 */
export const TICK_CHART = {
  desktop: { TOP: 7, H1: 104, GAP: 7, H2: 50, H3: 40, LB: 15, H: 230 },
  phone: { TOP: 0, H1: 72, GAP: 7, H2: 36, H3: 28, LB: 15, H: 165 },
  R: 52,
  /** 측정 폭이 이보다 좁으면 폰 치수(뷰포트 640 이하 본문 ≈ 360). */
  PHONE_MAX_W: 600,
  /** 최소 보기 창 10초(D-00 ①). */
  MIN_VIEW_MS: 10 * SEC,
} as const satisfies { desktop: TickChartDims; phone: TickChartDims; R: number; PHONE_MAX_W: number; MIN_VIEW_MS: number };

/** 판 y 경계 — 가격 [y1a, y1b] · 순매수 [y2a, y2b] · 10분 [y3a, y3b]. */
export interface TickPanels {
  y1a: number;
  y1b: number;
  y2a: number;
  y2b: number;
  y3a: number;
  y3b: number;
  H: number;
}

export function tickPanelsOf(d: TickChartDims): TickPanels {
  const y1a = d.TOP;
  const y1b = y1a + d.H1;
  const y2a = y1b + d.GAP;
  const y2b = y2a + d.H2;
  const y3a = y2b + d.GAP;
  const y3b = y3a + d.H3;
  return { y1a, y1b, y2a, y2b, y3a, y3b, H: y3b + d.LB };
}

/** 그날 경계(epoch ms) — 08:00 · 09:00 · 15:30 · 16:00 · 20:00 KST. `ChartBounds`(T0 · T1530 · T2000) 꼴을 포함한다. */
export interface TickBounds {
  T0: number;
  T0900: number;
  T1530: number;
  T1600: number;
  T2000: number;
}

export function tickBoundsOf(ymd: string): TickBounds {
  const T0 = Number(dayStartNs(ymd, '0800') / 1_000_000n);
  return { T0, T0900: T0 + HOUR, T1530: T0 + 7.5 * HOUR, T1600: T0 + 8 * HOUR, T2000: T0 + 12 * HOUR };
}

/** 수신 ns → ms(소수 · 커서 · 점 x 공통). */
export function msOfNs(ns: bigint): number {
  return Number(ns) / 1e6;
}

/** 시각 → x · view.t0 = L · view.t1 = xr(= W − R). */
export function xOfTick(view: View, L: number, xr: number): (t: number) => number {
  const span = view.t1 - view.t0 || 1;
  return (t) => L + ((t - view.t0) / span) * (xr - L);
}

/** x → 시각(`xOfTick` 의 역). */
export function tOfTick(view: View, L: number, xr: number): (px: number) => number {
  const w = xr - L || 1;
  return (px) => view.t0 + ((px - L) / w) * (view.t1 - view.t0);
}

/** 현재 틱 커서 x — 창 밖이면 null. */
export function cursorXOf(view: View, x: (t: number) => number, recvMs: number | null): number | null {
  if (recvMs === null || !Number.isFinite(recvMs) || recvMs < view.t0 || recvMs > view.t1) return null;
  return x(recvMs);
}

// ---------------------------------------------------------------------------
// 시각 눈금
// ---------------------------------------------------------------------------

export interface TickMark {
  t: number;
  label: string;
}

/** 눈금 간격 단계 1초 ~ 3시간. */
const TICK_STEPS = [
  SEC,
  5 * SEC,
  10 * SEC,
  15 * SEC,
  30 * SEC,
  MIN,
  2 * MIN,
  5 * MIN,
  10 * MIN,
  15 * MIN,
  30 * MIN,
  HOUR,
  2 * HOUR,
  3 * HOUR,
] as const;
/** 라벨 폭 여유 — 초 라벨 「HH:MM:SS」(8자 · 52px) 60 · 분 라벨 「HH:MM」 36. */
const TICK_MIN_PX_SEC = 60;
const TICK_MIN_PX_MIN = 36;
const KST_OFFSET_MS = 9 * HOUR;

/**
 * 시각 눈금 — 간격이 라벨 폭(초 60px · 분 36px)을 넘는 가장 작은 단계. KST 자정 기준 간격 배수에만 놓는다.
 * 라벨: 분 미만 간격은 「HH:MM:SS」 · 그 밖 정시 「H」 · 아니면 「HH:MM」(매집감지 `ticksOf` 와 같은 꼴).
 */
export function tickTicksOf(view: View, plotW: number): TickMark[] {
  const w = view.t1 - view.t0;
  if (!(w > 0) || !(plotW > 0)) return [];
  let step: number = TICK_STEPS[TICK_STEPS.length - 1]!;
  for (const s of TICK_STEPS) {
    const need = s < MIN ? TICK_MIN_PX_SEC : TICK_MIN_PX_MIN;
    if ((s / w) * plotW >= need) {
      step = s;
      break;
    }
  }
  const out: TickMark[] = [];
  for (let t = Math.ceil((view.t0 + KST_OFFSET_MS) / step) * step - KST_OFFSET_MS; t <= view.t1; t += step) {
    let label: string;
    if (step < MIN) label = kstClock(t);
    else {
      const hm = kstHm(t);
      label = hm.endsWith(':00') ? String(Number(hm.slice(0, 2))) : hm;
    }
    out.push({ t, label });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 가격 선 — 수신순 A3 계열 · 열별 4점 솎음
// ---------------------------------------------------------------------------

/** 수신순 A3 가격 계열(가격 0 제외 · 단일가 포함). t = 수신 ms. */
export interface PriceSeries {
  n: number;
  t: Float64Array;
  px: Float64Array;
  /** 그 점의 rec. */
  rec: Int32Array;
  /** 하루 최대 가격(축 폭 결정 · 0 = 없음). */
  maxPx: number;
}

const seriesCache = new WeakMap<TickSession, PriceSeries>();

/** 세션 → 수신순 A3 계열(세션마다 한 번 · WeakMap). */
export function priceSeriesOf(session: TickSession): PriceSeries {
  const hit = seriesCache.get(session);
  if (hit !== undefined) return hit;
  const { recvOrder, a3Of, a3, index } = session;
  const t = new Float64Array(a3.n);
  const px = new Float64Array(a3.n);
  const rec = new Int32Array(a3.n);
  let n = 0;
  let maxPx = 0;
  for (let p = 0; p < recvOrder.length; p++) {
    const r = recvOrder[p]!;
    const j = a3Of[r]!;
    if (j < 0) continue;
    const v = a3.px[j]!;
    if (!(v > 0)) continue;
    t[n] = msOfNs(index.recvNs[r]!);
    px[n] = v;
    rec[n] = r;
    if (v > maxPx) maxPx = v;
    n += 1;
  }
  const out: PriceSeries = { n, t: t.subarray(0, n), px: px.subarray(0, n), rec: rec.subarray(0, n), maxPx };
  seriesCache.set(session, out);
  return out;
}

/** 정렬된 t 에서 v 이상인 첫 색인. */
function lowerBoundF(t: Float64Array, n: number, v: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (t[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 정렬된 t 에서 v 초과인 첫 색인. */
function upperBoundF(t: Float64Array, n: number, v: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (t[mid]! <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * 열별 솎음 색인 — 창 [t0, t1] 안 점을 열 `floor((t − t0) / 폭 × plotW)` 로 나눠 열마다 첫 · 최소 · 최대 · 끝(색인 오름차순 ·
 * 중복 제거)을 남긴다. 창 바로 앞 한 점 · 바로 뒤 한 점을 더해 선이 창 경계까지 이어지게 한다(클립이 자른다).
 */
export function decimatedIdxOf(s: Pick<PriceSeries, 'n' | 't' | 'px'>, view: View, plotW: number): number[] {
  const a = lowerBoundF(s.t, s.n, view.t0);
  const b = upperBoundF(s.t, s.n, view.t1);
  const out: number[] = [];
  if (a > 0) out.push(a - 1);
  const span = view.t1 - view.t0 || 1;
  const cols = Math.max(1, Math.ceil(plotW));
  let k = a;
  while (k < b) {
    const col = Math.min(cols - 1, Math.floor(((s.t[k]! - view.t0) / span) * cols));
    const first = k;
    let mn = k;
    let mx = k;
    let last = k;
    k += 1;
    while (k < b && Math.min(cols - 1, Math.floor(((s.t[k]! - view.t0) / span) * cols)) === col) {
      if (s.px[k]! < s.px[mn]!) mn = k;
      if (s.px[k]! > s.px[mx]!) mx = k;
      last = k;
      k += 1;
    }
    const four = [first, mn, mx, last].sort((u, v) => u - v);
    for (let i = 0; i < four.length; i++) if (i === 0 || four[i] !== four[i - 1]) out.push(four[i]!);
  }
  if (b < s.n) out.push(b);
  return out;
}

/** 이웃 가격 점 간격이 이보다 크면 선을 끊는다(빈 띠 · 장전 공백). */
const PRICE_BREAK_MS = 15 * MIN;
const f1 = (v: number) => v.toFixed(1);

/** 보이는 창 가격 선 경로(열별 4점 솎음 · 15분 넘는 공백에서 끊김). 점이 없으면 ''. */
export function pricePathDecimated(
  session: TickSession,
  view: View,
  x: (t: number) => number,
  y: (px: number) => number,
  plotW: number,
): string {
  const s = priceSeriesOf(session);
  const idx = decimatedIdxOf(s, view, plotW);
  let d = '';
  let prevT: number | null = null;
  for (const i of idx) {
    const t = s.t[i]!;
    const cmd = prevT === null || t - prevT > PRICE_BREAK_MS ? 'M' : 'L';
    d += `${cmd}${f1(x(t))},${f1(y(s.px[i]!))}`;
    prevT = t;
  }
  return d;
}

/** 가격 y 범위 — min/max = 축 글자 · lo/hi = 여유(범위 × 8% · 범위 0 이면 값 × 0.5%)를 더한 그림 범위. */
export interface TickPriceRange {
  min: number;
  max: number;
  lo: number;
  hi: number;
}

/**
 * 창 안 가격 min/max(창 안 점이 없으면 창 바로 앞 점 하나 — 그 값이 창 내내 이어진다 · 그것도 없으면 하루 전체 · 그래도 없으면
 * [0, 1]). 원 · 평단은 이 범위를 넓히지 않는다(평단은 판 안으로 클램프).
 */
export function tickPriceRangeOf(s: Pick<PriceSeries, 'n' | 't' | 'px'>, view: View): TickPriceRange {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const add = (p: number) => {
    if (p < min) min = p;
    if (p > max) max = p;
  };
  const a = lowerBoundF(s.t, s.n, view.t0);
  const b = upperBoundF(s.t, s.n, view.t1);
  if (b > a) for (let k = a; k < b; k++) add(s.px[k]!);
  else if (a > 0) add(s.px[a - 1]!);
  else for (let k = 0; k < s.n; k++) add(s.px[k]!);
  if (!Number.isFinite(min)) return { min: 0, max: 1, lo: 0, hi: 1 };
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.005 || 1;
  return { min, max, lo: min - pad, hi: max + pad };
}

/** 가격 → y(가격 판 [y1a, y1b] 안 · 위아래 3px 여유). */
export function yOfTickPrice(range: TickPriceRange, p: TickPanels): (px: number) => number {
  const top = p.y1a + 3;
  const h = p.y1b - p.y1a - 6;
  const span = range.hi - range.lo || 1;
  return (v) => top + ((range.hi - v) / span) * h;
}

/** 마지막 A3 수신 ms(없으면 null) — `useChartView` 의 lastTradeMs. */
export function lastTradeMsOfSession(session: TickSession): number | null {
  const s = priceSeriesOf(session);
  return s.n > 0 ? s.t[s.n - 1]! : null;
}

/** 세션 마지막 레코드 수신 ms(빈 세션 null) — 진행 중 VI · 당일 계단의 오른쪽 끝. */
export function lastRecvMsOf(session: TickSession): number | null {
  const n = session.recvOrder.length;
  if (n === 0) return null;
  return msOfNs(session.index.recvNs[session.recvOrder[n - 1]!]!);
}
