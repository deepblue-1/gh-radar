import { describe, it, expect } from 'vitest';
import { formatKstTime } from './scanner-time';

describe('formatKstTime', () => {
  it('2026-04-14T05:32:08Z → 14:32:08 KST (UTC+9)', () => {
    expect(formatKstTime(Date.UTC(2026, 3, 14, 5, 32, 8))).toBe('14:32:08 KST');
  });

  it('자정(UTC 15:00 전일) → 00:00:00 KST', () => {
    // 2026-04-13 15:00:00 UTC = 2026-04-14 00:00:00 KST
    expect(formatKstTime(Date.UTC(2026, 3, 13, 15, 0, 0))).toBe('00:00:00 KST');
  });

  it('12시 정각(UTC 03:00) → 12:00:00 KST', () => {
    expect(formatKstTime(Date.UTC(2026, 3, 14, 3, 0, 0))).toBe('12:00:00 KST');
  });

  it('23:59:59 KST (UTC 14:59:59)', () => {
    expect(formatKstTime(Date.UTC(2026, 3, 14, 14, 59, 59))).toBe(
      '23:59:59 KST',
    );
  });

  it('한자리 시/분/초는 2자리 zero-pad', () => {
    // 2026-04-14 00:04:05 KST = 2026-04-13 15:04:05 UTC
    expect(formatKstTime(Date.UTC(2026, 3, 13, 15, 4, 5))).toBe('00:04:05 KST');
  });
});
