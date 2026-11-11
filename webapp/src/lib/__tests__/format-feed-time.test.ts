import { describe, expect, it } from 'vitest';

import { formatFeedTime } from '../format-feed-time';

/**
 * Phase 41 Plan 05 Task 1 — 피드 줄 시각 표기(목업 `.fr .t`).
 *
 * 잠그는 것: 같은 KST 날짜면 공시 `HH:MM:SS` · 뉴스 `HH:MM` · 다른 날이면 `MM/DD` ·
 * 날짜 경계는 KST(UTC 15:00 = KST 다음날 00:00) · 호스트 TZ 무관 · 읽을 수 없는 값은 「—」.
 */

// KST 2026-11-12 14:00:00 (= UTC 05:00)
const NOW = new Date('2026-11-12T05:00:00.000Z');

describe('formatFeedTime', () => {
  it('같은 KST 날짜의 공시는 HH:MM:SS', () => {
    expect(formatFeedTime('2026-11-12T13:42:07.000+09:00', 'disclosure', NOW)).toBe('13:42:07');
  });

  it('같은 KST 날짜의 뉴스는 HH:MM', () => {
    expect(formatFeedTime('2026-11-12T09:05:59.000+09:00', 'news', NOW)).toBe('09:05');
  });

  it('다른 날이면 종류와 상관없이 MM/DD', () => {
    expect(formatFeedTime('2026-11-10T21:00:00.000+09:00', 'news', NOW)).toBe('11/10');
    expect(formatFeedTime('2026-11-11T23:59:59.000+09:00', 'disclosure', NOW)).toBe('11/11');
  });

  it('날짜 경계는 KST — UTC 15:00 은 KST 다음날 00:00 이다', () => {
    // now = KST 11-13 00:30
    const now = new Date('2026-11-12T15:30:00.000Z');
    // UTC 14:59 = KST 11-12 23:59 → 어제
    expect(formatFeedTime('2026-11-12T14:59:00.000Z', 'news', now)).toBe('11/12');
    // UTC 15:00 = KST 11-13 00:00 → 오늘
    expect(formatFeedTime('2026-11-12T15:00:00.000Z', 'news', now)).toBe('00:00');
    expect(formatFeedTime('2026-11-12T15:00:09.000Z', 'disclosure', now)).toBe('00:00:09');
  });

  it('읽을 수 없는 시각은 「—」', () => {
    expect(formatFeedTime('not-a-date', 'news', NOW)).toBe('—');
    expect(formatFeedTime('', 'disclosure', NOW)).toBe('—');
  });
});
