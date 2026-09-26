import { describe, expect, it } from 'vitest';

import { isSafeInternalPath } from '../safe-path';

/**
 * Phase 21 Plan 27 Task 1 — 같은 출처 절대 경로 판정(WR-01 · T-21-16 · T-21-61).
 *
 * login `?next=` · `/auth/callback` `?next=` · 네이티브 navigate 가 이 한 함수를 쓴다.
 * 거부 표가 깨지면 → 로그인 직후(또는 네이티브 탭 이동이) 외부 호스트로 튕기는 오픈 리다이렉트.
 * 통과 표가 깨지면 → 로그인 뒤 원래 보던 화면(쿼리 포함)으로 돌아가지 못하고 홈에 떨어진다.
 */

describe('isSafeInternalPath', () => {
  it.each([
    '/',
    '/me',
    '/trading?focus=a%7Cb',
    '/stocks/005930?tab=news&view=news',
  ])('같은 출처 절대 경로 %j 는 통과', (path) => {
    expect(isSafeInternalPath(path)).toBe(true);
  });

  it.each([
    ['프로토콜 상대', '//evil.com'],
    ['역슬래시(URL 파서가 / 로 읽음)', '/' + '\\' + 'evil.com'],
    ['탭 문자(URL 파서가 지움)', '/\t/evil.com'],
    ['개행 문자(URL 파서가 지움)', '/\n/evil.com'],
    ['절대 URL', 'https://evil.com'],
    ['상대 경로', 'evil.com'],
    ['빈 문자열', ''],
    ['null', null],
    ['undefined', undefined],
    ['숫자', 42],
  ])('%s 은 거부', (_label, path) => {
    expect(isSafeInternalPath(path)).toBe(false);
  });
});
