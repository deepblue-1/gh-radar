import { describe, it, expect } from 'vitest';

import { AUTO_REFRESH_INTERVAL_MS, isAutoRefreshWindow } from './auto-refresh-window';

/**
 * quick-260913-g4c — 자동 갱신 KST 창 (평일·비휴장일 08:00~20:05).
 * 모든 입력은 UTC ISO — 브라우저 로컬 타임존과 무관해야 한다.
 */
describe('isAutoRefreshWindow', () => {
  it('간격 상수는 30초', () => {
    expect(AUTO_REFRESH_INTERVAL_MS).toBe(30_000);
  });

  it('2026-09-14(월) KST 07:59 false / 08:00 true / 20:05 true / 20:06 false', () => {
    expect(isAutoRefreshWindow(new Date('2026-09-13T22:59:00Z'))).toBe(false);
    expect(isAutoRefreshWindow(new Date('2026-09-13T23:00:00Z'))).toBe(true);
    expect(isAutoRefreshWindow(new Date('2026-09-14T11:05:59Z'))).toBe(true);
    expect(isAutoRefreshWindow(new Date('2026-09-14T11:06:00Z'))).toBe(false);
  });

  it('UTC 는 일요일이지만 KST 는 월 08:00 → true (UTC 요일 판정이면 실패)', () => {
    expect(isAutoRefreshWindow(new Date('2026-09-13T23:00:00Z'))).toBe(true);
  });

  it('주말·휴장일 → false', () => {
    // KST 일 08:30 (UTC 토 23:30)
    expect(isAutoRefreshWindow(new Date('2026-09-12T23:30:00Z'))).toBe(false);
    // 2026-09-19(토) KST 10:00
    expect(isAutoRefreshWindow(new Date('2026-09-19T01:00:00Z'))).toBe(false);
    // 2026-09-24(목, 추석 연휴 휴장) KST 10:00
    expect(isAutoRefreshWindow(new Date('2026-09-24T01:00:00Z'))).toBe(false);
  });
});
