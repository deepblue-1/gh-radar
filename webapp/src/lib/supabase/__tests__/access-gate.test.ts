import { describe, expect, it } from 'vitest';

import { decideAccess } from '../access-gate';

/**
 * Phase 29 Plan 12 — 역할 게이트 판정(D-01 · D-04 · D-21 · ADMIN-02).
 *
 * middleware(`updateSession`)는 로그인 사용자의 비공개 요청마다 `my_app_access()` 결과를 이 함수에 넘긴다.
 * 통과 표가 깨지면 → 승인된 사용자가 승인 대기 화면에 갇힌다.
 * 차단 표가 깨지면 → 미허용 사용자가 데이터를 보거나 viewer 가 트레이딩 표면을 연다.
 */

describe('decideAccess — 트레이서', () => {
  it('admin 은 /scanner 를 통과한다', () => {
    expect(decideAccess({ pathname: '/scanner', role: 'admin', roleError: false })).toEqual({
      kind: 'next',
    });
  });

  it('역할 없음은 /scanner 에서 /pending 으로', () => {
    expect(decideAccess({ pathname: '/scanner', role: null, roleError: false })).toEqual({
      kind: 'redirect',
      to: '/pending',
    });
  });

  it('역할이 있으면 /pending 에서 / 로', () => {
    expect(decideAccess({ pathname: '/pending', role: 'trader', roleError: false })).toEqual({
      kind: 'redirect',
      to: '/',
    });
  });

  it('역할 없음은 /pending 자체를 통과한다(리다이렉트 루프 없음)', () => {
    expect(decideAccess({ pathname: '/pending', role: null, roleError: false })).toEqual({
      kind: 'next',
    });
  });
});

const next = { kind: 'next' } as const;
const toPending = { kind: 'redirect', to: '/pending' } as const;
const toHome = { kind: 'redirect', to: '/' } as const;

describe('decideAccess — 역할 없음 · 조회 오류 (D-01 fail closed)', () => {
  it.each(['/', '/trading', '/admin/users', '/me'])('역할 없음 %j → /pending', (pathname) => {
    expect(decideAccess({ pathname, role: null, roleError: false })).toEqual(toPending);
  });

  it('조회 오류는 역할보다 우선한다 — admin 이라도 /pending', () => {
    expect(decideAccess({ pathname: '/scanner', role: 'admin', roleError: true })).toEqual(
      toPending,
    );
  });
});

describe('decideAccess — admin', () => {
  it.each(['/admin', '/admin/users', '/admin/servers', '/trading', '/me'])(
    'admin 은 %j 를 통과한다',
    (pathname) => {
      expect(decideAccess({ pathname, role: 'admin', roleError: false })).toEqual(next);
    },
  );

  it('경계 밖 /administrator 는 Admin 접두가 아니다 — trader 도 통과', () => {
    expect(decideAccess({ pathname: '/administrator', role: 'trader', roleError: false })).toEqual(
      next,
    );
  });
});

describe('decideAccess — trader (D-02)', () => {
  it.each(['/admin', '/admin/users'])('trader 는 %j 에서 / 로', (pathname) => {
    expect(decideAccess({ pathname, role: 'trader', roleError: false })).toEqual(toHome);
  });

  it.each(['/', '/trading', '/analytics/limitup', '/chat', '/me', '/scanner'])(
    'trader 는 %j 를 통과한다',
    (pathname) => {
      expect(decideAccess({ pathname, role: 'trader', roleError: false })).toEqual(next);
    },
  );
});

describe('decideAccess — viewer (D-21 스캐너 · 뉴스 · 테마만)', () => {
  it.each(['/trading', '/trading/order-log', '/analytics/limitup', '/chat', '/me', '/admin/users'])(
    'viewer 는 %j 에서 / 로',
    (pathname) => {
      expect(decideAccess({ pathname, role: 'viewer', roleError: false })).toEqual(toHome);
    },
  );

  it.each(['/', '/scanner', '/search', '/stocks/005930', '/themes', '/watchlist'])(
    'viewer 는 %j 를 통과한다',
    (pathname) => {
      expect(decideAccess({ pathname, role: 'viewer', roleError: false })).toEqual(next);
    },
  );

  it('경계 밖 /mentor 는 /me 접두가 아니다 — viewer 도 통과', () => {
    expect(decideAccess({ pathname: '/mentor', role: 'viewer', roleError: false })).toEqual(next);
  });
});
