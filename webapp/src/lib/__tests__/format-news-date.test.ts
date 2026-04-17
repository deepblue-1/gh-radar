import { describe, it, expect } from 'vitest';
import { formatNewsCardDate, formatNewsFullDate } from '../format-news-date';

describe('formatNewsCardDate (MM/DD HH:mm KST)', () => {
  it('formats UTC to KST card style', () => {
    // 2026-04-17T05:32:00Z → KST 14:32 on 04/17
    expect(formatNewsCardDate('2026-04-17T05:32:00.000Z')).toBe('04/17 14:32');
  });

  it('pads single-digit month/day with 2 digits', () => {
    expect(formatNewsCardDate('2026-01-05T00:00:00.000Z')).toBe('01/05 09:00');
  });

  it('returns em-dash on invalid input', () => {
    expect(formatNewsCardDate('invalid')).toBe('—');
  });

  it('returns em-dash on empty/null/undefined', () => {
    expect(formatNewsCardDate('')).toBe('—');
    expect(formatNewsCardDate(null)).toBe('—');
    expect(formatNewsCardDate(undefined)).toBe('—');
  });
});

describe('formatNewsFullDate (YYYY-MM-DD HH:mm KST)', () => {
  it('formats UTC to KST full style', () => {
    expect(formatNewsFullDate('2026-04-17T05:32:00.000Z')).toBe('2026-04-17 14:32');
  });

  it('returns em-dash on invalid input', () => {
    expect(formatNewsFullDate('not-a-date')).toBe('—');
  });

  it('returns em-dash on empty/null/undefined', () => {
    expect(formatNewsFullDate('')).toBe('—');
    expect(formatNewsFullDate(null)).toBe('—');
    expect(formatNewsFullDate(undefined)).toBe('—');
  });
});
