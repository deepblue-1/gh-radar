import { describe, expect, it } from 'vitest';
import {
  DAILY_OHLCV_RANGES,
  DAILY_OHLCV_TIMEFRAMES,
  TIMEFRAME_LABELS,
  type DailyOhlcvRangeKey,
  type DailyOhlcvRow,
  type DailyOhlcvTimeframe,
} from '../dailyOhlcv.js';

describe('DailyOhlcvRow / DailyOhlcvRangeKey', () => {
  it('exposes 4 range keys in 1Y → 5Y order', () => {
    expect(DAILY_OHLCV_RANGES).toEqual(['1Y', '2Y', '3Y', '5Y']);
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
    // @ts-expect-error '1M' 은 더 이상 지원하지 않음 (2026-05-16 사용자 요청)
    const _bad: DailyOhlcvRangeKey = '1M';
    expect(true).toBe(true);
  });
});

describe('DailyOhlcvTimeframe', () => {
  it('exposes 3 timeframe keys in D → M order', () => {
    expect(DAILY_OHLCV_TIMEFRAMES).toEqual(['D', 'W', 'M']);
    expect(DAILY_OHLCV_TIMEFRAMES).toHaveLength(3);
  });

  it('matches each timeframe to a Korean label', () => {
    expect(TIMEFRAME_LABELS.D).toBe('일봉');
    expect(TIMEFRAME_LABELS.W).toBe('주봉');
    expect(TIMEFRAME_LABELS.M).toBe('월봉');
  });

  it('rejects out-of-domain timeframe at the type level', () => {
    // @ts-expect-error '1m' 등은 도메인 외
    const _bad: DailyOhlcvTimeframe = '1m';
    expect(true).toBe(true);
  });
});
