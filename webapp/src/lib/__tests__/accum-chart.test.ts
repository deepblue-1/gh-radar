import { describe, expect, it } from 'vitest';

import type { AccumReportOrders } from '@gh-radar/shared';

import {
  ACCUM_DATE,
  CHEONIL,
  HANSUN,
  accumDetailRows,
  accumKstMs,
  accumSyntheticDetail,
} from '@/test-fixtures/accum-export';

import {
  ACCUM_CHART,
  MIN_VIEW_MS,
  bucketBarsOf,
  bucketMaxOf,
  carryLineOf,
  clampView,
  cycleMarksOf,
  cumPathOf,
  cumRangeOf,
  cumTicksOf,
  dayBoundsOf,
  gapBandOf,
  labelRowsOf,
  labelWidthOf,
  orderCirclesOf,
  orderRadiusOf,
  shadeOf,
  ticksOf,
  yOfCum,
  priceAxisWidthOf,
  priceClipOf,
  pricePathOf,
  pricePointsOf,
  priceRangeOf,
  xOfView,
  fmtViewRange,
  lastTradeMsOf,
  panBy,
  presetOf,
  zoomAt,
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

  it('pricePathOf — 15:20 · 15:30 · 16:00(간격 30분) → 16:00 에서 새 M · 좌표 소수 1자리', () => {
    const pts: PricePoint[] = [
      [at('15:20:00'), 100],
      [at('15:30:00'), 110],
      [at('16:00:00'), 120],
    ];
    const view = { t0: T0, t1: T0 + 11 * H };
    const d = pricePathOf(pts, view, xOfView(view, 52, 640), (p) => 300 - p);
    expect(cmds(d)).toEqual(['M', 'L', 'M']);
    expect(d).toMatch(/^M\d+\.\d,200\.0L\d+\.\d,190\.0M\d+\.\d,180\.0$/);
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
    expect(cmds(d)).toEqual(['M', 'M', 'M']);
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
