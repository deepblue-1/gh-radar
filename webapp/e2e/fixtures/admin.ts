import type { Page, Route } from '@playwright/test';
import type {
  AdminServerResult,
  AdminServersOverview,
  AdminServerView,
  AdminUsersOverview,
  AdminUserView,
  AppRole,
  DmaBroker,
} from '@gh-radar/shared';

/**
 * Phase 29 (29-15) — 웹 Admin E2E 픽스처.
 *
 * ① 왜 목인가
 *   `/admin/*` 화면은 Express `/api/admin/*` 만 부른다(D-07 — 브라우저 fetch). middleware 는 실 Supabase 로 e2e
 *   계정(admin 시드 — 29-07 `seed-test-user.ts`)을 통과시키고, 화면 데이터는 여기서 `page.route` 로 준다.
 *   relay wss 는 필요 없다. 라우트는 host 무관 `**`(NEXT_PUBLIC_API_BASE_URL 과 무관 — mock-api.ts 와 같다).
 *
 * ② 메모리 상태 + 요청 기록
 *   `mockAdminApi` 는 GET/POST/PATCH/PUT/DELETE 를 메모리 상태로 응답하고 모든 요청을 `requests` 에 쌓는다.
 *   쓰기는 상태를 바꾸므로 화면의 「재조회」 가 바뀐 목록을 받는다(승인 → 사용자 목록으로 이동 등).
 *   spec 은 `onRequest` 로 특정 요청의 응답을 덮을 수 있다(실패 · 409 · BUSY 결과 등 — 29-17 · 29-18 · 29-19).
 *
 * ③ 값은 목업 A 와 같은 모양
 *   `reference/mockup-admin-users.html` 의 USERS 4행(웹 3 + 서버에만 1) + PENDING 1행. 이메일은 실주소 대신
 *   `*@example.invalid`, 서버 주소는 TEST-NET(RFC 5737) 이다.
 */

export const ADMIN_SERVER_KEYS = ['KB120', 'KB121', 'KYOBO119', 'KYOBO127'] as const;

const REGISTRY: AdminUsersOverview['servers'] = [
  { key: 'KB120', broker: 'KB', enabled: true },
  { key: 'KB121', broker: 'KB', enabled: true },
  { key: 'KYOBO119', broker: 'KYOBO', enabled: true },
  { key: 'KYOBO127', broker: 'KYOBO', enabled: true },
];

/** KB121 BUSY 실패 message — 서버 한국어 문장 그대로(D-23 ④). 칩 `title` 단언에 쓴다. */
export const ADMIN_BUSY_MESSAGE = '미체결 주문 또는 실행 중인 전략이 있어 변경할 수 없습니다';

export const ADMIN_USERS_FIXTURE: AdminUsersOverview = {
  users: [
    {
      email: 'alex@example.invalid',
      role: 'admin',
      dmaUserId: 'alexjx',
      signedUp: true,
      accountCount: 2,
      servers: [
        { serverKey: 'KB120', tone: 'ok', message: null },
        { serverKey: 'KB121', tone: 'ok', message: null },
        { serverKey: 'KYOBO119', tone: 'ok', message: null },
        { serverKey: 'KYOBO127', tone: 'warn', message: null },
      ],
      accounts: [
        {
          broker: 'KB',
          accountNo: '11122233301',
          name: '위탁',
          branchNo: '00123',
          traderId: '000456',
          priority: 1,
          servers: [
            { serverKey: 'KB120', tone: 'ok', message: null, state: 'active' },
            { serverKey: 'KB121', tone: 'ok', message: null, state: 'active' },
          ],
          serverOnlyOn: [],
        },
        {
          broker: 'KYOBO',
          accountNo: '5556667701',
          name: '위탁',
          branchNo: '',
          traderId: '',
          priority: 2,
          servers: [
            { serverKey: 'KYOBO119', tone: 'ok', message: null, state: 'active' },
            { serverKey: 'KYOBO127', tone: 'warn', message: null, state: 'active' },
          ],
          serverOnlyOn: [],
        },
      ],
    },
    {
      email: 'kim.trader@example.invalid',
      role: 'trader',
      dmaUserId: 'kimtr',
      signedUp: true,
      accountCount: 2,
      servers: [
        { serverKey: 'KB120', tone: 'ok', message: null },
        { serverKey: 'KB121', tone: 'err', message: ADMIN_BUSY_MESSAGE },
        { serverKey: 'KYOBO119', tone: 'ok', message: null },
      ],
      accounts: [
        {
          broker: 'KB',
          accountNo: '12345678901',
          name: '위탁',
          branchNo: '00123',
          traderId: '000789',
          priority: 1,
          servers: [
            { serverKey: 'KB120', tone: 'ok', message: null, state: 'active' },
            { serverKey: 'KB121', tone: 'err', message: ADMIN_BUSY_MESSAGE, state: 'active' },
          ],
          serverOnlyOn: [],
        },
        {
          broker: 'KYOBO',
          accountNo: '9876543201',
          name: '위탁',
          branchNo: '',
          traderId: '',
          priority: 2,
          servers: [{ serverKey: 'KYOBO119', tone: 'ok', message: null, state: 'active' }],
          serverOnlyOn: [],
        },
      ],
    },
    {
      email: 'park.view@example.invalid',
      role: 'viewer',
      dmaUserId: null,
      signedUp: true,
      accountCount: 0,
      servers: [],
      accounts: [],
    },
  ],
  pending: [{ email: 'lee.new@example.invalid', signedUpAt: new Date().toISOString() }],
  serverOnly: [{ dmaUserId: 'smok95', servers: ['KYOBO119'], accountCount: 1 }],
  servers: REGISTRY,
};

function server(
  key: string,
  broker: DmaBroker,
  host: string,
  over: Partial<AdminServerView> = {},
): AdminServerView {
  return {
    key,
    broker,
    host,
    port: 9000,
    enabled: true,
    isOrderServer: false,
    isQuotePrimary: false,
    sortOrder: 0,
    userCount: 0,
    status: { conn: 'ok', journal: 'ok', admin: 'ok', quote: null },
    ...over,
  };
}

export const ADMIN_SERVERS_FIXTURE: AdminServersOverview = {
  groups: [
    {
      broker: 'KB',
      servers: [
        server('KB120', 'KB', '192.0.2.120', {
          isOrderServer: true,
          isQuotePrimary: true,
          sortOrder: 1,
          userCount: 3,
          status: { conn: 'ok', journal: 'ok', admin: 'ok', quote: 'live' },
        }),
        server('KB121', 'KB', '192.0.2.121', { sortOrder: 2, userCount: 2 }),
      ],
    },
    {
      broker: 'KYOBO',
      servers: [
        server('KYOBO119', 'KYOBO', '198.51.100.119', { isOrderServer: true, sortOrder: 1, userCount: 3 }),
        server('KYOBO127', 'KYOBO', '198.51.100.127', {
          sortOrder: 2,
          userCount: 1,
          status: { conn: 'down', journal: 'down', admin: 'down', quote: null },
        }),
      ],
    },
  ],
};

/** 기록된 요청 1건 — `path` 는 `/api/admin` 뒤(디코드 전 원문 · 예 `/users/lee.new%40example.invalid`). */
export interface AdminRequestRecord {
  method: string;
  path: string;
  body: unknown;
}

export interface AdminMockResponse {
  status?: number;
  body: unknown;
}

export interface MockAdminApiOptions {
  users?: AdminUsersOverview;
  servers?: AdminServersOverview;
  /**
   * 요청을 기본 처리 전에 가로챈다 — 응답을 돌려주면 그 응답을 쓰고(상태는 바뀌지 않는다), `undefined` 면
   * 기본 메모리 처리로 간다. 기록은 어느 쪽이든 남는다.
   */
  onRequest?: (req: AdminRequestRecord) => AdminMockResponse | undefined | Promise<AdminMockResponse | undefined>;
}

export interface AdminApiMock {
  /** 들어온 순서대로 모든 요청. */
  requests: AdminRequestRecord[];
  /** 현재 메모리 상태(쓰기가 바꾼다). */
  state: { users: AdminUsersOverview; servers: AdminServersOverview };
}

const ROLE_ORDER: Record<AppRole, number> = { admin: 0, trader: 1, viewer: 2 };

function sortUsers(users: AdminUserView[]): AdminUserView[] {
  return users.sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.email < b.email ? -1 : a.email > b.email ? 1 : 0),
  );
}

function okResults(servers: readonly string[]): AdminServerResult[] {
  return servers.map((s) => ({ server: s, outcome: 'ok' as const }));
}

function notFound(): AdminMockResponse {
  return { status: 404, body: { error: { code: 'NOT_FOUND', message: '없는 경로예요' } } };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Admin API 경로 전부(host 무관 glob)를 메모리 상태로 응답한다. 반환값의 `requests` 로 보낸 요청을 단언한다.
 */
export async function mockAdminApi(page: Page, opts: MockAdminApiOptions = {}): Promise<AdminApiMock> {
  const mock: AdminApiMock = {
    requests: [],
    state: {
      users: clone(opts.users ?? ADMIN_USERS_FIXTURE),
      servers: clone(opts.servers ?? ADMIN_SERVERS_FIXTURE),
    },
  };

  const handle = (req: AdminRequestRecord): AdminMockResponse => {
    const { users, servers } = mock.state;
    const seg = req.path.split('/').filter(Boolean).map(decodeURIComponent);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const findUser = (email: string) => users.users.find((u) => u.email === email);

    // ── /users ──────────────────────────────────────────────────────────────
    if (seg[0] === 'users') {
      if (seg.length === 1 && req.method === 'GET') return { body: users };
      if (seg.length === 1 && req.method === 'POST') {
        const email = String(body.email ?? '').trim().toLowerCase();
        const role = body.role as AppRole;
        const dma = body.dma as { dmaUserId: string; servers: string[] } | undefined;
        users.pending = users.pending.filter((p) => p.email !== email);
        const existing = findUser(email);
        if (existing) {
          existing.role = role;
          if (dma) existing.dmaUserId = dma.dmaUserId;
        } else {
          users.users.push({
            email,
            role,
            dmaUserId: dma?.dmaUserId ?? null,
            signedUp: true,
            accountCount: dma ? 1 : 0,
            servers: dma ? dma.servers.map((s) => ({ serverKey: s, tone: 'ok' as const, message: null })) : [],
            accounts: [],
          });
        }
        sortUsers(users.users);
        return { body: { ok: true, relayNotified: true, ...(dma ? { results: okResults(dma.servers) } : {}) } };
      }
      const email = seg[1];
      const user = findUser(email);
      if (seg.length === 2 && req.method === 'PATCH') {
        if (!user) return notFound();
        user.role = body.role as AppRole;
        sortUsers(users.users);
        return { body: { ok: true, relayNotified: true } };
      }
      if (seg.length === 2 && req.method === 'DELETE') {
        if (!user) return notFound();
        users.users = users.users.filter((u) => u.email !== email);
        const results = user.dmaUserId ? okResults(user.servers.map((c) => c.serverKey)) : undefined;
        return { body: { ok: true, deleted: true, relayNotified: true, ...(results ? { results } : {}) } };
      }
      if (seg.length === 3 && seg[2] === 'dma' && req.method === 'POST') {
        if (!user) return notFound();
        const dmaServers = (body.servers as string[] | undefined) ?? [];
        user.dmaUserId = String(body.dmaUserId ?? '');
        user.accountCount = 1;
        user.servers = dmaServers.map((s) => ({ serverKey: s, tone: 'ok' as const, message: null }));
        return { body: { results: okResults(dmaServers), relayNotified: true } };
      }
      return notFound();
    }

    // ── /dma-users/:dma/* — relay 프록시: 그 DMA 사용자의 서버 전부 ok ─────────
    if (seg[0] === 'dma-users' && seg.length >= 3) {
      const owner = users.users.find((u) => u.dmaUserId === seg[1]);
      const keys = owner?.servers.map((c) => c.serverKey) ?? [];
      if (seg[2] === 'accounts' && req.method === 'PUT') {
        return { body: { results: okResults((body.servers as string[] | undefined) ?? []) } };
      }
      if (
        (seg[2] === 'password' && req.method === 'POST') ||
        (seg[2] === 'reconcile' && req.method === 'POST') ||
        (seg[2] === 'accounts' && seg.length === 5 && req.method === 'DELETE')
      ) {
        return { body: { results: okResults(keys) } };
      }
      return notFound();
    }

    // ── /servers ────────────────────────────────────────────────────────────
    if (seg[0] === 'servers') {
      const all = servers.groups.flatMap((g) => g.servers);
      if (seg.length === 1 && req.method === 'GET') return { body: servers };
      if (seg.length === 1 && req.method === 'POST') {
        const broker = body.broker as DmaBroker;
        const group = servers.groups.find((g) => g.broker === broker);
        if (!group) return notFound();
        if (all.some((s) => s.key === body.key)) {
          return { status: 409, body: { error: { code: 'SERVER_EXISTS', message: '이미 있는 서버예요' } } };
        }
        group.servers.push(
          server(String(body.key), broker, String(body.host), {
            port: Number(body.port),
            enabled: false,
            sortOrder: Number(body.sortOrder ?? group.servers.length + 1),
            status: null,
          }),
        );
        return { body: { ok: true, relayNotified: true } };
      }
      const target = all.find((s) => s.key === seg[1]);
      if (!target) return notFound();
      if (seg.length === 2 && req.method === 'PATCH') {
        Object.assign(target, body);
        return { body: { ok: true, relayNotified: true } };
      }
      if (seg.length === 3 && req.method === 'PUT' && (seg[2] === 'order-server' || seg[2] === 'quote-primary')) {
        const flag = seg[2] === 'order-server' ? 'isOrderServer' : 'isQuotePrimary';
        for (const s of all) if (s.broker === target.broker) s[flag] = s.key === target.key;
        return { body: seg[2] === 'order-server' ? { ok: true, relayNotified: true } : { ok: true } };
      }
      return notFound();
    }

    return notFound();
  };

  await page.route('**/api/admin/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const idx = url.pathname.indexOf('/api/admin');
    const raw = request.postData();
    let body: unknown = null;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    const record: AdminRequestRecord = {
      method: request.method(),
      path: url.pathname.slice(idx + '/api/admin'.length),
      body,
    };
    mock.requests.push(record);
    const res = (await opts.onRequest?.(record)) ?? handle(record);
    await route.fulfill({
      status: res.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(res.body),
    });
  });

  return mock;
}
