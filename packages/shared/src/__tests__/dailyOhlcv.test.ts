import { describe, expect, it } from 'vitest';
import {
  DAILY_OHLCV_RANGES,
  type DailyOhlcvRangeKey,
  type DailyOhlcvRow,
} from '../dailyOhlcv.js';

describe('DailyOhlcvRow / DailyOhlcvRangeKey', () => {
  it('exposes 4 range keys in 1M → 1Y order', () => {
    expect(DAILY_OHLCV_RANGES).toEqual(['1M', '3M', '6M', '1Y']);
    expect(DAILY_OHLCV_RANGES).toHaveLength(4);
  });

  it('accepts a full row with nullable change fields', () => {
    const row: DailyOhlcvRow = {
      date: '2026-05-15',
      open: 70000,
      high: 71000,
      low: 69500,
      close: 70500,
      volume: 12_345_678,
      changeAmount: 500,
      changeRate: 0.71,
    };
    expect(row.date).toBe('2026-05-15');

    const newlyListed: DailyOhlcvRow = {
      date: '2026-05-15',
      open: 10000,
      high: 11000,
      low: 9500,
      close: 10500,
      volume: 1000,
      changeAmount: null,
      changeRate: null,
    };
    expect(newlyListed.changeAmount).toBeNull();
  });

  it('rejects out-of-domain range keys at the type level', () => {
    // @ts-expect-error 5Y 는 v1 범위 외
    const _bad: DailyOhlcvRangeKey = '5Y';
    expect(true).toBe(true);
  });
});
