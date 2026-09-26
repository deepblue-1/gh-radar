import { describe, expect, it } from 'vitest';

import { isPublicPath, PUBLIC_PREFIXES } from '../public-path';

/**
 * Phase 22 Plan 03 Task 1 — 공개 경로 판정(D-11 · MOBILE-02b).
 *
 * 미들웨어(`updateSession`)가 로그인 없이 통과시키는 경로를 이 한 함수로 정한다.
 * 통과 표가 깨지면 → 스토어·테스터가 방침 URL(`/privacy`)에서 로그인 화면으로 튕긴다.
 * 차단 표가 깨지면 → 이름이 비슷한 보호 경로(`/privacy-x` 등)가 로그인 없이 열린다(인증 벽 구멍 · T-22-12).
 */

describe('isPublicPath', () => {
  it.each(['/privacy', '/privacy/', '/privacy/anything', '/login', '/auth/callback'])(
    '공개 경로 %j 는 통과',
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each(['/privacyx', '/privacy-x', '/', '/trading', '/me', '/loginx', '/authx'])(
    '보호 경로 %j 는 차단',
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );

  it('공개 prefix 는 정확히 /login · /auth · /privacy 셋이다', () => {
    expect(PUBLIC_PREFIXES).toEqual(['/login', '/auth', '/privacy']);
  });
});
