import type { Page, Route } from '@playwright/test';
import {
  normalizeAccountNo,
  normalizeOrderIp,
  normalizeOrderMac,
  type AdminAccountFanout,
  type AdminAccountMaster,
  type AdminAccountMasterUser,
  type AdminAccountView,
  type AdminOrderEndpoint,
  type AdminPutAccountBody,
  type AdminServerResult,
  type AdminServersOverview,
  type AdminServerView,
  type AdminUsersOverview,
  type AdminUserView,
  type AppRole,
  type DmaBroker,
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
 *
 * ④ 계좌 주문 서버(29-38 G-1 ⑦) — 의도 계좌는 `orderServer: null`(지정 없음) · `defaultOrderServer` = 그 증권사 기본 주문 서버
 *   (`ADMIN_SERVERS_FIXTURE` 의 `isOrderServer` 와 같은 KB120 · KYOBO119). `PUT …/accounts/:broker/:accountNo/order-server` 는
 *   그 계좌의 active 등록 서버만 받고(아니면 409 `ORDER_SERVER_NOT_REGISTERED`) 상태의 `orderServer` 를 바꾼다.
 *
 * ⑤ 주문자 IP/MAC(30-06) — `ADMIN_USERS_FIXTURE_P30` 은 `ADMIN_USERS_FIXTURE` 복제에 KB 계좌별 `orderEndpoints`(서버별 87 값)를
 *   붙인다: alex 위탁 = 설정 · 일치 · alex 불일치 계좌(KB120 설정 · KB121 미설정) · alex 40자 이름 계좌(미설정 · 폰 backstop) ·
 *   kim 위탁 = 미설정. `ADMIN_USERS_FIXTURE` 는 그대로다(P29 카드는 「확인 전」 으로 보인다).
 *   `PUT /dma-users/:dma/accounts` 는 상태 계좌의 이름을 바꾸고, `orderEndpoint` 가 있으면 **shared 정규화(서버 규칙 한 벌 — 규칙 두
 *   벌 금지)** 로 서버처럼 처리한다 — 둘 다 성공 · 짝이 맞으면 그 계좌 active 등록 서버 전부에 정규화값을 적고 ok, 아니면 상태를
 *   바꾸지 않고 서버마다 failed code 13 + gh-trade 원문(`ADMIN_CODE13_MESSAGE`). 서버 집합은 바꾸지 않는다(P29 토글은 onRequest 몫).
 *   목 상태 · PUT 저장은 87 정규화값이고, 카드는 그 값을 표시 표기(D-17 — `ADMIN_ORDER_IP_DISPLAY` · `ADMIN_ORDER_MAC_DISPLAY`)로 그린다.
 *
 * ⑥ 공유 계좌(30-09 · D-18) — `ADMIN_USERS_FIXTURE_P30` 의 alex(KB120 · KB121) · kim(KB120 만)이 같은 KB 계좌 `ADMIN_SHARED_ACCOUNT`
 *   를 목록 끝에 갖는다(미설정 · 기존 accounts[0] 순서 그대로). 목 PUT 이 IP/MAC 정규화 성공이면 소유자 계좌에 쓴 뒤 **같은 증권사 ·
 *   같은 정규화 계좌번호를 가진 다른 사용자 계좌의 active 서버 중 이번 PUT servers 에 든 서버**에도 같은 정규화값을 쓴다 — gh-trade
 *   261011 op 3 전파(같은 서버 users.toml 안 · 주문자 IP · MAC 만)를 흉내 낸다. 전파 배포 전 실서버의 code 7 거절은
 *   spec 이 필요하면 `onRequest` 로 덮는다(카드 편집이 계좌 시트로 옮겨 가 지금은 그 spec 이 없다 — quick 261106-t8k).
 *
 * ⑥ Phase 36 예수금 · 비용률(36-03) — `ADMIN_USERS_FIXTURE_P36` 은 P30 복제에 alex 계좌별 `costs`(서버별 67/87 병합 값)를 붙인다:
 *   KB 위탁 = KB120 1억 · 0.01% · 0.2%(live) · KB121 5,000만 · 0.05% · 0.2%(snapshot — 서버별 다름 두 줄) · 교보 위탁 = KYOBO119 7억(snapshot) ·
 *   KYOBO127 null(「확인 전」). 목 `PUT …/accounts/:broker/:accountNo/budget|fee` 는 그 계좌 active 등록 서버 중 값을 아는 서버의
 *   `costs` 를 바꾸고(예수금은 live) 서버마다 ok 를 돌려준다 — 재조회가 바뀐 값을 받는다. 실패 · code 1 은 spec 이 `onRequest` 로 덮는다.
 *
 * ⑦ 계좌 마스터 `/accounts`(quick 261106-t8k — 261106-lwu 계좌 메뉴 · 261106-ntl 계좌 시트) — 상태 `accounts` = 마스터 행(users 없음).
 *   기본값은 그 목의 `users` 픽스처 DMA 사용자 계좌를 (broker, 정규화 번호)로 묶어 파생(첫 행 값 · `updatedAt` 고정) + 연결 없는 2행
 *   `ADMIN_UNLINKED_ACCOUNTS`(KB 12345678 · 교보 98765432 — 피커로 고르는 계좌). GET 은 행마다 `users` 를 **요청 때 현재 사용자 상태에서**
 *   계산하므로 사용자 화면의 연결 결과가 그대로 보인다. POST 등록(정규화 번호 중복 409 `ACCOUNT_EXISTS`) · DELETE(연결 있으면 409
 *   `ACCOUNT_IN_USE`). PUT 저장 · …/budget · …/fee 는 연결 사용자마다 그 사용자 계좌에 ⑤ · ⑥ 과 **같은 규칙 한 벌**(내부 함수 공유)을
 *   적용하고 `{ ok: true, fanout: [{ dmaUserId, results(그 계좌 active 서버별), error: null }] }` 로 답한다.
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
          orderServer: null,
          defaultOrderServer: 'KB120',
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
          orderServer: null,
          defaultOrderServer: 'KYOBO119',
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
          orderServer: null,
          defaultOrderServer: 'KB120',
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
          orderServer: null,
          defaultOrderServer: 'KYOBO119',
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

// ── Phase 30 (30-06) 주문자 IP/MAC ────────────────────────────────────────────────

/** gh-trade code 13 문구 원문(AdminProto.cpp — 30-RESEARCH §Pattern 4). 웹 결과 줄은 이 문장을 그대로 싣는다. */
export const ADMIN_CODE13_MESSAGE =
  '주문자 IP/MAC 형식 오류 — IP 는 12자리 숫자 또는 a.b.c.d, MAC 은 12자리 16진, 둘 다 적거나 둘 다 비워야 합니다';

/** 87 값(설정 · 일치 계좌 · 정규화값) — 카드는 표시 표기(D-17 · 아래 `*_DISPLAY`)로 그린다. */
export const ADMIN_ORDER_IP = '010041001124';
export const ADMIN_ORDER_MAC = '1CFD087D978E';
/** 위 87 값의 표시 표기(D-17 · shared `formatOrderIp/Mac`) — 읽기 줄 · 편집칸 초깃값. */
export const ADMIN_ORDER_IP_DISPLAY = '10.41.1.124';
export const ADMIN_ORDER_MAC_DISPLAY = '1C:FD:08:7D:97:8E';

/** 불일치 계좌 — KB120 설정 · KB121 미설정(D-10 경고 줄 1개). */
export const ADMIN_MISMATCH_ACCOUNT = '11122233302';
/** 40자 계좌명 계좌(UI-SPEC E2 long-text backstop) — 미설정. */
export const ADMIN_LONG_NAME_ACCOUNT = '11122233303';
export const ADMIN_LONG_ACCOUNT_NAME = '연금저축 장기투자 배당 성장 혼합 포트폴리오 위탁계좌 분기 리밸런싱 대상';
/** 공유 KB 계좌(30-09 · D-18) — alex(KB120 · KB121) · kim(KB120) 이 함께 쓴다. 머리 주석 ⑥. */
export const ADMIN_SHARED_ACCOUNT = '11122233304';

const UNSET = { orderIp: '', orderMac: '' } as const;

function buildP30Fixture(): AdminUsersOverview {
  const users = JSON.parse(JSON.stringify(ADMIN_USERS_FIXTURE)) as AdminUsersOverview;
  const alex = users.users.find((u) => u.email === 'alex@example.invalid')!;
  const kim = users.users.find((u) => u.email === 'kim.trader@example.invalid')!;
  const set = { orderIp: ADMIN_ORDER_IP, orderMac: ADMIN_ORDER_MAC };

  // alex 위탁 — 설정 · 일치
  alex.accounts[0].orderEndpoints = { KB120: { ...set }, KB121: { ...set } };
  // 교보 — 값은 빈 문자열이어도 화면에 IP/MAC 줄이 없다(D-03 · D-09)
  alex.accounts[1].orderEndpoints = { KYOBO119: { ...UNSET }, KYOBO127: { ...UNSET } };
  const kbServers = () => [
    { serverKey: 'KB120', tone: 'ok' as const, message: null, state: 'active' as const },
    { serverKey: 'KB121', tone: 'ok' as const, message: null, state: 'active' as const },
  ];
  alex.accounts.push(
    {
      broker: 'KB',
      accountNo: ADMIN_MISMATCH_ACCOUNT,
      name: '단타',
      branchNo: '00123',
      traderId: '000456',
      priority: 3,
      servers: kbServers(),
      serverOnlyOn: [],
      orderServer: null,
      defaultOrderServer: 'KB120',
      orderEndpoints: { KB120: { orderIp: '010041001125', orderMac: '1CFD087D978F' }, KB121: { ...UNSET } },
    },
    {
      broker: 'KB',
      accountNo: ADMIN_LONG_NAME_ACCOUNT,
      name: ADMIN_LONG_ACCOUNT_NAME,
      branchNo: '00123',
      traderId: '000456',
      priority: 4,
      servers: kbServers(),
      serverOnlyOn: [],
      orderServer: null,
      defaultOrderServer: 'KB120',
      orderEndpoints: { KB120: { ...UNSET }, KB121: { ...UNSET } },
    },
  );
  // ⑥ 공유 계좌 — alex 쪽(KB120 · KB121 · 미설정). 목록 끝(기존 계좌 순서를 바꾸지 않는다).
  alex.accounts.push({
    broker: 'KB',
    accountNo: ADMIN_SHARED_ACCOUNT,
    name: '공유',
    branchNo: '00123',
    traderId: '000456',
    priority: 5,
    servers: kbServers(),
    serverOnlyOn: [],
    orderServer: null,
    defaultOrderServer: 'KB120',
    orderEndpoints: { KB120: { ...UNSET }, KB121: { ...UNSET } },
  });
  alex.accountCount = alex.accounts.length;

  // kim 위탁 — 등록 서버마다 미설정
  kim.accounts[0].orderEndpoints = { KB120: { ...UNSET }, KB121: { ...UNSET } };
  kim.accounts[1].orderEndpoints = { KYOBO119: { ...UNSET } };
  // ⑥ 공유 계좌 — kim 쪽(KB120 만 · 미설정). 목록 끝.
  kim.accounts.push({
    broker: 'KB',
    accountNo: ADMIN_SHARED_ACCOUNT,
    name: '공유',
    branchNo: '00123',
    traderId: '000456',
    priority: 3,
    servers: [{ serverKey: 'KB120', tone: 'ok', message: null, state: 'active' }],
    serverOnlyOn: [],
    orderServer: null,
    defaultOrderServer: 'KB120',
    orderEndpoints: { KB120: { ...UNSET } },
  });
  kim.accountCount = kim.accounts.length;
  return users;
}

/**
 * P30 픽스처 — `ADMIN_USERS_FIXTURE` 복제 + KB 계좌별 `orderEndpoints`(설정 · 미설정 · 불일치 · 40자 이름). 머리 주석 ⑤.
 */
export const ADMIN_USERS_FIXTURE_P30: AdminUsersOverview = buildP30Fixture();

// ── Phase 36 (36-03) 예수금 · 수수료 · 매도세 ─────────────────────────────────────────

/** P36 픽스처 — `ADMIN_USERS_FIXTURE_P30` 복제 + alex KB · 교보 위탁 계좌의 서버별 `costs`. 머리 주석 ⑥. */
function buildP36Fixture(): AdminUsersOverview {
  const users = clone(ADMIN_USERS_FIXTURE_P30);
  const alex = users.users.find((u) => u.email === 'alex@example.invalid')!;
  alex.accounts[0].costs = {
    KB120: { budgetKrw: 100_000_000, feePpm: 100, sellTaxPpm: 2000, budgetSource: 'live' },
    KB121: { budgetKrw: 50_000_000, feePpm: 500, sellTaxPpm: 2000, budgetSource: 'snapshot' },
  };
  alex.accounts[1].costs = {
    KYOBO119: { budgetKrw: 700_000_000, feePpm: 500, sellTaxPpm: 2000, budgetSource: 'snapshot' },
    KYOBO127: null,
  };
  return users;
}

export const ADMIN_USERS_FIXTURE_P36: AdminUsersOverview = buildP36Fixture();

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
        // 29-38 — 옛 주문 서버에 relay 가 끄지 못한 전략이 남은 계좌 2개(relay servers/status staleAccounts · 29-43)
        server('KB121', 'KB', '192.0.2.121', {
          sortOrder: 2,
          userCount: 2,
          status: { conn: 'ok', journal: 'ok', admin: 'ok', quote: null, staleAccounts: 2 },
        }),
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

// ── quick 261106-t8k 계좌 마스터(머리 주석 ⑦) ─────────────────────────────────────────

/** 마스터 행 — `AdminAccountMaster` 에서 `users` 를 뺀 모양(연결은 GET 때 사용자 상태에서 계산). */
export type AdminAccountMasterRow = Omit<AdminAccountMaster, 'users'>;

export const ADMIN_ACCOUNTS_UPDATED_AT = '2026-11-06T00:00:00.000Z';

/** 어느 사용자에게도 연결되지 않은 계좌 2행 — 사용자 화면 피커가 고르는 계좌(P29-A4 · A5 의 POST 바디 값과 같다). */
export const ADMIN_UNLINKED_ACCOUNTS: readonly AdminAccountMasterRow[] = [
  { broker: 'KB', accountNo: '12345678', name: '', branchNo: '00123', traderId: '000789', updatedAt: ADMIN_ACCOUNTS_UPDATED_AT },
  { broker: 'KYOBO', accountNo: '98765432', name: '', branchNo: '', traderId: '', updatedAt: ADMIN_ACCOUNTS_UPDATED_AT },
];

const masterKey = (broker: string, accountNo: string) => `${broker}|${normalizeAccountNo(accountNo)}`;

function compareMaster(a: AdminAccountMasterRow, b: AdminAccountMasterRow): number {
  if (a.broker !== b.broker) return a.broker < b.broker ? -1 : 1;
  return a.accountNo < b.accountNo ? -1 : a.accountNo > b.accountNo ? 1 : 0;
}

/** 사용자 픽스처의 DMA 사용자 계좌 → 마스터 행(첫 행 값) + 연결 없는 2행. broker, accountNo 순. */
export function deriveAdminAccounts(users: AdminUsersOverview): AdminAccountMasterRow[] {
  const rows = new Map<string, AdminAccountMasterRow>();
  for (const u of users.users) {
    if (u.dmaUserId === null) continue;
    for (const a of u.accounts) {
      const key = masterKey(a.broker, a.accountNo);
      if (rows.has(key)) continue;
      rows.set(key, {
        broker: a.broker,
        accountNo: normalizeAccountNo(a.accountNo),
        name: a.name,
        branchNo: a.branchNo,
        traderId: a.traderId,
        updatedAt: ADMIN_ACCOUNTS_UPDATED_AT,
      });
    }
  }
  for (const a of ADMIN_UNLINKED_ACCOUNTS) if (!rows.has(masterKey(a.broker, a.accountNo))) rows.set(masterKey(a.broker, a.accountNo), { ...a });
  return [...rows.values()].sort(compareMaster);
}

export interface MockAdminApiOptions {
  users?: AdminUsersOverview;
  /** 계좌 마스터를 통째로 갈아 끼운다(기본 = `deriveAdminAccounts(users)` · 머리 주석 ⑦). */
  accounts?: AdminAccountMasterRow[];
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
  state: { users: AdminUsersOverview; servers: AdminServersOverview; accounts: AdminAccountMasterRow[] };
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
 * ⑤ 주문자 IP/MAC 판정 — 서버(gh-trade)처럼 shared 정규화 · 짝 규칙(한 벌). 성공이면 정규화값, 아니면 null(code 13).
 * 사용자 계좌 PUT 과 계좌 마스터 PUT(⑦)이 함께 쓴다.
 */
function normalizeEndpointPair(oe: AdminOrderEndpoint): AdminOrderEndpoint | null {
  const ip = normalizeOrderIp(oe.orderIp);
  const mac = normalizeOrderMac(oe.orderMac);
  if (ip === null || mac === null || (ip === '') !== (mac === '')) return null;
  return { orderIp: ip, orderMac: mac };
}

function code13Results(servers: readonly string[]): AdminServerResult[] {
  return servers.map((s) => ({ server: s, outcome: 'failed' as const, code: 13, message: ADMIN_CODE13_MESSAGE }));
}

const activeKeys = (acct: AdminAccountView) => acct.servers.filter((c) => c.state === 'active').map((c) => c.serverKey);

/** 정규화값을 그 계좌 active 등록 서버 전부에 적는다(⑤). */
function writeEndpoint(acct: AdminAccountView, value: AdminOrderEndpoint): void {
  const next = { ...(acct.orderEndpoints ?? {}) };
  for (const k of activeKeys(acct)) next[k] = { ...value };
  acct.orderEndpoints = next;
}

/** ⑥ 예수금 · 비용률 — 그 계좌 active 등록 서버 중 값을 아는 서버의 costs 를 바꾼다(예수금은 live). 바꾼 대상 = active 서버 키. */
function applyCost(acct: AdminAccountView, op: 'budget' | 'fee', body: Record<string, unknown>): string[] {
  const active = activeKeys(acct);
  const costs = { ...(acct.costs ?? {}) };
  for (const k of active) {
    const cur = costs[k];
    if (cur == null) continue;
    costs[k] =
      op === 'budget'
        ? { ...cur, budgetKrw: Number(body.budgetKrw), budgetSource: 'live' }
        : { ...cur, feePpm: Number(body.feePpm), sellTaxPpm: Number(body.sellTaxPpm) };
  }
  acct.costs = costs;
  return active;
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
      accounts: [],
    },
  };
  mock.state.accounts = clone(opts.accounts ?? deriveAdminAccounts(mock.state.users));

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
      // 계좌 주문 서버 지정(29-38) — `accounts` PUT 보다 먼저(경로가 더 길다).
      if (seg[2] === 'accounts' && seg.length === 6 && seg[5] === 'order-server' && req.method === 'PUT') {
        const acct = owner?.accounts.find((a) => a.broker === seg[3] && a.accountNo === seg[4]);
        if (!acct) return notFound();
        const key = (body.serverKey ?? null) as string | null;
        if (key !== null && !acct.servers.some((c) => c.serverKey === key && c.state === 'active')) {
          return {
            status: 409,
            body: { error: { code: 'ORDER_SERVER_NOT_REGISTERED', message: '그 계좌에 등록된 서버가 아니에요' } },
          };
        }
        acct.orderServer = key;
        return { body: { ok: true, orderServer: key } };
      }
      // ⑥ 계좌 예수금 · 비용률(36-03) — `accounts` PUT 보다 먼저(경로가 더 길다). 값을 아는 active 등록 서버의 costs 를 바꾼다.
      if (seg[2] === 'accounts' && seg.length === 6 && (seg[5] === 'budget' || seg[5] === 'fee') && req.method === 'PUT') {
        const acct = owner?.accounts.find((a) => a.broker === seg[3] && a.accountNo === seg[4]);
        if (!acct) return { status: 409, body: { error: { code: 'NO_SUCH_ACCOUNT', message: '없는 계좌예요' } } };
        return { body: { results: okResults(applyCost(acct, seg[5] as 'budget' | 'fee', body)) } };
      }
      if (seg[2] === 'accounts' && req.method === 'PUT') {
        const put = body as Partial<AdminPutAccountBody>;
        const putServers = put.servers ?? [];
        const acct = put.account
          ? owner?.accounts.find(
              (a) =>
                a.broker === put.account!.broker &&
                normalizeAccountNo(a.accountNo) === normalizeAccountNo(put.account!.accountNo),
            )
          : undefined;
        // ⑤ 주문자 IP/MAC — 서버(gh-trade)처럼 정규화 · 짝 규칙. 실패면 상태를 바꾸지 않고 서버마다 code 13.
        if (put.orderEndpoint) {
          const value = normalizeEndpointPair(put.orderEndpoint);
          if (value === null) return { body: { results: code13Results(putServers) } };
          const { orderIp: ip, orderMac: mac } = value;
          if (acct) {
            writeEndpoint(acct, value);
            // ⑥ gh-trade 261011 op 3 전파 흉내 — 같은 증권사 · 같은 정규화 계좌번호를 가진 다른 사용자 계좌의 active 서버 중
            // 이번 PUT servers 에 든 서버(같은 서버 users.toml 안)에 같은 정규화값. 주문자 IP · MAC 만 옮긴다.
            for (const other of users.users) {
              if (other.dmaUserId === null || other.dmaUserId === seg[1]) continue;
              for (const a of other.accounts) {
                if (a.broker !== acct.broker || normalizeAccountNo(a.accountNo) !== normalizeAccountNo(acct.accountNo)) continue;
                const shared = { ...(a.orderEndpoints ?? {}) };
                for (const c of a.servers) {
                  if (c.state === 'active' && putServers.includes(c.serverKey)) shared[c.serverKey] = { orderIp: ip, orderMac: mac };
                }
                a.orderEndpoints = shared;
              }
            }
          }
        }
        if (acct && put.account) acct.name = put.account.name;
        return { body: { results: okResults(putServers) } };
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

    // ── /accounts — 계좌 마스터(⑦) ─────────────────────────────────────────────
    if (seg[0] === 'accounts') {
      /** 그 계좌를 가진 DMA 사용자와 그 사용자 계좌(dmaUserId 오름차순 · 같은 DMA id 는 첫 줄 계좌 · 이메일은 모음). */
      const linkedOf = (broker: string, accountNo: string) => {
        const key = masterKey(broker, accountNo);
        const byDma = new Map<string, { emails: string[]; acct: AdminAccountView }>();
        for (const u of users.users) {
          if (u.dmaUserId === null) continue;
          const acct = u.accounts.find((a) => masterKey(a.broker, a.accountNo) === key);
          if (!acct) continue;
          const cur = byDma.get(u.dmaUserId);
          if (cur) cur.emails.push(u.email);
          else byDma.set(u.dmaUserId, { emails: [u.email], acct });
        }
        return [...byDma.entries()]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([dmaUserId, v]) => ({ dmaUserId, ...v }));
      };
      const fanoutOf = (linked: ReturnType<typeof linkedOf>, results: (acct: AdminAccountView) => AdminServerResult[]) => ({
        body: {
          ok: true,
          fanout: linked.map(
            (l): AdminAccountFanout => ({ dmaUserId: l.dmaUserId, results: results(l.acct), error: null }),
          ),
        },
      });

      if (seg.length === 1 && req.method === 'GET') {
        const accounts: AdminAccountMaster[] = [...mock.state.accounts].sort(compareMaster).map((row) => ({
          ...row,
          users: linkedOf(row.broker, row.accountNo).map(
            (l): AdminAccountMasterUser => ({
              dmaUserId: l.dmaUserId,
              emails: [...l.emails].sort(),
              priority: l.acct.priority,
              servers: l.acct.servers.map((c) => ({ serverKey: c.serverKey, state: c.state })),
            }),
          ),
        }));
        return { body: { accounts } };
      }
      if (seg.length === 1 && req.method === 'POST') {
        const broker = body.broker as DmaBroker;
        const accountNo = normalizeAccountNo(String(body.accountNo ?? ''));
        if (mock.state.accounts.some((a) => masterKey(a.broker, a.accountNo) === masterKey(broker, accountNo))) {
          return { status: 409, body: { error: { code: 'ACCOUNT_EXISTS', message: '이미 등록된 계좌예요.' } } };
        }
        mock.state.accounts.push({
          broker,
          accountNo,
          name: String(body.name ?? ''),
          branchNo: String(body.branchNo ?? ''),
          traderId: String(body.traderId ?? ''),
          updatedAt: ADMIN_ACCOUNTS_UPDATED_AT,
        });
        return { body: { ok: true } };
      }
      const row = seg.length >= 3 ? mock.state.accounts.find((a) => masterKey(a.broker, a.accountNo) === masterKey(seg[1], seg[2])) : undefined;
      if (!row) return notFound();
      const linked = linkedOf(row.broker, row.accountNo);
      if (seg.length === 3 && req.method === 'PUT') {
        const oe = body.orderEndpoint as AdminOrderEndpoint | undefined;
        const value = oe ? normalizeEndpointPair(oe) : undefined;
        // ⑤ 같은 규칙 — 실패면 상태를 바꾸지 않고 사용자마다 active 서버별 code 13.
        if (value === null) return fanoutOf(linked, (acct) => code13Results(activeKeys(acct)));
        row.name = String(body.name ?? row.name);
        row.branchNo = String(body.branchNo ?? row.branchNo);
        row.traderId = String(body.traderId ?? row.traderId);
        for (const l of linked) {
          l.acct.name = row.name;
          l.acct.branchNo = row.branchNo;
          l.acct.traderId = row.traderId;
          if (value) writeEndpoint(l.acct, value);
        }
        return fanoutOf(linked, (acct) => okResults(activeKeys(acct)));
      }
      if (seg.length === 4 && (seg[3] === 'budget' || seg[3] === 'fee') && req.method === 'PUT') {
        const op = seg[3] as 'budget' | 'fee';
        return fanoutOf(linked, (acct) => okResults(applyCost(acct, op, body)));
      }
      if (seg.length === 3 && req.method === 'DELETE') {
        if (linked.length > 0) {
          return {
            status: 409,
            body: {
              error: {
                code: 'ACCOUNT_IN_USE',
                message: '연결된 사용자가 있어 삭제할 수 없어요 — 「사용자」 에서 먼저 연결을 해제하세요',
              },
            },
          };
        }
        mock.state.accounts = mock.state.accounts.filter((a) => a !== row);
        return { body: { ok: true } };
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
