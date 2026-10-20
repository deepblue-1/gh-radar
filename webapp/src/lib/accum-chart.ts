/**
 * 매집감지 상세 차트 순수 기하 (Phase 34 · UI-SPEC A6 · A11 「표시 변환 규칙」 · D-14 ~ D-18).
 *
 * - 원본 = 채택 목업 C(`reference/mockup-accum-chart.html` build()) + 세 번째 판(`mockup-accum-detail.html` chart() 10분 막대).
 *   픽셀 값만 UI-SPEC 의 4 배수로 옮겼다(판 200 / 112 / 72 · 사이 24 · 전체 472).
 * - **차트 라이브러리 없이 순수 SVG(D-17 · 리서치 결론)** — 세 판이 한 x(ms) 창을 공유하고 원 · 계단 · 막대 · 세로선 · 음영이
 *   한 좌표계에 겹쳐야 해서 SVG 좌표를 직접 낸다. 컴포넌트는 그리기만 하고 기하는 여기서 테스트가 잠근다.
 * - 단위: 시각 = epoch ms · 기준 시각은 하드코딩 없이 `price.t0_ms`(그날 09:00 KST) · 폭 W = `useChartWidth` 측정값과
 *   viewBox 1:1(글자 11px 고정).
 */

import type {
  AccumReportBucket,
  AccumReportCumNet,
  AccumReportOrders,
  AccumReportPayload,
  AccumReportPrice,
  AccumReportRow,
} from '@gh-radar/shared';

import { isNum } from './teamflow-report';

/**
 * 판 배치(UI-SPEC A6) — 그림 영역 x = [L, W − R] · 가격 판 y 16~216 · 누적 판 240~352 · 10분 판 376~448 ·
 * 시각 눈금 기준선 y 465 · 높이 472 고정(폰 · 데스크톱 같음). L 은 종목마다 `priceAxisWidthOf` 로 정한다(52 / 60).
 */
export const ACCUM_CHART = { R: 56, TOP: 16, H1: 200, GAP: 24, H2: 112, H3: 72, BOT: 24, H: 472, TICK_Y: 465 } as const;

/** 최소 보기 창 10분(D-14). */
export const MIN_VIEW_MS = 10 * 60_000;

const HOUR = 3600e3;
const MIN = 60e3;
/** 창 밖 여유 — 창 경계에서 선 · 원이 끊겨 보이지 않게 ±30분까지 그린다(클립이 자른다). */
const VIEW_PAD_MS = 30 * MIN;
/** 이웃 가격 점 간격이 이보다 크면 선을 끊는다(15:30~16:00 빈 띠를 잇지 않는다). */
const PRICE_BREAK_MS = 15 * MIN;

/** 보기 창(ms). */
export interface View {
  t0: number;
  t1: number;
}

/** 그날 경계 — T0 = 09:00 · T1530 · T1600 · T2000. */
export function dayBoundsOf(t0ms: number) {
  return { T0: t0ms, T1530: t0ms + 6.5 * HOUR, T1600: t0ms + 7 * HOUR, T2000: t0ms + 11 * HOUR };
}

/** 창 폭 = max(10분, min(하루, v 폭)) · 시작은 [T0, T2000 − 폭] 안(목업 clampView). */
export function clampView(v: View, T0: number, T2000: number): View {
  const w = Math.max(MIN_VIEW_MS, Math.min(T2000 - T0, v.t1 - v.t0));
  const t0 = Math.max(T0, Math.min(v.t0, T2000 - w));
  return { t0, t1: t0 + w };
}

/** 시각 → x · view.t0 = L · view.t1 = W − R. */
export function xOfView(view: View, L: number, W: number): (t: number) => number {
  const span = view.t1 - view.t0 || 1;
  const plotW = W - ACCUM_CHART.R - L;
  return (t) => L + ((t - view.t0) / span) * plotW;
}

/**
 * 왼쪽 가격 축 폭 L(UI-SPEC A6 long-text 백스톱 — 플래너 결정): 그 종목 하루 최대 가격이 1,000,000 이상이면 60, 아니면 52.
 * 종목마다 한 번 정해 확대/이동 중 그림 영역이 흔들리지 않는다(「1,234,500」 7자리 잘림 방지 · 「천」 단위 표기는 쓰지 않는다).
 */
export function priceAxisWidthOf(dayMaxPx: number): number {
  return dayMaxPx >= 1_000_000 ? 60 : 52;
}

/** 하루 최대 가격 = price.px ∪ orders.px 의 최대(유한 수만 · 없으면 0). */
export function dayMaxPxOf(price: Pick<AccumReportPrice, 'px'>, orders: Pick<AccumReportOrders, 'px'>): number {
  let mx = 0;
  for (const p of price.px) if (isNum(p) && p > mx) mx = p;
  for (const p of orders.px) if (isNum(p) && p > mx) mx = p;
  return mx;
}

/** 가격 점 [시각 ms, 가격]. */
export type PricePoint = [t: number, px: number];

/** payload.price → 점 목록(칸 시각 = t0_ms + idx × step_s × 1000 · 유한 수만 · idx 오름차순 그대로). */
export function pricePointsOf(price: AccumReportPrice): PricePoint[] {
  const out: PricePoint[] = [];
  const step = (isNum(price.step_s) ? price.step_s : 10) * 1000;
  const n = Math.min(price.idx.length, price.px.length);
  for (let k = 0; k < n; k++) {
    const i = price.idx[k];
    const p = price.px[k];
    if (!isNum(i) || !isNum(p)) continue;
    out.push([price.t0_ms + i * step, p]);
  }
  return out;
}

/** 정렬된 점에서 t 이상인 첫 인덱스(이진 탐색). */
function lowerBound(points: readonly PricePoint[], t: number): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid]![0] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 정렬된 점에서 t 초과인 첫 인덱스(이진 탐색). */
function upperBound(points: readonly PricePoint[], t: number): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid]![0] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 가격 y 범위 — min/max 는 축 글자, lo/hi 는 여유를 더한 그림 범위. */
export interface PriceRange {
  min: number;
  max: number;
  lo: number;
  hi: number;
}

/**
 * 가격 y 범위(D-14 · Pitfall 14) = 보이는 창 안 가격 ∪ 보이는 주문 px 의 min/max · 여유 = 범위 × 8%(범위 0 이면 max × 0.5%).
 * 창 안 가격 점이 0 이면 하루 전체 가격으로 폴백 · 값이 하나도 없으면 [0, 1](NaN 금지).
 */
export function priceRangeOf(points: readonly PricePoint[], orders: AccumReportOrders, view: View): PriceRange {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const add = (p: number) => {
    if (p < min) min = p;
    if (p > max) max = p;
  };
  const a = lowerBound(points, view.t0);
  const b = upperBound(points, view.t1);
  if (b > a) for (let k = a; k < b; k++) add(points[k]![1]);
  else for (const [, p] of points) add(p);
  const n = Math.min(orders.t_ms.length, orders.px.length);
  for (let i = 0; i < n; i++) {
    const t = orders.t_ms[i];
    const p = orders.px[i];
    if (isNum(t) && isNum(p) && t >= view.t0 && t <= view.t1) add(p);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, lo: 0, hi: 1 };
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.005 || 1;
  return { min, max, lo: min - pad, hi: max + pad };
}

/** 가격 → y(가격 판 TOP ~ TOP + H1). */
export function yOfPrice(range: PriceRange): (px: number) => number {
  const { TOP, H1 } = ACCUM_CHART;
  const span = range.hi - range.lo || 1;
  return (p) => TOP + ((range.hi - p) / span) * H1;
}

const f1 = (n: number) => n.toFixed(1);

/**
 * 가격 선 경로(D-14) — 창 ±30분 밖 점은 이진 탐색으로 시작/끝 인덱스를 잘라 순회 · 이웃 간격 > 15분이면 `M` 으로 끊는다 ·
 * 좌표 소수 1자리. 점이 없으면 빈 문자열.
 */
export function pricePathOf(
  points: readonly PricePoint[],
  view: View,
  x: (t: number) => number,
  y: (px: number) => number,
): string {
  const a = lowerBound(points, view.t0 - VIEW_PAD_MS);
  const b = upperBound(points, view.t1 + VIEW_PAD_MS);
  let d = '';
  let prev: number | null = null;
  for (let k = a; k < b; k++) {
    const [t, p] = points[k]!;
    const cmd = prev === null || t - prev > PRICE_BREAK_MS ? 'M' : 'L';
    d += `${cmd}${f1(x(t))},${f1(y(p))}`;
    prev = t;
  }
  return d;
}

// ---------------------------------------------------------------------------
// 골격(RED) — 데이터 레이어 시그니처만. 구현은 GREEN 커밋.
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OrderCircle {
  cx: number;
  cy: number;
  r: number;
  side: 'B' | 'S';
  first: boolean;
  title: string;
}

export function orderRadiusOf(_val: number): number {
  return 0;
}

export function orderCirclesOf(
  _orders: AccumReportOrders,
  _view: View,
  _x: (t: number) => number,
  _y: (px: number) => number,
): OrderCircle[] {
  return [];
}

export interface CumRange {
  min: number;
  max: number;
}

export function cumRangeOf(_cum: AccumReportCumNet): CumRange {
  return { min: 0, max: 0 };
}

export function yOfCum(_range: CumRange): (c: number) => number {
  return () => 0;
}

export function cumPathOf(
  _cum: AccumReportCumNet,
  _x: (t: number) => number,
  _yC: (c: number) => number,
  _T2000: number,
): string {
  return '';
}

export interface BucketBar {
  slot: number;
  buy: Rect | null;
  sell: Rect | null;
  hit: Rect;
  title: string;
}

export function bucketMaxOf(_buckets: readonly AccumReportBucket[]): number {
  return 0;
}

export function bucketBarsOf(
  _buckets: readonly AccumReportBucket[],
  _view: View,
  _x: (t: number) => number,
  _T0: number,
  _bTop: number,
  _h: number,
  _bMax?: number,
): BucketBar[] {
  return [];
}

export function gapBandOf(_bounds: { T1530: number; T1600: number }, _x: (t: number) => number): { x: number; w: number } {
  return { x: 0, w: 0 };
}

export function shadeOf(
  _row: Pick<AccumReportRow, 'since_date' | 'date'>,
  _payload: Pick<AccumReportPayload, 'cycles'>,
  _T0: number,
): View | null {
  return null;
}
