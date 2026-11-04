/**
 * 틱 뷰어 3판 차트 순수 기하 (Phase 37 D-00 ① · 스케치 019 D · 매집감지 상세 차트 `accum-chart.ts` 와 같은 모양).
 *
 * ① 네 판 — 가격(선 · 팀 평단 · 팀 주문 원) | 당일 팀 순매수 보라 계단 + 누적(pos_net) 회색 계단 | 10분 팀 매수/매도 막대 |
 *   누적 거래대금 회색 영역(왼쪽 축 = 시총 대비 %) + 누적 팀 비중 보라 선(스케치 022 A · 2026-11-03 사용자 요청).
 *   판 높이 = 데스크톱 합 307 · 폰 222(스케치 019 D `accDims` + 넷째 판 · 순매수 판 70 / 50 — 스케치 028 ④). 그림 영역 x = [L, W − R] · 글자 11px · viewBox 1:1.
 * ② 시각 = epoch ms(수신 시각 · 커서와 같은 축). 하루 경계 = 08:00 ~ 20:00(KST) · 정규장 09:00 · 빈 띠 15:30 ~ 16:00.
 * ③ 가격 선 = 보이는 창의 A3(가격 0 제외 · 단일가 포함)를 **픽셀 열마다 첫 · 최소 · 최대 · 끝 4점**으로 솎는다 — 하루 수십만
 *   체결이어도 경로 점 수 ≤ 4 × (열 수 + 2). 이웃 점이 15분 넘게 떨어지면 끊는다(빈 띠 · 장전 공백을 잇지 않는다).
 * ④ 컴포넌트(`components/ticks/tick-chart.tsx`)는 그리기만 하고 기하는 여기서 테스트가 잠근다.
 */

import { A3_LAYOUT, dayStartNs, decodeFields, payloadOf, type AccumReportPayload, type TickOpenResponse } from '@gh-radar/shared';

import { posNetPathOf, posNetPointsOf, type PosNetPoint, type View } from '@/lib/accum-chart';
import { kstClock } from '@/lib/limitup-report';
import { kstHm } from '@/lib/teamflow-report';

import type { OwnModel } from './own-model';
import type { TeamModel } from './team-model';
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
  H4: number;
  LB: number;
  H: number;
}

/**
 * 판 치수(스케치 019 D + 022 + 028 ④ 순매수 판 50 → 70 · 폰 36 → 50) — 데스크톱 7 + 104 + 7 + 70 + 7 + 40 + 7 + 50 + 15 = 307 ·
 * 폰 0 + 72 + 7 + 50 + 7 + 28 + 7 + 36 + 15 = 222.
 * R = 오른쪽(보라) 축 폭 · 왼쪽 축 폭 L 은 종목마다 `priceAxisWidthOf`(52 / 60).
 */
export const TICK_CHART = {
  desktop: { TOP: 7, H1: 104, GAP: 7, H2: 70, H3: 40, H4: 50, LB: 15, H: 307 },
  phone: { TOP: 0, H1: 72, GAP: 7, H2: 50, H3: 28, H4: 36, LB: 15, H: 222 },
  R: 52,
  /** 측정 폭이 이보다 좁으면 폰 치수(뷰포트 640 이하 본문 ≈ 360). */
  PHONE_MAX_W: 600,
  /** 최소 보기 창 10초(D-00 ①). */
  MIN_VIEW_MS: 10 * SEC,
} as const satisfies { desktop: TickChartDims; phone: TickChartDims; R: number; PHONE_MAX_W: number; MIN_VIEW_MS: number };

/** 판 y 경계 — 가격 [y1a, y1b] · 순매수 [y2a, y2b] · 10분 [y3a, y3b] · 누적 거래대금 [y4a, y4b]. */
export interface TickPanels {
  y1a: number;
  y1b: number;
  y2a: number;
  y2b: number;
  y3a: number;
  y3b: number;
  y4a: number;
  y4b: number;
  H: number;
}

export function tickPanelsOf(d: TickChartDims): TickPanels {
  const y1a = d.TOP;
  const y1b = y1a + d.H1;
  const y2a = y1b + d.GAP;
  const y2b = y2a + d.H2;
  const y3a = y2b + d.GAP;
  const y3b = y3a + d.H3;
  const y4a = y3b + d.GAP;
  const y4b = y4a + d.H4;
  return { y1a, y1b, y2a, y2b, y3a, y3b, y4a, y4b, H: y4b + d.LB };
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

/** 수신 ns → ms(소수 · 커서 · 점 x 공통). µs 까지 정수로 자른 뒤 나눈다(ns 그대로 Number 로 바꾸면 2^53 을 넘는다). */
export function msOfNs(ns: bigint): number {
  return Number(ns / 1000n) / 1000;
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

/** 시각 t 이하 마지막 가격 점 색인(없으면 −1) — 띠 · 구간 합계의 그 시각 가격. */
export function priceIdxAt(s: Pick<PriceSeries, 'n' | 't'>, t: number): number {
  return upperBoundF(s.t, s.n, t) - 1;
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

// ---------------------------------------------------------------------------
// 팀 레이어(Task 2) — 당일 계단 · 누적 계단 · 10분 막대 · VI 띠 · 평단
// ---------------------------------------------------------------------------

/** 값 범위(0 포함) — 순매수 계단 축. */
export interface NetRange {
  min: number;
  max: number;
}

/** 순매수 → y(순매수 판 [y2a, y2b] 안 · 위아래 3px 여유) · 범위 0 이면 0 이 판 가운데. */
export function yOfNet(range: NetRange, p: TickPanels): (v: number) => number {
  const top = p.y2a + 3;
  const h = p.y2b - p.y2a - 6;
  const span = range.max - range.min;
  if (!(span > 0)) return () => top + h / 2;
  return (v) => top + ((range.max - v) / span) * h;
}

/**
 * 당일 팀 순매수 판 범위 = 하루 전체 계단의 순매수 · 매수 누적 · 거울 매도 누적(−매도) ∪ 0 — 세 선이 다 축 안에 든다
 * (창과 무관하게 고정 · 매집감지 cumRangeOf 와 같은 규칙 · 스케치 028 ④ 목업 hi/lo).
 */
export function dayNetRangeOf(model: Pick<TeamModel, 'dayStairs'>): NetRange {
  let min = 0;
  let max = 0;
  for (const s of model.dayStairs) {
    for (const v of [s.net, s.buy, -s.sell]) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { min, max };
}

/**
 * 누적(이월 포함) 점(D-09) — 열기 응답 `accum.pos_net` 을 매집감지 `posNetPointsOf` 로 방어해 읽는다. 당일 화면(`isToday`)은
 * 늘 [](당일 선만 · 라이브 kind 16 으로 보강하지 않는다) · accum 없음 · 모양 어긋남도 [].
 */
export function cumPointsOf(accum: TickOpenResponse['accum'] | null | undefined, isToday: boolean): PosNetPoint[] {
  if (isToday || accum === null || accum === undefined) return [];
  return posNetPointsOf({ pos_net: accum.pos_net } as Pick<AccumReportPayload, 'pos_net'>);
}

/** 누적(pos_net) 범위 = 점 값 ∪ 0(독립 범위 · 스케치 018 ②). */
export function cumNetRangeOf(points: readonly Pick<PosNetPoint, 'net'>[]): NetRange {
  let min = 0;
  let max = 0;
  for (const p of points) {
    if (p.net < min) min = p.net;
    if (p.net > max) max = p.net;
  }
  return { min, max };
}

type DayStair = TeamModel['dayStairs'][number];

/**
 * 당일 팀 계단 — 0 에서 시작(x = T0) · 팀 주문 끝 시각마다 `H x V y` · 끝 = max(마지막 계단, endMs).
 * `pick` = 계단 → 값(기본 순매수 보라 선 · `s => s.buy` 매수 누적 · `s => −s.sell` 거울 매도 누적 — 스케치 028 ④).
 * 계단이 없으면 ''(판 가운데 「팀 체결 없음」). 창 밖은 클립이 자른다(계단은 창 시작 값이 앞 점에 달려 있다).
 */
export function teamDayStairsOf(
  model: Pick<TeamModel, 'dayStairs'>,
  x: (t: number) => number,
  y: (v: number) => number,
  T0: number,
  endMs: number,
  pick: (s: DayStair) => number = (s) => s.net,
): string {
  if (model.dayStairs.length === 0) return '';
  let d = `M${f1(x(T0))},${f1(y(0))}`;
  let lastT = T0;
  for (const s of model.dayStairs) {
    d += `H${f1(x(s.tMs))}V${f1(y(pick(s)))}`;
    lastT = s.tMs;
  }
  return `${d}H${f1(x(Math.max(lastT, endMs)))}`;
}

/**
 * 누적(이월 포함) 회색 계단 — 매집감지 `posNetPathOf` 그대로(cycle · end 끊김 · 열린 끝 20:00 · T0 앞 점은 T0 에 붙임).
 * 틱 뷰어 T0 = 08:00.
 */
export function cumStairsOf(
  points: readonly PosNetPoint[],
  x: (t: number) => number,
  y: (v: number) => number,
  T0: number,
  T2000: number,
): string {
  return posNetPathOf(points, x, y, T0, T2000);
}

/** 10분 칸 수 — 08:00 ~ 20:00. */
export const TEAM_BUCKETS = 72;
const SLOT_MS = 10 * MIN;

export interface TeamBucketBar {
  slot: number;
  /** 칸 시작 ms. */
  t0: number;
  buy: { x: number; y: number; w: number; h: number } | null;
  sell: { x: number; y: number; w: number; h: number } | null;
}

/** 칸 값 최대(하루 · 창과 무관). */
export function bucketMaxOfModel(model: Pick<TeamModel, 'buckets'>): number {
  let mx = 0;
  for (let k = 0; k < model.buckets.buy.length; k++) {
    if (model.buckets.buy[k]! > mx) mx = model.buckets.buy[k]!;
    if (model.buckets.sell[k]! > mx) mx = model.buckets.sell[k]!;
  }
  return mx;
}

const BAR_RATIO = 0.42;
const BAR_MIN_W = 1.5;

/**
 * 10분 팀 매수/매도 막대 쌍(매집감지 `bucketBarsOf` 와 같은 모양) — 칸 폭 × 0.42(최소 1.5) · 매수 왼쪽 · 매도 오른쪽 · 바닥 =
 * 판 아래선 · 높이 = 값 ÷ 하루 최대 × 판 높이 · 0 은 없음 · 창 밖 칸은 뺀다.
 */
export function teamBucketsOf(
  model: Pick<TeamModel, 'buckets'>,
  view: View,
  x: (t: number) => number,
  T0: number,
  p: TickPanels,
): TeamBucketBar[] {
  const mx = bucketMaxOfModel(model);
  const top = p.y3a + 2;
  const h = p.y3b - top;
  const scale = mx > 0 ? h / mx : 0;
  const out: TeamBucketBar[] = [];
  for (let k = 0; k < TEAM_BUCKETS; k++) {
    const buy = model.buckets.buy[k]!;
    const sell = model.buckets.sell[k]!;
    if (buy <= 0 && sell <= 0) continue;
    const s0 = T0 + k * SLOT_MS;
    const s1 = s0 + SLOT_MS;
    if (s1 < view.t0 || s0 > view.t1) continue;
    const x0 = x(s0);
    const bw = Math.max(BAR_MIN_W, (x(s1) - x0) * BAR_RATIO);
    const bar = (v: number, bx: number) => (v > 0 ? { x: bx, y: p.y3b - v * scale, w: bw, h: v * scale } : null);
    out.push({
      slot: k,
      t0: s0,
      buy: bar(buy, x0 + 1),
      sell: bar(sell, x0 + 1 + bw + 1),
    });
  }
  return out;
}

/** VI 띠(수신 ms) — 해제가 없으면(진행 중) 끝 = 세션 마지막 수신. */
export interface ViBand {
  t0: number;
  t1: number;
  open: boolean;
}

export function viBandsOf(session: TickSession): ViBand[] {
  const end = lastRecvMsOf(session);
  return session.vi.map((v) => {
    const t0 = msOfNs(v.startNs);
    const open = v.endNs === null;
    return { t0, t1: open ? Math.max(t0, end ?? t0) : msOfNs(v.endNs!), open };
  });
}

/**
 * 팀 평단 계단(`--up` 점점선) — 팀 체결마다 잔량 > 0 이면 평단(원가 ÷ 잔량) · 잔량 0 이면 끊는다 · 끝 = endMs.
 * 가격 판 범위 [lo, hi] 로 클램프(판 위/아래 끝에 붙는다 · 매집감지 avgPxPathOf 와 같은 규칙).
 */
export function teamAvgPathOf(
  model: Pick<TeamModel, 'fills' | 'prefix' | 'fillMs'>,
  x: (t: number) => number,
  y: (px: number) => number,
  range: Pick<TickPriceRange, 'lo' | 'hi'>,
  endMs: number,
): string {
  const { prefix, fillMs } = model;
  let d = '';
  let open = false;
  let lastAvg = Number.NaN;
  let lastT = 0;
  const clamp = (v: number) => Math.max(range.lo, Math.min(range.hi, v));
  for (let k = 1; k <= prefix.n; k++) {
    const t = fillMs[k - 1]!;
    const hold = prefix.hold[k]!;
    if (hold > 0) {
      const avg = prefix.cost[k]! / hold;
      if (!open) {
        d += `M${f1(x(t))},${f1(y(clamp(avg)))}`;
        open = true;
      } else if (avg !== lastAvg) d += `H${f1(x(t))}V${f1(y(clamp(avg)))}`;
      lastAvg = avg;
      lastT = t;
    } else if (open) {
      d += `H${f1(x(t))}`;
      open = false;
    }
  }
  if (open) d += `H${f1(x(Math.max(lastT, endMs)))}`;
  return d;
}

// ---------------------------------------------------------------------------
// 넷째 판 — 누적 거래대금(시총 대비) · 누적 팀 비중 (스케치 022 A · 2026-11-03 사용자 요청)
// ---------------------------------------------------------------------------

/**
 * 수신순 누적 계열 — 그 거래소 A3 전부(단일가 포함 · 중복 수신 제외 · 가격/수량 0 제외)를 A3 하나마다 쌓는다(10분 칸 없음).
 * 시작값 = 첫 A3 의 거래소 누적(cum_value · cum_volume) − 그 체결 — 기록이 늦게 시작한 격자도 카드 큰 숫자(거래소 누적)와
 * 맞는다(천일 10/14 하루치 실측: 직접 합 vs 거래소 누적 차이 0.006%). 팀 = 팀 모델 체결(`team.fills` — 팀 주문의 조각 ·
 * 단일가 제외)인 A3. 비중 = 팀 매수 + 매도 금액 ÷ 누적 거래대금.
 */
export interface TurnoverSeries {
  n: number;
  t: Float64Array;
  /** 그 점의 수신순 자리(카드가 커서 자리로 찾는다). */
  pos: Int32Array;
  qty: Float64Array;
  val: Float64Array;
  /**
   * 기록 시작 전 거래대금(첫 A3 의 거래소 누적 − 그 체결 · 점이 없으면 0) — 구간 합계가 첫 A3 앞에서 시작해도 기록 전 몫이
   * 섞이지 않게 빼는 값(스케치 028 ③).
   */
  val0: number;
  teamBuy: Float64Array;
  teamSell: Float64Array;
  /** (teamBuy + teamSell) ÷ val. */
  share: Float64Array;
}

const turnoverCache = new WeakMap<TickSession, TurnoverSeries>();

export function turnoverSeriesOf(session: TickSession): TurnoverSeries {
  const hit = turnoverCache.get(session);
  if (hit !== undefined) return hit;
  const { recvOrder, a3Of, a3, index, duplicates } = session;
  const side = new Map<number, 'B' | 'S'>();
  for (const f of session.team.fills) side.set(f.rec, f.bs === '2' ? 'B' : 'S');
  const t = new Float64Array(a3.n);
  const pos = new Int32Array(a3.n);
  const qty = new Float64Array(a3.n);
  const val = new Float64Array(a3.n);
  const teamBuy = new Float64Array(a3.n);
  const teamSell = new Float64Array(a3.n);
  const share = new Float64Array(a3.n);
  let n = 0;
  let q = 0;
  let v = 0;
  let v0 = 0;
  let b = 0;
  let s = 0;
  for (let p = 0; p < recvOrder.length; p++) {
    const r = recvOrder[p]!;
    const j = a3Of[r]!;
    if (j < 0 || duplicates[r] === 1) continue;
    const px = a3.px[j]!;
    const k = a3.qty[j]!;
    if (!(px > 0) || !(k > 0)) continue;
    if (n === 0) {
      v = Math.max(0, a3.cumValue[j]! - px * k) || 0;
      v0 = v;
      const cv = decodeFields(A3_LAYOUT, payloadOf(session.buf, index, r), index.recvNs[r]!, index.label)['cum_volume'];
      q = Math.max(0, (typeof cv === 'bigint' ? Number(cv) : typeof cv === 'number' ? cv : 0) - k) || 0;
    }
    q += k;
    v += px * k;
    const sd = side.get(r);
    if (sd === 'B') b += px * k;
    else if (sd === 'S') s += px * k;
    t[n] = msOfNs(index.recvNs[r]!);
    pos[n] = p;
    qty[n] = q;
    val[n] = v;
    teamBuy[n] = b;
    teamSell[n] = s;
    share[n] = (b + s) / v;
    n += 1;
  }
  const out: TurnoverSeries = {
    n,
    t: t.subarray(0, n),
    pos: pos.subarray(0, n),
    qty: qty.subarray(0, n),
    val: val.subarray(0, n),
    val0: v0,
    teamBuy: teamBuy.subarray(0, n),
    teamSell: teamSell.subarray(0, n),
    share: share.subarray(0, n),
  };
  turnoverCache.set(session, out);
  return out;
}

/** 시각 t 이하 마지막 점 색인(없으면 −1). */
export function turnoverIdxAt(s: Pick<TurnoverSeries, 'n' | 't'>, t: number): number {
  return upperBoundF(s.t, s.n, t) - 1;
}

/** 시각 t 보다 앞선 마지막 점 색인(없으면 −1) — 구간 합계의 빼는 점(t 자체는 구간 안). */
export function turnoverIdxBefore(s: Pick<TurnoverSeries, 'n' | 't'>, t: number): number {
  return lowerBoundF(s.t, s.n, t) - 1;
}

/** 수신순 자리 pos 이하 마지막 점 색인(없으면 −1) — 카드 커서. */
export function turnoverIdxAtPos(s: Pick<TurnoverSeries, 'n' | 'pos'>, pos: number): number {
  let lo = 0;
  let hi = s.n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (s.pos[mid]! <= pos) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** 시가총액 = 기준가 × 상장주식수 — 둘 중 하나라도 없으면 null(그날 안에서 고정 · 시총 대비 % 는 누적 거래대금에 비례). */
export function marketCapOf(basePx: number | null, listingShares: number | null | undefined): number | null {
  if (basePx === null || !(basePx > 0) || listingShares === null || listingShares === undefined || !(listingShares > 0)) return null;
  return basePx * listingShares;
}

/** 팀 비중 축 위끝을 고를 때 무시하는 앞부분 — 누적 거래대금이 하루 합의 이 비율 미만인 점(첫 몇 체결의 큰 비중 잡음). */
const SHARE_WARMUP_RATIO = 0.01;
/** 팀 비중 축 단위(5%) · 최소 위끝. */
const SHARE_STEP = 0.05;

/** 누적 팀 비중 → y(넷째 판 · 0 = 판 아래선 · shareTop = 위끝에서 3px 아래 · 넘는 값은 위끝에 붙는다) — 선 · 호버 점 공용. */
export function yOfShare(shareTop: number, p: TickPanels): (v: number) => number {
  const h = p.y4b - (p.y4a + 3);
  return (v) => p.y4b - (Math.min(v, shareTop) / shareTop) * h;
}

export interface TurnoverPaths {
  /** 누적 거래대금 영역(닫힌 경로 · 없으면 ''). */
  area: string;
  /** 누적 팀 비중 선(팀 체결이 하나도 없으면 ''). */
  share: string;
  /** 창 거래대금 범위(아래끝 = 창 시작 값 · 위끝 = 창 끝 값). */
  valLo: number;
  valHi: number;
  /** 팀 비중 축 위끝(5% 단위 · 아래끝 0). */
  shareTop: number;
}

/**
 * 넷째 판 경로 — 가격 선처럼 열별 솎음(`decimatedIdxOf` · 비중 기준 첫/최소/최대/끝)으로 고른 점만 잇는다.
 * 거래대금 축 = 창 시작 직전 값 ~ 창 끝 값(누적이라 창 안에서 단조) · 비중 축 = 0 ~ 창 안 최대(앞 1% 잡음 제외 · 5% 올림) —
 * 넘는 값은 위끝에 붙는다. 영역 끝 = max(마지막 점, endMs) 까지 평평하게.
 */
export function turnoverPathsOf(
  s: TurnoverSeries,
  view: View,
  x: (t: number) => number,
  p: TickPanels,
  plotW: number,
  endMs: number,
): TurnoverPaths {
  const empty = { area: '', share: '', valLo: 0, valHi: 0, shareTop: SHARE_STEP };
  if (s.n === 0) return empty;
  const idx = decimatedIdxOf({ n: s.n, t: s.t, px: s.share }, view, plotW);
  if (idx.length === 0) return empty;
  const a = lowerBoundF(s.t, s.n, view.t0);
  const b = upperBoundF(s.t, s.n, view.t1);
  const valLo = a > 0 ? s.val[a - 1]! : 0;
  const valHi = s.val[Math.max(0, b - 1)]!;
  const warm = s.val[s.n - 1]! * SHARE_WARMUP_RATIO;
  let mx = 0;
  for (const i of idx) if (s.val[i]! >= warm && s.share[i]! > mx) mx = s.share[i]!;
  const shareTop = Math.max(SHARE_STEP, Math.ceil(mx / SHARE_STEP - 1e-9) * SHARE_STEP);

  const top = p.y4a + 3;
  const h = p.y4b - top;
  const span = valHi - valLo;
  const yV = (v: number) => (span > 0 ? p.y4b - (Math.max(0, v - valLo) / span) * h : p.y4b - h / 2);
  const yS = yOfShare(shareTop, p);

  const first = idx[0]!;
  let area = `M${f1(x(s.t[first]!))},${f1(p.y4b)}`;
  let share = '';
  const hasTeam = s.teamBuy[s.n - 1]! + s.teamSell[s.n - 1]! > 0;
  for (const i of idx) {
    const xx = f1(x(s.t[i]!));
    area += `L${xx},${f1(yV(s.val[i]!))}`;
    if (hasTeam) share += `${share === '' ? 'M' : 'L'}${xx},${f1(yS(s.share[i]!))}`;
  }
  const last = idx[idx.length - 1]!;
  const xEnd = f1(x(Math.max(s.t[last]!, endMs)));
  area += `H${xEnd}V${f1(p.y4b)}Z`;
  if (hasTeam) share += `H${xEnd}`;
  return { area, share, valLo, valHi, shareTop };
}

// ---------------------------------------------------------------------------
// 우리 체결 ◆ · 짝 없음 ◇ · 조건 근거 ○ (Phase 38 D-08 · D-10 · 가격 판만)
// ---------------------------------------------------------------------------

/** 우리 점 반지름(◆ = 2R 정사각을 45° 돌린 것 · ○ = R − 1) — 데스크톱 4 · 폰 3.5. */
export const OWN_MARK_R = { desktop: 4, phone: 3.5 } as const;
/** 우리 점 클릭 · 툴팁 판정 여유(반지름 + 3px). */
export const OWN_MARK_HIT_PAD = 3;
/** 창 여유(팀 원 `tickCirclesOf` 와 같은 ± 2%). */
const OWN_VIEW_PAD_RATIO = 0.02;

/**
 * 가격 판 우리 점 하나.
 * - 'fill' = 짝 체결(채운 ◆) · 'est' = 같은 A3 에 붙은 체결 중 하나라도 추정(빈 ◆ 점선) — x = 그 A3 수신 ms · y = A3 가격.
 * - 'nofill' = 짝 전문 없음 · 대기(빈 ◇) — x = 체결 gw 시각 · y = 체결가 · rec −1.
 * - 'ev' = 조건 근거(○) — B6 = 그 B6 수신 ms · ev_price · 단건 A3 · 체결통보 = 그 A3 · 구간 = 구간 끝 A3 하나(D-11).
 */
export interface OwnMark {
  kind: 'fill' | 'est' | 'nofill' | 'ev';
  tMs: number;
  px: number;
  cx: number;
  cy: number;
  /** 클릭이 커서를 옮길 rec(◆ = 그 A3 · ○ = 근거 전문) · ◇ 는 −1(뷰어가 줄 rec 를 rows 로 푼다). */
  rec: number;
  /** ◆ · ◇ 의 우리 체결 id(◆ 는 같은 A3 rec 묶음 · ◇ 는 하나) · ○ 는 []. */
  fillIds: number[];
  /** 대표 주문 id(◆ · ◇ = 첫 체결의 주문 · ○ = 근거가 같은 주문 중 첫째). */
  orderId: number;
  /** ○ 의 주문 id 전부(근거 전문이 같은 주문 여럿 = 한 점 · 툴팁 줄 여럿) · ◆ · ◇ 는 [orderId]. */
  orderIds: number[];
}

const OWN_DRAW_RANK: Record<OwnMark['kind'], number> = { ev: 0, nofill: 1, est: 2, fill: 2 };

/**
 * 창 ± 2% 안 우리 점 — 그리기 순서 ○ → ◇ → ◆(◆ 가 위) · 같은 종류는 시각순. 가격 0 이하는 그리지 않는다.
 * 짝 체결은 A3 rec 하나에 한 점(`fillsOfRec`) · 근거는 evidenceRec 하나에 한 점(구간이면 끝 rec — 띠는 그리지 않는다 · D-08).
 */
export function ownMarksOf(
  own: Pick<OwnModel, 'fills' | 'fillsOfRec' | 'orders'>,
  session: Pick<TickSession, 'index' | 'a3' | 'a3Of'>,
  view: View,
  x: (t: number) => number,
  y: (px: number) => number,
): OwnMark[] {
  const pad = (view.t1 - view.t0) * OWN_VIEW_PAD_RATIO;
  const inView = (t: number) => t >= view.t0 - pad && t <= view.t1 + pad;
  const recvMs = (rec: number) => msOfNs(session.index.recvNs[rec]!);
  const out: OwnMark[] = [];
  const push = (m: Omit<OwnMark, 'cx' | 'cy'>) => {
    if (!(m.px > 0) || !Number.isFinite(m.tMs) || !inView(m.tMs)) return;
    out.push({ ...m, cx: x(m.tMs), cy: y(m.px) });
  };

  // ◆ — A3 rec 마다 한 점
  for (const [rec, ids] of own.fillsOfRec) {
    if (ids.length === 0) continue;
    const j = session.a3Of[rec]!;
    const first = own.fills[ids[0]!]!;
    push({
      kind: ids.some((id) => own.fills[id]!.est) ? 'est' : 'fill',
      tMs: recvMs(rec),
      px: j >= 0 ? session.a3.px[j]! : first.px,
      rec,
      fillIds: ids.slice(),
      orderId: first.order,
      orderIds: [first.order],
    });
  }
  // ◇ — 짝 없음 · 대기 체결마다
  for (const f of own.fills) {
    if (f.rec >= 0) continue;
    push({ kind: 'nofill', tMs: f.gwMs, px: f.px, rec: -1, fillIds: [f.id], orderId: f.order, orderIds: [f.order] });
  }
  // ○ — 근거 전문 하나에 한 점(주문 id 오름차순)
  const evOf = new Map<number, number[]>();
  for (const o of own.orders) {
    if (o.evidenceRec < 0) continue;
    const ids = evOf.get(o.evidenceRec);
    if (ids) ids.push(o.id);
    else evOf.set(o.evidenceRec, [o.id]);
  }
  for (const [rec, ids] of evOf) {
    const o = own.orders[ids[0]!]!;
    let px = 0;
    if (o.evidence.kind === 'b6') {
      const ev = o.event?.ev_price ?? 0;
      px = ev > 0 ? ev : (o.px ?? 0);
    } else {
      const j = session.a3Of[rec]!;
      px = j >= 0 ? session.a3.px[j]! : 0;
    }
    push({ kind: 'ev', tMs: recvMs(rec), px, rec, fillIds: [], orderId: ids[0]!, orderIds: ids });
  }

  return out.sort((a, b) => OWN_DRAW_RANK[a.kind] - OWN_DRAW_RANK[b.kind] || a.tMs - b.tMs);
}

/** 클릭 · 툴팁 판정 — (mx, my) 에서 반지름 + 3px 안 가장 가까운 우리 점(같으면 위에 그린 것) · 없으면 null. */
export function ownMarkAt(marks: readonly OwnMark[], mx: number, my: number, r: number): OwnMark | null {
  const lim = r + OWN_MARK_HIT_PAD;
  let best: OwnMark | null = null;
  let bestD = Infinity;
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i]!;
    const d = Math.hypot(mx - m.cx, my - m.cy);
    if (d <= lim && d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}
