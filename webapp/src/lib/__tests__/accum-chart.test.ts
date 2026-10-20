import { describe, expect, it } from 'vitest';

import type { AccumReportOrders } from '@gh-radar/shared';

import { ACCUM_DATE, HANSUN, accumDetailRows, accumKstMs } from '@/test-fixtures/accum-export';

import {
  ACCUM_CHART,
  MIN_VIEW_MS,
  clampView,
  dayBoundsOf,
  priceAxisWidthOf,
  pricePathOf,
  pricePointsOf,
  priceRangeOf,
  xOfView,
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
});
