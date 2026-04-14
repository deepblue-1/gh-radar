import { describe, it, expect } from 'vitest';
import { formatTradeAmount } from './format';

describe('formatTradeAmount', () => {
  it('0 → "-"', () => expect(formatTradeAmount(0)).toBe('-'));
  it('null → "-"', () => expect(formatTradeAmount(null)).toBe('-'));
  it('undefined → "-"', () => expect(formatTradeAmount(undefined)).toBe('-'));
  it('1e8 (1억) → "1억"', () => expect(formatTradeAmount(1e8)).toBe('1억'));
  it('1234e8 (1234억) → "1,234억"', () =>
    expect(formatTradeAmount(1234e8)).toBe('1,234억'));
  it('9999e8 (9999억) → "9,999억"', () =>
    expect(formatTradeAmount(9999e8)).toBe('9,999억'));
  it('1e12 (1조) → "1.0조"', () =>
    expect(formatTradeAmount(1e12)).toBe('1.0조'));
  it('2.3e12 (2.3조) → "2.3조"', () =>
    expect(formatTradeAmount(2.3e12)).toBe('2.3조'));
  it('1,234,567,890 (12.3억대) → "12억" (억 미만 버림)', () =>
    expect(formatTradeAmount(1_234_567_890)).toBe('12억'));
});
