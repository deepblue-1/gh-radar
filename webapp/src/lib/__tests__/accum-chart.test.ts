import { describe, expect, it } from 'vitest';

import type { AccumDetailRow, AccumReportOrders, AccumReportPayload } from '@gh-radar/shared';

import {
  ACCUM_DATE,
  CHEONIL,
  HANSUN,
  accumDetailRows,
  accumKstMs,
  accumSyntheticDetail,
} from '@/test-fixtures/accum-export';
import { payloadOf } from '@/lib/accum-report';

import {
  ACCUM_CHART,
  MIN_VIEW_MS,
  avgPxPathOf,
  avgPxPointsOf,
  bucketBarsOf,
  bucketMaxOf,
  bucketTipAt,
  carryLineOf,
  clampView,
  cycleMarksOf,
  cumPathOf,
  cumRangeOf,
  cumTicksOf,
  cumTipAt,
  dayBoundsOf,
  gapBandOf,
  labelRowsOf,
  labelWidthOf,
  nearestOrderOf,
  orderCirclesOf,
  orderTipOf,
  orderRadiusOf,
  shadeOf,
  tOfView,
  ticksOf,
  yOfCum,
  priceAxisWidthOf,
  priceClipOf,
  pricePathOf,
  pricePointsOf,
  priceRangeOf,
  priceTicksOf,
  xOfView,
  fmtViewRange,
  lastTradeMsOf,
  panBy,
  presetOf,
  zoomAt,
  posDayPathOf,
  posDayPointsOf,
  posNetPathOf,
  posNetPointsOf,
  teamAvgOf,
  type PosDayPoint,
  type PosNetPoint,
  type PricePoint,
} from '../accum-chart';

/**
 * Phase 34 Plan 06 — 매집감지 상세 차트 순수 기하 골든(UI-SPEC A6 · A11 「표시 변환 규칙」 · D-14 ~ D-17).
 * 원본 = 채택 목업 C(`reference/mockup-accum-chart.html`) JS. 단위 ms · 측정 폭 1:1.
 */

const H = 3600e3;
const M = 60e3;
const T0 = accumKstMs(ACCUM_DATE, '09:00:00');
const at = (hms: string) => accumKstMs(ACCUM_DATE, hms);

const EMPTY_ORDERS: AccumReportOrders = { t_ms: [], side: [], qty: [], val: [], px: [], pieces: [], first: [] };

/** 경로 문자열 → 명령 글자 목록(M · L · H · V). */
const cmds = (d: string) => d.match(/[MLHV]/g) ?? [];

describe('accum-chart — 창 · x (D-14)', () => {
  it('dayBoundsOf(t0) = T0 · T1530 = +6.5h · T1600 = +7h · T2000 = +11h', () => {
    expect(dayBoundsOf(T0)).toEqual({ T0, T1530: T0 + 6.5 * H, T1600: T0 + 7 * H, T2000: T0 + 11 * H });
  });

  it('clampView — 10분 미만은 MIN_VIEW_MS 로 넓히고 T0 앞이면 T0 시작 · 12h 는 [T0, T2000]', () => {
    const { T2000 } = dayBoundsOf(T0);
    expect(MIN_VIEW_MS).toBe(10 * M);
    // 폭 5분 · T0 앞 → 폭 10분 · 시작 T0
    expect(clampView({ t0: T0 - H, t1: T0 - H + 5 * M }, T0, T2000)).toEqual({ t0: T0, t1: T0 + 10 * M });
    // 폭 65분 · T0 앞 → 폭은 지키고 시작만 T0
    expect(clampView({ t0: T0 - H, t1: T0 + 5 * M }, T0, T2000)).toEqual({ t0: T0, t1: T0 + 65 * M });
    expect(clampView({ t0: T0 - H, t1: T0 + 11 * H }, T0, T2000)).toEqual({ t0: T0, t1: T2000 });
    // 오른쪽 끝을 넘으면 폭을 지키고 T2000 에 붙는다
    expect(clampView({ t0: T2000 - 10 * M, t1: T2000 + 50 * M }, T0, T2000)).toEqual({ t0: T2000 - H, t1: T2000 });
  });

  it('xOfView — view.t0 = L · view.t1 = W − 56 (R)', () => {
    const v = { t0: T0, t1: T0 + 11 * H };
    const x = xOfView(v, 52, 640);
    expect(ACCUM_CHART.R).toBe(56);
    expect(x(v.t0)).toBe(52);
    expect(x(v.t1)).toBe(640 - 56);
    expect(x((v.t0 + v.t1) / 2)).toBeCloseTo((52 + 584) / 2, 6);
  });

  it('ACCUM_CHART — 판 200 / 112 / 72 · 사이 24 · 전체 472 · 눈금 465', () => {
    const c = ACCUM_CHART;
    expect([c.TOP, c.H1, c.GAP, c.H2, c.H3, c.BOT, c.H, c.TICK_Y]).toEqual([16, 200, 24, 112, 72, 24, 472, 465]);
    expect(c.TOP + c.H1 + c.GAP + c.H2 + c.GAP + c.H3 + c.BOT).toBe(c.H);
  });
});

describe('accum-chart — 가격 판 (D-14 · Pitfall 14 · A6 long-text 백스톱)', () => {
  it('priceAxisWidthOf — 하루 최대 가격 1,000,000 미만 52 · 이상 60', () => {
    expect(priceAxisWidthOf(224_000)).toBe(52);
    expect(priceAxisWidthOf(999_999)).toBe(52);
    expect(priceAxisWidthOf(1_234_500)).toBe(60);
  });

  it('pricePointsOf — idx → [t0_ms + idx × step_s × 1000, px] · 유한 수만', () => {
    const pts = pricePointsOf({ t0_ms: T0, step_s: 10, idx: [0, 6, 7, 9], px: [100, 110, Number.NaN, 120] });
    expect(pts).toEqual([
      [T0, 100],
      [T0 + 60_000, 110],
      [T0 + 90_000, 120],
    ]);
  });

  it('pricePathOf — 15:20 · 15:30 · 16:00(간격 30분) → 16:00 에서 새 M · 체결가 계단(앞 값 수평 유지 → 칸 안에서 새 값) · 좌표 소수 1자리', () => {
    const pts: PricePoint[] = [
      [at('15:20:00'), 100],
      [at('15:30:00'), 110],
      [at('16:00:00'), 120],
    ];
    const view = { t0: T0, t1: T0 + 11 * H };
    const d = pricePathOf(pts, view, xOfView(view, 52, 640), (p) => 300 - p);
    expect(cmds(d)).toEqual(['M', 'H', 'H', 'L', 'M', 'H']);
    expect(d).toMatch(/^M\d+\.\d,200\.0H\d+\.\dH\d+\.\dL\d+\.\d,190\.0M\d+\.\d,180\.0H\d+\.\d$/);
    const x = xOfView(view, 52, 640);
    // 15:20 칸을 수평으로 채우고 · 15:30 칸 시작까지 100 유지 · 15:30:10(칸 끝)에 110
    expect(d.startsWith(`M${x(at('15:20:00')).toFixed(1)},200.0H${x(at('15:20:10')).toFixed(1)}H${x(at('15:30:00')).toFixed(1)}L${x(at('15:30:10')).toFixed(1)},190.0`)).toBe(true);
  });

  it('pricePathOf — 이웃 칸(10초 간격)은 수평 없이 칸 끝으로 바로 L · 팀 주문(칸 안 시각 · 앞 값과 새 값 사이 가격)이 선 위에 온다', () => {
    const pts: PricePoint[] = [
      [at('09:44:00'), 24_100],
      [at('09:44:10'), 24_600],
    ];
    const view = { t0: at('09:40:00'), t1: at('09:50:00') };
    const x = xOfView(view, 52, 640);
    const d = pricePathOf(pts, view, x, (p) => p / 100);
    // 09:44:00 칸 = 241 수평 · 09:44:10 칸 안에서 246 으로 — 09:44:12 · 24,200 체결은 이 L 선분 위에 있다
    const f = (t: string) => x(at(t)).toFixed(1);
    expect(d).toBe(`M${f('09:44:00')},241.0H${f('09:44:10')}L${f('09:44:20')},246.0`);
  });

  it('pricePathOf — 팀 주문(orders)은 그 시각 · 가격 꼭짓점 → 원이 선 위 · 같은 칸 안이면 칸 끝 값으로 이어진다 · 창 밖 주문은 없다', () => {
    const pts: PricePoint[] = [
      [at('09:41:50'), 24_100],
      [at('09:44:10'), 24_600],
    ];
    const orders: AccumReportOrders = {
      ...EMPTY_ORDERS,
      t_ms: [at('09:44:12'), at('09:44:13'), at('12:00:00')],
      px: [24_250, 24_500, 99_999],
    };
    const view = { t0: at('09:40:00'), t1: at('09:50:00') };
    const x = xOfView(view, 52, 640);
    const f = (t: string) => x(at(t)).toFixed(1);
    const d = pricePathOf(pts, view, x, (p) => p / 100, 10_000, orders);
    // 24,100 을 09:44:10(주문이 든 칸 시작)까지 유지 → 09:44:12 · 242.5 → 09:44:13 · 245 → 칸 끝 09:44:20 · 246
    expect(d).toBe(
      `M${f('09:41:50')},241.0H${f('09:42:00')}H${f('09:44:10')}L${f('09:44:12')},242.5L${f('09:44:13')},245.0L${f('09:44:20')},246.0`,
    );
  });

  it('pricePathOf — 창 ±30분 밖 점은 경로에 없다(이진 탐색 자르기)', () => {
    const pts: PricePoint[] = [
      [at('09:00:00'), 1],
      [at('09:29:00'), 2],
      [at('09:31:00'), 3],
      [at('10:30:00'), 4],
      [at('11:29:00'), 5],
      [at('11:31:00'), 6],
    ];
    const view = { t0: at('10:00:00'), t1: at('11:00:00') };
    const d = pricePathOf(pts, view, xOfView(view, 52, 640), (p) => p);
    // 09:31 · 10:30 · 11:29 만 남는다(09:31 → 10:30 간격 59분 = 끊김)
    expect(d.match(/,(\d+)\.\d/g)).toEqual([',3.0', ',4.0', ',5.0']);
    expect(cmds(d)).toEqual(['M', 'H', 'M', 'H', 'M', 'H']);
  });

  it('priceRangeOf — 보이는 가격 [100, 120] ∪ 보이는 주문 px 130 → [100, 130] · 여유 8%', () => {
    const view = { t0: at('10:00:00'), t1: at('11:00:00') };
    const pts: PricePoint[] = [
      [at('09:00:00'), 50], // 창 밖 — 범위에 안 든다
      [at('10:10:00'), 100],
      [at('10:20:00'), 120],
    ];
    const orders: AccumReportOrders = {
      ...EMPTY_ORDERS,
      t_ms: [at('10:15:00'), at('12:00:00')],
      px: [130, 999],
    };
    const r = priceRangeOf(pts, orders, view);
    expect(r.min).toBe(100);
    expect(r.max).toBe(130);
    expect(r.lo).toBeCloseTo(100 - 30 * 0.08, 6);
    expect(r.hi).toBeCloseTo(130 + 30 * 0.08, 6);
  });

  it('priceRangeOf — 보이는 점 0 → 하루 전체 min/max · 유한 수(NaN 금지) · 범위 0 이면 max × 0.5%', () => {
    const pts: PricePoint[] = [
      [at('09:10:00'), 200],
      [at('09:20:00'), 240],
    ];
    const r = priceRangeOf(pts, EMPTY_ORDERS, { t0: at('18:00:00'), t1: at('19:00:00') });
    expect([r.min, r.max]).toEqual([200, 240]);
    expect(Number.isFinite(r.lo) && Number.isFinite(r.hi)).toBe(true);
    const flat = priceRangeOf([[at('09:10:00'), 1000]], EMPTY_ORDERS, { t0: T0, t1: T0 + 11 * H });
    expect(flat.lo).toBeCloseTo(995, 6);
    expect(flat.hi).toBeCloseTo(1005, 6);
    const none = priceRangeOf([], EMPTY_ORDERS, { t0: T0, t1: T0 + 11 * H });
    expect(Number.isFinite(none.lo) && Number.isFinite(none.hi) && none.hi > none.lo).toBe(true);
  });

  it('한선엔지니어링(price 3,648칸) — 전체 창 경로에 NaN 없음 · M 2개 이상(15:30~16:00 끊김)', () => {
    const row = accumDetailRows().find((r) => r.isin === HANSUN)!;
    const price = row.payload!.price;
    expect(price.idx).toHaveLength(3648);
    const pts = pricePointsOf(price);
    const { T0: t0, T2000 } = dayBoundsOf(price.t0_ms);
    const view = clampView({ t0, t1: T2000 }, t0, T2000);
    const r = priceRangeOf(pts, row.payload!.orders, view);
    const y = (p: number) => 16 + ((r.hi - p) / (r.hi - r.lo)) * 200;
    const d = pricePathOf(pts, view, xOfView(view, 52, 640), y);
    expect(d).not.toMatch(/NaN|Infinity/);
    expect(cmds(d).filter((c) => c === 'M').length).toBeGreaterThanOrEqual(2);
  });

  it('priceTicksOf(IN-06) — 5등분 반올림 · 같은 값은 하나(상한가 잠김 창 = 글자 1개) · 오름차순', () => {
    expect(priceTicksOf({ min: 100, max: 140 })).toEqual([100, 110, 120, 130, 140]);
    expect(priceTicksOf({ min: 12_000, max: 12_000 })).toEqual([12_000]);
    expect(priceTicksOf({ min: 1000, max: 1002 })).toEqual([1000, 1001, 1002]);
  });

  it('priceClipOf(WR-01) — x [L, W − R] · y 가격 판 [TOP, TOP + H1] ± 원 최대 반지름 7 · 누적 판 위끝(240) 안 넘음', () => {
    const c = priceClipOf(52, 640);
    expect(c).toEqual({ x: 52, y: 16 - 7, w: 640 - 56 - 52, h: 200 + 14 });
    expect(c.y + c.h).toBeLessThan(ACCUM_CHART.TOP + ACCUM_CHART.H1 + ACCUM_CHART.GAP);
    expect(priceClipOf(60, 100).w).toBe(0); // 폭이 L + R 보다 좁으면 0(음수 금지)
    // 재현: 창 끝 바로 밖 가격이 크게 다르면 경로 y 가 판 밖으로 나간다 — 그래서 클립이 필요하다
    const pts: PricePoint[] = [
      [at('09:59:50'), 12_000],
      [at('10:00:00'), 13_000],
    ];
    const view = { t0: at('09:50:00'), t1: at('09:59:55') };
    const r = priceRangeOf(pts, EMPTY_ORDERS, view);
    const y = (p: number) => 16 + ((r.hi - p) / (r.hi - r.lo)) * 200;
    const ys = (pricePathOf(pts, view, xOfView(view, 52, 640), y).match(/,(-?\d+\.\d)/g) ?? []).map((s) => Number(s.slice(1)));
    expect(Math.min(...ys)).toBeLessThan(c.y);
  });
});

const FULL = { t0: T0, t1: T0 + 11 * H };

describe('accum-chart — 주문 원 (D-15)', () => {
  it('orderRadiusOf — 1천만 ≈ 2.7 · 1억 ≈ 3.78 · 10억 이상 7 · 0 = 2.2', () => {
    expect(orderRadiusOf(1e7)).toBeCloseTo(2.7, 1);
    expect(Math.abs(orderRadiusOf(1e7) - 2.7)).toBeLessThan(0.05);
    expect(orderRadiusOf(1e8)).toBeCloseTo(3.78, 2);
    expect(orderRadiusOf(1e9)).toBe(7);
    expect(orderRadiusOf(1e12)).toBe(7);
    expect(orderRadiusOf(0)).toBe(2.2);
  });

  it('orderCirclesOf — 큰 원부터(반지름 내림차순) · first 는 맨 뒤 · 창 ±30분 밖 · 결측 좌표 제외', () => {
    const view = { t0: at('10:00:00'), t1: at('11:00:00') };
    const orders: AccumReportOrders = {
      t_ms: [at('10:01:00'), at('10:02:00'), at('10:03:00'), at('10:04:00'), at('11:31:00'), at('10:05:00')],
      side: ['B', 'S', 'B', 'B', 'B', 'S'],
      qty: [10, 20, 30, 1, 5, 7],
      val: [1e7, 1e9, 1e8, 1e6, 1e9, Number.NaN],
      px: [100, 101, 102, 99, 103, Number.NaN],
      pieces: [1, 2, 3, 1, 1, 1],
      first: [0, 0, 0, 1, 0, 0],
    };
    const c = orderCirclesOf(orders, view, xOfView(view, 52, 640), (p) => p);
    expect(c.map((o) => o.cy)).toEqual([101, 102, 100, 99]);
    expect(c.map((o) => o.first)).toEqual([false, false, false, true]);
    expect(c[0]!.r).toBe(7);
    expect(c[0]!.side).toBe('S');
    expect(c[0]!.title).toBe('10:02:00 팀 매도 20주 · 10.00억 @101 · 2조각');
  });

  it('천일고속 first 원 — title 「09:01:00 팀 매수 9주 · 0.02억 @…조각 · 팀매수 시작」 · 맨 마지막', () => {
    const row = accumDetailRows().find((r) => r.isin === CHEONIL)!;
    const c = orderCirclesOf(row.payload!.orders, FULL, xOfView(FULL, 52, 640), (p) => p);
    expect(c).toHaveLength(45);
    const last = c[c.length - 1]!;
    expect(last.first).toBe(true);
    expect(last.title.startsWith('09:01:00 팀 매수 9주 · 0.02억 @')).toBe(true);
    expect(last.title.endsWith('조각 · 팀매수 시작')).toBe(true);
    expect(last.title).toBe('09:01:00 팀 매수 9주 · 0.02억 @174,300 · 1조각 · 팀매수 시작');
  });

  it('orders 빈 배열 → [] · throw 없음', () => {
    expect(orderCirclesOf(EMPTY_ORDERS, FULL, xOfView(FULL, 52, 640), (p) => p)).toEqual([]);
  });
});

describe('accum-chart — 순매수 누적 계단 (D-14 · 고정 범위)', () => {
  const cum = { t_ms: [at('09:10:00'), at('10:00:00'), at('11:00:00')], net_krw: [1e8, -5e7, 2e8] };

  it('cumRangeOf — 하루 전체 min/max(0 포함)', () => {
    expect(cumRangeOf(cum)).toEqual({ min: -5e7, max: 2e8 });
    expect(cumRangeOf({ t_ms: [at('09:10:00')], net_krw: [3e8] })).toEqual({ min: 0, max: 3e8 });
    expect(cumRangeOf({ t_ms: [], net_krw: [] })).toEqual({ min: 0, max: 0 });
  });

  it('cumTicksOf — 0 과 12px 미만으로 붙은 끝값 글자는 뺀다(0 글자 우선 · 오름차순)', () => {
    const r1 = cumRangeOf(cum); // −0.5억 ~ 2억 → 0 과 −0.5억 간격 = 112 × 0.5/2.5 = 22.4px
    expect(cumTicksOf(r1, yOfCum(r1))).toEqual([-5e7, 0, 2e8]);
    const r2 = { min: -3e7, max: 2.28e9 }; // 한선엔지니어링 실측급 −0.3억 ~ +22.8억 → −0.3억 간격 ≈ 1.5px
    expect(cumTicksOf(r2, yOfCum(r2))).toEqual([0, 2.28e9]);
    const r3 = { min: 0, max: 0 };
    expect(cumTicksOf(r3, yOfCum(r3))).toEqual([0]);
  });

  it('cumPathOf — M x0,y(0) L x0,y0 → H/V 계단 → 끝 H x(T2000) · 창을 좁혀도 y(0) 같다', () => {
    const yC = yOfCum(cumRangeOf(cum));
    const { T2000 } = dayBoundsOf(T0);
    const d1 = cumPathOf(cum, xOfView(FULL, 52, 640), yC, T2000);
    expect(cmds(d1)).toEqual(['M', 'L', 'H', 'V', 'H', 'V', 'H']);
    const y0 = yC(0).toFixed(1);
    expect(d1.startsWith('M')).toBe(true);
    expect(d1.split('L')[0]!.endsWith(`,${y0}`)).toBe(true);
    // 0 은 [−0.5억, 2억] 의 아래 1/5 지점 → 누적 판(240~352) 안
    expect(yC(0)).toBeCloseTo(240 + (2e8 / 2.5e8) * 112, 6);
    expect(d1.endsWith(`H${xOfView(FULL, 52, 640)(T2000).toFixed(1)}`)).toBe(true);
    const narrow = { t0: at('10:00:00'), t1: at('10:30:00') };
    const d2 = cumPathOf(cum, xOfView(narrow, 52, 640), yC, T2000);
    expect(d2.split('L')[0]!.endsWith(`,${y0}`)).toBe(true);
    expect(d2.match(/V([\d.]+)/g)).toEqual(d1.match(/V([\d.]+)/g));
  });

  it('day_cum_net 빔 → 빈 경로', () => {
    const yC = yOfCum(cumRangeOf({ t_ms: [], net_krw: [] }));
    expect(cumPathOf({ t_ms: [], net_krw: [] }, xOfView(FULL, 52, 640), yC, T0 + 11 * H)).toBe('');
  });
});

describe('accum-chart — 10분 막대 (D-14 · 창 기준 폭 · 하루 최대 고정)', () => {
  const buckets = [
    { slot: 0, buy_krw: 1e8, sell_krw: 0 },
    { slot: 3, buy_krw: 5e7, sell_krw: 2e8 },
  ];
  const bTop = 376;

  it('bucketMaxOf — 매수 · 매도 중 하루 최대 · 빈 배열 0', () => {
    expect(bucketMaxOf(buckets)).toBe(2e8);
    expect(bucketMaxOf([])).toBe(0);
  });

  it('bucketBarsOf — slot k 의 x = x(T0 + k × 10분) · 폭 = 칸 × 0.42 · 0 값 막대 없음 · title', () => {
    const x = xOfView(FULL, 52, 640);
    const bars = bucketBarsOf(buckets, FULL, x, T0, bTop, 72);
    expect(bars.map((b) => b.slot)).toEqual([0, 3]);
    const slotW = x(T0 + 10 * M) - x(T0);
    const [b0, b3] = bars as [(typeof bars)[0], (typeof bars)[0]];
    expect(b0.hit.x).toBeCloseTo(x(T0), 6);
    expect(b0.hit.w).toBeCloseTo(slotW, 6);
    expect(b0.hit.y).toBe(bTop);
    expect(b0.hit.h).toBe(72);
    expect(b0.buy!.w).toBeCloseTo(slotW * 0.42, 6);
    expect(b0.sell).toBeNull();
    expect(b3.hit.x).toBeCloseTo(x(T0 + 30 * M), 6);
    expect(b3.sell!.h).toBeCloseTo(72, 6);
    expect(b3.sell!.y).toBeCloseTo(bTop, 6);
    expect(b3.buy!.h).toBeCloseTo(18, 6);
    expect(b3.buy!.y).toBeCloseTo(bTop + 72 - 18, 6);
    expect(b3.sell!.x).toBeGreaterThan(b3.buy!.x);
    expect(b0.title).toBe('09:00~09:10 팀 매수 1.00억 · 팀 매도 0.00억');
    expect(b3.title).toBe('09:30~09:40 팀 매수 0.50억 · 팀 매도 2.00억');
  });

  it('창을 반으로 좁히면 막대 폭 2배 · 높이(하루 최대 기준)는 같다 · 최소 폭 1.5', () => {
    const half = { t0: T0, t1: T0 + 5.5 * H };
    const a = bucketBarsOf(buckets, FULL, xOfView(FULL, 52, 640), T0, bTop, 72);
    const b = bucketBarsOf(buckets, half, xOfView(half, 52, 640), T0, bTop, 72);
    expect(b[1]!.buy!.w / a[1]!.buy!.w).toBeCloseTo(2, 6);
    expect(b[1]!.buy!.h).toBeCloseTo(a[1]!.buy!.h, 6);
    // 그림 폭 66 → 칸 1px → 막대 1.5
    const tiny = bucketBarsOf(buckets, FULL, xOfView(FULL, 52, 52 + 66 + 56), T0, bTop, 72);
    expect(tiny[0]!.buy!.w).toBe(1.5);
  });

  it('buckets [] → [] · throw 없음', () => {
    expect(bucketBarsOf([], FULL, xOfView(FULL, 52, 640), T0, bTop, 72)).toEqual([]);
  });
});

describe('accum-chart — 빈 띠 · 등록 전 음영 (D-14 · D-16 · Pitfall 15)', () => {
  it('gapBandOf = [T1530, T1600] 의 x 구간', () => {
    const b = dayBoundsOf(T0);
    const x = xOfView(FULL, 52, 640);
    const g = gapBandOf(b, x);
    expect(g.x).toBeCloseTo(x(b.T1530), 6);
    expect(g.w).toBeCloseTo(x(b.T1600) - x(b.T1530), 6);
  });

  it('shadeOf — 오늘 등록 · 첫 사이클 reg 09:57:20 → [T0, reg]', () => {
    const row = accumDetailRows().find((r) => r.isin === CHEONIL)!;
    expect(shadeOf(row, row.payload!, T0)).toEqual({ t0: T0, t1: at('09:57:20') });
  });

  it('shadeOf — 이월(since < date) → null · reg null → null · reg < T0 → [T0, T0](폭 0)', () => {
    const carry = accumSyntheticDetail('carry');
    expect(shadeOf(carry, carry.payload!, T0)).toBeNull();
    const row = accumDetailRows().find((r) => r.isin === CHEONIL)!;
    const noReg = { ...row.payload!, cycles: [{ ...row.payload!.cycles[0]!, reg_time_ms: null }] };
    expect(shadeOf(row, noReg, T0)).toBeNull();
    expect(shadeOf(row, { cycles: [] }, T0)).toBeNull();
    const pre = accumSyntheticDetail('preOpenReg');
    expect(shadeOf(pre, pre.payload!, T0)).toEqual({ t0: T0, t1: T0 });
  });
});

describe('accum-chart — 사이클 세로선 (D-16 · CR-01 · Pitfall 13)', () => {
  it('multiCycle(cycle 값 1, 1) → k = 1, 2(나온 순서) · 「등록 09:12 · 1」 · 「청산 11:32」 · 「등록 13:05 · 2」 · 둘째 종료선 없음', () => {
    const row = accumSyntheticDetail('multiCycle');
    expect(row.payload!.cycles.map((c) => c.cycle)).toEqual([1, 1]);
    const m = cycleMarksOf(row, row.payload!, T0);
    expect(m.map((c) => c.k)).toEqual([1, 2]);
    expect(m[0]!.reg).toEqual({ t: at('09:12:40'), tx: at('09:12:40'), label: '등록 09:12 · 1', title: '사이클 1 등록 09:12:40' });
    expect(m[0]!.end).toEqual({ t: at('11:32:04'), tx: at('11:32:04'), label: '청산 11:32', title: '사이클 1 청산 11:32:04' });
    expect(m[1]!.reg!.label).toBe('등록 13:05 · 2');
    expect(m[1]!.reg!.title).toBe('사이클 2 등록 13:05:20');
    expect(m[1]!.end).toBeNull();
  });

  it('사이클 1개 오늘 등록 09:57:20 → 「등록 09:57」(번호 없음) · title 「사이클 1 등록 09:57:20」', () => {
    const row = accumDetailRows().find((r) => r.isin === CHEONIL)!;
    const m = cycleMarksOf(row, row.payload!, T0);
    expect(m).toHaveLength(1);
    expect(m[0]!.reg!.label).toBe('등록 09:57');
    expect(m[0]!.reg!.title).toBe('사이클 1 등록 09:57:20');
    expect(m[0]!.end).toBeNull();
  });

  it('cycles 0 → 선 없음', () => {
    const row = accumDetailRows().find((r) => r.isin === CHEONIL)!;
    expect(cycleMarksOf(row, { cycles: [] }, T0)).toEqual([]);
  });

  it('carry → 등록선 없음 · 종료선 「청산 14:56」', () => {
    const row = accumSyntheticDetail('carry');
    const m = cycleMarksOf(row, row.payload!, T0);
    expect(m[0]!.reg).toBeNull();
    expect(m[0]!.end!.label).toBe('청산 14:56');
    expect(m[0]!.end!.title).toBe('사이클 1 청산 14:56:30');
  });

  it('drop0600 → 종료선 x 기준 = T0(왼쪽 끝) · 라벨은 원래 시각 「이월 탈락(복원 안 됨) 06:00」', () => {
    const row = accumSyntheticDetail('drop0600');
    const m = cycleMarksOf(row, row.payload!, T0);
    expect(m[0]!.reg).toBeNull();
    expect(m[0]!.end!.tx).toBe(T0);
    expect(m[0]!.end!.t).toBe(at('06:00:00'));
    expect(m[0]!.end!.label).toBe('이월 탈락(복원 안 됨) 06:00');
    expect(m[0]!.end!.title).toBe('사이클 1 이월 탈락(복원 안 됨) 06:00:00');
  });

  it('preOpenReg 08:41 → 등록선 x 기준 = T0 · 라벨 「등록 08:41」', () => {
    const row = accumSyntheticDetail('preOpenReg');
    const m = cycleMarksOf(row, row.payload!, T0);
    expect(m[0]!.reg!.tx).toBe(T0);
    expect(m[0]!.reg!.label).toBe('등록 08:41');
  });

  it('reg_time_ms · end_time_ms null → 그 선 없음', () => {
    const row = accumDetailRows().find((r) => r.isin === CHEONIL)!;
    const c = { ...row.payload!.cycles[0]!, reg_time_ms: null, end_time_ms: null };
    expect(cycleMarksOf(row, { cycles: [c] }, T0)).toEqual([{ k: 1, reg: null, end: null }]);
  });
});

describe('accum-chart — 이월 줄 (D-16)', () => {
  it('carryLineOf — 「이월 D+2 · 10/10 09:20 등록」 · reg null 「이월 D+2 · 10/10 등록」 · 오늘 등록 null', () => {
    const carry = accumSyntheticDetail('carry');
    expect(carryLineOf(carry)).toBe('이월 D+2 · 10/10 09:20 등록');
    expect(carryLineOf({ ...carry, reg_time_ms: null })).toBe('이월 D+2 · 10/10 등록');
    expect(carryLineOf(accumDetailRows().find((r) => r.isin === CHEONIL)!)).toBeNull();
  });
});

describe('accum-chart — 시각 눈금 (D-14 · 28px 규칙)', () => {
  it('전체 창 · 그림 폭 1000 → 1시간 간격 「9」…「20」', () => {
    const t = ticksOf(FULL, 1000);
    expect(t.map((k) => k.label)).toEqual(['9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']);
    expect(t[0]!.t).toBe(T0);
  });

  it('전체 창 · 그림 폭 202 → 2시간 간격(1h 간격 18px < 28)', () => {
    const t = ticksOf(FULL, 202);
    expect(t.length).toBeGreaterThanOrEqual(5);
    const steps = new Set(t.slice(1).map((k, i) => k.t - t[i]!.t));
    expect([...steps]).toEqual([2 * H]);
    expect(t.every((k) => /^\d{1,2}$/.test(k.label))).toBe(true);
  });

  it('30분 창 → 5분 간격 · 정시 「10」 · 그 밖 「10:05」 꼴', () => {
    const t = ticksOf({ t0: at('10:00:00'), t1: at('10:30:00') }, 500);
    expect(t.map((k) => k.label)).toEqual(['10', '10:05', '10:10', '10:15', '10:20', '10:25', '10:30']);
  });
});

describe('accum-chart — 세로선 라벨 줄 배치 (labelRowsOf)', () => {
  const PL = 52;
  const PR = 584;

  it('labelWidthOf — 한글 11px · 숫자/기호/공백 6.5px', () => {
    expect(labelWidthOf('등록 09:12')).toBeCloseTo(2 * 11 + 6 * 6.5, 6);
  });

  it('0 라벨 → 빈 줄', () => {
    expect(labelRowsOf([], PL, PR)).toEqual([]);
  });

  it('겹치지 않으면 모두 1줄(y 27) · 등록은 선 오른쪽(start) · 종료는 선 왼쪽(end)', () => {
    const p = labelRowsOf(
      [
        { id: 'r1', x: 100, text: '등록 09:57', kind: 'reg' },
        { id: 'e1', x: 400, text: '청산 14:56', kind: 'end' },
      ],
      PL,
      PR,
    );
    expect(p.map((l) => [l.id, l.row, l.y, l.anchor, l.textX])).toEqual([
      ['r1', 0, 27, 'start', 104],
      ['e1', 0, 27, 'end', 396],
    ]);
  });

  it('앞 라벨과 4px 안으로 겹치면 다음 줄(+14) · 최대 3줄 · 넘치면 생략', () => {
    const labels = [0, 1, 2, 3].map((i) => ({ id: `r${i}`, x: 100 + i * 5, text: '등록 09:12 · 1', kind: 'reg' as const }));
    const p = labelRowsOf(labels, PL, PR);
    expect(p.map((l) => [l.id, l.row, l.y])).toEqual([
      ['r0', 0, 27],
      ['r1', 1, 41],
      ['r2', 2, 55],
    ]);
  });

  it('오른쪽 끝을 넘는 등록 라벨은 선 왼쪽 · 왼쪽 끝 종료 라벨은 선 오른쪽', () => {
    const p = labelRowsOf(
      [
        { id: 'e0', x: PL, text: '이월 탈락(복원 안 됨) 06:00', kind: 'end' },
        { id: 'r9', x: PR - 10, text: '등록 19:50', kind: 'reg' },
      ],
      PL,
      PR,
    );
    expect(p.find((l) => l.id === 'e0')).toMatchObject({ anchor: 'start', textX: PL + 4 });
    expect(p.find((l) => l.id === 'r9')).toMatchObject({ anchor: 'end', textX: PR - 14 });
  });

  it('이월 줄이 1줄 왼쪽 자리를 먼저 차지 → 왼쪽 끝 종료 라벨은 2줄', () => {
    const p = labelRowsOf(
      [{ id: 'e0', x: PL, text: '이월 탈락(복원 안 됨) 06:00', kind: 'end' }],
      PL,
      PR,
      '이월 D+1 · 10/13 13:30 등록',
    );
    expect(p).toEqual([
      expect.objectContaining({ id: 'e0', row: 1, y: 41, anchor: 'start' }),
    ]);
  });
});

describe('accum-chart — 보기 창 조작 (D-14 · 34-07 프리셋 · 확대/축소 · 이동)', () => {
  const B = dayBoundsOf(T0);

  it('lastTradeMsOf — 마지막 idx 칸 시각(천일 15:30:00 · 한선 19:59:50) · idx 빔이면 null', () => {
    const rows = accumDetailRows();
    expect(lastTradeMsOf(rows.find((r) => r.isin === CHEONIL)!.payload!.price)).toBe(at('15:30:00'));
    expect(lastTradeMsOf(rows.find((r) => r.isin === HANSUN)!.payload!.price)).toBe(at('19:59:50'));
    expect(lastTradeMsOf(accumSyntheticDetail('noPrice').payload!.price)).toBeNull();
  });

  it('presetOf — full [T0, T2000] · reg [T0, T1530] · last2h [끝 − 2h, 끝] · 끝이 T0 + 2h 안이면 [T0, 끝 → 최소 폭]', () => {
    expect(presetOf('full', B, at('19:58:30'))).toEqual({ t0: T0, t1: B.T2000 });
    expect(presetOf('reg', B, at('19:58:30'))).toEqual({ t0: T0, t1: B.T1530 });
    expect(presetOf('last2h', B, at('19:58:30'))).toEqual({ t0: at('17:58:30'), t1: at('19:58:30') });
    expect(presetOf('last2h', B, at('10:00:00'))).toEqual({ t0: T0, t1: at('10:00:00') });
    // 끝이 09:05 면 폭 5분 → clampView 가 10분으로 넓힌다
    expect(presetOf('last2h', B, at('09:05:00'))).toEqual({ t0: T0, t1: T0 + 10 * M });
    // 끝 null(체결 없음)이면 전체로 폴백(버튼은 disabled)
    expect(presetOf('last2h', B, null)).toEqual({ t0: T0, t1: B.T2000 });
  });

  it('zoomAt — tc 기준 k 배(tc 의 상대 위치 유지) · panBy — 양 끝 +dt', () => {
    const v = { t0: T0, t1: T0 + 4 * H };
    expect(zoomAt(v, T0 + H, 0.5)).toEqual({ t0: T0 + 0.5 * H, t1: T0 + 2.5 * H });
    expect(zoomAt(v, T0 + 2 * H, 2)).toEqual({ t0: T0 - 2 * H, t1: T0 + 6 * H });
    expect(panBy(v, 30 * M)).toEqual({ t0: T0 + 30 * M, t1: T0 + 4 * H + 30 * M });
    expect(panBy(v, -30 * M)).toEqual({ t0: T0 - 30 * M, t1: T0 + 4 * H - 30 * M });
  });

  it('fmtViewRange — 「HH:MM ~ HH:MM」(KST)', () => {
    expect(fmtViewRange({ t0: T0, t1: B.T2000 })).toBe('09:00 ~ 20:00');
    expect(fmtViewRange({ t0: at('13:30:00'), t1: at('15:30:00') })).toBe('13:30 ~ 15:30');
  });
});

describe('accum-chart — 팀 평단 계단 (quick-261021-amg · WinForms AccumChartPanel 동형)', () => {
  /** x = 분 = px · range 100~120(여유 0) → y(110) 116 · y(120) 16 · y(100) 216. */
  const xm = (t: number) => (t - T0) / M;
  const R = { min: 100, max: 120, lo: 100, hi: 120 };
  const m = (n: number) => T0 + n * M;
  const pts = (...a: [number, number][]): PricePoint[] => a.map(([n, p]) => [m(n), p]);
  const path = (p: PricePoint[], endMin: number) => avgPxPathOf(p, xm, R, T0, m(endMin));

  it('avgPxPointsOf — 결측 · null · 숫자 · 배열 · t_ms/px 가 배열 아님 → []', () => {
    const bad: unknown[] = [undefined, null, 5, [], { t_ms: 'x', px: [] }, { t_ms: [1], px: 'y' }];
    expect(avgPxPointsOf({})).toEqual([]);
    for (const v of bad) {
      expect(avgPxPointsOf({ avg_px: v } as unknown as Pick<AccumReportPayload, 'avg_px'>)).toEqual([]);
    }
  });

  it('avgPxPointsOf — NaN · null 요소 건너뜀 · 같은 ms 순서 유지 · 정렬 안 함 · 길이 다르면 짧은 쪽까지', () => {
    const [a, b, c] = [m(10), m(20), m(30)];
    expect(avgPxPointsOf({ avg_px: { t_ms: [a, b, b, c], px: [110, 120, 0, Number.NaN] } })).toEqual([
      [a, 110],
      [b, 120],
      [b, 0],
    ]);
    expect(
      avgPxPointsOf({ avg_px: { t_ms: [a, null, c], px: [110, 115, 120] } as unknown as AccumReportPayload['avg_px'] }),
    ).toEqual([
      [a, 110],
      [c, 120],
    ]);
    // 정렬하지 않는다(배열 순서가 정본)
    expect(avgPxPointsOf({ avg_px: { t_ms: [c, a], px: [110, 120] } })).toEqual([
      [c, 110],
      [a, 120],
    ]);
    expect(avgPxPointsOf({ avg_px: { t_ms: [a, b, c], px: [110] } })).toEqual([[a, 110]]);
  });

  it('실측 천일(avg_px 없음) · avg_px 불량 → payloadOf 는 행을 남기고 avgPxPointsOf 만 [](선만 빠진다)', () => {
    const row = accumDetailRows().find((r) => r.isin === CHEONIL)!;
    expect(row.payload!.avg_px).toBeUndefined();
    expect(payloadOf(row)).not.toBeNull();
    expect(avgPxPointsOf(row.payload!)).toEqual([]);
    const bad = { ...row, payload: { ...row.payload!, avg_px: 'bad' } } as unknown as AccumDetailRow;
    expect(payloadOf(bad)).not.toBeNull();
    expect(avgPxPointsOf(bad.payload!)).toEqual([]);
  });

  it('avgPxPathOf — 계단(수평 → 수직) · 0 에서 끊김', () => {
    expect(path(pts([60, 110], [120, 120], [180, 0]), 300)).toBe('M60.0,116.0H120.0V16.0H180.0');
  });

  it('avgPxPathOf — 0 뒤 다음 양수 점에서 새로 시작 · 열린 끝은 endMs 까지', () => {
    expect(path(pts([60, 110], [120, 0], [180, 100]), 300)).toBe('M60.0,116.0H120.0M180.0,216.0H300.0');
  });

  it('avgPxPathOf — 같은 ms 두 점(종료 값 → 0)은 배열 순서대로', () => {
    expect(path(pts([60, 110], [120, 120], [120, 0]), 300)).toBe('M60.0,116.0H120.0V16.0H120.0');
  });

  it('avgPxPathOf — 09:00 미만 점은 09:00 · 여럿이면 마지막 점만', () => {
    expect(path(pts([-180, 105], [-179, 110], [60, 120]), 120)).toBe('M0.0,116.0H60.0V16.0H120.0');
    expect(path(pts([-180, 110], [-180, 0]), 120)).toBe('');
  });

  it('avgPxPathOf — 가격축 범위 밖은 판 위/아래 끝으로 클램프', () => {
    expect(path(pts([60, 50], [120, 500]), 180)).toBe('M60.0,216.0H120.0V16.0H180.0');
  });

  it('avgPxPathOf — 끝은 마지막 점보다 앞으로 가지 않음 · 빈/0 만 → \'\' · 음수 px 는 0 처럼 끊음', () => {
    expect(path(pts([60, 110]), 30)).toBe('M60.0,116.0H60.0');
    expect(path([], 300)).toBe('');
    expect(path(pts([60, 0]), 300)).toBe('');
    expect(path(pts([60, 110], [120, -1]), 300)).toBe('M60.0,116.0H120.0');
  });
});

describe('마우스 툴팁(2026-10-23 · gh-trade AccumChartPanel · AccumBucketChart 동형)', () => {
  const orders: AccumReportOrders = {
    t_ms: [at('10:00:00'), at('10:00:05'), at('10:30:00')],
    side: ['B', 'B', 'S'],
    qty: [100, 50, 80],
    val: [2_000_000_000, 10_000_000, 1_600_000],
    px: [20_000, 20_000, 20_500],
    pieces: [3, 1, 1],
    first: [1, 0, 0],
  };
  const view = { t0: at('09:30:00'), t1: at('11:00:00') };
  const x = xOfView(view, 52, 640);
  const circles = orderCirclesOf(orders, view, x, (p) => 220 - (p - 19_000) / 10);
  const payload = {
    orders,
    day_cum_net: { t_ms: [at('10:00:00'), at('10:00:05'), at('10:30:00')], net_krw: [200_000_000, 210_000_000, 194_000_000] },
    avg_px: { t_ms: [at('10:00:00'), at('10:30:00')], px: [19_800, 0] },
  } as Pick<AccumReportPayload, 'orders' | 'day_cum_net' | 'avg_px'>;

  it('tOfView = xOfView 의 역', () => {
    expect(tOfView(view, 52, 640)(x(at('10:15:00')))).toBeCloseTo(at('10:15:00'), 3);
  });

  it('nearestOrderOf — 세로선이 「반지름 + 2」 안에 지나는 원 중 세로로 가장 가까운 것 · 가격 판(16~216) 밖 · 멀면 null · 원래 번호 i', () => {
    const big = circles.find((c) => c.i === 0)!;
    expect(nearestOrderOf(circles, big.cx + big.r + 1.5, big.cy + 30)?.i).toBe(0);
    expect(nearestOrderOf(circles, big.cx + big.r + 3, big.cy)?.i ?? null).not.toBe(0);
    expect(nearestOrderOf(circles, big.cx, 230)).toBeNull();
    expect(nearestOrderOf(circles, 600, 100)).toBeNull();
  });

  it('orderTipOf — 원 title + 「순매수 누적(그 주문 포함) · 등락률(기준가) · 평단 대비(그 시각 평단)」 · 모르는 항목은 뺀다', () => {
    const c0 = circles.find((c) => c.i === 0)!;
    expect(orderTipOf(payload, { base: 18_000 }, c0)).toEqual([
      '10:00:00 팀 매수 100주 · 20.00억 @20,000 · 3조각 · 팀매수 시작',
      '순매수 누적 +2.00억 · 등락률 +11.11% · 평단 대비 +1.01%',
    ]);
    // 평단 0(포지션 없음) · 기준가 없음 → 순매수 누적만
    const c2 = circles.find((c) => c.i === 2)!;
    expect(orderTipOf(payload, { base: null }, c2)).toEqual([c2.title, '순매수 누적 +1.94억']);
    // 누적 점도 없으면 1줄
    expect(orderTipOf({ ...payload, day_cum_net: { t_ms: [], net_krw: [] } }, { base: null }, c2)).toEqual([c2.title]);
  });

  it('quick-261026-01h orderTipOf { dayAxis } — 둘째 줄 첫 항목만 「당일 순매수 ±X.XX억」 · 옵션 없음 그대로', () => {
    const c0 = circles.find((c) => c.i === 0)!;
    expect(orderTipOf(payload, { base: 18_000 }, c0, { dayAxis: true })).toEqual([
      '10:00:00 팀 매수 100주 · 20.00억 @20,000 · 3조각 · 팀매수 시작',
      '당일 순매수 +2.00억 · 등락률 +11.11% · 평단 대비 +1.01%',
    ]);
    expect(orderTipOf(payload, { base: 18_000 }, c0, { dayAxis: false })[1]).toBe(
      '순매수 누적 +2.00억 · 등락률 +11.11% · 평단 대비 +1.01%',
    );
  });

  it('quick-261026-01h cumTipAt { dayAxis } (pos_net 없음) — 「HH:MM:SS · 당일 순매수 ±X.XX억[ · 팀 평단 N원]」 · key 그대로', () => {
    expect(cumTipAt(payload, at('10:10:00'), { dayAxis: true })).toEqual({
      key: 'c1',
      lines: ['10:00:05 · 당일 순매수 +2.10억 · 팀 평단 19,800원'],
      circle: null,
    });
    expect(cumTipAt(payload, at('10:40:00'), { dayAxis: true })!.lines).toEqual(['10:30:00 · 당일 순매수 +1.94억']);
  });

  it('cumTipAt — t 이하 마지막 점 「HH:MM:SS · 순매수 누적 · 팀 평단」 · 첫 점 앞 null', () => {
    expect(cumTipAt(payload, at('10:10:00'))).toEqual({
      key: 'c1',
      lines: ['10:00:05 · 순매수 누적 +2.10억 · 팀 평단 19,800원'],
      circle: null,
    });
    expect(cumTipAt(payload, at('10:40:00'))!.lines).toEqual(['10:30:00 · 순매수 누적 +1.94억']);
    expect(cumTipAt(payload, at('09:59:59'))).toBeNull();
  });

  it('bucketTipAt — 그 칸 「HH:MM~HH:MM · 팀 매수 / 매도 / 순」 · 빈 칸 null', () => {
    const buckets = [{ slot: 6, buy_krw: 300_000_000, sell_krw: 120_000_000 }];
    expect(bucketTipAt(buckets, T0, at('10:05:00'))).toEqual({
      key: 'b6',
      lines: ['10:00~10:10 · 팀 매수 3.00억 / 매도 1.20억 / 순 +1.80억'],
      circle: null,
    });
    expect(bucketTipAt(buckets, T0, at('10:10:00'))).toBeNull();
  });
});

describe('포지션 순매수 선(quick-261025-fac · 스케치 017 B)', () => {
  /** x = 분 = px · y = 억(yq) · T2000 → x 660. */
  const xm = (t: number) => (t - T0) / M;
  const yq = (c: number) => c / 1e8;
  const m = (n: number) => T0 + n * M;
  const T2000 = T0 + 11 * H;
  const pp = (...a: [number, number, number, number?][]): PosNetPoint[] =>
    a.map(([n, net, cycle, end = 0]) => ({ t: m(n), net, cycle, end }));
  const path = (p: PosNetPoint[]) => posNetPathOf(p, xm, yq, T0, T2000);
  type PosPick = Pick<AccumReportPayload, 'pos_net'>;
  const ofPos = (v: unknown) => posNetPointsOf({ pos_net: v } as unknown as PosPick);

  it('posNetPointsOf — 키 없음 · null · 문자열 · 숫자 · 배열 · t_ms/net_krw/cycle 중 하나가 배열 아님 → []', () => {
    expect(posNetPointsOf({})).toEqual([]);
    const bad: unknown[] = [
      undefined,
      null,
      'bad',
      5,
      [],
      { t_ms: 'x', net_krw: [], cycle: [] },
      { t_ms: [1], net_krw: 'y', cycle: [1] },
      { t_ms: [1], net_krw: [1] },
    ];
    for (const v of bad) expect(ofPos(v)).toEqual([]);
  });

  it('posNetPointsOf — 길이 다르면 셋 중 최소 · NaN/null 점 건너뜀 · end 없음/배열 아님 → 0 · end 짧음/수 아님 → 그 점 0 · 정렬 안 함', () => {
    const [a, b, c] = [m(10), m(20), m(30)];
    expect(ofPos({ t_ms: [a, b, c], net_krw: [1, 2], cycle: [1, 1, 1] })).toEqual([
      { t: a, net: 1, cycle: 1, end: 0 },
      { t: b, net: 2, cycle: 1, end: 0 },
    ]);
    expect(ofPos({ t_ms: [a, null, c, c], net_krw: [1, 2, Number.NaN, 4], cycle: [1, 1, 1, null] })).toEqual([
      { t: a, net: 1, cycle: 1, end: 0 },
    ]);
    expect(ofPos({ t_ms: [a, b], net_krw: [1, 2], cycle: [1, 2], end: 'x' })).toEqual([
      { t: a, net: 1, cycle: 1, end: 0 },
      { t: b, net: 2, cycle: 2, end: 0 },
    ]);
    expect(ofPos({ t_ms: [a, b, c], net_krw: [1, 2, 3], cycle: [1, 1, 1], end: [4, 'q'] })).toEqual([
      { t: a, net: 1, cycle: 1, end: 4 },
      { t: b, net: 2, cycle: 1, end: 0 },
      { t: c, net: 3, cycle: 1, end: 0 },
    ]);
    // 정렬하지 않는다(배열 순서가 정본)
    expect(ofPos({ t_ms: [c, a], net_krw: [1, 2], cycle: [1, 1] }).map((p) => p.t)).toEqual([c, a]);
  });

  it('실측 천일(pos_net 없음) · pos_net 불량 → payloadOf 는 행을 남기고 posNetPointsOf 만 [](선만 빠진다)', () => {
    const row = accumDetailRows().find((r) => r.isin === CHEONIL)!;
    expect(row.payload!.pos_net).toBeUndefined();
    expect(payloadOf(row)).not.toBeNull();
    expect(posNetPointsOf(row.payload!)).toEqual([]);
    const bad = { ...row, payload: { ...row.payload!, pos_net: 'bad' } } as unknown as AccumDetailRow;
    expect(payloadOf(bad)).not.toBeNull();
    expect(posNetPointsOf(bad.payload!)).toEqual([]);
  });

  it('posNetPathOf — end≠0 점 뒤 끊김 · 사이클 끊김 · 열린 마지막 조각만 20:00', () => {
    expect(
      path(
        pp([13, 1.2e8, 1, 0], [60, 2.5e8, 1, 0], [152, 0.6e8, 1, 1], [190, 1.4e8, 1, 0], [220, 0.5e8, 1, 4], [246, 1.1e8, 2, 0], [300, 1.8e8, 2, 0]),
      ),
    ).toBe('M13.0,1.2H60.0V2.5H152.0V0.6M190.0,1.4H220.0V0.5M246.0,1.1H300.0V1.8H660.0');
  });

  it('posNetPathOf — end 없음 · 사이클로만 끊김 · 09:00 전 점은 왼쪽 끝 · 여럿이면 마지막만', () => {
    expect(
      path(pp([-179, 12.4e8, 1], [-20, 12.6e8, 1], [60, 13e8, 1], [356, 0.5e8, 1], [370, 1.2e8, 2], [420, 1.5e8, 2])),
    ).toBe('M0.0,12.6H60.0V13.0H356.0V0.5M370.0,1.2H420.0V1.5H660.0');
  });

  it('posNetPathOf — 닫힌 마지막 조각은 연장 없음 · 열린 점 하나는 20:00 까지 · 빈 배열 → \'\'', () => {
    expect(path(pp([60, 1e8, 1, 0], [120, 0.5e8, 1, 1]))).toBe('M60.0,1.0H120.0V0.5');
    expect(path(pp([60, 1e8, 1, 0]))).toBe('M60.0,1.0H660.0');
    expect(path([])).toBe('');
  });

  it('cumRangeOf(cum, pos) — 포지션 값도 합친 범위 · 인자 하나는 그대로', () => {
    const cum = { t_ms: [at('09:10:00'), at('09:20:00')], net_krw: [-5e7, 2e8] };
    expect(cumRangeOf(cum, pp([60, 13e8, 1]))).toEqual({ min: -5e7, max: 13e8 });
    expect(cumRangeOf(cum, pp([60, -3e8, 1]))).toEqual({ min: -3e8, max: 2e8 });
    expect(cumRangeOf(cum)).toEqual({ min: -5e7, max: 2e8 });
    expect(cumRangeOf(cum, [])).toEqual({ min: -5e7, max: 2e8 });
  });

  describe('cumTipAt — 포지션 순매수(이월 포함) · 공백 「포지션 —」', () => {
    const base = {
      orders: EMPTY_ORDERS,
      day_cum_net: { t_ms: [at('10:00:00'), at('10:00:05'), at('10:30:00')], net_krw: [200_000_000, 210_000_000, 194_000_000] },
      avg_px: { t_ms: [at('10:00:00'), at('10:30:00')], px: [19_800, 0] },
    };
    type Tip = Pick<AccumReportPayload, 'day_cum_net' | 'avg_px' | 'pos_net'>;
    const withPos = (pos: Tip['pos_net']): Tip => ({ ...base, pos_net: pos });
    const payload = withPos({
      t_ms: ['09:30:00', '10:00:00', '10:20:00', '10:40:00', '11:00:00'].map(at),
      net_krw: [1.5e8, 1.8e8, 0.5e8, 1.2e8, 1.6e8],
      cycle: [1, 1, 1, 2, 2],
      end: [0, 0, 1, 0, 0],
    });
    const tip = (p: Tip, hms: string) => cumTipAt(p, at(hms));

    it('둘 다 점 없음 → null · 그날 첫 점 전 → 그날 0.00억 · 스냅샷 시각 = 둘 중 늦은 점', () => {
      expect(tip(payload, '09:20:00')).toBeNull();
      expect(tip(payload, '09:45:00')).toEqual({
        key: 'c-1p0',
        lines: ['09:30:00 · 순매수 누적 0.00억 · 포지션 순매수 +1.50억(이월 포함)'],
        circle: null,
      });
      expect(tip(payload, '10:10:00')).toEqual({
        key: 'c1p1',
        lines: ['10:00:05 · 순매수 누적 +2.10억 · 포지션 순매수 +1.80억(이월 포함) · 팀 평단 19,800원'],
        circle: null,
      });
    });

    it('end≠0 점 그 시각엔 값 · 그 뒤는 「포지션 —」 · 새 사이클 점에서 다시 값', () => {
      expect(tip(payload, '10:25:00')).toEqual({
        key: 'c1p2',
        lines: ['10:20:00 · 순매수 누적 +2.10억 · 포지션 순매수 +0.50억(이월 포함) · 팀 평단 19,800원'],
        circle: null,
      });
      expect(tip(payload, '10:35:00')).toEqual({
        key: 'c2p2',
        lines: ['10:30:00 · 순매수 누적 +1.94억 · 포지션 —'],
        circle: null,
      });
      expect(tip(payload, '10:50:00')).toEqual({
        key: 'c2p3',
        lines: ['10:40:00 · 순매수 누적 +1.94억 · 포지션 순매수 +1.20억(이월 포함)'],
        circle: null,
      });
    });

    it('사이클 사이(end 없음) · 닫힌 마지막 조각 뒤 → 「포지션 —」', () => {
      const between = withPos({
        t_ms: ['09:30:00', '10:20:00', '10:40:00'].map(at),
        net_krw: [1.5e8, 0.5e8, 1.2e8],
        cycle: [1, 1, 2],
      });
      expect(tip(between, '10:35:00')!.lines).toEqual(['10:30:00 · 순매수 누적 +1.94억 · 포지션 —']);
      const closed = withPos({ t_ms: ['09:30:00', '10:20:00'].map(at), net_krw: [1.5e8, 0.5e8], cycle: [1, 1], end: [0, 1] });
      expect(tip(closed, '10:50:00')!.lines).toEqual(['10:30:00 · 순매수 누적 +1.94억 · 포지션 —']);
    });

    it('quick-261026-01h { dayAxis } — 같은 key · 글자만 「당일 순매수 · 누적(이월 포함)」 / 「누적 —」', () => {
      expect(cumTipAt(payload, at('10:10:00'), { dayAxis: true })).toEqual({
        key: 'c1p1',
        lines: ['10:00:05 · 당일 순매수 +2.10억 · 누적 +1.80억(이월 포함) · 팀 평단 19,800원'],
        circle: null,
      });
      expect(cumTipAt(payload, at('10:35:00'), { dayAxis: true })).toEqual({
        key: 'c2p2',
        lines: ['10:30:00 · 당일 순매수 +1.94억 · 누적 —'],
        circle: null,
      });
      // 옵션 없음 = 기존 글자
      expect(cumTipAt(payload, at('10:35:00'), {})!.lines).toEqual(['10:30:00 · 순매수 누적 +1.94억 · 포지션 —']);
    });

    it('pos_net 키 없음 · 빈 배열 셋 → 기존 문구 · key 그대로', () => {
      for (const p of [base as Tip, withPos({ t_ms: [], net_krw: [], cycle: [] })]) {
        expect(tip(p, '10:10:00')).toEqual({
          key: 'c1',
          lines: ['10:00:05 · 순매수 누적 +2.10억 · 팀 평단 19,800원'],
          circle: null,
        });
        expect(tip(p, '10:40:00')!.lines).toEqual(['10:30:00 · 순매수 누적 +1.94억']);
        expect(tip(p, '09:59:59')).toBeNull();
      }
    });
  });
});

describe('quick-261026-0ty pos_day — 서버 당일 순매수 · 당일 평단(gh-trade 261026-0q3)', () => {
  const xm = (t: number) => (t - T0) / M;
  const yq = (c: number) => c / 1e8;
  const m = (n: number) => T0 + n * M;
  const T2000 = T0 + 11 * H;
  type DayPick = Pick<AccumReportPayload, 'pos_day'>;
  const ofDay = (v: unknown) => posDayPointsOf({ pos_day: v } as unknown as DayPick);
  const dp = (...a: [number, number, number?][]): PosDayPoint[] => a.map(([n, net, avg = 0]) => ({ t: m(n), net, avg }));

  it('posDayPointsOf — 키 없음 · null · 배열 자체 · t_ms/net_krw 배열 아님 → []', () => {
    expect(posDayPointsOf({})).toEqual([]);
    for (const v of [undefined, null, 'x', 3, [], { t_ms: 'x', net_krw: [] }, { t_ms: [1], net_krw: 'y' }, { t_ms: [1] }]) {
      expect(ofDay(v)).toEqual([]);
    }
  });

  it('posDayPointsOf — 짧은 쪽까지 · t/net 결측 점 건너뜀 · avg 배열 아님/결측/짧음 → 0 · 순서 그대로', () => {
    const [a, b, c] = [m(10), m(20), m(30)];
    expect(ofDay({ t_ms: [a, b, c], net_krw: [1, 2], avg_px: [5, 6, 7] })).toEqual([
      { t: a, net: 1, avg: 5 },
      { t: b, net: 2, avg: 6 },
    ]);
    expect(ofDay({ t_ms: [a, null, c], net_krw: [1, 2, Number.NaN] })).toEqual([{ t: a, net: 1, avg: 0 }]);
    expect(ofDay({ t_ms: [a, b, c], net_krw: [1, 2, 3], avg_px: [5, 'q'] })).toEqual([
      { t: a, net: 1, avg: 5 },
      { t: b, net: 2, avg: 0 },
      { t: c, net: 3, avg: 0 },
    ]);
    expect(ofDay({ t_ms: [c, a], net_krw: [1, 2], avg_px: [1, 2] }).map((p) => p.t)).toEqual([c, a]);
  });

  it('posDayPathOf — 한 조각 · 0선 시작 없음 · 20:00 연장 · 09:00 전 점은 T0 에 붙임 · 빈 배열 \'\'', () => {
    expect(posDayPathOf(dp([13, 1e8], [60, 2.3e8], [246, 0.2e8]), xm, yq, T0, T2000)).toBe('M13.0,1.0H60.0V2.3H246.0V0.2H660.0');
    expect(posDayPathOf(dp([-179, 0], [-20, 0.1e8], [60, 0.5e8]), xm, yq, T0, T2000)).toBe('M0.0,0.1H60.0V0.5H660.0');
    expect(posDayPathOf([], xm, yq, T0, T2000)).toBe('');
  });

  it('teamAvgOf — 당일 축 + pos_day 양수 평단 점 → pos_day [t, avg] 전부(0 포함) · day true · 그 밖 payload.avg_px', () => {
    const avg_px = { t_ms: [m(60)], px: [19_800] };
    const pos_day = { t_ms: [m(50), m(65), m(90)], net_krw: [1, 2, 3], avg_px: [0, 19_900, 19_950] };
    expect(teamAvgOf({ avg_px, pos_day }, false)).toEqual({ points: [[m(60), 19_800]], day: false });
    expect(teamAvgOf({ avg_px, pos_day }, true)).toEqual({
      points: [
        [m(50), 0],
        [m(65), 19_900],
        [m(90), 19_950],
      ],
      day: true,
    });
    expect(teamAvgOf({ avg_px, pos_day: { ...pos_day, avg_px: [0, 0, 0] } }, true)).toEqual({
      points: [[m(60), 19_800]],
      day: false,
    });
    expect(teamAvgOf({ avg_px }, true)).toEqual({ points: [[m(60), 19_800]], day: false });
    expect(teamAvgOf({ avg_px, pos_day: { t_ms: [], net_krw: [], avg_px: [] } }, true).day).toBe(false);
  });

  describe('툴팁 — pos_day 원천(dayAxis 일 때만)', () => {
    const orders: AccumReportOrders = {
      t_ms: [at('10:00:00'), at('10:00:05'), at('10:30:00')],
      side: ['B', 'B', 'S'],
      qty: [100, 50, 80],
      val: [2_000_000_000, 10_000_000, 1_600_000],
      px: [20_000, 20_000, 20_500],
      pieces: [3, 1, 1],
      first: [1, 0, 0],
    };
    const view = { t0: at('09:30:00'), t1: at('11:00:00') };
    const x = xOfView(view, 52, 640);
    const circles = orderCirclesOf(orders, view, x, (p) => 220 - (p - 19_000) / 10);
    const base = {
      orders,
      day_cum_net: { t_ms: [at('10:00:00'), at('10:00:05'), at('10:30:00')], net_krw: [200_000_000, 210_000_000, 194_000_000] },
      avg_px: { t_ms: [at('10:00:00'), at('10:30:00')], px: [19_800, 0] },
    };
    const PD = {
      ...base,
      pos_day: {
        t_ms: [at('09:50:00'), at('10:00:05'), at('10:30:00')],
        net_krw: [50_000_000, 180_000_000, 150_000_000],
        avg_px: [0, 19_900, 19_950],
      },
    };

    it('cumTipAt { dayAxis } (pos_net 없음) — 당일 순매수 = pos_day 계단 · 「팀 평단(당일)」 · 평단 0 이면 없음 · 첫 점 전 null', () => {
      expect(cumTipAt(PD, at('10:10:00'), { dayAxis: true })).toEqual({
        key: 'c1',
        lines: ['10:00:05 · 당일 순매수 +1.80억 · 팀 평단(당일) 19,900원'],
        circle: null,
      });
      expect(cumTipAt(PD, at('09:55:00'), { dayAxis: true })!.lines).toEqual(['09:50:00 · 당일 순매수 +0.50억']);
      expect(cumTipAt(PD, at('09:45:00'), { dayAxis: true })).toBeNull();
      expect(cumTipAt(PD, at('10:10:00'), { dayAxis: false })!.lines).toEqual([
        '10:00:05 · 순매수 누적 +2.10억 · 팀 평단 19,800원',
      ]);
    });

    it('cumTipAt { dayAxis } (pos_net 있음) — 당일 = pos_day · 첫 점 전 「당일 순매수 —」', () => {
      const withPos = {
        ...PD,
        pos_net: {
          t_ms: ['09:30:00', '10:00:00', '10:20:00', '10:40:00', '11:00:00'].map(at),
          net_krw: [1.5e8, 1.8e8, 0.5e8, 1.2e8, 1.6e8],
          cycle: [1, 1, 1, 2, 2],
          end: [0, 0, 1, 0, 0],
        },
      };
      expect(cumTipAt(withPos, at('10:10:00'), { dayAxis: true })).toEqual({
        key: 'c1p1',
        lines: ['10:00:05 · 당일 순매수 +1.80억 · 누적 +1.80억(이월 포함) · 팀 평단(당일) 19,900원'],
        circle: null,
      });
      expect(cumTipAt(withPos, at('09:40:00'), { dayAxis: true })).toEqual({
        key: 'c-1p0',
        lines: ['09:30:00 · 당일 순매수 — · 누적 +1.50억(이월 포함)'],
        circle: null,
      });
    });

    it('orderTipOf { dayAxis } — 당일 순매수 = pos_day · 평단 대비 = pos_day 평단(0 이면 없음)', () => {
      const c0 = circles.find((c) => c.i === 0)!;
      expect(orderTipOf(PD, { base: 18_000 }, c0, { dayAxis: true })).toEqual([
        '10:00:00 팀 매수 100주 · 20.00억 @20,000 · 3조각 · 팀매수 시작',
        '당일 순매수 +0.50억 · 등락률 +11.11%',
      ]);
      const c1 = circles.find((c) => c.i === 1)!;
      expect(orderTipOf(PD, { base: 18_000 }, c1, { dayAxis: true })[1]).toBe(
        '당일 순매수 +1.80억 · 등락률 +11.11% · 평단 대비 +0.50%',
      );
    });

    it('pos_day 빈 배열 셋 → { dayAxis } 결과가 01h 와 같다', () => {
      const empty = { ...base, pos_day: { t_ms: [], net_krw: [], avg_px: [] } };
      expect(cumTipAt(empty, at('10:10:00'), { dayAxis: true })).toEqual({
        key: 'c1',
        lines: ['10:00:05 · 당일 순매수 +2.10억 · 팀 평단 19,800원'],
        circle: null,
      });
      const c0 = circles.find((c) => c.i === 0)!;
      expect(orderTipOf(empty, { base: 18_000 }, c0, { dayAxis: true })).toEqual([
        '10:00:00 팀 매수 100주 · 20.00억 @20,000 · 3조각 · 팀매수 시작',
        '당일 순매수 +2.00억 · 등락률 +11.11% · 평단 대비 +1.01%',
      ]);
    });
  });
});
