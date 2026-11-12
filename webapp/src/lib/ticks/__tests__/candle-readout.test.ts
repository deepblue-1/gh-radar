import { describe, expect, it } from 'vitest';

import type { TickOpenResponse } from '@gh-radar/shared';

import type { PricePoint } from '@/lib/accum-chart';
import { SYNTH_DATE, a3Msg, b6Msg, synthNs, synthSession } from '@/test-fixtures/tick-synth';

import type { Candles } from '../candle-chart';
import type { CandleMaValue } from '../candle-ma';
import { candleBandAt, candleCaptionOf, type CandleBandSrc, type CandleCaptionInput } from '../candle-readout';
import { teamKpiAt } from '../team-model';
import { msOfNs, priceSeriesOf, tickBoundsOf, turnoverSeriesOf } from '../tick-chart';
import { tickBandAt, type TickBandSource } from '../tick-chart-tip';

/**
 * Phase 42 Plan 06 Task 1 — 값 띠 값(candleBandAt) · 카드 아래 캡션 글자(candleCaptionOf) (D-14 · D-15 · D-17 · D-20 · Q3 · Q5).
 *
 * 깨지면: 봉 차트 값 띠 수익률이 팀 거래정보 패널과 다르거나, 카드 아래 누적 설명이 틀린 상황에 뜬다.
 */

const B = tickBoundsOf(SYNTH_DATE);
const MIN = 60_000;
const T1015 = B.T0 + 135 * MIN; // 10:15

/** 합성 — 일반 1건(팀 첫 매수 전) · 팀 매수 SMP 3조각 · 일반 1조각 · 팀 매도 · 일반 1건(candle-returns.test.ts 와 같은 하루). */
function teamDay() {
  return synthSession([
    [-5, a3Msg({ seq: 99, bs: '1', px: 16350, qty: 10, a1: 16400, b1: 16350, time: '125959995000' })],
    [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
    [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
    [1.1, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 200, time: '130000001100' })],
    [1.2, a3Msg({ seq: 103, bs: '2', px: 16400, qty: 300, time: '130000001200' })],
    [1.5, b6Msg({ seq: 104, ask1: [16450, 10], bid1: [16400, 20] })],
    [2, a3Msg({ seq: 105, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000002000' })],
    [2.5, b6Msg({ seq: 106, ask1: [16400, 1], bid1: [16350, 2] })],
    [5, a3Msg({ seq: 107, bs: '1', px: 16300, qty: 400, time: '130000005000' })],
    [5.5, b6Msg({ seq: 108, ask1: [16400, 1], bid1: [16300, 2] })],
    [8, a3Msg({ seq: 109, bs: '2', px: 16350, qty: 5, a1: 16350, b1: 16300, time: '130000008000' })],
  ]);
}

const s = teamDay();
const recOfSeq = (seq: number) => {
  for (let r = 0; r < s.index.n; r++) if (s.index.seq[r] === seq) return r;
  throw new Error(`seq ${seq} 없음`);
};
const msOfRec = (rec: number) => msOfNs(s.index.recvNs[rec]!);

const f = (a: number[]) => Float64Array.from(a);

/** 5분봉 3개 — 10:10 · 10:15 · (10:20 빈 칸) · 10:25. */
const candles: Candles = {
  unit: 5,
  n: 3,
  t0: f([T1015 - 5 * MIN, T1015, T1015 + 10 * MIN]),
  o: f([12_900, 13_100, 13_400]),
  h: f([13_200, 13_500, 13_450]),
  l: f([12_850, 13_000, 13_300]),
  c: f([13_100, 13_450, 13_350]),
  amt: f([1_000_000, 2_500_000, 800_000]),
};

const MA: CandleMaValue[] = [
  { key: 'bar:sma:5', name: '단순 5', color: 1, values: f([Number.NaN, 13_250, 13_300]) },
  { key: 'day:sma:120', name: '일 120', color: 3, values: f([Number.NaN, Number.NaN, Number.NaN]) },
];

const tickSrc = (over: Partial<TickBandSource> = {}): TickBandSource => ({
  team: s.team,
  cum: [],
  price: priceSeriesOf(s),
  turnover: turnoverSeriesOf(s),
  basePx: 13_000,
  mcap: null,
  T0: B.T0,
  ...over,
});

const src = (over: Partial<CandleBandSrc> = {}): CandleBandSrc => ({
  session: s,
  candles,
  ma: MA,
  cumAvg: [],
  tick: tickSrc(),
  ...over,
});

describe('candleBandAt — 첫 칸 「봉」', () => {
  it('5분봉 10:15 칸 안 시각(10:16:52) → 그 봉 시 · 고 · 저 · 종 · 거래대금 · 등락률 = (종 − 기준가) ÷ 기준가 × 100', () => {
    const b = candleBandAt(src(), T1015 + 112_000, -1);
    expect(b.unit).toBe(5);
    expect(b.candle).not.toBeNull();
    expect(b.candle!.start).toBe(T1015);
    expect([b.candle!.o, b.candle!.h, b.candle!.l, b.candle!.c, b.candle!.amt]).toEqual([
      13_100, 13_500, 13_000, 13_450, 2_500_000,
    ]);
    expect(b.candle!.chgPct).toBeCloseTo(((13_450 - 13_000) / 13_000) * 100, 12);
  });

  it('기준가 없음 → 등락률 null(봉 값은 그대로)', () => {
    const b = candleBandAt(src({ tick: tickSrc({ basePx: null }) }), T1015 + 1, -1);
    expect(b.candle!.c).toBe(13_450);
    expect(b.candle!.chgPct).toBeNull();
  });

  it('빈 분(10:22 — 봉 없는 칸) → candle null · 이동평균 값 전부 null(이름 · 색은 칩 순서 그대로)', () => {
    const b = candleBandAt(src(), T1015 + 7 * MIN, -1);
    expect(b.candle).toBeNull();
    expect(b.ma.map((m) => m.key)).toEqual(['bar:sma:5', 'day:sma:120']);
    expect(b.ma.every((m) => m.v === null)).toBe(true);
  });

  it('이동평균 값 = 그 봉 색인 값 · NaN → null · key · name · color 그대로(입력 순서)', () => {
    const b = candleBandAt(src(), T1015 + 112_000, -1);
    expect(b.ma).toEqual([
      { key: 'bar:sma:5', name: '단순 5', color: 1, v: 13_250 },
      { key: 'day:sma:120', name: '일 120', color: 3, v: null },
    ]);
    expect(candleBandAt(src(), T1015 - 1, -1).ma[0]!.v).toBeNull(); // 10:10 봉 값 NaN
    expect(candleBandAt(src({ ma: [] }), T1015, -1).ma).toEqual([]);
  });
});

describe('candleBandAt — 둘째 칸 평단 · 수익률 = teamKpiAt(패널과 같은 쌍 · Q3)', () => {
  it('전제 — 합성 하루 팀 체결 4건', () => {
    expect(s.team.fills.map((x) => x.qty)).toEqual([100, 200, 300, 400]);
  });

  it('팀 체결 뒤 rec 마다 avgPx · ret 이 teamKpiAt(team, session, rec) 의 avgPx · pnl.ret 과 비트까지 같다', () => {
    let nonNull = 0;
    for (const seq of [101, 103, 104, 105, 107, 109]) {
      const rec = recOfSeq(seq);
      const kpi = teamKpiAt(s.team, s, rec);
      const b = candleBandAt(src(), msOfRec(rec), rec);
      expect(b.avgPx).toBe(kpi.avgPx);
      expect(b.ret).toBe(kpi.pnl?.ret ?? null);
      if (b.ret !== null) nonNull++;
    }
    expect(nonNull).toBeGreaterThan(2);
  });

  it('rec −1 → 평단 · 수익률 둘 다 null · 팀 첫 매수 전 rec → 둘 다 null(패널도 「—」)', () => {
    const none = candleBandAt(src(), T1015, -1);
    expect(none.avgPx).toBeNull();
    expect(none.ret).toBeNull();
    const before = recOfSeq(99);
    const b = candleBandAt(src(), msOfRec(before), before);
    expect(teamKpiAt(s.team, s, before).pnl).toBeNull();
    expect(b.avgPx).toBeNull();
    expect(b.ret).toBeNull();
  });
});

describe('candleBandAt — 선 차트 띠 값(셋째 · 넷째 칸 · 1줄 팀)', () => {
  it('tick = tickBandAt(src.tick, t) 와 같은 값', () => {
    for (const t of [msOfRec(recOfSeq(103)), msOfNs(synthNs(9)), T1015]) {
      expect(candleBandAt(src(), t, -1).tick).toEqual(tickBandAt(tickSrc(), t));
    }
  });
});

describe('candleBandAt — 넷째 줄 누적 평단 · 누적 수익률(D-15 · D-17)', () => {
  const tA = T1015;
  const tB = T1015 + 10 * MIN;
  const price = { n: 2, t: f([tA, tB + MIN]), px: f([14_300, 12_000]) };
  const cumAvg: PricePoint[] = [
    [tA - MIN, 13_000],
    [tB, 0],
  ];

  it('누적 평단 13000 · 그 시각 가격 14300 → cumAvg 13000 · cumRet ≈ 0.1 · hasCumAvg', () => {
    const b = candleBandAt(src({ cumAvg, tick: tickSrc({ price }) }), tA + 30_000, -1);
    expect(b.hasCumAvg).toBe(true);
    expect(b.cumAvg).toBe(13_000);
    expect(b.cumRet).toBeCloseTo(0.1, 12);
  });

  it('누적 평단 px 0 구간 → 누적 평단 · 누적 수익률 둘 다 null · 첫 점 전도 null', () => {
    const b = candleBandAt(src({ cumAvg, tick: tickSrc({ price }) }), tB + 2 * MIN, -1);
    expect(b.hasCumAvg).toBe(true);
    expect(b.cumAvg).toBeNull();
    expect(b.cumRet).toBeNull();
    const early = candleBandAt(src({ cumAvg, tick: tickSrc({ price }) }), tA - 2 * MIN, -1);
    expect(early.cumAvg).toBeNull();
    expect(early.cumRet).toBeNull();
  });

  it('누적 평단 [] → hasCumAvg false · 둘 다 null', () => {
    const b = candleBandAt(src({ cumAvg: [], tick: tickSrc({ price }) }), tA + 30_000, -1);
    expect(b.hasCumAvg).toBe(false);
    expect(b.cumAvg).toBeNull();
    expect(b.cumRet).toBeNull();
  });
});

describe('candleCaptionOf — 카드 아래 캡션 글자(UI-SPEC S9 문구 정본)', () => {
  const ACCUM = { reg_time_ms: 0, pos_net: [], avg_px: null } as NonNullable<TickOpenResponse['accum']>;
  const base = (over: Partial<CandleCaptionInput> = {}): CandleCaptionInput => ({
    accum: ACCUM,
    isToday: false,
    hasCum: true,
    nxt: false,
    ma: [],
    ...over,
  });

  it('당일 화면 → 누적 항목 없음(선 안내만)', () => {
    expect(candleCaptionOf(base({ isToday: true, accum: null }))).toEqual([]);
    expect(candleCaptionOf(base({ isToday: true, ma: [{ name: '단순 60', status: 'short-bars' }] }))).toEqual([
      '단순 60 — 이 봉 단위로는 봉이 모자라 그리지 않아요',
    ]);
  });

  it('과거 · 미등록(accum null) → 「누적 자료 없음(매집감지 미등록)」 · 등록 · 포지션 없음 → 「누적 자료 없음(매집감지 포지션 없음)」', () => {
    expect(candleCaptionOf(base({ accum: null, hasCum: false }))).toEqual(['누적 자료 없음(매집감지 미등록)']);
    expect(candleCaptionOf(base({ accum: undefined }))).toEqual(['누적 자료 없음(매집감지 미등록)']);
    expect(candleCaptionOf(base({ hasCum: false }))).toEqual(['누적 자료 없음(매집감지 포지션 없음)']);
  });

  it('누적 있음 KRX → 「누적 = 매집감지 보고서 값 · 우리 체결 제외」 · NXT → 끝에 「 · KRX+NXT 합산」', () => {
    expect(candleCaptionOf(base())).toEqual(['누적 = 매집감지 보고서 값 · 우리 체결 제외']);
    expect(candleCaptionOf(base({ nxt: true }))).toEqual(['누적 = 매집감지 보고서 값 · 우리 체결 제외 · KRX+NXT 합산']);
  });

  it('선 안내 — short-days · short-bars · error 는 한 번 · loading · ok 는 없음 · 순서 = 누적 캡션 → 선 안내(입력 순서)', () => {
    const items = candleCaptionOf(
      base({
        ma: [
          { name: '단순 5', status: 'ok' },
          { name: '일 120', status: 'short-days' },
          { name: '일 20', status: 'error' },
          { name: '단순 60', status: 'short-bars' },
          { name: '일 60', status: 'error' },
          { name: '일 5', status: 'loading' },
        ],
      }),
    );
    expect(items).toEqual([
      '누적 = 매집감지 보고서 값 · 우리 체결 제외',
      '일 120 — 지난 거래일 종가가 모자라 그리지 않아요',
      '일 이동평균 — 일별 종가를 불러오지 못했어요(화면을 다시 열면 다시 불러와요)',
      '단순 60 — 이 봉 단위로는 봉이 모자라 그리지 않아요',
    ]);
  });
});
