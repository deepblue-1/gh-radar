import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyOhlcvRow } from '@gh-radar/shared';

// ── createClient mock — fetchDailyOhlcv 호출 체인 검증 ──
//
// fetchDailyOhlcv chain:
//   supabase.from('stock_daily_ohlcv')
//     .select(...)
//     .eq('code', code)
//     .gte('date', from)
//     .order('date', { ascending: true })
//     [.abortSignal(signal)]        // signal 주입 시
//   await query  →  { data, error }
//
// order() 가 반환하는 객체가:
//   (a) abortSignal(signal) 메서드 가 있어 다시 thenable 을 반환,
//   (b) await 직접 시 then 으로 finalResolved 를 resolve
// 양쪽 모두 만족해야 한다.

let recordedAbortSignal: AbortSignal | null = null;
let finalResolved: { data: unknown; error: unknown } = {
  data: [],
  error: null,
};

const thenable = {
  then: (resolve: (v: unknown) => void) => resolve(finalResolved),
  abortSignal: (s: AbortSignal) => {
    recordedAbortSignal = s;
    return thenable;
  },
};

const orderMock = vi.fn(() => thenable);
const gteMock = vi.fn(() => ({ order: orderMock }));
const eqMock = vi.fn(() => ({ gte: gteMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: fromMock }),
}));

import {
  aggregateByTimeframe,
  aggregateToMonthly,
  aggregateToWeekly,
  fetchDailyOhlcv,
  rangeToFromDate,
} from '../daily-ohlcv-api';

beforeEach(() => {
  finalResolved = { data: [], error: null };
  recordedAbortSignal = null;
  fromMock.mockClear();
  selectMock.mockClear();
  eqMock.mockClear();
  gteMock.mockClear();
  orderMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rangeToFromDate', () => {
  const today = new Date('2026-05-15T00:00:00Z');

  it.each([
    ['1Y', '2025-04-10'],
    ['2Y', '2024-03-06'],
    ['3Y', '2023-01-31'],
    ['5Y', '2020-11-22'],
  ] as const)('range %s → today − N일 = %s', (range, expected) => {
    expect(rangeToFromDate(range, today)).toBe(expected);
  });

  it('today 인자 미주입 시 현재 시각 기준 호출 가능 (smoke)', () => {
    const result = rangeToFromDate('1Y');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('fetchDailyOhlcv', () => {
  it('Supabase chain 을 stock_daily_ohlcv → eq(code) → gte(date) → order(ascending) 순으로 호출', async () => {
    finalResolved = {
      data: [
        {
          date: '2026-05-14',
          open: '70000',
          high: '71000',
          low: '69500',
          close: '70500',
          volume: '12345',
          change_amount: '500',
          change_rate: '0.71',
        },
      ],
      error: null,
    };

    const rows = await fetchDailyOhlcv('005930', '1Y');

    expect(fromMock).toHaveBeenCalledWith('stock_daily_ohlcv');
    expect(selectMock).toHaveBeenCalledWith(
      'date, open, high, low, close, volume, change_amount, change_rate',
    );
    expect(eqMock).toHaveBeenCalledWith('code', '005930');
    expect(gteMock).toHaveBeenCalledTimes(1);
    expect(orderMock).toHaveBeenCalledWith('date', { ascending: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].open).toBe(70000); // string → number 변환
    expect(rows[0].changeRate).toBe(0.71);
  });

  it('거래정지 row (open=0) 는 응답에서 제외 — 케스피온 079190 4월 9~30일 패턴', async () => {
    finalResolved = {
      data: [
        // 정상 row
        {
          date: '2026-04-08',
          open: 339,
          high: 372,
          low: 328,
          close: 330,
          volume: 2271554,
          change_amount: 5,
          change_rate: 1.54,
        },
        // 거래정지 (KRX 응답이 OHLV=0, close=직전종가)
        {
          date: '2026-04-09',
          open: 0,
          high: 0,
          low: 0,
          close: 330,
          volume: 0,
          change_amount: 0,
          change_rate: 0,
        },
        {
          date: '2026-04-10',
          open: 0,
          high: 0,
          low: 0,
          close: 330,
          volume: 0,
          change_amount: 0,
          change_rate: 0,
        },
        // 거래재개
        {
          date: '2026-05-04',
          open: 780,
          high: 858,
          low: 730,
          close: 858,
          volume: 1266408,
          change_amount: 528,
          change_rate: 30.0,
        },
      ],
      error: null,
    };

    const rows = await fetchDailyOhlcv('079190', '1Y');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.date)).toEqual(['2026-04-08', '2026-05-04']);
  });

  it('change_amount / change_rate null 유지', async () => {
    finalResolved = {
      data: [
        {
          date: '2026-05-14',
          open: 1000,
          high: 1100,
          low: 950,
          close: 1050,
          volume: 100,
          change_amount: null,
          change_rate: null,
        },
      ],
      error: null,
    };

    const rows = await fetchDailyOhlcv('900001', '1Y');
    expect(rows[0].changeAmount).toBeNull();
    expect(rows[0].changeRate).toBeNull();
  });

  it('AbortSignal 주입 시 Supabase abortSignal() 호출 chain 진입', async () => {
    const ctrl = new AbortController();
    await fetchDailyOhlcv('005930', '1Y', ctrl.signal);
    expect(recordedAbortSignal).toBe(ctrl.signal);
  });

  it('Supabase error → throw', async () => {
    finalResolved = { data: null, error: new Error('PostgREST 401') };
    await expect(fetchDailyOhlcv('005930', '1Y')).rejects.toThrow(
      'PostgREST 401',
    );
  });

  it('data === null 응답을 빈 배열로 정규화', async () => {
    finalResolved = { data: null, error: null };
    const rows = await fetchDailyOhlcv('005930', '1Y');
    expect(rows).toEqual([]);
  });
});

/**
 * Aggregate 함수 검증 — 일봉 5일을 주봉 1개로 묶고, 두 달치를 월봉 2개로 묶는다.
 */
describe('aggregateToWeekly / aggregateToMonthly / aggregateByTimeframe', () => {
  /** 2026-05-11(월) ~ 2026-05-15(금) 5 영업일 */
  const week1: DailyOhlcvRow[] = [
    { date: '2026-05-11', open: 100, high: 110, low: 95, close: 105, volume: 100, changeAmount: null, changeRate: null },
    { date: '2026-05-12', open: 105, high: 115, low: 100, close: 110, volume: 110, changeAmount: null, changeRate: null },
    { date: '2026-05-13', open: 110, high: 120, low: 105, close: 115, volume: 120, changeAmount: null, changeRate: null },
    { date: '2026-05-14', open: 115, high: 125, low: 110, close: 120, volume: 130, changeAmount: null, changeRate: null },
    { date: '2026-05-15', open: 120, high: 130, low: 115, close: 125, volume: 140, changeAmount: null, changeRate: null },
  ];

  it('주봉 — 월요일 anchor + OHLC 합산', () => {
    const w = aggregateToWeekly(week1);
    expect(w).toHaveLength(1);
    expect(w[0].date).toBe('2026-05-11');
    expect(w[0].open).toBe(100); // 첫날 open
    expect(w[0].close).toBe(125); // 마지막날 close
    expect(w[0].high).toBe(130); // 주간 max
    expect(w[0].low).toBe(95); // 주간 min
    expect(w[0].volume).toBe(600); // 합산
    expect(w[0].changeAmount).toBeNull();
  });

  it('월봉 — 월 anchor + OHLC 합산 (2 달치)', () => {
    const month1: DailyOhlcvRow[] = [
      ...week1,
      { date: '2026-06-01', open: 130, high: 140, low: 125, close: 135, volume: 200, changeAmount: null, changeRate: null },
      { date: '2026-06-30', open: 135, high: 150, low: 130, close: 145, volume: 210, changeAmount: null, changeRate: null },
    ];
    const m = aggregateToMonthly(month1);
    expect(m).toHaveLength(2);
    expect(m[0].date).toBe('2026-05-01');
    expect(m[0].close).toBe(125);
    expect(m[1].date).toBe('2026-06-01');
    expect(m[1].open).toBe(130);
    expect(m[1].close).toBe(145);
    expect(m[1].high).toBe(150);
    expect(m[1].volume).toBe(410);
  });

  it('aggregateByTimeframe — D 는 raw 반환, W/M 은 분기', () => {
    expect(aggregateByTimeframe(week1, 'D')).toBe(week1);
    expect(aggregateByTimeframe(week1, 'W')).toHaveLength(1);
    expect(aggregateByTimeframe(week1, 'M')).toHaveLength(1);
  });

  it('빈 배열은 빈 배열 반환', () => {
    expect(aggregateToWeekly([])).toEqual([]);
    expect(aggregateToMonthly([])).toEqual([]);
  });
});
