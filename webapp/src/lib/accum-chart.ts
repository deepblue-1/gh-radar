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

import { endReasonLabelOf, isCarry } from './accum-report';
import { fmtYmdShort, kstClock } from './limitup-report';
import { fmtEok, isNum, kstHm } from './teamflow-report';

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
// 데이터 레이어 — 주문 원 · 누적 계단 · 10분 막대 · 빈 띠 · 등록 전 음영 (UI-SPEC A6 레이어 1 · 3 · 4 · 7)
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 주문 원 반지름(D-15) = max(2.2, min(7, 2.2 + √(val ÷ 1e7) × 0.5)) — 1천만 ≈ 2.7 · 1억 ≈ 3.8 · 10억 이상 7. */
export function orderRadiusOf(val: number): number {
  if (!isNum(val) || val <= 0) return 2.2;
  return Math.max(2.2, Math.min(7, 2.2 + Math.sqrt(val / 1e7) * 0.5));
}

export interface OrderCircle {
  cx: number;
  cy: number;
  r: number;
  side: 'B' | 'S';
  first: boolean;
  /** 「HH:MM:SS 팀 매수 N주 · X.XX억 @가격 · N조각」 + first 면 「 · 팀매수 시작」 */
  title: string;
}

const INT_FMT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

/**
 * 주문 원(D-15) — 창 ±30분 안 · 시각 · 가격이 유한한 주문만. **그리기 순서 = first 아닌 원은 반지름 내림차순(큰 원 먼저 →
 * 작은 원이 위) → first 원은 맨 마지막(항상 위)**. 금액은 억 2자리(부호 없이) · 수량 · 가격 ko-KR · 시각 KST HH:MM:SS.
 */
export function orderCirclesOf(
  orders: AccumReportOrders,
  view: View,
  x: (t: number) => number,
  y: (px: number) => number,
): OrderCircle[] {
  const lo = view.t0 - VIEW_PAD_MS;
  const hi = view.t1 + VIEW_PAD_MS;
  const plain: OrderCircle[] = [];
  const firsts: OrderCircle[] = [];
  for (let i = 0; i < orders.t_ms.length; i++) {
    const t = orders.t_ms[i];
    const px = orders.px[i];
    if (!isNum(t) || !isNum(px) || t < lo || t > hi) continue;
    const val = orders.val[i];
    const side = orders.side[i] === 'S' ? 'S' : 'B';
    const first = orders.first[i] === 1;
    const qty = orders.qty[i];
    const pieces = orders.pieces[i];
    const title =
      `${kstClock(t)} 팀 ${side === 'B' ? '매수' : '매도'} ${isNum(qty) ? INT_FMT.format(qty) : '—'}주 · ` +
      `${fmtEok(val, { digits: 2 })} @${INT_FMT.format(px)} · ${isNum(pieces) ? pieces : '—'}조각` +
      (first ? ' · 팀매수 시작' : '');
    const c: OrderCircle = { cx: x(t), cy: y(px), r: orderRadiusOf(val ?? 0), side, first, title };
    (first ? firsts : plain).push(c);
  }
  plain.sort((a, b) => b.r - a.r);
  return [...plain, ...firsts];
}

/** 누적 y 범위 — 하루 전체 min/max(0 포함 · 창과 무관하게 고정). */
export interface CumRange {
  min: number;
  max: number;
}

export function cumRangeOf(cum: AccumReportCumNet): CumRange {
  let min = 0;
  let max = 0;
  for (const c of cum.net_krw) {
    if (!isNum(c)) continue;
    if (c < min) min = c;
    if (c > max) max = c;
  }
  return { min, max };
}

/** 누적 → y(누적 판 TOP + H1 + GAP ~ + H2). 범위 0 이면 0선이 판 위끝. */
export function yOfCum(range: CumRange): (c: number) => number {
  const { TOP, H1, GAP, H2 } = ACCUM_CHART;
  const top = TOP + H1 + GAP;
  const span = range.max - range.min || 1;
  return (c) => top + ((range.max - c) / span) * H2;
}

/**
 * 순매수 누적 계단(D-14) — `M x0,y(0) L x0,y0` 뒤 점마다 `H x V y` · 끝 `H x(T2000)`. 결측 점은 건너뛴다 · 빈 배열이면 ''.
 * 점이 수천 개여도 경로 하나 · 창 밖은 clipPath 가 자른다(계단은 창 시작 값이 앞 점에 달려 있어 잘라 순회하지 않는다).
 */
export function cumPathOf(
  cum: AccumReportCumNet,
  x: (t: number) => number,
  yC: (c: number) => number,
  T2000: number,
): string {
  let d = '';
  const n = Math.min(cum.t_ms.length, cum.net_krw.length);
  for (let k = 0; k < n; k++) {
    const t = cum.t_ms[k];
    const c = cum.net_krw[k];
    if (!isNum(t) || !isNum(c)) continue;
    const X = f1(x(t));
    d += d === '' ? `M${X},${f1(yC(0))}L${X},${f1(yC(c))}` : `H${X}V${f1(yC(c))}`;
  }
  return d === '' ? '' : `${d}H${f1(x(T2000))}`;
}

const SLOT_MS = 10 * MIN;
const BAR_RATIO = 0.42;
const BAR_MIN_W = 1.5;

export interface BucketBar {
  slot: number;
  /** 매수 막대(왼쪽) — 0 이면 null */
  buy: Rect | null;
  /** 매도 막대(오른쪽) — 0 이면 null */
  sell: Rect | null;
  /** 칸 전체 높이 투명 히트 영역(<title> 자리) */
  hit: Rect;
  /** 「HH:MM~HH:MM 팀 매수 X.XX억 · 팀 매도 X.XX억」 */
  title: string;
}

/** 10분 막대 y 기준 = 하루 전체 매수 · 매도 최대(창과 무관하게 고정) · 없으면 0. */
export function bucketMaxOf(buckets: readonly AccumReportBucket[]): number {
  let mx = 0;
  for (const b of buckets) {
    if (isNum(b.buy_krw) && b.buy_krw > mx) mx = b.buy_krw;
    if (isNum(b.sell_krw) && b.sell_krw > mx) mx = b.sell_krw;
  }
  return mx;
}

/**
 * 10분 막대 쌍(D-14 · 목업 detail chart()) — slot k 의 칸 = [x(T0 + k × 10분), x(T0 + (k+1) × 10분)] · 막대 폭 = 현재 창 기준
 * 칸 폭 × 0.42(최소 1.5) · 매수 왼쪽(x0 + 1) · 매도 오른쪽(+ 폭 + 1) · 높이 = 값 ÷ 하루 최대 × h · 바닥 = 판 아래선 · 0 은 없음.
 * 창 ±30분 밖 칸은 뺀다.
 */
export function bucketBarsOf(
  buckets: readonly AccumReportBucket[],
  view: View,
  x: (t: number) => number,
  T0: number,
  bTop: number,
  h: number,
  bMax: number = bucketMaxOf(buckets),
): BucketBar[] {
  const scale = bMax > 0 ? h / bMax : 0;
  const out: BucketBar[] = [];
  for (const b of buckets) {
    if (!isNum(b.slot)) continue;
    const s0 = T0 + b.slot * SLOT_MS;
    const s1 = s0 + SLOT_MS;
    if (s1 < view.t0 - VIEW_PAD_MS || s0 > view.t1 + VIEW_PAD_MS) continue;
    const x0 = x(s0);
    const slotW = x(s1) - x0;
    const bw = Math.max(BAR_MIN_W, slotW * BAR_RATIO);
    const bar = (v: number, bx: number): Rect | null => {
      if (!isNum(v) || v <= 0) return null;
      const bh = v * scale;
      return { x: bx, y: bTop + h - bh, w: bw, h: bh };
    };
    out.push({
      slot: b.slot,
      buy: bar(b.buy_krw, x0 + 1),
      sell: bar(b.sell_krw, x0 + 1 + bw + 1),
      hit: { x: x0, y: bTop, w: slotW, h },
      title: `${kstHm(s0)}~${kstHm(s1)} 팀 매수 ${fmtEok(b.buy_krw, { digits: 2 })} · 팀 매도 ${fmtEok(b.sell_krw, { digits: 2 })}`,
    });
  }
  return out;
}

/** 15:30~16:00 빈 띠(체결 없음 정상 구간)의 x 구간. */
export function gapBandOf(bounds: { T1530: number; T1600: number }, x: (t: number) => number): { x: number; w: number } {
  const a = x(bounds.T1530);
  return { x: a, w: x(bounds.T1600) - a };
}

/**
 * 등록 전 음영(D-16 · Pitfall 15) = 오늘 등록(`since_date === date`)이고 첫 사이클 `reg_time_ms` 가 있을 때만
 * `[T0, max(T0, firstReg)]`. 이월 · reg 결측 · 사이클 없음 · 첫 사이클이 다른 날 등록이면 null.
 */
export function shadeOf(
  row: Pick<AccumReportRow, 'since_date' | 'date'>,
  payload: Pick<AccumReportPayload, 'cycles'>,
  T0: number,
): View | null {
  if (row.since_date !== row.date) return null;
  const first = payload.cycles[0];
  if (first === undefined || !isNum(first.reg_time_ms)) return null;
  if (typeof first.since_date === 'string' && first.since_date !== '' && first.since_date !== row.date) return null;
  return { t0: T0, t1: Math.max(T0, first.reg_time_ms) };
}

// ---------------------------------------------------------------------------
// 세로선 · 이월 줄 · 눈금 · 라벨 줄 (UI-SPEC A6 레이어 2 · 6 · 8 · D-16)
// ---------------------------------------------------------------------------

/** 사이클 세로선 하나 — t = 원래 시각(라벨 · title) · tx = 그릴 시각 max(t, T0)(09:00 이전 · 06:00 은 왼쪽 끝). */
export interface CycleMarkLine {
  t: number;
  tx: number;
  label: string;
  title: string;
}

export interface CycleMark {
  /** cycles[] 나온 순서 1-based(사이클 표 # 와 같은 번호 · `cycle` 값은 연속 · 고유를 가정하지 않는다 — CR-01) */
  k: number;
  reg: CycleMarkLine | null;
  end: CycleMarkLine | null;
}

/**
 * 사이클 세로선(D-16) — `cycles[]` 를 나온 순서대로 k = 1… · 등록선 = 그 사이클이 오늘 등록(since_date == date)이고
 * reg_time_ms 가 있을 때만 · 라벨 「등록 HH:MM」(사이클 2개 이상이면 「 · k」) · 종료선 = end_time_ms 가 있을 때 ·
 * 라벨 「{청산|이월 탈락(복원 안 됨)|이월 만료} HH:MM」(원래 시각) · title 은 HH:MM:SS.
 */
export function cycleMarksOf(
  row: Pick<AccumReportRow, 'date'>,
  payload: Pick<AccumReportPayload, 'cycles'>,
  T0: number,
): CycleMark[] {
  const multi = payload.cycles.length >= 2;
  return payload.cycles.map((c, i) => {
    const k = i + 1;
    let reg: CycleMarkLine | null = null;
    if (c.since_date === row.date && isNum(c.reg_time_ms)) {
      const t = c.reg_time_ms;
      reg = {
        t,
        tx: Math.max(t, T0),
        label: `등록 ${kstHm(t)}${multi ? ` · ${k}` : ''}`,
        title: `사이클 ${k} 등록 ${kstClock(t)}`,
      };
    }
    let end: CycleMarkLine | null = null;
    if (isNum(c.end_time_ms)) {
      const t = c.end_time_ms;
      const word = endReasonLabelOf(c.end_reason) ?? '종료';
      end = { t, tx: Math.max(t, T0), label: `${word} ${kstHm(t)}`, title: `사이클 ${k} ${word} ${kstClock(t)}` };
    }
    return { k, reg, end };
  });
}

/**
 * 좌상단 이월 줄(D-16) — 이월 행(`isCarry`)만 「이월 D+{carry_days} · {MM/DD} {HH:MM} 등록」 · reg_time_ms null 이면
 * 「이월 D+n · {MM/DD} 등록」. 그 밖 null.
 */
export function carryLineOf(
  row: Pick<AccumReportRow, 'since_date' | 'date' | 'carry_days' | 'reg_time_ms'>,
): string | null {
  if (!isCarry(row)) return null;
  const d = isNum(row.carry_days) ? ` D+${row.carry_days}` : '';
  const hm = isNum(row.reg_time_ms) ? ` ${kstHm(row.reg_time_ms)}` : '';
  return `이월${d} · ${fmtYmdShort(row.since_date!)}${hm} 등록`;
}

export interface Tick {
  t: number;
  label: string;
}

const TICK_STEPS = [5 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR];
const TICK_MIN_PX = 28;
const KST_OFFSET = 9 * HOUR;

/**
 * 시각 눈금(D-14 · 목업 ticks) — 창 폭 ≤ 30분 5분 · ≤ 2.5h 15분 · ≤ 5h 30분 · 그 밖 1h → 눈금 간격이 28px 미만이면 한 단계
 * 큰 간격(1h → 2h → 3h). 눈금은 KST 자정 기준으로 맞춘다 · 라벨 정시 「H」 · 그 밖 「HH:MM」 · 창 양 끝 포함.
 */
export function ticksOf(view: View, plotW: number): Tick[] {
  const w = view.t1 - view.t0;
  if (!(w > 0)) return [];
  let si = w <= 30 * MIN ? 0 : w <= 2.5 * HOUR ? 1 : w <= 5 * HOUR ? 2 : 3;
  while (si < TICK_STEPS.length - 1 && (TICK_STEPS[si]! / w) * plotW < TICK_MIN_PX) si += 1;
  const step = TICK_STEPS[si]!;
  const out: Tick[] = [];
  for (let t = Math.ceil((view.t0 + KST_OFFSET) / step) * step - KST_OFFSET; t <= view.t1; t += step) {
    const hm = kstHm(t);
    out.push({ t, label: hm.endsWith(':00') ? String(Number(hm.slice(0, 2))) : hm });
  }
  return out;
}

/** 세로선 라벨 입력 — x = 선 위치(그림 좌표). */
export interface ChartLabel {
  id: string;
  x: number;
  text: string;
  kind: 'reg' | 'end';
}

/** 배치된 라벨 — row 0~2 · y = 27 + row × 14 · textX/anchor = 글자 기준점. */
export interface PlacedLabel extends ChartLabel {
  row: number;
  y: number;
  textX: number;
  anchor: 'start' | 'end';
}

const LABEL_ROW0_Y = 27;
const LABEL_ROW_H = 14;
const LABEL_MAX_ROWS = 3;
const LABEL_PAD = 4;
const LABEL_GAP = 4;
const HANGUL_RE = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;

/** 라벨 폭 추정(11px 글자) — 한글 11px · 숫자/기호/공백 6.5px. */
export function labelWidthOf(text: string): number {
  let w = 0;
  for (const ch of text) w += HANGUL_RE.test(ch) ? 11 : 6.5;
  return w;
}

/**
 * 세로선 라벨 줄 배치(A11 labelRowsOf) — 등록 라벨은 선 오른쪽(+4 · start) · 종료 라벨은 선 왼쪽(−4 · end)이 기본이고,
 * 오른쪽 끝을 넘는 등록 라벨은 선 왼쪽으로 · 왼쪽 끝을 넘는 종료 라벨은 선 오른쪽으로 뒤집는다. 같은 줄 앞 라벨과 4px 안으로
 * 겹치면 다음 줄(최대 3줄 · 넘치면 그 라벨은 결과에서 빠진다 — 선과 <title> 은 남는다). 이월 줄(`carryText`)이 있으면
 * 1줄 왼쪽 [plotL + 4, + 폭] 을 먼저 차지한다. 입력 순서대로 놓는다.
 */
export function labelRowsOf(
  labels: readonly ChartLabel[],
  plotL: number,
  plotR: number,
  carryText?: string | null,
): PlacedLabel[] {
  const rows: [number, number][][] = Array.from({ length: LABEL_MAX_ROWS }, () => []);
  if (carryText) rows[0]!.push([plotL + LABEL_PAD, plotL + LABEL_PAD + labelWidthOf(carryText)]);
  const out: PlacedLabel[] = [];
  for (const l of labels) {
    const w = labelWidthOf(l.text);
    let anchor: 'start' | 'end' = l.kind === 'reg' ? 'start' : 'end';
    if (anchor === 'start' && l.x + LABEL_PAD + w > plotR) anchor = 'end';
    else if (anchor === 'end' && l.x - LABEL_PAD - w < plotL) anchor = 'start';
    const textX = anchor === 'start' ? l.x + LABEL_PAD : l.x - LABEL_PAD;
    const a = anchor === 'start' ? textX : textX - w;
    const b = a + w;
    const row = rows.findIndex((r) => r.every(([p, q]) => b + LABEL_GAP <= p || a >= q + LABEL_GAP));
    if (row < 0) continue;
    rows[row]!.push([a, b]);
    out.push({ ...l, row, y: LABEL_ROW0_Y + row * LABEL_ROW_H, textX, anchor });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 보기 창 조작 — 프리셋 · 확대/축소 · 이동 · 창 범위 글자 (D-14 · 34-07)
// ---------------------------------------------------------------------------

/** 프리셋 3개 — 「전체」 09:00~20:00 · 「정규장」 09:00~15:30 · 「마지막 2시간」 [max(T0, 끝 − 2h), 끝]. */
export type ChartPreset = 'full' | 'reg' | 'last2h';

export function lastTradeMsOf(_price: AccumReportPrice): number | null {
  return null;
}

export function presetOf(
  _name: ChartPreset,
  _bounds: { T0: number; T1530: number; T2000: number },
  _lastTradeMs: number | null,
): View {
  return { t0: 0, t1: 0 };
}

export function zoomAt(v: View, _tc: number, _k: number): View {
  return v;
}

export function panBy(v: View, _dt: number): View {
  return v;
}

export function fmtViewRange(_v: View): string {
  return '';
}
