import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * admin-api 단위 테스트 (Phase 29 29-15 · 29-13 라우트 표).
 *
 * 잠그는 것: 경로(인코딩 포함) · 메서드 · JSON 바디 · Content-Type · Bearer · relay 경유 경로의 긴 타임아웃.
 * 하네스는 `orders-api.test.ts` 그대로(supabase getSession 목 + `vi.mock('../api')` 의 apiFetch 만 교체).
 */

const getSessionMock = vi.fn(async () => ({
  data: { session: { access_token: 'tok-abc' } as { access_token: string } | null },
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: () => getSessionMock() } }),
}));

const apiFetchMock = vi.fn();
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

import { ApiClientError } from '../api';
import {
  RELAY_TIMEOUT_MS,
  changeDmaPassword,
  connectAdminDma,
  deleteAdminUser,
  fetchAdminServers,
  fetchAdminUsers,
  patchAdminRole,
  patchAdminServer,
  putDmaAccount,
  reconcileDmaUser,
  removeDmaAccount,
  setOrderServer,
  setQuotePrimary,
  upsertAdminServer,
  upsertAdminUser,
} from '../admin-api';

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ ok: true });
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok-abc' } } });
});

/** n 번째 apiFetch 호출의 (경로, init). */
function call(n = 0): { path: string; init: Record<string, unknown> & { headers: Record<string, string> } } {
  const [path, init] = apiFetchMock.mock.calls[n] as [string, Record<string, unknown> & { headers: Record<string, string> }];
  return { path, init };
}

const ACCOUNT = {
  broker: 'KB' as const,
  accountNo: '12345678901',
  name: '위탁',
  branchNo: '00123',
  traderId: '000456',
  priority: 1,
};

describe('admin-api — 사용자', () => {
  it('fetchAdminUsers — GET /api/admin/users · Bearer · 응답 그대로', async () => {
    const overview = { users: [], pending: [], serverOnly: [], servers: [] };
    apiFetchMock.mockResolvedValueOnce(overview);
    await expect(fetchAdminUsers()).resolves.toBe(overview);
    const { path, init } = call();
    expect(path).toBe('/api/admin/users');
    expect(init.method).toBeUndefined();
    expect(init.headers.Authorization).toBe('Bearer tok-abc');
  });

  it('upsertAdminUser — 승인({ email, role })은 POST JSON · 기본 타임아웃', async () => {
    await upsertAdminUser({ email: 'lee.new@example.invalid', role: 'trader' });
    const { path, init } = call();
    expect(path).toBe('/api/admin/users');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'lee.new@example.invalid', role: 'trader' });
    expect(init.timeoutMs).toBeUndefined();
  });

  it('upsertAdminUser — dma 를 실으면 relay 경유라 긴 타임아웃', async () => {
    await upsertAdminUser({
      email: 'kim@example.invalid',
      role: 'trader',
      dma: { dmaUserId: 'kimtr', password: 'pw', account: ACCOUNT, servers: ['KB120'] },
    });
    expect(call().init.timeoutMs).toBe(RELAY_TIMEOUT_MS);
  });

  it('patchAdminRole · deleteAdminUser · connectAdminDma — 이메일을 경로 인코딩', async () => {
    await patchAdminRole('a+b@example.invalid', 'viewer');
    expect(call(0).path).toBe('/api/admin/users/a%2Bb%40example.invalid');
    expect(call(0).init.method).toBe('PATCH');
    expect(JSON.parse(call(0).init.body as string)).toEqual({ role: 'viewer' });

    await deleteAdminUser('a+b@example.invalid');
    expect(call(1).path).toBe('/api/admin/users/a%2Bb%40example.invalid');
    expect(call(1).init.method).toBe('DELETE');
    expect(call(1).init.body).toBeUndefined();
    expect(call(1).init.timeoutMs).toBe(RELAY_TIMEOUT_MS);

    const dma = { dmaUserId: 'kimtr', password: 'pw', account: ACCOUNT, servers: ['KB120', 'KB121'] };
    await connectAdminDma('a+b@example.invalid', dma);
    expect(call(2).path).toBe('/api/admin/users/a%2Bb%40example.invalid/dma');
    expect(call(2).init.method).toBe('POST');
    expect(JSON.parse(call(2).init.body as string)).toEqual(dma);
  });

  it('세션이 없으면 서버 왕복 없이 UNAUTHENTICATED', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    await expect(fetchAdminUsers()).rejects.toBeInstanceOf(ApiClientError);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe('admin-api — DMA 사용자(relay 프록시)', () => {
  it('비밀번호 · 계좌 put/remove · 다시 반영 — 경로 · 메서드 · 바디', async () => {
    await changeDmaPassword('kim/tr', 'secret');
    expect(call(0).path).toBe('/api/admin/dma-users/kim%2Ftr/password');
    expect(call(0).init.method).toBe('POST');
    expect(JSON.parse(call(0).init.body as string)).toEqual({ password: 'secret' });

    await putDmaAccount('kimtr', { account: ACCOUNT, servers: ['KB120'] });
    expect(call(1).path).toBe('/api/admin/dma-users/kimtr/accounts');
    expect(call(1).init.method).toBe('PUT');
    expect(JSON.parse(call(1).init.body as string)).toEqual({ account: ACCOUNT, servers: ['KB120'] });

    await removeDmaAccount('kimtr', 'KYOBO', '98765432-01');
    expect(call(2).path).toBe('/api/admin/dma-users/kimtr/accounts/KYOBO/98765432-01');
    expect(call(2).init.method).toBe('DELETE');

    await reconcileDmaUser('kimtr');
    expect(call(3).path).toBe('/api/admin/dma-users/kimtr/reconcile');
    expect(call(3).init.method).toBe('POST');

    for (let i = 0; i < 4; i++) expect(call(i).init.timeoutMs).toBe(RELAY_TIMEOUT_MS);
  });
});

describe('admin-api — 서버 레지스트리', () => {
  it('GET · POST · PATCH · order-server · quote-primary', async () => {
    await fetchAdminServers();
    expect(call(0).path).toBe('/api/admin/servers');

    await upsertAdminServer({ key: 'KB122', broker: 'KB', host: '192.0.2.10', port: 9000 });
    expect(call(1).path).toBe('/api/admin/servers');
    expect(call(1).init.method).toBe('POST');
    expect(JSON.parse(call(1).init.body as string)).toEqual({
      key: 'KB122',
      broker: 'KB',
      host: '192.0.2.10',
      port: 9000,
    });

    await patchAdminServer('KB121', { enabled: false });
    expect(call(2).path).toBe('/api/admin/servers/KB121');
    expect(call(2).init.method).toBe('PATCH');
    expect(JSON.parse(call(2).init.body as string)).toEqual({ enabled: false });

    await setOrderServer('KYOBO119');
    expect(call(3).path).toBe('/api/admin/servers/KYOBO119/order-server');
    expect(call(3).init.method).toBe('PUT');

    await setQuotePrimary('KB121');
    expect(call(4).path).toBe('/api/admin/servers/KB121/quote-primary');
    expect(call(4).init.method).toBe('PUT');
    expect(call(4).init.timeoutMs).toBe(RELAY_TIMEOUT_MS);
  });
});
