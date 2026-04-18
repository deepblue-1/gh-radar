import { describe, it, expect } from 'vitest';
import {
  formatDiscussionCardDate,
  formatDiscussionFullDate,
} from '../format-discussion-date';

describe('formatDiscussionCardDate (MM/DD HH:mm KST)', () => {
  it('formats UTC ISO to KST card style', () => {
    // 2026-04-17T05:32:00Z → KST 14:32 on 04/17
    expect(formatDiscussionCardDate('2026-04-17T05:32:00.000Z')).toBe('04/17 14:32');
  });

  it('pads single-digit month/day with 2 digits', () => {
    // 2026-01-05T00:00:00Z → KST 09:00 on 01/05
    expect(formatDiscussionCardDate('2026-01-05T00:00:00.000Z')).toBe('01/05 09:00');
  });

  it('handles ISO with KST +09:00 offset', () => {
    // 2026-04-17T14:32:29+09:00 == 14:32 KST
    expect(formatDiscussionCardDate('2026-04-17T14:32:29+09:00')).toBe('04/17 14:32');
  });

  it('returns em-dash on invalid input', () => {
    expect(formatDiscussionCardDate('invalid')).toBe('—');
  });

  it('returns em-dash on empty/null/undefined', () => {
    expect(formatDiscussionCardDate('')).toBe('—');
    expect(formatDiscussionCardDate(null)).toBe('—');
    expect(formatDiscussionCardDate(undefined)).toBe('—');
  });
});

describe('formatDiscussionFullDate (YYYY-MM-DD HH:mm KST)', () => {
  it('formats UTC ISO to KST full style', () => {
    expect(formatDiscussionFullDate('2026-04-17T05:32:00.000Z')).toBe(
      '2026-04-17 14:32',
    );
  });

  it('handles KST offset input', () => {
    expect(formatDiscussionFullDate('2026-04-17T14:32:29+09:00')).toBe(
      '2026-04-17 14:32',
    );
  });

  it('returns em-dash on invalid input', () => {
    expect(formatDiscussionFullDate('not-a-date')).toBe('—');
  });

  it('returns em-dash on empty/null/undefined', () => {
    expect(formatDiscussionFullDate('')).toBe('—');
    expect(formatDiscussionFullDate(null)).toBe('—');
    expect(formatDiscussionFullDate(undefined)).toBe('—');
  });
});
