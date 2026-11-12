import { describe, expect, it } from 'vitest';

import {
  CANDLE_AUTO_MIN_PX,
  CANDLE_CHART,
  CANDLE_UNITS,
  EDGE_LABEL_MAX,
  EDGE_LABEL_STEP,
  amountBarsOf,
  autoUnitOf,
  candleBaseOf,
  candleIdxAt,
  candlePanelsOf,
  candlePathsOf,
  candleUnitLabelOf,
  candlesOf,
  cumAvgPathOf,
  cumAvgPointsOf,
  cumAvgVisibleOf,
  edgeLabelsOf,
  maVisibleOf,
  type CandleUnit,
  type Candles,
  type EdgeLabelInput,
} from '@/lib/ticks/candle-chart';
import { msOfNs, tickBoundsOf, turnoverSeriesOf } from '@/lib/ticks/tick-chart';
import type { TickSession } from '@/lib/ticks/tick-session';
import { SYNTH_DATE, a3Msg, synthSession } from '@/test-fixtures/tick-synth';

/**
 * Phase 42 Plan 01 Task 2 — 봉 차트 분봉 집계 · 캐시 · 봉 찾기 · 판 치수 · 누적 평단 · 봉 경로(SC-2 · SC-7 · D-07 · D-09 · D-12 · D-15).
 *
 * 깨지면: 봉의 시 · 고 · 저 · 종 · 거래대금이 그 구간 체결과 어긋나거나, 넷째 판 누적 거래대금과 합이 다르다(또는 확대/이동마다
 * 다시 집계해 하루 수십만 체결 종목에서 끊긴다).
 *
 * 오라클은 구현을 부르지 않고 `session.recvOrder` · `a3Of` · `a3.px` · `a3.qty` · `duplicates` · `index.recvNs` 로 직접 짠다.
 */

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const { T0, T2000 } = tickBoundsOf(SYNTH_DATE);
/** synthNs 는 13:00 KST 기준 ms — 그날 hh:mm:ss 를 그 기준 ms 로. */
const at = (h: number, m: number, s = 0) => (h - 13) * HOUR + m * MIN + s * SEC;

/** 하루 여러 칸 · 빈 분 · 중복 · 가격 0 · 수량 0 · 08:00 전 · 20:00 뒤 · 단일가(09:00:02)가 섞인 합성 하루. */
function richSession(): TickSession {
  let seq = 0;
  const m = (ms: number, px: number, qty: number, s?: number): [number, Uint8Array] => [
    ms,
    a3Msg({ seq: s ?? ++seq, bs: '2', px, qty }),
  ];
  return synthSession([
    m(at(7, 59, 30), 9_000, 10), // 08:00 전 — 제외
    m(at(8, 0, 1), 10_000, 5),
    m(at(8, 0, 40), 10_100, 7),
    m(at(8, 0, 59), 9_950, 3),
    m(at(8, 59, 10), 10_050, 2),
    m(at(9, 0, 2), 10_300, 400), // 단일가 체결 — 수신 시각 09:00 봉
    m(at(9, 0, 30), 0, 100), // 가격 0 — 제외
    m(at(9, 0, 31), 10_250, 0), // 수량 0 — 제외
    m(at(9, 4, 59), 10_400, 30),
    m(at(9, 5, 0), 10_380, 11),
    [at(9, 5, 1), a3Msg({ seq: 1_000, bs: '1', px: 10_360, qty: 9 })],
    [at(9, 5, 2), a3Msg({ seq: 1_000, bs: '1', px: 10_360, qty: 9 })], // 같은 seq 다시 = 중복 수신 — 한 번만
    m(at(9, 14, 0), 10_500, 1),
    m(at(9, 15, 0), 10_450, 4),
    m(at(9, 29, 59), 10_420, 6),
    m(at(9, 30, 0), 10_600, 8),
    m(at(9, 59, 59), 10_700, 2),
    m(at(10, 0, 0), 10_650, 3),
    m(at(10, 59, 0), 10_550, 12),
    m(at(13, 0, 0), 11_000, 20),
    m(at(13, 0, 1), 11_050, 1),
    m(at(15, 20, 0), 11_200, 7),
    m(at(16, 10, 0), 11_100, 5),
    m(at(19, 59, 59), 11_150, 2),
    m(at(20, 0, 0), 11_300, 9), // 20:00 — 제외
    m(at(20, 3, 0), 11_400, 9), // 20:00 뒤 — 제외
  ]);
}

interface Bar {
  o: number;
  h: number;
  l: number;
  c: number;
  amt: number;
}

/** 직접 집계(구현과 독립) — 같은 거름 · 칸 = 08:00 정시에 맞물린 unit 분 칸 · 시작 ms 오름차순. */
function oracle(s: TickSession, unit: CandleUnit): [number, Bar][] {
  const bars = new Map<number, Bar>();
  const u = unit * MIN;
  for (let p = 0; p < s.recvOrder.length; p++) {
    const r = s.recvOrder[p]!;
    const j = s.a3Of[r]!;
    if (j < 0 || s.duplicates[r] === 1) continue;
    const px = s.a3.px[j]!;
    const q = s.a3.qty[j]!;
    if (px <= 0 || q <= 0) continue;
    const ms = msOfNs(s.index.recvNs[r]!);
    if (ms < T0 || ms >= T2000) continue;
    const start = T0 + Math.floor((ms - T0) / u) * u;
    const b = bars.get(start);
    if (b === undefined) bars.set(start, { o: px, h: px, l: px, c: px, amt: px * q });
    else {
      b.h = Math.max(b.h, px);
      b.l = Math.min(b.l, px);
      b.c = px;
      b.amt += px * q;
    }
  }
  return [...bars.entries()].sort((a, b) => a[0] - b[0]);
}

function asRows(c: Candles): [number, Bar][] {
  const out: [number, Bar][] = [];
  for (let i = 0; i < c.n; i++) out.push([c.t0[i]!, { o: c.o[i]!, h: c.h[i]!, l: c.l[i]!, c: c.c[i]!, amt: c.amt[i]! }]);
  return out;
}

function expectSame(c: Candles, want: [number, Bar][]) {
  expect(c.n).toBe(want.length);
  const got = asRows(c);
  for (let i = 0; i < want.length; i++) {
    expect(got[i]![0]).toBe(want[i]![0]);
    expect(got[i]![1].o).toBe(want[i]![1].o);
    expect(got[i]![1].h).toBe(want[i]![1].h);
    expect(got[i]![1].l).toBe(want[i]![1].l);
    expect(got[i]![1].c).toBe(want[i]![1].c);
    expect(got[i]![1].amt).toBe(want[i]![1].amt);
  }
}

describe('집계', () => {
  const s = richSession();

  const vsOracle = (unit: CandleUnit) => {
    const c = candlesOf(s, unit);
    expect(c.unit).toBe(unit);
    expect(c.n).toBeGreaterThan(0);
    expectSame(c, oracle(s, unit));
  };
  it('1분봉 — 시 · 고 · 저 · 종 · 거래대금이 직접 집계와 같다(오라클)', () => vsOracle(1));
  it('5분봉 — 시 · 고 · 저 · 종 · 거래대금이 직접 집계와 같다(오라클)', () => vsOracle(5));
  it('10분봉 — 시 · 고 · 저 · 종 · 거래대금이 직접 집계와 같다(오라클)', () => vsOracle(10));
  it('15분봉 — 시 · 고 · 저 · 종 · 거래대금이 직접 집계와 같다(오라클)', () => vsOracle(15));
  it('30분봉 — 시 · 고 · 저 · 종 · 거래대금이 직접 집계와 같다(오라클)', () => vsOracle(30));
  it('60분봉 — 시 · 고 · 저 · 종 · 거래대금이 직접 집계와 같다(오라클)', () => vsOracle(60));

  it('거름 — 중복 수신은 한 번만 · 가격 0 · 수량 0 · 08:00 전 · 20:00 이후 제외 · 체결 없는 분에는 봉이 없다', () => {
    const c = candlesOf(s, 1);
    // 체결 있는 분 = 08:00 · 08:59 · 09:00 · 09:04 · 09:05 · 09:14 · 09:15 · 09:29 · 09:30 · 09:59 · 10:00 · 10:59 · 13:00 · 15:20 · 16:10 · 19:59
    expect(c.n).toBe(16);
    const i0905 = asRows(c).findIndex(([t]) => t === T0 + 65 * MIN);
    // 09:05 = 10,380 × 11 + 10,360 × 9(중복 수신 한 번 더는 빠진다)
    expect(c.amt[i0905]).toBe(10_380 * 11 + 10_360 * 9);
    const i0900 = asRows(c).findIndex(([t]) => t === T0 + HOUR);
    // 09:00 = 단일가 10,300 × 400 만(가격 0 · 수량 0 제외)
    expect(c.amt[i0900]).toBe(10_300 * 400);
    expect(c.t0[0]).toBe(T0);
    expect(c.t0[c.n - 1]).toBe(T0 + 11 * HOUR + 59 * MIN);
    // 07:59 · 20:00 · 20:03 가격은 어느 봉에도 없다
    for (const px of [9_000, 11_300, 11_400]) {
      for (let i = 0; i < c.n; i++) expect([c.o[i], c.h[i], c.l[i], c.c[i]]).not.toContain(px);
    }
  });

  it('단일가 — 09:00:02 수신 체결은 09:00 봉의 시가 · 60분봉은 정시(09:00 · 10:00) 시작', () => {
    const c1 = candlesOf(s, 1);
    const i = asRows(c1).findIndex(([t]) => t === T0 + HOUR);
    expect(c1.o[i]).toBe(10_300);
    const c60 = candlesOf(s, 60);
    for (let k = 0; k < c60.n; k++) expect((c60.t0[k]! - T0) % HOUR).toBe(0);
    expect(Array.from(c60.t0)).toContain(T0 + HOUR); // 09:00
    expect(Array.from(c60.t0)).toContain(T0 + 2 * HOUR); // 10:00
    const k0900 = Array.from(c60.t0).indexOf(T0 + HOUR);
    // 09:00 ~ 10:00 칸 시가 = 단일가 체결 · 종가 = 09:59:59 체결
    expect(c60.o[k0900]).toBe(10_300);
    expect(c60.c[k0900]).toBe(10_700);
    expect(c60.h[k0900]).toBe(10_700);
    expect(c60.l[k0900]).toBe(10_300);
  });

  it('거래대금 합 = 넷째 판 누적 거래대금 증가분(08:00 ~ 20:00 안 체결만인 하루)', () => {
    const inDay = synthSession([
      [at(9, 0, 1), a3Msg({ seq: 1, px: 10_000, qty: 10 })],
      [at(9, 0, 2), a3Msg({ seq: 1, px: 10_000, qty: 10 })],
      [at(9, 7, 0), a3Msg({ seq: 2, px: 10_050, qty: 3 })],
      [at(11, 0, 0), a3Msg({ seq: 3, px: 0, qty: 3 })],
      [at(14, 30, 0), a3Msg({ seq: 4, px: 9_990, qty: 77 })],
    ]);
    const tv = turnoverSeriesOf(inDay);
    for (const unit of CANDLE_UNITS) {
      const c = candlesOf(inDay, unit);
      let sum = 0;
      for (let i = 0; i < c.n; i++) sum += c.amt[i]!;
      expect(sum).toBe(tv.val[tv.n - 1]! - tv.val0);
    }
  });
});

describe('캐시', () => {
  it('같은 세션 · 단위면 같은 객체 · 1분봉 = candleBaseOf · 새 세션 객체면 새 집계(값은 같다)', () => {
    const s = richSession();
    expect(candlesOf(s, 5)).toBe(candlesOf(s, 5));
    expect(candlesOf(s, 60)).toBe(candlesOf(s, 60));
    expect(candlesOf(s, 1)).toBe(candleBaseOf(s));
    expect(candleBaseOf(s)).toBe(candlesOf(s, 1));
    const s2 = richSession();
    expect(candlesOf(s2, 5)).not.toBe(candlesOf(s, 5));
    expect(asRows(candlesOf(s2, 5))).toEqual(asRows(candlesOf(s, 5)));
  });
});

describe('봉 찾기', () => {
  const s = richSession();

  it('candleIdxAt — 칸 [t0, t0 + 단위) 안이면 그 색인 · 빈 분 · 창 앞 · 뒤는 −1', () => {
    const c1 = candlesOf(s, 1);
    const i0905 = asRows(c1).findIndex(([t]) => t === T0 + 65 * MIN);
    expect(candleIdxAt(c1, T0 + 65 * MIN)).toBe(i0905);
    expect(candleIdxAt(c1, T0 + 65 * MIN + 59_999)).toBe(i0905);
    expect(candleIdxAt(c1, T0 + 66 * MIN)).toBe(-1); // 09:06 — 체결 없는 분
    expect(candleIdxAt(c1, T0 - 1)).toBe(-1); // 08:00 전
    expect(candleIdxAt(c1, T2000 + MIN)).toBe(-1); // 20:00 뒤
    const c5 = candlesOf(s, 5);
    const k = Array.from(c5.t0).indexOf(T0 + 65 * MIN);
    expect(candleIdxAt(c5, T0 + 69 * MIN + 30 * SEC)).toBe(k);
    expect(candleIdxAt(c5, T0 + 70 * MIN)).toBe(Array.from(c5.t0).indexOf(T0 + 70 * MIN));
  });
});

describe('판 치수', () => {
  it('CANDLE_CHART — 데스크톱 420 · 폰 303 · yCb = y1b − 거래대금 높이 · yRa = y1b + 7', () => {
    const d = candlePanelsOf(CANDLE_CHART.desktop);
    expect(d.H).toBe(420);
    expect(d.yCb).toBe(d.y1b - 32);
    expect(d.yRa).toBe(d.y1b + 7);
    expect(d.yRb).toBe(d.yRa + 50);
    expect(d.y2a).toBe(d.yRb + 7);
    const p = candlePanelsOf(CANDLE_CHART.phone);
    expect(p.H).toBe(303);
    expect(p.yCb).toBe(p.y1b - 22);
    expect(p.yRa).toBe(p.y1b + 7);
    expect(p.y1b - p.y1a).toBe(110);
  });
});

describe('누적', () => {
  const avg = { t_ms: [T0 + HOUR, T0 + 2 * HOUR], px: [13_772, 13_800] };
  const base = { reg_time_ms: T0, pos_net: [] as unknown };

  it('cumAvgPointsOf — 당일 · accum null · avg_px null · 키 없음 · 길이 어긋남이면 [] · 정상이면 점', () => {
    expect(cumAvgPointsOf({ ...base, avg_px: avg }, true)).toEqual([]);
    expect(cumAvgPointsOf(null, false)).toEqual([]);
    expect(cumAvgPointsOf(undefined, false)).toEqual([]);
    expect(cumAvgPointsOf({ ...base, avg_px: null }, false)).toEqual([]);
    expect(cumAvgPointsOf(base, false)).toEqual([]);
    expect(cumAvgPointsOf({ ...base, avg_px: { t_ms: [1], px: [] } }, false)).toEqual([]);
    expect(cumAvgPointsOf({ ...base, avg_px: avg }, false)).toEqual([
      [T0 + HOUR, 13_772],
      [T0 + 2 * HOUR, 13_800],
    ]);
  });

  it('cumAvgPathOf — px 0 다음에 끊긴 하위 경로(M 둘) · 08:00 전 점은 08:00 에 붙는다 · 끝 = max(endMs, 마지막 점)', () => {
    const x = (t: number) => (t - T0) / MIN;
    const y = (v: number) => 1_000 - v / 100;
    const d = cumAvgPathOf(
      [
        [T0 - 2 * HOUR, 13_000],
        [T0 + HOUR, 13_100],
        [T0 + 2 * HOUR, 0],
        [T0 + 3 * HOUR, 13_200],
      ],
      x,
      y,
      T0,
      T0 + 5 * HOUR,
    );
    expect(d.match(/M/g)?.length).toBe(2);
    expect(d.startsWith('M0.0,870.0')).toBe(true);
    expect(d.endsWith('H300.0')).toBe(true);
    expect(cumAvgPathOf([], x, y, T0, T0 + HOUR)).toBe('');
  });
});

describe('봉 경로', () => {
  const one = (o: number, h: number, l: number, c: number): Candles => ({
    unit: 1,
    n: 1,
    t0: Float64Array.of(T0),
    o: Float64Array.of(o),
    h: Float64Array.of(h),
    l: Float64Array.of(l),
    c: Float64Array.of(c),
    amt: Float64Array.of(1),
  });
  const view = { t0: T0, t1: T0 + 10 * MIN };
  const y = (v: number) => 200 - v;

  it('칸 폭 2px 이면 몸통 없이 꼬리만', () => {
    const p = candlePathsOf(one(100, 110, 90, 105), view, (t) => ((t - T0) / MIN) * 2, y);
    expect(p.upBody).toBe('');
    expect(p.upWick).toBe('M1.0,90.0V110.0');
    expect(p.downBody + p.downWick).toBe('');
  });

  it('칸 폭 40px 이면 몸통 폭 14 · 시가 = 종가면 몸통 높이 1 · 종가 < 시가 = 내림', () => {
    const x = (t: number) => ((t - T0) / MIN) * 40;
    const flat = candlePathsOf(one(100, 110, 90, 100), view, x, y);
    expect(flat.upBody).toBe('M13.0,100.0h14.0v1.0h-14.0Z');
    const down = candlePathsOf(one(105, 110, 90, 95), view, x, y);
    expect(down.upBody + down.upWick).toBe('');
    expect(down.downBody).toBe('M13.0,95.0h14.0v10.0h-14.0Z');
    expect(down.downWick).toBe('M20.0,90.0V110.0');
  });

  it('보기 창과 겹치지 않는 봉은 그리지 않는다', () => {
    const p = candlePathsOf(one(100, 110, 90, 105), { t0: T0 + 2 * MIN, t1: T0 + 5 * MIN }, (t) => t, y);
    expect(p.upBody + p.upWick + p.downBody + p.downWick).toBe('');
  });

  it('candleUnitLabelOf — 「5분봉(자동)」 · 「15분봉」', () => {
    expect(candleUnitLabelOf(5, true)).toBe('5분봉(자동)');
    expect(candleUnitLabelOf(15, false)).toBe('15분봉');
  });
});

describe('자동', () => {
  it('autoUnitOf — 칸 폭 4px 이상인 가장 작은 단위(12시간 · 900px → 5분 · 1시간 · 900px → 1분)', () => {
    expect(CANDLE_AUTO_MIN_PX).toBe(4);
    // 1분 칸 = 60,000 / 43,200,000 × 900 = 1.25px · 5분 칸 = 6.25px
    expect(autoUnitOf(12 * HOUR, 900)).toBe(5);
    // 1분 칸 = 60,000 / 3,600,000 × 900 = 15px
    expect(autoUnitOf(HOUR, 900)).toBe(1);
  });

  it('autoUnitOf — 아무 단위도 4px 를 못 넘으면 60(하루 전체 · 40px) · 하루 전체 · 100px 는 30분(4.17px)', () => {
    // 60분 칸 = 3,600,000 / 43,200,000 × 40 = 3.33px
    expect(autoUnitOf(12 * HOUR, 40)).toBe(60);
    expect(autoUnitOf(12 * HOUR, 100)).toBe(30);
  });
});

/** 데스크톱 가격 판: y1a 7 · yCb 135 · y1b 167 · 거래대금 영역 32 → 막대 최대 30. */
const PD = candlePanelsOf(CANDLE_CHART.desktop);
const PP = candlePanelsOf(CANDLE_CHART.phone);

/** 1분봉 셋 — 오름(거래대금 200) · 내림(100) · 오름(50). */
const three: Candles = {
  unit: 1,
  n: 3,
  t0: Float64Array.of(T0, T0 + MIN, T0 + 2 * MIN),
  o: Float64Array.of(100, 110, 100),
  h: Float64Array.of(112, 111, 104),
  l: Float64Array.of(99, 100, 99),
  c: Float64Array.of(110, 101, 103),
  amt: Float64Array.of(200, 100, 50),
};
const allView = { t0: T0, t1: T0 + 3 * MIN };

describe('거래대금 막대', () => {
  const x20 = (t: number) => ((t - T0) / MIN) * 20;

  it('창 안 최대 거래대금 봉 높이 = 영역 − 2 · 절반 거래대금 = 절반 높이 · 아래 끝 = y1b · 칸 가운데 몸통 폭', () => {
    expect(PD.y1b - PD.yCb).toBe(32);
    const bars = amountBarsOf(three, allView, x20, PD);
    expect(bars.max).toBe(200);
    // 칸 20px → 폭 14 · 가운데 10 → 왼끝 3 · 높이 30 · 위끝 167 − 30 = 137
    expect(bars.up).toBe('M3.0,137.0h14.0v30.0h-14.0ZM43.0,159.5h14.0v7.5h-14.0Z');
    // 절반 거래대금(100) → 높이 15 · 위끝 152
    expect(bars.down).toBe('M23.0,152.0h14.0v15.0h-14.0Z');
  });

  it('오름 봉은 up · 내림 봉은 down · 창 밖 봉은 없고 최대는 창 안 봉 기준', () => {
    const bars = amountBarsOf(three, { t0: T0 + MIN, t1: T0 + 3 * MIN }, x20, PD);
    expect(bars.max).toBe(100);
    expect(bars.down).toBe('M23.0,137.0h14.0v30.0h-14.0Z');
    expect(bars.up).toBe('M43.0,152.0h14.0v15.0h-14.0Z');
    const none = amountBarsOf(three, { t0: T0 + 5 * MIN, t1: T0 + 9 * MIN }, x20, PD);
    expect(none).toEqual({ up: '', down: '', max: 0 });
  });

  it('칸 폭 2px(꼬리만 구간)이면 막대 폭 = max(1, 2 × 0.7) = 1.4', () => {
    const bars = amountBarsOf(three, allView, (t) => ((t - T0) / MIN) * 2, PD);
    expect(bars.up.startsWith('M0.3,137.0h1.4v30.0h-1.4Z')).toBe(true);
  });
});

describe('보이는 값', () => {
  it('maVisibleOf — 창과 겹치는 봉의 유한 값만', () => {
    const v = Float64Array.of(Number.NaN, 105, 106);
    expect(maVisibleOf(three, v, allView)).toEqual([105, 106]);
    expect(maVisibleOf(three, v, { t0: T0, t1: T0 + MIN })).toEqual([]);
    expect(maVisibleOf(three, v, { t0: T0 + 2 * MIN + 30 * SEC, t1: T0 + 5 * MIN })).toEqual([106]);
  });

  it('cumAvgVisibleOf — 창 앞에서 이어 들어온 값 + 창 안 계단 값 · px ≤ 0 은 빠진다', () => {
    const pts: [number, number][] = [
      [T0 - HOUR, 13_000],
      [T0 + HOUR, 13_100],
      [T0 + 2 * HOUR, 0],
      [T0 + 3 * HOUR, 13_200],
      [T0 + 6 * HOUR, 13_300],
    ];
    expect(cumAvgVisibleOf(pts, { t0: T0 + 30 * MIN, t1: T0 + 4 * HOUR })).toEqual([13_000, 13_100, 13_200]);
    // 창 앞 마지막 점이 0 이면 이어 들어온 값 없음
    expect(cumAvgVisibleOf(pts, { t0: T0 + 2 * HOUR + MIN, t1: T0 + 2 * HOUR + 2 * MIN })).toEqual([]);
    expect(cumAvgVisibleOf([], allView)).toEqual([]);
  });
});

describe('가장자리', () => {
  const range = { min: 100, max: 200, lo: 100, hi: 200 };
  const desk = { P: PD, L: 60, xr: 860, phone: false };
  const phone = { P: PP, L: 44, xr: 340, phone: true };
  const item = (key: string, name: string, vis: number[]): EdgeLabelInput => ({
    key,
    name,
    fill: `var(--${key})`,
    vis,
    last: vis.length > 0 ? vis[vis.length - 1]! : null,
  });

  it('보이는 값 하나라도 [lo, hi] 안이면 글자 없음 · 숨김 아님 · 보이는 값 0개면 글자도 숨김도 없음', () => {
    const r = edgeLabelsOf([item('ma-1', '단순 5', [90, 150, 250]), item('ma-2', '단순 20', [])], range, desk);
    expect(r.labels).toEqual([]);
    expect(r.hidden.size).toBe(0);
  });

  it('전부 위 → ▴ 오른쪽 끝 정렬 · x = xr − 4 · 데스크톱 첫 y = y1a + 24 · 둘째 +13', () => {
    expect(EDGE_LABEL_STEP).toBe(13);
    const r = edgeLabelsOf([item('a', '단순 5', [201, 230]), item('b', '일 20', [13_950])], range, desk);
    expect(r.labels).toEqual([
      { key: 'a', text: '단순 5 230 ▴', x: 856, y: PD.y1a + 24, anchor: 'end', fill: 'var(--a)', side: 'above' },
      { key: 'b', text: '일 20 13,950 ▴', x: 856, y: PD.y1a + 37, anchor: 'end', fill: 'var(--b)', side: 'above' },
    ]);
    expect([...r.hidden]).toEqual(['a', 'b']);
  });

  it('전부 아래 → ▾ 왼쪽 · x = L + 4 · 첫 y = 봉 영역 아래 − 4 · 둘째 −13 · 값 = last 정수 반올림', () => {
    const r = edgeLabelsOf(
      [
        { key: 'cum', name: '누적 평단', fill: 'var(--muted-fg)', vis: [50, 60], last: 13_771.6 },
        item('m', '지수 20', [99]),
      ],
      range,
      desk,
    );
    expect(r.labels[0]).toEqual({
      key: 'cum',
      text: '누적 평단 13,772 ▾',
      x: 64,
      y: PD.yCb - 4,
      anchor: 'start',
      fill: 'var(--muted-fg)',
      side: 'below',
    });
    expect(r.labels[1]!.y).toBe(PD.yCb - 17);
    expect(r.hidden.has('cum')).toBe(true);
    expect(r.hidden.has('m')).toBe(true);
  });

  it('데스크톱 아래 밖 7개 → 4개 + 「외 3개 ▾」(마지막 자리 · 흐린 색) · 순서 = 입력 순서', () => {
    expect(EDGE_LABEL_MAX).toEqual({ desktop: 5, phone: 3 });
    const items = Array.from({ length: 7 }, (_, i) => item(`k${i}`, `단순 ${i + 2}`, [10]));
    const r = edgeLabelsOf(items, range, desk);
    expect(r.labels.map((l) => l.key)).toEqual(['k0', 'k1', 'k2', 'k3', 'more-below']);
    const more = r.labels[4]!;
    expect(more.text).toBe('외 3개 ▾');
    expect(more.fill).toBe('var(--muted-fg)');
    expect(more.y).toBe(PD.yCb - 4 - 4 * 13);
    expect(r.hidden.size).toBe(7);
  });

  it('폰 위 밖 4개 → 2개 + 「외 2개 ▴」 · 폰 첫 y = y1a + 11 · 위 · 아래가 섞여도 가장자리마다 따로 쌓는다', () => {
    const items = [
      item('u0', '단순 5', [300]),
      item('d0', '누적 평단', [10]),
      item('u1', '단순 20', [300]),
      item('u2', '단순 60', [300]),
      item('u3', '지수 5', [300]),
    ];
    const r = edgeLabelsOf(items, range, phone);
    const above = r.labels.filter((l) => l.side === 'above');
    expect(above.map((l) => l.text)).toEqual(['단순 5 300 ▴', '단순 20 300 ▴', '외 2개 ▴']);
    expect(above.map((l) => l.y)).toEqual([PP.y1a + 11, PP.y1a + 24, PP.y1a + 37]);
    expect(above[2]!.key).toBe('more-above');
    expect(above.every((l) => l.x === 336 && l.anchor === 'end')).toBe(true);
    const below = r.labels.filter((l) => l.side === 'below');
    expect(below).toHaveLength(1);
    expect(below[0]!.y).toBe(PP.yCb - 4);
  });
});
