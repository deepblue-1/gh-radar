import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    ['1M', '2026-03-16'],
    ['3M', '2026-01-15'],
    ['6M', '2025-10-07'],
    ['1Y', '2025-04-10'],
  ] as const)('range %s → today − N일 = %s', (range, expected) => {
    expect(rangeToFromDate(range, today)).toBe(expected);
  });

  it('today 인자 미주입 시 현재 시각 기준 호출 가능 (smoke)', () => {
    const result = rangeToFromDate('1M');
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

    const rows = await fetchDailyOhlcv('005930', '1M');

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

    const rows = await fetchDailyOhlcv('900001', '1M');
    expect(rows[0].changeAmount).toBeNull();
    expect(rows[0].changeRate).toBeNull();
  });

  it('AbortSignal 주입 시 Supabase abortSignal() 호출 chain 진입', async () => {
    const ctrl = new AbortController();
    await fetchDailyOhlcv('005930', '1M', ctrl.signal);
    expect(recordedAbortSignal).toBe(ctrl.signal);
  });

  it('Supabase error → throw', async () => {
    finalResolved = { data: null, error: new Error('PostgREST 401') };
    await expect(fetchDailyOhlcv('005930', '1M')).rejects.toThrow(
      'PostgREST 401',
    );
  });

  it('data === null 응답을 빈 배열로 정규화', async () => {
    finalResolved = { data: null, error: null };
    const rows = await fetchDailyOhlcv('005930', '1M');
    expect(rows).toEqual([]);
  });
});
