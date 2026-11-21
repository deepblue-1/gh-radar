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

describe('decideAccess — trader 어드민 메뉴 (quick 261121-n1b)', () => {
  const trader = (pathname: string, adminMenus?: readonly string[]) =>
    decideAccess({ pathname, role: 'trader', roleError: false, adminMenus });

  it('trader + [pnl] → /admin/pnl · /admin/pnl/x 통과 · /admin/settlement 는 /', () => {
    expect(trader('/admin/pnl', ['pnl'])).toEqual(next);
    expect(trader('/admin/pnl/x', ['pnl'])).toEqual(next);
    expect(trader('/admin/settlement', ['pnl'])).toEqual(toHome);
  });

  it('trader + [settlement] → /admin/settlement 통과 · /admin/pnl 은 /', () => {
    expect(trader('/admin/settlement', ['settlement'])).toEqual(next);
    expect(trader('/admin/pnl', ['settlement'])).toEqual(toHome);
  });

  it.each(['/admin', '/admin/users', '/admin/accounts', '/admin/servers', '/admin/launch'])(
    'trader + [pnl, settlement] 여도 %j 는 /',
    (pathname) => {
      expect(trader(pathname, ['pnl', 'settlement'])).toEqual(toHome);
    },
  );

  it('경계 밖 이웃 이름 /admin/pnlx · /admin/settlements 는 /', () => {
    expect(trader('/admin/pnlx', ['pnl', 'settlement'])).toEqual(toHome);
    expect(trader('/admin/settlements', ['pnl', 'settlement'])).toEqual(toHome);
  });

  it('모르는 메뉴 문자열 · 프로토타입 키는 무시 → /', () => {
    expect(trader('/admin/users', ['users'])).toEqual(toHome);
    expect(trader('/admin/pnl', ['toString', '__proto__'])).toEqual(toHome);
  });

  it('메뉴 없음 · 생략 → 기존 판정 그대로(/admin/pnl 도 /)', () => {
    expect(trader('/admin/pnl', [])).toEqual(toHome);
    expect(trader('/admin/pnl')).toEqual(toHome);
  });

  it('viewer + [pnl, settlement] → /admin/pnl · /admin/settlement 도 / (메뉴는 trader 에게만 효력)', () => {
    for (const pathname of ['/admin/pnl', '/admin/settlement']) {
      expect(
        decideAccess({ pathname, role: 'viewer', roleError: false, adminMenus: ['pnl', 'settlement'] }),
      ).toEqual(toHome);
    }
  });

  it('역할 오류 · 역할 없음 우선순위 불변 — 메뉴가 있어도 /pending', () => {
    expect(
      decideAccess({ pathname: '/admin/pnl', role: 'trader', roleError: true, adminMenus: ['pnl'] }),
    ).toEqual(toPending);
    expect(
      decideAccess({ pathname: '/admin/pnl', role: null, roleError: false, adminMenus: ['pnl'] }),
    ).toEqual(toPending);
  });

  it('admin 은 메뉴와 무관하게 /admin 전부 통과', () => {
    expect(decideAccess({ pathname: '/admin/users', role: 'admin', roleError: false, adminMenus: [] })).toEqual(next);
  });
});
