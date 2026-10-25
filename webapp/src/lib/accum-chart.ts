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
import { MINUS, fmtEok, isNum, kstHm } from './teamflow-report';

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

/**
 * 가격 축 글자 값(D-14) — min ~ max 5등분 점 5개를 원 단위로 반올림해 같은 값은 하나만(IN-06 — 창 안 가격이 한 값(상한가
 * 잠김)이면 5개가 한 자리에 겹쳐 그려졌다 · DOM · 스크린리더 · 글자 두께가 달라진다). 오름차순.
 */
export function priceTicksOf(range: Pick<PriceRange, 'min' | 'max'>): number[] {
  const raw = [0, 1, 2, 3, 4].map((i) => Math.round(range.min + ((range.max - range.min) * i) / 4));
  return [...new Set(raw)];
}

/** 가격 → y(가격 판 TOP ~ TOP + H1). */
export function yOfPrice(range: PriceRange): (px: number) => number {
  const { TOP, H1 } = ACCUM_CHART;
  const span = range.hi - range.lo || 1;
  return (p) => TOP + ((range.hi - p) / span) * H1;
}

const f1 = (n: number) => n.toFixed(1);

/**
 * 가격 선 경로(D-14) — 창 ±30분 밖 점은 잘라 순회 · 이웃 간격 > 15분이면 `M` 으로 끊는다 · 좌표 소수 1자리. 점이 없으면 빈 문자열.
 *
 * **체결가 계단 + 팀 체결(2026-10-23 · 팀 주문 원이 선 위에 오게):** 가격 점 = 10초 칸 시작 시각 · 그 칸 **마지막** 체결가다.
 * 칸 시작에 그 값을 찍고 이웃 점을 곧게 이으면 (a) 칸 끝 값이 최대 10초 앞서 그려지고 (b) 체결 없는 칸 사이를 대각선으로 이어
 * 가격이 그대로였던 구간이 미리 오르내려 — 그 사이 실제 체결가로 찍힌 팀 주문 원이 선에서 떨어져 보였다(10/22 원 8,296개 중앙값
 * 0.26% · p90 1.03% 차이). 그래서 선은 「꼭짓점」 을 시각순으로 잇는다:
 *   - 칸 마지막 값은 칸 **끝**(시작 + step) 꼭짓점 · 팀 주문은 그 주문 시각 · 가격(`orders` — 팀 체결도 그 시각 실제 체결이다).
 *   - 앞 꼭짓점 값을 「바뀔 수 있는 가장 이른 때」(그 꼭짓점이 든 10초 칸 시작 · 앞 꼭짓점보다 이르면 앞 꼭짓점)까지 수평 유지(`H`)
 *     → 새 꼭짓점까지 `L`. 구간 첫 꼭짓점은 그 「이른 때」 에서 시작해 수평으로 꼭짓점까지 간다.
 *   그래서 원은 늘 선 위에 있다. 칸 안 다른(팀 아닌) 체결의 오르내림은 자료에 없어 선이 지나지 않는다.
 */
export function pricePathOf(
  points: readonly PricePoint[],
  view: View,
  x: (t: number) => number,
  y: (px: number) => number,
  stepMs: number = 10_000,
  orders: Pick<AccumReportOrders, 't_ms' | 'px'> | null = null,
): string {
  const lo = view.t0 - VIEW_PAD_MS;
  const hi = view.t1 + VIEW_PAD_MS;
  // 꼭짓점 [바뀔 수 있는 가장 이른 때, 꼭짓점 시각, 가격] — 칸 끝 값 ∪ 팀 주문, 시각순(같은 시각은 칸 값 먼저)
  const verts: [s: number, t: number, p: number][] = [];
  const a = lowerBound(points, lo - stepMs);
  const b = upperBound(points, hi);
  for (let k = a; k < b; k++) {
    const [t, p] = points[k]!;
    verts.push([t, t + stepMs, p]);
  }
  if (orders !== null && points.length > 0) {
    const t0 = points[0]![0];
    const n = Math.min(orders.t_ms.length, orders.px.length);
    for (let i = 0; i < n; i++) {
      const t = orders.t_ms[i];
      const p = orders.px[i];
      if (!isNum(t) || !isNum(p) || p <= 0 || t < lo || t > hi) continue;
      const s0 = t0 + Math.floor((t - t0) / stepMs) * stepMs;
      verts.push([s0, t, p]);
    }
    verts.sort((u, v) => u[1] - v[1] || u[0] - v[0]);
  }
  let d = '';
  let prevT: number | null = null;
  for (const [s0, t, p] of verts) {
    if (prevT === null || t - prevT > PRICE_BREAK_MS) {
      d += `M${f1(x(s0))},${f1(y(p))}`;
      if (t > s0) d += `H${f1(x(t))}`;
    } else {
      const s = Math.max(prevT, s0);
      if (s > prevT) d += `H${f1(x(s))}`;
      d += `L${f1(x(t))},${f1(y(p))}`;
    }
    prevT = t;
  }
  return d;
}

/**
 * payload.avg_px → 팀 평단 점 목록(quick-261021-amg) — 유한 수 쌍만 · **배열 순서 그대로(정렬하지 않음)**.
 * 같은 ms 두 점(종료 값 → 0)은 순서가 정본이다. 두 배열 길이가 다르면 짧은 쪽까지만 본다.
 * payloadOf 는 6키만 검사하고 이 선택 키는 보지 않는다(pnl 을 pnlOf 가 따로 방어하는 것과 같은 방식). 그래서 키가 없거나
 * (2026-10-21 이전 export 행) 모양이 어긋나면 이 함수가 [] 를 내서 **평단 선만 생략**되고 행 · 차트 · KPI 는 그대로다.
 */
export function avgPxPointsOf(payload: Pick<AccumReportPayload, 'avg_px'>): PricePoint[] {
  const a: unknown = payload.avg_px;
  if (typeof a !== 'object' || a === null || Array.isArray(a)) return [];
  const { t_ms: ts, px: ps } = a as { t_ms?: unknown; px?: unknown };
  if (!Array.isArray(ts) || !Array.isArray(ps)) return [];
  const out: PricePoint[] = [];
  const n = Math.min(ts.length, ps.length);
  for (let k = 0; k < n; k++) {
    const t = ts[k] as number;
    const p = ps[k] as number;
    if (!isNum(t) || !isNum(p)) continue;
    out.push([t, p]);
  }
  return out;
}

/**
 * 팀 평단 계단 경로(quick-261021-amg · WinForms AccumChartPanel 동형) — 가격 판과 같은 y 축.
 * - 계단: 다음 점까지 수평(`H`) · 값이 바뀌는 점에서 수직(`V`). 좌표 소수 1자리 · 점이 없으면 빈 문자열.
 * - px ≤ 0 = 등록 포지션 없음 → 열린 조각을 그 점 x 까지 수평으로 닫고 끊는다 · 다음 양수 점에서 `M` 으로 새로 시작.
 * - 09:00(T0) 미만 점(이월 종목 06:01 row 2)은 x = T0 에 붙인다. T0 전 점이 여럿이면 마지막 점만 쓴다(다음 점도 T0 전이면 건너뜀).
 * - 가격축 안 클램프: px 를 [range.lo, range.hi] 로 잘라 판 위/아래 끝에 붙인다. 축 맞춤(priceRangeOf · D-14)에는 평단을
 *   넣지 않는다 — 가격 축 글자 · 가격 선 · 원 위치는 평단 유무와 무관.
 * - 열린 마지막 조각의 끝 = max(endMs, 마지막 점 시각). 호출부는 endMs 로 마지막 체결 칸 시각(lastTradeMsOf)을 준다 — 가격 선이
 *   마지막 체결 칸에서 끝나므로 같은 끝을 쓴다(누적 판의 T2000 연장 규칙과 다르다).
 * - 창 ±30분 자르기는 하지 않는다 — 계단은 창 시작 값이 앞 점에 달려 있고 클립이 자른다(cumPathOf 와 같은 이유).
 */
export function avgPxPathOf(
  points: readonly PricePoint[],
  x: (t: number) => number,
  range: PriceRange,
  T0: number,
  endMs: number,
): string {
  const y = yOfPrice(range);
  const yc = (p: number) => f1(y(Math.min(range.hi, Math.max(range.lo, p))));
  let d = '';
  let open = false;
  let lastTx: number | null = null;
  for (let k = 0; k < points.length; k++) {
    const [t, p] = points[k]!;
    const next = points[k + 1];
    if (t < T0 && next !== undefined && next[0] < T0) continue;
    const tx = Math.max(t, T0);
    lastTx = tx;
    const xs = f1(x(tx));
    if (p <= 0) {
      if (open) d += `H${xs}`;
      open = false;
    } else if (open) {
      d += `H${xs}V${yc(p)}`;
    } else {
      d += `M${xs},${yc(p)}`;
      open = true;
    }
  }
  if (open && lastTx !== null) d += `H${f1(x(Math.max(endMs, lastTx)))}`;
  return d;
}

/** 포지션 순매수 점(quick-261025-fac) — end 0 = 열림(end 배열이 없으면 전부 0). */
export interface PosNetPoint {
  t: number;
  net: number;
  cycle: number;
  end: number;
}

/**
 * payload.pos_net → 포지션 순매수 점 목록(quick-261025-fac · 스케치 017 B) — avgPxPointsOf 와 같은 선 단위 방어.
 * - 키 없음 · 객체 아님 · 배열 자체 · t_ms / net_krw / cycle 중 하나라도 배열 아님 → []. 길이가 다르면 셋 중 짧은 쪽까지.
 * - t · net · cycle 중 하나라도 유한 수가 아니면 그 점을 건너뛴다. **배열 순서 그대로(정렬하지 않음).**
 * - `end` 가 배열이 아니면(없음 포함) 모든 점 end 0, 배열이면 그 자리 값이 유한 수일 때만 그 값 · 아니면(짧음 포함) 0.
 * payloadOf 는 6키만 검사하고 이 선택 키는 보지 않는다(avg_px 와 같은 방식). 그래서 키가 없거나(2026-10-25 이전 export 행)
 * 모양이 어긋나면 이 함수가 [] 를 내서 **포지션 선만 생략**되고 행 · 차트 · 범례 · 툴팁은 오늘 모양 그대로다.
 */
export function posNetPointsOf(payload: Pick<AccumReportPayload, 'pos_net'>): PosNetPoint[] {
  const a: unknown = payload.pos_net;
  if (typeof a !== 'object' || a === null || Array.isArray(a)) return [];
  const { t_ms: ts, net_krw: ns, cycle: cs, end: es } = a as {
    t_ms?: unknown;
    net_krw?: unknown;
    cycle?: unknown;
    end?: unknown;
  };
  if (!Array.isArray(ts) || !Array.isArray(ns) || !Array.isArray(cs)) return [];
  const ends: unknown[] | null = Array.isArray(es) ? es : null;
  const out: PosNetPoint[] = [];
  const n = Math.min(ts.length, ns.length, cs.length);
  for (let k = 0; k < n; k++) {
    const t = ts[k] as number;
    const net = ns[k] as number;
    const cycle = cs[k] as number;
    if (!isNum(t) || !isNum(net) || !isNum(cycle)) continue;
    const e = ends === null ? 0 : (ends[k] as number);
    out.push({ t, net, cycle, end: isNum(e) ? e : 0 });
  }
  return out;
}

/**
 * 포지션 순매수 계단 경로(quick-261025-fac · 스케치 017 B · WinForms 상세 차트 동형) — 누적 판 y 축(cumRangeOf 두 선 합친 범위).
 * - cumPathOf 와 같은 H-다음-V 계단 · 좌표 소수 1자리 · 점이 없으면 ''.
 * - **끊김:** 점 k 는 (앞 점 없음) 또는 (cycle 이 앞 점과 다름) 또는 (앞 점 end ≠ 0) 이면 `M` 으로 새 조각을 시작한다. 앞 점은
 *   건너뛴 점을 포함한 원래 순서의 앞 점이다. 조각은 자기 마지막 점에서 멈춘다(0선 시작 `L` 없음 · 조각 끝 연장 없음).
 * - **열린 끝:** 마지막 점의 end 가 0(열린 포지션)일 때만 `H x(max(T2000, 마지막 점 x 시각))` 로 20:00 까지 잇는다.
 * - 09:00(T0) 미만 점(이월 종목 06:01 row 2)은 avgPxPathOf 와 똑같이 x = T0 에 붙이고, 다음 점도 T0 전이면 건너뛴다.
 * - 창 ±30분 자르기는 하지 않는다 — 계단은 창 시작 값이 앞 점에 달려 있고 클립이 자른다(cumPathOf 와 같은 이유).
 * - 툴팁 `cumTipAt` 의 「포지션 —」 판정이 이 조각 규칙과 짝이다(마지막 점에서 멈춤 · 열린 마지막 조각만 이어짐).
 * - 한계: end 배열이 없는 동안 같은 사이클 안 청산 → 재등장(숨김 구간)은 끊지 못하고 이어져 보인다(gh-trade `end[]` 로 해소).
 */
export function posNetPathOf(
  points: readonly PosNetPoint[],
  x: (t: number) => number,
  yC: (c: number) => number,
  T0: number,
  T2000: number,
): string {
  let d = '';
  let open = false;
  let last: { tx: number; end: number } | null = null;
  for (let k = 0; k < points.length; k++) {
    const p = points[k]!;
    const prev = points[k - 1];
    if (prev === undefined || prev.cycle !== p.cycle || prev.end !== 0) open = false;
    const next = points[k + 1];
    if (p.t < T0 && next !== undefined && next.t < T0) continue;
    const tx = Math.max(p.t, T0);
    const xs = f1(x(tx));
    d += open ? `H${xs}V${f1(yC(p.net))}` : `M${xs},${f1(yC(p.net))}`;
    open = true;
    last = { tx, end: p.end };
  }
  if (last !== null && last.end === 0) d += `H${f1(x(Math.max(T2000, last.tx)))}`;
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

/** 주문 원 최대 반지름(D-15). */
const ORDER_R_MAX = 7;

/** 주문 원 반지름(D-15) = max(2.2, min(7, 2.2 + √(val ÷ 1e7) × 0.5)) — 1천만 ≈ 2.7 · 1억 ≈ 3.8 · 10억 이상 7. */
export function orderRadiusOf(val: number): number {
  if (!isNum(val) || val <= 0) return 2.2;
  return Math.max(2.2, Math.min(ORDER_R_MAX, 2.2 + Math.sqrt(val / 1e7) * 0.5));
}

/**
 * 가격 레이어(가격 선 · 주문 원) 클립 = 그림 영역 x [L, W − R] × 가격 판 y [TOP, TOP + H1] 위아래 원 최대 반지름(7) 여유(WR-01).
 * 가격 y 범위는 창 안 점만으로 잡는데 경로 · 원은 창 ±30분까지 그려서, 창 경계 바로 밖 가격이 크게 다르면(상한가 진입 · 급락)
 * 경계를 넘는 선분이 위 라벨 띠나 아래 누적 · 10분 판을 세로로 가른다 — 그 선분을 가격 판 높이에서 자른다.
 */
export function priceClipOf(L: number, W: number): Rect {
  const { R, TOP, H1 } = ACCUM_CHART;
  return { x: L, y: TOP - ORDER_R_MAX, w: Math.max(0, W - R - L), h: H1 + 2 * ORDER_R_MAX };
}

export interface OrderCircle {
  /** payload.orders 안 원래 번호 — 마우스 툴팁(`orderTipOf`)이 그 주문을 다시 찾는다 */
  i: number;
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
    const c: OrderCircle = { i, cx: x(t), cy: y(px), r: orderRadiusOf(val ?? 0), side, first, title };
    (first ? firsts : plain).push(c);
  }
  plain.sort((a, b) => b.r - a.r);
  return [...plain, ...firsts];
}

/** 누적 y 범위 — 하루 전체 min/max(0 포함 · 창과 무관하게 고정 · pos_net 점이 있으면 그 값도 합친다). */
export interface CumRange {
  min: number;
  max: number;
}

export function cumRangeOf(cum: AccumReportCumNet, pos: readonly PosNetPoint[] = []): CumRange {
  let min = 0;
  let max = 0;
  for (const c of cum.net_krw) {
    if (!isNum(c)) continue;
    if (c < min) min = c;
    if (c > max) max = c;
  }
  // quick-261025-fac — 포지션 순매수 선도 같은 축(이월 13억도 판 안). 09:00 전 건너뛴 점 값도 넣는다(차이가 작아 단순함 우선).
  for (const p of pos) {
    if (p.net < min) min = p.net;
    if (p.net > max) max = p.net;
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

/** 누적 축 글자 간 최소 세로 간격(11px 글자 높이 + 여유) — 이보다 0 에 가까운 끝값 글자는 뺀다. */
const CUM_TICK_MIN_PX = 12;

/**
 * 누적 축 글자(오른쪽 · D-14) — 0 · `min` · `max` 중 0 과 세로 간격이 `CUM_TICK_MIN_PX` 미만인 끝값은 뺀다(34-10 백스톱 —
 * 한선엔지니어링 실측 −0.3억 처럼 0 에 붙은 끝값 글자가 「0.0억」 과 겹쳤다). 0 글자는 0선과 짝이라 항상 남긴다 · 오름차순.
 */
export function cumTicksOf(range: CumRange, y: (c: number) => number): number[] {
  const out = [0];
  for (const v of [range.min, range.max]) {
    if (v !== 0 && Math.abs(y(v) - y(0)) >= CUM_TICK_MIN_PX) out.push(v);
  }
  return out.sort((a, b) => a - b);
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

// ---------------------------------------------------------------------------
// 마우스 툴팁(2026-10-23 사용자 요청 · gh-trade AccumChartPanel · AccumBucketChart 동형) — 판마다 대상 하나
// ---------------------------------------------------------------------------

/** 원 판정 가로 여유 — 마우스 세로선이 「반지름 + 2」 안에 원을 지나면 후보(gh-trade HOVER_PAD). */
const HOVER_PAD = 2;

/** 마우스 툴팁 대상 — 판 하나에 하나. key 가 같으면 같은 대상(다시 그리지 않는다). */
export interface ChartHover {
  key: string;
  lines: string[];
  /** 가격 판 주문이면 그 원(테두리 강조용) */
  circle: OrderCircle | null;
}

/** x(px) → 시각 — `xOfView` 의 역. */
export function tOfView(view: View, L: number, W: number): (px: number) => number {
  const plotW = W - ACCUM_CHART.R - L || 1;
  return (px) => view.t0 + ((px - L) / plotW) * (view.t1 - view.t0);
}

/** 부호 붙은 % 2자리(gh-trade 툴팁 「+5.13%」) — 음수는 MINUS(U+2212). */
function pct2(v: number): string {
  const r = Math.round(v * 100) / 100;
  if (r === 0) return '0.00%';
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(2)}%`;
}

/** 열 지향 계단에서 시각 t 이하 마지막 점의 번호(없으면 −1) — t_ms 비감소 가정 · 결측 점은 건너뛴다. */
function stepIndexAt(ts: readonly number[], vs: readonly number[], t: number): number {
  let idx = -1;
  const n = Math.min(ts.length, vs.length);
  for (let k = 0; k < n; k++) {
    const tk = ts[k];
    if (!isNum(tk) || !isNum(vs[k])) continue;
    if (tk > t) break;
    idx = k;
  }
  return idx;
}

/** 그 시각 팀 평단(avg_px 계단 · 0 이하 = 포지션 없음 → null). 키가 없거나 모양이 어긋나면 null. */
function avgPxAt(payload: Pick<AccumReportPayload, 'avg_px'>, t: number): number | null {
  const pts = avgPxPointsOf(payload);
  let v: number | null = null;
  for (const [tk, p] of pts) {
    if (tk > t) break;
    v = p;
  }
  return v !== null && v > 0 ? v : null;
}

/**
 * 가격 판 — 마우스 세로선이 지나는 원(|mx − cx| ≤ r + 2) 중 세로로 가장 가까운 것(gh-trade NearestCircle). 가격 판 밖이면 null.
 */
export function nearestOrderOf(circles: readonly OrderCircle[], mx: number, my: number): OrderCircle | null {
  const { TOP, H1 } = ACCUM_CHART;
  if (my < TOP || my > TOP + H1) return null;
  let best: OrderCircle | null = null;
  let bestDy = Infinity;
  for (const c of circles) {
    if (Math.abs(mx - c.cx) > c.r + HOVER_PAD) continue;
    const dy = Math.abs(my - c.cy);
    if (dy < bestDy) {
      bestDy = dy;
      best = c;
    }
  }
  return best;
}

/**
 * 주문 원 툴팁 2줄 — ① 「HH:MM:SS 팀 매수 N주 · X.XX억 @가격 · N조각[ · 팀매수 시작]」(원 title 그대로)
 * ② 「순매수 누적 ±X.XX억 · 등락률 ±N.NN% · 평단 대비 ±N.NN%」 — 그 시각까지 day_cum_net(그 주문 포함) · 기준가(row.base) 대비 ·
 * 그 시각 팀 평단 대비. 값을 모르는 항목은 뺀다(gh-trade TooltipText 동형). 다 빠지면 1줄.
 */
export function orderTipOf(
  payload: Pick<AccumReportPayload, 'orders' | 'day_cum_net' | 'avg_px'>,
  row: Pick<AccumReportRow, 'base'>,
  c: OrderCircle,
): string[] {
  const t = payload.orders.t_ms[c.i]!;
  const px = payload.orders.px[c.i]!;
  const parts: string[] = [];
  const k = stepIndexAt(payload.day_cum_net.t_ms, payload.day_cum_net.net_krw, t);
  if (k >= 0) parts.push(`순매수 누적 ${fmtEok(payload.day_cum_net.net_krw[k], { signed: true, digits: 2 })}`);
  if (isNum(row.base) && row.base > 0) parts.push(`등락률 ${pct2(((px - row.base) / row.base) * 100)}`);
  const avg = avgPxAt(payload, t);
  if (avg !== null) parts.push(`평단 대비 ${pct2(((px - avg) / avg) * 100)}`);
  return parts.length > 0 ? [c.title, parts.join(' · ')] : [c.title];
}

/**
 * 누적 판 — 시각 t 의 계단 값(t 이하 마지막 점) 「HH:MM:SS · 순매수 누적 ±X.XX억[ · 팀 평단 N원]」(gh-trade NetTooltipText).
 * 첫 점 앞이면 null.
 *
 * **pos_net 점이 있으면(quick-261025-fac · 스케치 017 B)** 「t 이하 마지막 사건 시각」 문법을 두 선으로 넓힌 스냅샷이다 —
 * kd = 그날 계단 t 이하 마지막 점 · kp = 포지션 t 이하 마지막 점 · 둘 다 없으면 null · 시각 tk = 둘 중 늦은 점.
 * 「HH:MM:SS · 순매수 누적 ±X.XX억 · 포지션 순매수 ±Y.YY억(이월 포함)[ · 팀 평단 N원]」 — 그날 값은 첫 주문 전이면 0(그날 0부터).
 * 포지션 값은 posNetPathOf 의 조각 규칙과 짝이다: 그 점 시각엔 값이 있고, 그 뒤(tk > 점 시각)는 그 점 end ≠ 0(조각이 거기서
 * 멈춤) 또는 다음 점 cycle 이 다르면(사이클 사이) 없다 → 「포지션 —」. 열린 마지막 조각만 이후에도 값이 이어진다. key = `c{kd}p{kp}`.
 * pos_net 이 없거나 빈 행은 위 기존 문구 · key `c{k}` 그대로다.
 */
export function cumTipAt(
  payload: Pick<AccumReportPayload, 'day_cum_net' | 'avg_px' | 'pos_net'>,
  t: number,
): ChartHover | null {
  const { t_ms: ts, net_krw: vs } = payload.day_cum_net;
  const k = stepIndexAt(ts, vs, t);
  const pos = posNetPointsOf(payload);
  if (pos.length === 0) {
    if (k < 0) return null;
    const tk = ts[k]!;
    let text = `${kstClock(tk)} · 순매수 누적 ${fmtEok(vs[k], { signed: true, digits: 2 })}`;
    const avg = avgPxAt(payload, tk);
    if (avg !== null) text += ` · 팀 평단 ${INT_FMT.format(avg)}원`;
    return { key: `c${k}`, lines: [text], circle: null };
  }
  let kp = -1;
  for (let i = 0; i < pos.length; i++) {
    if (pos[i]!.t > t) break;
    kp = i;
  }
  if (k < 0 && kp < 0) return null;
  const tk = Math.max(k >= 0 ? ts[k]! : -Infinity, kp >= 0 ? pos[kp]!.t : -Infinity);
  const day = `순매수 누적 ${fmtEok(k >= 0 ? vs[k] : 0, { signed: true, digits: 2 })}`;
  let posVal: number | null = null;
  if (kp >= 0) {
    const p = pos[kp]!;
    const next = pos[kp + 1];
    const gap = tk > p.t && (p.end !== 0 || (next !== undefined && next.cycle !== p.cycle));
    if (!gap) posVal = p.net;
  }
  const posText =
    posVal === null ? '포지션 —' : `포지션 순매수 ${fmtEok(posVal, { signed: true, digits: 2 })}(이월 포함)`;
  let text = `${kstClock(tk)} · ${day} · ${posText}`;
  const avg = avgPxAt(payload, tk);
  if (avg !== null) text += ` · 팀 평단 ${INT_FMT.format(avg)}원`;
  return { key: `c${k}p${kp}`, lines: [text], circle: null };
}

/**
 * 10분 판 — 시각 t 가 든 칸(09:00 = 0)에 팀 주문이 있으면 「HH:MM~HH:MM · 팀 매수 X.XX억 / 매도 X.XX억 / 순 ±X.XX억」
 * (gh-trade BarTooltipText — 금액은 이 화면 규칙대로 억 2자리). 빈 칸이면 null.
 */
export function bucketTipAt(buckets: readonly AccumReportBucket[], T0: number, t: number): ChartHover | null {
  const slot = Math.floor((t - T0) / SLOT_MS);
  const b = buckets.find((x) => x.slot === slot);
  if (b === undefined) return null;
  const buy = isNum(b.buy_krw) ? b.buy_krw : 0;
  const sell = isNum(b.sell_krw) ? b.sell_krw : 0;
  if (buy <= 0 && sell <= 0) return null;
  const s0 = T0 + slot * SLOT_MS;
  const text =
    `${kstHm(s0)}~${kstHm(s0 + SLOT_MS)} · 팀 매수 ${fmtEok(buy, { digits: 2 })} / 매도 ${fmtEok(sell, { digits: 2 })}` +
    ` / 순 ${fmtEok(buy - sell, { signed: true, digits: 2 })}`;
  return { key: `b${slot}`, lines: [text], circle: null };
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
 * 큰 간격(1h → 2h → 3h). 눈금은 KST 자정 기준 간격 배수에만 놓는다(창 끝이 배수가 아니면 그 끝에는 눈금 없음 · 배수와
 * 겹치면 포함) · 라벨 정시 「H」 · 그 밖 「HH:MM」.
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

/** 마지막 체결 칸 시각 = t0_ms + 마지막 idx × step_s × 1000(목업 lastTradeOf) · idx 가 비면 null. */
export function lastTradeMsOf(price: AccumReportPrice): number | null {
  const last = price.idx[price.idx.length - 1];
  if (!isNum(last)) return null;
  return price.t0_ms + last * (isNum(price.step_s) ? price.step_s : 10) * 1000;
}

/**
 * 프리셋 창(D-14 · 목업 preset) — clampView 를 거친다. 「마지막 2시간」 의 끝은 마지막 체결 칸 시각이고, 끝이 없으면(체결 0 —
 * 버튼은 disabled) 「전체」 로 폴백한다.
 */
export function presetOf(
  name: ChartPreset,
  bounds: { T0: number; T1530: number; T2000: number },
  lastTradeMs: number | null,
): View {
  const { T0, T1530, T2000 } = bounds;
  let v: View = { t0: T0, t1: T2000 };
  if (name === 'reg') v = { t0: T0, t1: T1530 };
  else if (name === 'last2h' && lastTradeMs !== null) v = { t0: Math.max(T0, lastTradeMs - 2 * HOUR), t1: lastTradeMs };
  return clampView(v, T0, T2000);
}

/** tc 기준 k 배 확대/축소 — tc 의 창 안 상대 위치를 지킨다(k < 1 확대 · k > 1 축소 · clamp 는 호출 쪽). */
export function zoomAt(v: View, tc: number, k: number): View {
  return { t0: tc - (tc - v.t0) * k, t1: tc + (v.t1 - tc) * k };
}

/** 창을 dt 만큼 옮긴다(+ = 뒤 시각 · clamp 는 호출 쪽). */
export function panBy(v: View, dt: number): View {
  return { t0: v.t0 + dt, t1: v.t1 + dt };
}

/** 창 범위 글자 「HH:MM ~ HH:MM」(KST). */
export function fmtViewRange(v: View): string {
  return `${kstHm(v.t0)} ~ ${kstHm(v.t1)}`;
}
