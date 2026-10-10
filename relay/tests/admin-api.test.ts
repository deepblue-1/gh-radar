/**
 * Phase 29 Plan 11 — relay Admin 내부 HTTP(`/internal/admin/*`) 통합 테스트.
 *
 * 실 `http.Server`(createOrderApi + 관문 + createAdminRouter) + `fetch` + 실 `AdminConn` 2개 ↔ 가짜 게이트웨이 2대(admin 모드 ·
 * `defaultAdminHandler`) + 실 `AdminIntentStore` ↔ 메모리 RPC 대역(`AdminDbFake`). 운영 무접촉.
 *
 * 잠그는 것 (Task 1 트레이서):
 *   T1  관문 — X-Relay-Secret 없음 401 · x-admin-email 없음 400
 *   T2  바디 — dmaUserId 9바이트 · KB branch 4자 · servers 빈 배열 → 400(RPC 0) · KYOBO branch 값 → 빈 값으로 강제 ·
 *       계좌번호 " 00123" → "123" 으로 RPC
 *   T3  정상 — 두 스텁이 각자 op 1(userId · 평문 비밀번호 · 계좌 5필드) 1건 → 86 ok → 200 서버별 결과 배열 · record 1회 ·
 *       RPC 의 p_password_enc 는 평문이 아니고 AAD = dmaUserId 로만 복호된다
 *   T4  DMA_USER_EXISTS → 409 { error: { code } } · 44 0건
 *
 * 잠그는 것 (Task 2 — 경로별 1케이스 · 스텁 게이트웨이):
 *   P1  POST /dma-users/:dma/password → 87 에 유저 있는 서버마다 op 1(password 만 · account 없음)
 *   P2  PUT /dma-users/:dma/accounts → 새 계좌 op 3 · 서버 교체로 빠진 서버의 마지막 계좌 = op 2 → settle
 *   P3  DELETE /dma-users/:dma/accounts/:broker/:accountNo → 마지막 계좌 409 LAST_ACCOUNT(44 0건) · 아니면 op 4
 *   P4  DELETE /dma-users/:dma → 서버마다 op 2 → { results, deleted: true }
 *   P5  POST /dma-users/:dma/reconcile → 의도 = 87 이면 44 0건 · 전 서버 ok
 *   P6  경로 검증 — :dma 9바이트 · :broker 밖 값 → 400
 *
 * 잠그는 것 (Task 3 — 운영 보조 라우트 · 감사 로그):
 *   S1  POST /registry/reload → reload 1회 → { ok: true, changed } · 실패 → 502 RELOAD_FAILED
 *   S2  POST /access/reload → 실 AppAccess 재적재 → 회수 사용자가 있으면 revoked 이벤트(fanout 결선 그대로) → { ok, changed }
 *   S3  GET /servers/status → 레지스트리 전 서버 { conn, journal, admin, quote } · 꺼진 서버 off · 시세 주 서버만 quote
 *   K1  (29-34 WR-04) DELETE /dma-users/:dma?skipDisabled=1 — 꺼진 KB121 에 44 0건 · 그 서버 의도만 settle · 켜진 KB120 ok →
 *       deleted true · 감사 줄에 skipDisabled / 쿼리 없으면 종전(deleted false · 꺼진 서버 사유)
 *   K2  쿼리 해석 — `skipDisabled=1` 만 참 · `true` · `0` · 없음은 거짓(dispatcher 옵션에 키 없음)
 *   S4  감사 로그 — 변경 라우트마다 info 1줄 { admin, route, dma(마스킹), servers: [{ server, outcome, code }] } ·
 *       비밀번호 · 계좌번호 원문 · dmaUserId 원문 없음 · 유저 삭제 뒤 접근 맵 재적재(D-04)
 *
 * 잠그는 것 (29-37 G-1 ⑥ — 계좌 주문 서버 지정):
 *   O1  PUT /dma-users/:dma/accounts/:broker/:accountNo/order-server { serverKey: "KB121" } → RPC 1회 → 지정 재적재 1회 →
 *       200 { ok: true, orderServer: "KB121" } · 44 0건(지정은 gh-trade 와이어 무변경) · 감사 1줄(DMA id · 계좌 마스킹)
 *   O2  { serverKey: null } → 지정 해제 → 200 { ok: true, orderServer: null }
 *   O3  레지스트리에 없는 키 · 형식 밖 키 · serverKey 누락 → 400 VALIDATION_FAILED · RPC 0 · 재적재 0
 *   O4  다른 증권사 서버 → 409 ORDER_SERVER_NOT_REGISTERED · 없는 계좌 → 409 NO_SUCH_ACCOUNT · 없는 유저 → 409 NO_DMA_USER
 *   O5  재적재 실패(ok false · throw)는 응답을 바꾸지 않는다(200 · warn)
 *   R1  계좌 put 으로 지정 서버가 빠지면(대역 DB 가 지정 해제) 응답 전에 지정 재적재 1회 · 실패는 응답 무변경(warn)
 *   R2  계좌 제거 뒤 재적재 1회 · 409 거부(LAST_ACCOUNT)는 0회
 *   R3  유저 삭제 뒤 재적재 1회(서버 settle 이 지정 행을 지운다)
 *   R4  생성 · 비밀번호 · reconcile 은 재적재하지 않는다(지정이 바뀌지 않는다)
 */
import { randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { AppAccess } from "../src/access/app-access.js";
import { AdminConn } from "../src/admin/admin-conn.js";
import { createAdminRouter } from "../src/admin/admin-api.js";
import { AdminDispatcher } from "../src/admin/dispatcher.js";
import { AdminIntentStore } from "../src/admin/intent-store.js";
import { createOrderApi } from "../src/order/order-api.js";
import type { QuoteSwitchResult } from "../src/quote/quote-switch.js";
import type { DmaServerRow } from "../src/registry/registry.js";
import { decryptDmaPassword } from "../src/store/credentials.js";
import { AdminDbFake } from "./helpers/admin-db-fake.js";
import {
  defaultAdminHandler,
  startFakeGateway,
  type AdminCommandRequest,
  type FakeAdminState,
  type FakeGateway,
} from "./helpers/fake-gateway.js";

const SECRET = "test-relay-order-secret-0123456789";
const OBSERVER_SECRET = "test-admin-observer-secret";
const ADMIN = "boss@gmail.com";
const PASSWORD = "dma-p@ss-절대노출금지";

type LogCall = { level: string; args: unknown[] };

async function spyLogs(): Promise<LogCall[]> {
  const { logger } = await import("../src/logger.js");
  const calls: LogCall[] = [];
  for (const level of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
      calls.push({ level, args });
    }) as never);
  }
  return calls;
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

function serverRow(key: string, broker: "KB" | "KYOBO", sortOrder: number, enabled = true): DmaServerRow {
  return { key, broker, host: "127.0.0.1", port: 1, enabled, isOrderServer: false, isQuotePrimary: false, sortOrder };
}

/** 서버마다 다른 유저 1명이 이미 있다 — op 2 의 「서버 마지막 사용자」(12)를 피한다. */
function stateWithOther(): FakeAdminState {
  return {
    usersRev: 1n,
    users: new Map([["other", [{ accountNo: "9999999901", name: "위탁", branchNo: "00009", traderId: "000009", priority: 1 }]]]),
    busyAccounts: new Set(),
  };
}

type Harness = {
  url: (path: string) => string;
  db: AdminDbFake;
  gateways: Record<string, FakeGateway>;
  states: Record<string, FakeAdminState>;
  conns: Record<string, AdminConn>;
  rows: DmaServerRow[];
  credKey: string;
  /** op 5(접속 · 보정) 를 뺀 44. */
  commands: (key: string) => AdminCommandRequest[];
  /** 계좌 주문 서버 지정 즉시 재적재 대역(29-37) — 호출 횟수 단언용. */
  orderServersReload: Mock<() => Promise<{ ok: boolean }>>;
  close: () => Promise<void>;
};

type HarnessOptions = {
  commandTimeoutMs?: number;
  /** 레지스트리 재적재 대역. 기본 { ok: true, changed: false }. */
  registryReload?: () => Promise<{ ok: boolean; changed: boolean }>;
  /** 접근 맵 대역. 기본 = 재적재 성공 · 회수 없음 · 아무도 없음. */
  access?: {
    reload(): Promise<{ ok: boolean; revoked: string[] }>;
    entryOf(userId: string): { dmaUserId: string | null } | undefined;
  };
  /** 서버별 저널 상태(기본 live). */
  journalStates?: Record<string, string>;
  /** 시세 주 서버 키 · 상태. */
  quote?: { serverKey: string | null; state: string };
  /** 꺼진 서버 키(레지스트리 enabled false). */
  disabled?: string[];
  /** DB 시세 주 서버 키(레지스트리 isQuotePrimary). 기본 없음. */
  quotePrimary?: string;
  /** 시세 주 서버 전환 대역(29-23). 기본 = 무동작 성공. */
  quoteSwitch?: {
    switchTo(server: DmaServerRow): Promise<QuoteSwitchResult>;
    readonly currentServerKey: string | null;
  };
  /** 라우터 시각 주입구(29-32 — deadlineAt = 도착 시각 + 마감). 기본 Date.now. */
  now?: () => number;
  /** 요청 마감(ms) 주입(29-32 — 실 소켓 테스트를 10초 기다리지 않게). 기본 ADMIN_REQUEST_DEADLINE_MS. */
  adminDeadlineMs?: number;
  /** 끄지 못한 전략 서버별 계좌 수(29-43 G-1 (가)). 기본 주입 없음. */
  staleStrategies?: () => ReadonlyMap<string, number>;
  /** 계좌 주문 서버 지정 재적재 결과(29-37). 기본 = 성공 `{ ok: true }`. */
  orderServersReload?: () => Promise<{ ok: boolean }>;
};

async function startHarness(opts: HarnessOptions = {}): Promise<Harness> {
  const credKey = randomBytes(32).toString("base64");
  const rows = [serverRow("KB120", "KB", 1), serverRow("KB121", "KB", 2), serverRow("KYOBO119", "KYOBO", 3)]
    .map((r) => (opts.disabled?.includes(r.key) ? { ...r, enabled: false } : r))
    .map((r) => (r.key === opts.quotePrimary ? { ...r, isQuotePrimary: true } : r));
  const db = new AdminDbFake(rows.map((r) => ({ key: r.key, broker: r.broker })));
  db.appUsers.add("trader@gmail.com");

  const gateways: Record<string, FakeGateway> = {};
  const states: Record<string, FakeAdminState> = {};
  const conns: Record<string, AdminConn> = {};
  for (const key of ["KB120", "KB121"]) {
    const gw = await startFakeGateway({ autoLogin: false, autoAccount: false });
    const state = stateWithOther();
    gw.respondAdminLogin({});
    gw.onAdminCommand(defaultAdminHandler(state));
    const conn = new AdminConn({
      serverKey: key,
      broker: "KB",
      secret: OBSERVER_SECRET,
      host: "127.0.0.1",
      port: gw.port,
      commandTimeoutMs: opts.commandTimeoutMs ?? 2000,
    });
    conn.start();
    gateways[key] = gw;
    states[key] = state;
    conns[key] = conn;
  }
  await waitFor(() => Object.values(conns).every((c) => c.currentSnapshot() !== null), "두 서버 87 수신");

  const store = new AdminIntentStore({ supabase: db.client });
  const registry = {
    all: () => rows.map((r) => ({ ...r })),
    get: (k: string) => rows.find((r) => r.key === k),
    reload: opts.registryReload ?? (() => Promise.resolve({ ok: true, changed: false })),
  };
  const pipelines = {
    get: (k: string) =>
      conns[k]
        ? { admin: conns[k]!, status: { health: () => ({ state: opts.journalStates?.[k] ?? "live" }) } }
        : undefined,
  };
  const access = opts.access ?? {
    reload: () => Promise.resolve({ ok: true, revoked: [] as string[] }),
    entryOf: () => undefined,
  };
  const dispatcher = new AdminDispatcher({ store, pipelines, registry, credKey, access });
  const orderServersReload = vi.fn<() => Promise<{ ok: boolean }>>(opts.orderServersReload ?? (() => Promise.resolve({ ok: true })));
  const router = createAdminRouter({
    store,
    dispatcher,
    registry,
    access,
    pipelines,
    credKey,
    quoteStatus: {
      serverKey: () => opts.quote?.serverKey ?? null,
      health: () => ({ state: opts.quote?.state ?? "ready" }),
    },
    // 시세 주 서버 전환(29-23) — 이 파일의 다른 경로는 부르지 않는다. 결과는 대역이 정한다.
    quoteSwitch: opts.quoteSwitch ?? { switchTo: () => Promise.resolve({ ok: true, changed: false }), currentServerKey: null },
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    ...(opts.adminDeadlineMs !== undefined ? { adminDeadlineMs: opts.adminDeadlineMs } : {}),
    ...(opts.staleStrategies !== undefined ? { staleStrategies: opts.staleStrategies } : {}),
    orderServers: { reload: orderServersReload },
  });

  const app = createOrderApi({
    relayOrderSecret: SECRET,
    dmaHost: () => "10.41.0.10",
    networkInterfaces: () => ({}),
    appVersion: "test-sha",
    nodeEnv: "test",
    sessions: { stats: () => ({ sessionCount: 0, readyCount: 0, everReadyCount: 0, stalledCount: 0 }) },
    admin: { router },
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;

  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    db,
    gateways,
    states,
    conns,
    rows,
    credKey,
    commands: (key) => gateways[key]!.adminCommandRequests().filter((r) => r.op !== 5),
    orderServersReload,
    close: async () => {
      for (const c of Object.values(conns)) c.stop();
      for (const g of Object.values(gateways)) await g.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function call(
  h: Harness,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(h.url(path), {
    method,
    headers: { "content-type": "application/json", "x-relay-secret": SECRET, "x-admin-email": ADMIN, ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const KB_ACCOUNT = { broker: "KB", accountNo: "1234567801", name: "위탁종합", branchNo: "00123", traderId: "000456", priority: 1 };

function createBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: "trader@gmail.com",
    dmaUserId: "tr01",
    password: PASSWORD,
    account: KB_ACCOUNT,
    servers: ["KB120", "KB121"],
    ...over,
  };
}

const stringify = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) => (typeof x === "bigint" ? x.toString() : x));

describe("relay Admin 내부 HTTP — 트레이서: 유저 생성 → 서버별 op 1 → 결과 배열 (29-11 Task 1)", () => {
  let h: Harness;
  let logs: LogCall[];

  beforeEach(async () => {
    logs = await spyLogs();
    h = await startHarness();
  });

  afterEach(async () => {
    await h.close();
    vi.restoreAllMocks();
    // 평문 비밀번호 · 관찰자 비밀은 어떤 로그 인자에도 없다.
    const dumped = stringify(logs.map((c) => c.args));
    expect(dumped).not.toContain(PASSWORD);
    expect(dumped).not.toContain(OBSERVER_SECRET);
  });

  it("T1 관문 — X-Relay-Secret 없음 401 · x-admin-email 없음 400", async () => {
    const noSecret = await fetch(h.url("/internal/admin/dma-users"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-email": ADMIN },
      body: JSON.stringify(createBody()),
    });
    expect(noSecret.status).toBe(401);
    expect(await noSecret.json()).toEqual({ error: { code: "UNAUTHORIZED_RELAY", message: "Unauthorized" } });

    const noEmail = await call(h, "POST", "/internal/admin/dma-users", createBody(), { "x-admin-email": "" });
    expect(noEmail.status).toBe(400);
    expect(((await noEmail.json()) as { error: { code: string } }).error.code).toBe("ADMIN_EMAIL_REQUIRED");
    expect(h.db.calls).toEqual([]);
  });

  it("T2 바디 검증 — 9바이트 id · KB branch 4자 · servers 빈 배열 → 400 · RPC 0", async () => {
    for (const body of [
      createBody({ dmaUserId: "abcdefghi" }),
      createBody({ dmaUserId: "가나다" }), // 9바이트(UTF-8 3 × 3)
      createBody({ account: { ...KB_ACCOUNT, branchNo: "0012" } }),
      createBody({ servers: [] }),
      createBody({ servers: ["KB999"] }), // 레지스트리에 없는 서버
      createBody({ account: { ...KB_ACCOUNT, accountNo: "1234567890123" } }), // 13자 — 자르지 않고 거부
    ]) {
      const res = await call(h, "POST", "/internal/admin/dma-users", body);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
    }
    expect(h.db.calls).toEqual([]);
    expect(h.commands("KB120")).toEqual([]);
  });

  it("T2 정규화 — 계좌번호 \" 00123\" → \"123\" · 교보 branch/trader 값 → 빈 값으로 RPC", async () => {
    const kb = await call(h, "POST", "/internal/admin/dma-users", createBody({ account: { ...KB_ACCOUNT, accountNo: " 00123" } }));
    expect(kb.status).toBe(200);
    expect((h.db.callsTo("dma_admin_create_dma_user")[0]!.args.p_account as { accountNo: string }).accountNo).toBe("123");
    // 서버에도 정규화 번호로 간다.
    expect(h.commands("KB120")[0]!.account?.accountNo).toBe("123");

    h.db.appUsers.add("kyobo@gmail.com");
    const ky = await call(
      h,
      "POST",
      "/internal/admin/dma-users",
      createBody({
        email: "kyobo@gmail.com",
        dmaUserId: "ky01",
        account: { broker: "KYOBO", accountNo: "777", name: "교보", branchNo: "00001", traderId: "000001", priority: 1 },
        servers: ["KYOBO119"],
      }),
    );
    expect(ky.status).toBe(200);
    const acc = h.db.callsTo("dma_admin_create_dma_user")[1]!.args.p_account as { branchNo: string; traderId: string };
    expect(acc.branchNo).toBe("");
    expect(acc.traderId).toBe("");
    // 교보 서버는 admin 연결이 없다 → offline(그 서버만).
    expect(await ky.json()).toEqual({ results: [{ server: "KYOBO119", outcome: "offline" }] });
  });

  it("T3 정상 — 스텁 2대에 op 1 각 1건 → 서버별 결과 배열 · record 1회 · 암호문 AAD = dmaUserId", async () => {
    const res = await call(h, "POST", "/internal/admin/dma-users", createBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        { server: "KB120", outcome: "ok", usersRev: "2" },
        { server: "KB121", outcome: "ok", usersRev: "2" },
      ],
    });

    for (const key of ["KB120", "KB121"]) {
      const cmds = h.commands(key);
      expect(cmds).toHaveLength(1);
      expect(cmds[0]).toMatchObject({
        op: 1,
        userId: "tr01",
        password: PASSWORD,
        account: { accountNo: "1234567801", name: "위탁종합", branchNo: "00123", traderId: "000456", priority: 1 },
      });
      expect(h.states[key]!.users.get("tr01")).toHaveLength(1);
    }

    expect(h.db.callsTo("dma_admin_record_results")).toHaveLength(1);
    expect(h.db.callsTo("dma_admin_record_results")[0]!.args).toEqual({
      p_dma_user_id: "tr01",
      p_results: [
        { server: "KB120", outcome: "ok" },
        { server: "KB121", outcome: "ok" },
      ],
    });

    const enc = h.db.callsTo("dma_admin_create_dma_user")[0]!.args.p_password_enc as string;
    expect(enc).not.toContain(PASSWORD);
    expect(stringify(h.db.calls)).not.toContain(PASSWORD);
    expect(decryptDmaPassword(enc, "tr01", h.credKey)).toBe(PASSWORD);
    expect(() => decryptDmaPassword(enc, "other-aad", h.credKey)).toThrow();
  });

  it("T4 DMA_USER_EXISTS → 409 { error: { code } } · 44 0건", async () => {
    h.db.dmaUsers.set("tr01", "x");
    const res = await call(h, "POST", "/internal/admin/dma-users", createBody());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("DMA_USER_EXISTS");
    expect(h.commands("KB120")).toEqual([]);
    expect(h.commands("KB121")).toEqual([]);
  });

  it("T5 (29-27 CR-01) 이미 DMA 가 연결된 이메일 → 409 DMA_LINKED 그대로 · 44 0건 · 의도 표 불변 · 감사 rejected", async () => {
    h.db.seedUser({
      email: "trader@gmail.com",
      dmaUserId: "old01",
      passwordEnc: "enc-old01",
      accounts: [{ accountNo: "1234567809", servers: ["KB120"] }],
    });
    const before = structuredClone({ users: [...h.db.dmaUsers], accounts: h.db.accounts, rows: h.db.serverRows });

    const res = await call(h, "POST", "/internal/admin/dma-users", createBody({ dmaUserId: "new02" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("DMA_LINKED");

    expect(h.commands("KB120")).toEqual([]);
    expect(h.commands("KB121")).toEqual([]);
    expect(h.db.callsTo("dma_admin_record_results")).toEqual([]);
    expect({ users: [...h.db.dmaUsers], accounts: h.db.accounts, rows: h.db.serverRows }).toEqual(before);
    expect(h.db.appUserDma.get("trader@gmail.com")).toBe("old01");

    const audits = logs.filter((c) => c.level === "info" && String(c.args[1] ?? "").startsWith("[admin-audit]"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.args[0]).toMatchObject({ route: "POST /dma-users", rejected: "DMA_LINKED" });
  });
});

describe("relay Admin 내부 HTTP — 변경 경로 (29-11 Task 2)", () => {
  let h: Harness;
  let logs: LogCall[];

  beforeEach(async () => {
    logs = await spyLogs();
    h = await startHarness();
    const created = await call(h, "POST", "/internal/admin/dma-users", createBody());
    expect(created.status).toBe(200);
  });

  afterEach(async () => {
    await h.close();
    vi.restoreAllMocks();
    const dumped = stringify(logs.map((c) => c.args));
    expect(dumped).not.toContain(PASSWORD);
    expect(dumped).not.toContain("new-p@ss");
  });

  it("P1 비밀번호 변경 → 서버마다 op 1(password 만) · 결과 배열", async () => {
    const res = await call(h, "POST", "/internal/admin/dma-users/tr01/password", { password: "new-p@ss" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        { server: "KB120", outcome: "ok", usersRev: "3" },
        { server: "KB121", outcome: "ok", usersRev: "3" },
      ],
    });
    for (const key of ["KB120", "KB121"]) {
      const last = h.commands(key).at(-1)!;
      expect(last).toMatchObject({ op: 1, userId: "tr01", password: "new-p@ss", account: null });
    }
    const enc = h.db.callsTo("dma_admin_set_password")[0]!.args.p_password_enc as string;
    expect(decryptDmaPassword(enc, "tr01", h.credKey)).toBe("new-p@ss");
  });

  it("P2 계좌 put — 새 계좌 op 3 · 서버 교체로 빠진 서버의 마지막 계좌는 op 2 → settle", async () => {
    const B = { ...KB_ACCOUNT, accountNo: "1234567802", priority: 2 };
    const add = await call(h, "PUT", "/internal/admin/dma-users/tr01/accounts", { account: B, servers: ["KB121"] });
    expect(add.status).toBe(200);
    expect(((await add.json()) as { results: { outcome: string }[] }).results.map((r) => r.outcome)).toEqual(["ok", "ok"]);
    expect(h.commands("KB121").at(-1)).toMatchObject({ op: 3, account: { accountNo: "1234567802" } });
    expect(h.commands("KB120")).toHaveLength(1); // 생성 op 1 뿐

    // 첫 계좌를 KB121 로만 — KB120 은 그 유저의 마지막 계좌라 op 2(유저 제거) 한 번.
    const swap = await call(h, "PUT", "/internal/admin/dma-users/tr01/accounts", { account: KB_ACCOUNT, servers: ["KB121"] });
    expect(swap.status).toBe(200);
    expect(((await swap.json()) as { results: { outcome: string }[] }).results.map((r) => r.outcome)).toEqual(["ok", "ok"]);
    expect(h.commands("KB120").at(-1)).toMatchObject({ op: 2, userId: "tr01" });
    expect(h.states.KB120!.users.has("tr01")).toBe(false);
    expect(h.db.intentOf("tr01").map((r) => r.serverKey)).toEqual(["KB121", "KB121"]);
  });

  it("P3 계좌 제거 — 마지막 계좌 409 LAST_ACCOUNT(44 0건) · 아니면 op 4", async () => {
    const before = h.commands("KB120").length + h.commands("KB121").length;
    const last = await call(h, "DELETE", "/internal/admin/dma-users/tr01/accounts/KB/1234567801");
    expect(last.status).toBe(409);
    expect(((await last.json()) as { error: { code: string } }).error.code).toBe("LAST_ACCOUNT");
    expect(h.commands("KB120").length + h.commands("KB121").length).toBe(before);

    const B = { ...KB_ACCOUNT, accountNo: "1234567802", priority: 2 };
    await call(h, "PUT", "/internal/admin/dma-users/tr01/accounts", { account: B, servers: ["KB120", "KB121"] });
    // 경로의 계좌번호도 정규화된다("001234567802" → "1234567802").
    const res = await call(h, "DELETE", "/internal/admin/dma-users/tr01/accounts/KB/001234567802");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { results: { outcome: string }[] }).results.map((r) => r.outcome)).toEqual(["ok", "ok"]);
    for (const key of ["KB120", "KB121"]) {
      expect(h.commands(key).at(-1)).toMatchObject({ op: 4, account: { accountNo: "1234567802" } });
    }
    expect(h.db.intentOf("tr01").map((r) => r.accountNo)).toEqual(["1234567801", "1234567801"]);
  });

  it("P4 유저 삭제 → 서버마다 op 2 → { results, deleted: true }", async () => {
    const res = await call(h, "DELETE", "/internal/admin/dma-users/tr01");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        { server: "KB120", outcome: "ok", usersRev: "3" },
        { server: "KB121", outcome: "ok", usersRev: "3" },
      ],
      deleted: true,
    });
    for (const key of ["KB120", "KB121"]) expect(h.commands(key).at(-1)).toMatchObject({ op: 2, userId: "tr01" });
    expect(h.db.callsTo("dma_admin_delete_dma_user")).toHaveLength(1);
  });

  it("P5 다시 반영 — 의도 = 87 이면 44 0건 · 전 서버 ok", async () => {
    const before = [h.commands("KB120").length, h.commands("KB121").length];
    const res = await call(h, "POST", "/internal/admin/dma-users/tr01/reconcile");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        { server: "KB120", outcome: "ok", usersRev: "2" },
        { server: "KB121", outcome: "ok", usersRev: "2" },
      ],
    });
    expect([h.commands("KB120").length, h.commands("KB121").length]).toEqual(before);
  });

  it("P6 경로 검증 — :dma 9바이트 · :broker 밖 값 → 400 VALIDATION_FAILED", async () => {
    for (const [method, path] of [
      ["POST", "/internal/admin/dma-users/abcdefghi/reconcile"],
      ["DELETE", "/internal/admin/dma-users/tr01/accounts/NH/123"],
      ["DELETE", "/internal/admin/dma-users/tr01/accounts/KB/1234567890123"],
    ] as const) {
      const res = await call(h, method, path);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("relay Admin 내부 HTTP — 계좌 주문 서버 지정 (29-37 G-1 ⑥)", () => {
  let h: Harness;
  let logs: LogCall[];
  const PATH = "/internal/admin/dma-users/tr01/accounts/KB/1234567801/order-server";

  beforeEach(async () => {
    logs = await spyLogs();
    h = await startHarness();
    const created = await call(h, "POST", "/internal/admin/dma-users", createBody());
    expect(created.status).toBe(200);
    logs.length = 0;
  });

  afterEach(async () => {
    await h.close();
    vi.restoreAllMocks();
  });

  const auditLines = () =>
    logs.filter((c) => c.level === "info" && c.args[1] === "[admin-audit] Admin 변경 요청").map((c) => c.args[0] as Record<string, unknown>);

  it("O1 지정 KB121 → RPC 1회 · 지정 재적재 1회 · 200 { ok, orderServer } · 44 0건 · 감사 1줄(마스킹)", async () => {
    const before = [h.commands("KB120").length, h.commands("KB121").length];
    // 경로의 계좌번호도 정규화된다("001234567801" → "1234567801").
    const res = await call(h, "PUT", "/internal/admin/dma-users/tr01/accounts/KB/001234567801/order-server", { serverKey: "KB121" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, orderServer: "KB121" });
    expect(h.db.callsTo("dma_admin_set_account_order_server").map((c) => c.args)).toEqual([
      { p_dma_user_id: "tr01", p_broker: "KB", p_account_no: "1234567801", p_server_key: "KB121" },
    ]);
    expect(h.db.orderServerOf("tr01", "KB", "1234567801")).toBe("KB121");
    expect(h.orderServersReload).toHaveBeenCalledTimes(1);
    expect([h.commands("KB120").length, h.commands("KB121").length]).toEqual(before);

    const lines = auditLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      admin: ADMIN,
      route: "PUT /dma-users/:dma/accounts/:broker/:accountNo/order-server",
      dma: "tr***(4)",
      broker: "KB",
      account: "123456****",
      orderServer: "KB121",
    });
    const dumped = stringify(logs.map((c) => c.args));
    expect(dumped).not.toContain("1234567801");
    expect(dumped).not.toContain('"tr01"');
  });

  it("O2 serverKey null → 지정 해제 · 200 { ok, orderServer: null } · 재적재 1회", async () => {
    expect((await call(h, "PUT", PATH, { serverKey: "KB121" })).status).toBe(200);
    const res = await call(h, "PUT", PATH, { serverKey: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, orderServer: null });
    expect(h.db.orderServerOf("tr01", "KB", "1234567801")).toBeNull();
    expect(h.db.callsTo("dma_admin_set_account_order_server").at(-1)!.args.p_server_key).toBeNull();
    expect(h.orderServersReload).toHaveBeenCalledTimes(2);
  });

  it("O3 레지스트리에 없는 키 · 형식 밖 키 · serverKey 누락 → 400 VALIDATION_FAILED · RPC 0 · 재적재 0", async () => {
    for (const body of [{ serverKey: "KB999" }, { serverKey: "kb121" }, { serverKey: "" }, {}, { serverKey: 121 }]) {
      const res = await call(h, "PUT", PATH, body);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
    }
    expect(h.db.callsTo("dma_admin_set_account_order_server")).toHaveLength(0);
    expect(h.orderServersReload).not.toHaveBeenCalled();
  });

  it("O4 다른 증권사 서버 409 ORDER_SERVER_NOT_REGISTERED · 없는 계좌 409 NO_SUCH_ACCOUNT · 없는 유저 409 NO_DMA_USER · 재적재 0 · 감사 rejected", async () => {
    const cases: Array<[string, unknown, string]> = [
      [PATH, { serverKey: "KYOBO119" }, "ORDER_SERVER_NOT_REGISTERED"],
      ["/internal/admin/dma-users/tr01/accounts/KB/999/order-server", { serverKey: "KB121" }, "NO_SUCH_ACCOUNT"],
      ["/internal/admin/dma-users/ghost/accounts/KB/1234567801/order-server", { serverKey: null }, "NO_DMA_USER"],
    ];
    for (const [path, body, code] of cases) {
      const res = await call(h, "PUT", path, body);
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
    }
    expect(h.db.orderServerOf("tr01", "KB", "1234567801")).toBeNull();
    expect(h.orderServersReload).not.toHaveBeenCalled();
    expect(auditLines().map((l) => l.rejected)).toEqual(["ORDER_SERVER_NOT_REGISTERED", "NO_SUCH_ACCOUNT", "NO_DMA_USER"]);
  });

  it("O4 removing 등록 서버로의 지정도 409 ORDER_SERVER_NOT_REGISTERED", async () => {
    // KB120 을 빼서 removing — settle 전이라도 지정 대상이 아니다.
    h.db.serverRows.find((r) => r.dmaUserId === "tr01" && r.serverKey === "KB120")!.state = "removing";
    const res = await call(h, "PUT", PATH, { serverKey: "KB120" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("ORDER_SERVER_NOT_REGISTERED");
  });

  it("O5 지정 재적재 실패(ok false · throw)는 응답을 바꾸지 않는다 — 200 · warn 1줄씩", async () => {
    await h.close();
    vi.restoreAllMocks();
    logs = await spyLogs();
    let n = 0;
    h = await startHarness({
      orderServersReload: () => (n++ === 0 ? Promise.resolve({ ok: false }) : Promise.reject(new Error("boom"))),
    });
    expect((await call(h, "POST", "/internal/admin/dma-users", createBody())).status).toBe(200);
    for (const serverKey of ["KB121", null]) {
      const res = await call(h, "PUT", PATH, { serverKey });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, orderServer: serverKey });
    }
    expect(h.orderServersReload).toHaveBeenCalledTimes(2);
    expect(logs.filter((c) => c.level === "warn" && String(c.args[1]).includes("지정 재적재"))).toHaveLength(2);
  });
});

describe("relay Admin 내부 HTTP — 등록 해제 · 계좌 제거 · 유저 삭제 뒤 지정 재적재 (29-37 Task 3)", () => {
  let h: Harness;
  let logs: LogCall[];
  const ORDER_PATH = "/internal/admin/dma-users/tr01/accounts/KB/1234567801/order-server";
  const B = { ...KB_ACCOUNT, accountNo: "1234567802", priority: 2 };

  beforeEach(async () => {
    logs = await spyLogs();
    h = await startHarness();
    expect((await call(h, "POST", "/internal/admin/dma-users", createBody())).status).toBe(200);
    expect((await call(h, "PUT", ORDER_PATH, { serverKey: "KB121" })).status).toBe(200);
    expect(h.db.orderServerOf("tr01", "KB", "1234567801")).toBe("KB121");
    h.orderServersReload.mockClear();
  });

  afterEach(async () => {
    await h.close();
    vi.restoreAllMocks();
  });

  it("R1 계좌 put 으로 지정 서버 KB121 이 빠지면 DB 가 지정을 지우고 → 응답 전에 지정 재적재 1회", async () => {
    let reloadedBeforeResponse = false;
    h.orderServersReload.mockImplementation(() => {
      reloadedBeforeResponse = h.db.orderServerOf("tr01", "KB", "1234567801") === null;
      return Promise.resolve({ ok: true });
    });
    const res = await call(h, "PUT", "/internal/admin/dma-users/tr01/accounts", { account: KB_ACCOUNT, servers: ["KB120"] });
    expect(res.status).toBe(200);
    expect(h.orderServersReload).toHaveBeenCalledTimes(1);
    expect(reloadedBeforeResponse).toBe(true);
    expect(h.db.orderServerOf("tr01", "KB", "1234567801")).toBeNull();
  });

  it("R1 재적재 실패(ok false · throw)는 계좌 put 응답을 바꾸지 않는다 — 200 · warn", async () => {
    h.orderServersReload.mockResolvedValueOnce({ ok: false }).mockRejectedValueOnce(new Error("boom"));
    for (const servers of [["KB120"], ["KB120", "KB121"]]) {
      const res = await call(h, "PUT", "/internal/admin/dma-users/tr01/accounts", { account: KB_ACCOUNT, servers });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { results: unknown[] }).results).toHaveLength(2);
    }
    expect(h.orderServersReload).toHaveBeenCalledTimes(2);
    expect(logs.filter((c) => c.level === "warn" && String(c.args[1]).includes("지정 재적재"))).toHaveLength(2);
  });

  it("R2 계좌 제거 뒤 재적재 1회 · 마지막 계좌 409 LAST_ACCOUNT 는 0회", async () => {
    const last = await call(h, "DELETE", "/internal/admin/dma-users/tr01/accounts/KB/1234567801");
    expect(last.status).toBe(409);
    expect(h.orderServersReload).not.toHaveBeenCalled();

    expect((await call(h, "PUT", "/internal/admin/dma-users/tr01/accounts", { account: B, servers: ["KB120", "KB121"] })).status).toBe(200);
    h.orderServersReload.mockClear();
    const res = await call(h, "DELETE", "/internal/admin/dma-users/tr01/accounts/KB/1234567801");
    expect(res.status).toBe(200);
    expect(h.orderServersReload).toHaveBeenCalledTimes(1);
    expect(h.db.orderServerOf("tr01", "KB", "1234567801")).toBeNull();
  });

  it("R3 유저 삭제(deleted true) 뒤 재적재 1회", async () => {
    const res = await call(h, "DELETE", "/internal/admin/dma-users/tr01");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { deleted: boolean }).deleted).toBe(true);
    expect(h.orderServersReload).toHaveBeenCalledTimes(1);
  });

  it("R4 생성 · 비밀번호 · reconcile 은 재적재 0회", async () => {
    h.db.appUsers.add("other@gmail.com");
    const created = await call(h, "POST", "/internal/admin/dma-users", createBody({ email: "other@gmail.com", dmaUserId: "tr02" }));
    expect(created.status).toBe(200);
    expect((await call(h, "POST", "/internal/admin/dma-users/tr01/password", { password: "new-p@ss" })).status).toBe(200);
    expect((await call(h, "POST", "/internal/admin/dma-users/tr01/reconcile")).status).toBe(200);
    expect(h.orderServersReload).not.toHaveBeenCalled();
  });
});

describe("relay Admin 내부 HTTP — 운영 보조 라우트 · 감사 로그 (29-11 Task 3)", () => {
  let h: Harness | null = null;
  let logs: LogCall[];

  beforeEach(async () => {
    logs = await spyLogs();
  });

  afterEach(async () => {
    await h?.close();
    h = null;
    vi.restoreAllMocks();
  });

  it("S1 레지스트리 재적재 — reload 1회 → { ok, changed } · 실패 → 502 RELOAD_FAILED", async () => {
    let calls = 0;
    let next = { ok: true, changed: true };
    h = await startHarness({
      registryReload: () => {
        calls += 1;
        return Promise.resolve(next);
      },
    });
    const res = await call(h, "POST", "/internal/admin/registry/reload");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, changed: true });
    expect(calls).toBe(1);

    next = { ok: false, changed: false };
    const bad = await call(h, "POST", "/internal/admin/registry/reload");
    expect(bad.status).toBe(502);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("RELOAD_FAILED");

    const noEmail = await call(h, "POST", "/internal/admin/registry/reload", undefined, { "x-admin-email": "" });
    expect(noEmail.status).toBe(400);
  });

  it("S2 접근 맵 재적재 — 실 AppAccess · 회수 사용자 → revoked 이벤트 · { ok, changed }", async () => {
    let rowsNow: unknown[] = [
      { user_id: "web-1", email: "a@gmail.com", role: "trader", dma_user_id: "tr01" },
      { user_id: "web-2", email: "b@gmail.com", role: "trader", dma_user_id: "tr02" },
    ];
    const supabase = { rpc: () => Promise.resolve({ data: rowsNow, error: null }) };
    const access = new AppAccess({ supabase: supabase as never });
    await access.reload();
    const revoked: string[][] = [];
    access.on("revoked", (ids) => revoked.push(ids));
    h = await startHarness({ access });

    const same = await call(h, "POST", "/internal/admin/access/reload");
    expect(await same.json()).toEqual({ ok: true, changed: false });

    rowsNow = [{ user_id: "web-1", email: "a@gmail.com", role: "viewer", dma_user_id: "tr01" }];
    const res = await call(h, "POST", "/internal/admin/access/reload");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, changed: true });
    expect(revoked).toEqual([["web-1", "web-2"]]);
    access.close();
  });

  it("S2 접근 맵 재적재 실패 → 502 RELOAD_FAILED", async () => {
    h = await startHarness({
      access: { reload: () => Promise.resolve({ ok: false, revoked: [] }), entryOf: () => undefined },
    });
    const res = await call(h, "POST", "/internal/admin/access/reload");
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RELOAD_FAILED");
  });

  it("S3 서버 상태 — 전 서버 { conn, journal, admin, quote } · 꺼진 서버 off · 시세 주 서버만 quote", async () => {
    h = await startHarness({
      journalStates: { KB121: "connecting" },
      quote: { serverKey: "KB120", state: "ready" },
    });
    // KB121 admin 연결을 끊는다 → 재접속 중.
    h.gateways.KB121!.sockets.forEach((sock) => sock.destroy());
    await waitFor(() => h!.conns.KB121!.state !== "ready", "KB121 재접속 중");

    const res = await call(h, "GET", "/internal/admin/servers/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      servers: {
        KB120: { conn: "ok", journal: "ok", admin: "ok", quote: "live", staleAccounts: 0 },
        KB121: { conn: "down", journal: "down", admin: "connecting", quote: null, staleAccounts: 0 },
        // 레지스트리엔 켜져 있지만 파이프라인이 없다(교보 비밀 미배치 등).
        KYOBO119: { conn: "down", journal: "down", admin: "down", quote: null, staleAccounts: 0 },
      },
    });
  });

  it("S3 서버 상태 — 레지스트리에서 꺼진 서버는 전부 off", async () => {
    h = await startHarness({ disabled: ["KYOBO119"], quote: { serverKey: "KB121", state: "connecting" } });
    const body = (await (await call(h, "GET", "/internal/admin/servers/status")).json()) as {
      servers: Record<string, unknown>;
    };
    expect(body.servers.KYOBO119).toEqual({ conn: "off", journal: "off", admin: "off", quote: null, staleAccounts: 0 });
    expect(body.servers.KB121).toMatchObject({ quote: "connecting" });
    expect(body.servers.KB120).toMatchObject({ quote: null });
  });

  it("S3 서버 상태 — staleAccounts = 그 서버에 남아 끄지 못한 계좌 수(29-43) · 다른 서버 0 · 꺼진 서버도 싣는다", async () => {
    h = await startHarness({
      disabled: ["KYOBO119"],
      staleStrategies: () =>
        new Map([
          ["KB120", 2],
          ["KYOBO119", 1],
        ]),
    });
    const body = (await (await call(h, "GET", "/internal/admin/servers/status")).json()) as {
      servers: Record<string, { staleAccounts?: number }>;
    };
    expect(body.servers.KB120?.staleAccounts).toBe(2);
    expect(body.servers.KB121?.staleAccounts).toBe(0);
    expect(body.servers.KYOBO119).toEqual({ conn: "off", journal: "off", admin: "off", quote: null, staleAccounts: 1 });
  });

  it("S4 감사 로그 — 변경 라우트마다 info 1줄 · 비밀번호 · 계좌번호 · dmaUserId 원문 없음 · 삭제 뒤 접근 맵 재적재", async () => {
    let reloads = 0;
    h = await startHarness({
      access: {
        reload: () => {
          reloads += 1;
          return Promise.resolve({ ok: true, revoked: [] });
        },
        entryOf: () => undefined,
      },
    });
    const B = { ...KB_ACCOUNT, accountNo: "1234567802", priority: 2 };
    expect((await call(h, "POST", "/internal/admin/dma-users", createBody({ dmaUserId: "trader07" }))).status).toBe(200);
    expect((await call(h, "POST", "/internal/admin/dma-users/trader07/password", { password: "new-p@ss" })).status).toBe(200);
    expect((await call(h, "PUT", "/internal/admin/dma-users/trader07/accounts", { account: B, servers: ["KB120"] })).status).toBe(200);
    expect((await call(h, "DELETE", "/internal/admin/dma-users/trader07/accounts/KB/1234567802")).status).toBe(200);
    expect((await call(h, "POST", "/internal/admin/dma-users/trader07/reconcile")).status).toBe(200);
    expect((await call(h, "DELETE", "/internal/admin/dma-users/trader07/accounts/KB/1234567801")).status).toBe(409);
    expect((await call(h, "DELETE", "/internal/admin/dma-users/trader07")).status).toBe(200);
    expect(reloads).toBe(1);

    const audits = logs.filter((c) => c.level === "info" && String(c.args[1] ?? "").startsWith("[admin-audit]"));
    expect(audits.map((c) => (c.args[0] as { route: string }).route)).toEqual([
      "POST /dma-users",
      "POST /dma-users/:dma/password",
      "PUT /dma-users/:dma/accounts",
      "DELETE /dma-users/:dma/accounts/:broker/:accountNo",
      "POST /dma-users/:dma/reconcile",
      "DELETE /dma-users/:dma/accounts/:broker/:accountNo",
      "DELETE /dma-users/:dma",
    ]);
    expect(audits[0]!.args[0]).toEqual({
      admin: ADMIN,
      route: "POST /dma-users",
      dma: "tr***(8)",
      servers: [
        { server: "KB120", outcome: "ok" },
        { server: "KB121", outcome: "ok" },
      ],
    });
    expect(audits[5]!.args[0]).toMatchObject({ rejected: "LAST_ACCOUNT", dma: "tr***(8)" });

    const dumped = stringify(logs.map((c) => c.args));
    for (const secret of [PASSWORD, "new-p@ss", "trader07", "1234567801", "1234567802"]) {
      expect(dumped).not.toContain(secret);
    }
  });
});

/**
 * 잠그는 것 (29-23 — 시세 주 서버 전환 경로 · 전환 자체는 tests/quote-switch.test.ts 가 실 스텁으로 잠근다):
 *   Q1  전환 실패 → 409 { error: { code: QUOTE_SWITCH_FAILED, message(화면 원문) } } · DB RPC 0 · 재적재 0 · 감사 rejected
 *   Q2  진행 중 → 409 QUOTE_SWITCH_BUSY · DB RPC 0
 *   Q3  없는 키 404 NO_SUCH_SERVER · 꺼진 서버 409 SERVER_DISABLED · 형식 밖 키 400 — 전환 시도 0
 *   Q4  같은 서버 · DB 도 그 서버 → 200 { ok: true } · RPC 0 · 재적재 0 / DB 가 다른 서버면 RPC 1(갈라짐 정리)
 *   Q5  전환 성공 뒤 DB 반영 실패 → 옛 서버로 되돌리는 switchTo 1회 · 500 QUOTE_PRIMARY_DB_FAILED(Express 는 502)
 *   Q6  (29-32 WR-07) 되돌리기는 응답 뒤 비동기 — 되돌리기 switchTo 가 끝나지 않아도 500 이 바로 온다 · 되돌리기 실패는 error 로그 1줄
 */
describe("relay Admin 내부 HTTP — 시세 주 서버 전환 (29-23)", () => {
  let h: Harness;
  let logs: LogCall[];

  beforeEach(async () => {
    logs = await spyLogs();
  });

  afterEach(async () => {
    await h.close();
    vi.restoreAllMocks();
  });

  /** 기록하는 전환 대역 — 결과는 순서대로 꺼낸다(모자라면 마지막 값). */
  function fakeSwitch(results: QuoteSwitchResult[], current = "KB120") {
    const calls: string[] = [];
    let currentServerKey: string | null = current;
    return {
      calls,
      sw: {
        get currentServerKey() {
          return currentServerKey;
        },
        switchTo(server: DmaServerRow): Promise<QuoteSwitchResult> {
          calls.push(server.key);
          const r = results[Math.min(calls.length - 1, results.length - 1)]!;
          if (r.ok && r.changed) currentServerKey = server.key;
          return Promise.resolve(r);
        },
      },
    };
  }

  const post = (key: string): Promise<Response> => call(h, "POST", `/internal/admin/servers/${key}/quote-primary`);

  it("Q1 전환 실패 → 409 QUOTE_SWITCH_FAILED(화면 원문) · DB RPC 0 · 재적재 0 · 감사 rejected", async () => {
    const message = "새 서버 로그인 실패 — KB120 으로 되돌림";
    const f = fakeSwitch([{ ok: false, code: "QUOTE_SWITCH_FAILED", message }]);
    let reloads = 0;
    h = await startHarness({
      quoteSwitch: f.sw,
      quotePrimary: "KB120",
      registryReload: () => {
        reloads += 1;
        return Promise.resolve({ ok: true, changed: false });
      },
    });
    const res = await post("KYOBO119");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "QUOTE_SWITCH_FAILED", message } });
    expect(f.calls).toEqual(["KYOBO119"]);
    expect(h.db.callsTo("dma_admin_set_quote_primary")).toEqual([]);
    expect(reloads).toBe(0);
    const audit = logs.find((c) => c.args.some((a) => typeof a === "string" && a.includes("[admin-audit]")));
    expect(audit?.args[0]).toMatchObject({ route: "POST /servers/:key/quote-primary", server: "KYOBO119", rejected: "QUOTE_SWITCH_FAILED" });
  });

  it("Q2 진행 중 → 409 QUOTE_SWITCH_BUSY · DB RPC 0", async () => {
    const f = fakeSwitch([{ ok: false, code: "QUOTE_SWITCH_BUSY", message: "시세 주 서버 전환이 진행 중입니다 — 잠시 뒤 다시 시도하세요" }]);
    h = await startHarness({ quoteSwitch: f.sw, quotePrimary: "KB120" });
    const res = await post("KYOBO119");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("QUOTE_SWITCH_BUSY");
    expect(h.db.callsTo("dma_admin_set_quote_primary")).toEqual([]);
  });

  it("Q3 없는 키 404 NO_SUCH_SERVER · 꺼진 서버 409 SERVER_DISABLED · 형식 밖 키 400 — 전환 시도 0", async () => {
    const f = fakeSwitch([{ ok: true, changed: true }]);
    h = await startHarness({ quoteSwitch: f.sw, quotePrimary: "KB120", disabled: ["KB121"] });
    const missing = await post("KB999");
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe("NO_SUCH_SERVER");
    const off = await post("KB121");
    expect(off.status).toBe(409);
    expect(((await off.json()) as { error: { code: string } }).error.code).toBe("SERVER_DISABLED");
    const bad = await post("XX1");
    expect(bad.status).toBe(400);
    expect(f.calls).toEqual([]);
    expect(h.db.callsTo("dma_admin_set_quote_primary")).toEqual([]);
  });

  it("Q4 같은 서버 · DB 도 그 서버 → 200 · RPC 0 · 재적재 0 / DB 가 다른 서버면 RPC 1", async () => {
    const f = fakeSwitch([{ ok: true, changed: false }]);
    let reloads = 0;
    h = await startHarness({
      quoteSwitch: f.sw,
      quotePrimary: "KB120",
      registryReload: () => {
        reloads += 1;
        return Promise.resolve({ ok: true, changed: false });
      },
    });
    const same = await post("KB120");
    expect(same.status).toBe(200);
    expect(await same.json()).toEqual({ ok: true });
    expect(h.db.callsTo("dma_admin_set_quote_primary")).toEqual([]);
    expect(reloads).toBe(0);
    await h.close();

    // 연결은 KYOBO119 인데 DB 는 KB120 — 같은 서버 요청이 DB 를 연결에 맞춘다(무동작 연결 · RPC 1).
    const g = fakeSwitch([{ ok: true, changed: false }], "KYOBO119");
    h = await startHarness({ quoteSwitch: g.sw, quotePrimary: "KB120" });
    const fix = await post("KYOBO119");
    expect(fix.status).toBe(200);
    expect(h.db.callsTo("dma_admin_set_quote_primary")).toEqual([
      { name: "dma_admin_set_quote_primary", args: { p_key: "KYOBO119" } },
    ]);
  });

  it("Q5 전환 성공 뒤 DB 반영 실패 → 옛 서버로 되돌리는 switchTo 1회 · 500 QUOTE_PRIMARY_DB_FAILED", async () => {
    const f = fakeSwitch([{ ok: true, changed: true }]);
    h = await startHarness({ quoteSwitch: f.sw, quotePrimary: "KB120" });
    h.db.failNext.set("dma_admin_set_quote_primary", { code: "08006", message: "connection failure", details: null, hint: null });
    const res = await post("KYOBO119");
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("QUOTE_PRIMARY_DB_FAILED");
    expect(f.calls).toEqual(["KYOBO119", "KB120"]);
    expect(f.sw.currentServerKey).toBe("KB120");
  });

  it("Q6 (29-32) DB 반영 실패 — 되돌리기 switchTo 가 끝나지 않아도 500 이 바로 온다 · 되돌리기 1회 시작", async () => {
    const calls: string[] = [];
    const sw = {
      currentServerKey: "KB120" as string | null,
      switchTo(server: DmaServerRow): Promise<QuoteSwitchResult> {
        calls.push(server.key);
        // 새 서버 전환은 성공 · 옛 서버로의 되돌리기는 영원히 끝나지 않는다(전환 상한 10초 흉내).
        return calls.length === 1 ? Promise.resolve({ ok: true, changed: true }) : new Promise<QuoteSwitchResult>(() => {});
      },
    };
    h = await startHarness({ quoteSwitch: sw, quotePrimary: "KB120" });
    h.db.failNext.set("dma_admin_set_quote_primary", { code: "08006", message: "connection failure", details: null, hint: null });
    const res = await Promise.race([
      post("KYOBO119"),
      new Promise<"hang">((resolve) => setTimeout(() => resolve("hang"), 1_500)),
    ]);
    expect(res).not.toBe("hang");
    expect((res as Response).status).toBe(500);
    expect(((await (res as Response).json()) as { error: { code: string } }).error.code).toBe("QUOTE_PRIMARY_DB_FAILED");
    expect(calls).toEqual(["KYOBO119", "KB120"]);
  });

  it("Q6 (29-32) 되돌리기 실패 → error 로그 1줄(다음 재적재 보정이 맞춘다) · 응답은 500 그대로", async () => {
    const calls: string[] = [];
    const sw = {
      currentServerKey: "KB120" as string | null,
      switchTo(server: DmaServerRow): Promise<QuoteSwitchResult> {
        calls.push(server.key);
        return calls.length === 1 ? Promise.resolve({ ok: true, changed: true }) : Promise.reject(new Error("rollback boom"));
      },
    };
    h = await startHarness({ quoteSwitch: sw, quotePrimary: "KB120" });
    h.db.failNext.set("dma_admin_set_quote_primary", { code: "08006", message: "connection failure", details: null, hint: null });
    const res = await post("KYOBO119");
    expect(res.status).toBe(500);
    await waitFor(
      () => logs.some((c) => c.level === "error" && c.args.some((a) => typeof a === "string" && a.includes("되돌리기 실패"))),
      "되돌리기 실패 로그",
    );
    expect(logs.filter((c) => c.level === "error" && c.args.some((a) => typeof a === "string" && a.includes("되돌리기 실패")))).toHaveLength(1);
  });
});

/**
 * 잠그는 것 (29-32 WR-07 — 요청 마감):
 *   M1  변경 라우트 6개(생성 · 비밀번호 · 계좌 put · 계좌 delete · 유저 delete · reconcile)가 deadlineAt = 도착 시각 + 10_000 을 넘긴다
 *   M2  생성 경로 — 느린 서버(KB121 무응답)는 마감에 timeout(ADMIN_DEADLINE_MESSAGE)으로 접혀 200 + 결과 배열(502 아님) ·
 *       뒤 반영이 끝나면 실제 결과가 한 번 더 기록 · reconcile 도 마감에 200 + 접힌 결과
 */
describe("relay Admin 내부 HTTP — 요청 마감 (29-32 WR-07)", () => {
  const DEADLINE_MESSAGE = "10초 안에 끝나지 않아 먼저 응답했어요 — 서버 반영은 계속돼요";
  let h: Harness;

  beforeEach(async () => {
    await spyLogs();
  });

  afterEach(async () => {
    await h.close();
    vi.restoreAllMocks();
  });

  it("M1 변경 라우트 6개 — deadlineAt = 도착 시각 + 10_000 을 dispatcher 에 넘긴다", async () => {
    const NOW = 1_800_000_000_000;
    h = await startHarness({ now: () => NOW });
    const reconcile = vi.spyOn(AdminDispatcher.prototype, "reconcileUser").mockResolvedValue([]);
    const password = vi.spyOn(AdminDispatcher.prototype, "changePassword").mockResolvedValue([]);
    const remove = vi.spyOn(AdminDispatcher.prototype, "deleteUser").mockResolvedValue({ results: [], deleted: false });

    const B = { ...KB_ACCOUNT, accountNo: "1234567802", priority: 2 };
    for (const [method, path, body] of [
      ["POST", "/internal/admin/dma-users", createBody()],
      ["POST", "/internal/admin/dma-users/tr01/password", { password: "new-p@ss" }],
      ["PUT", "/internal/admin/dma-users/tr01/accounts", { account: B, servers: ["KB120"] }],
      ["DELETE", "/internal/admin/dma-users/tr01/accounts/KB/1234567802", undefined],
      ["DELETE", "/internal/admin/dma-users/tr01", undefined],
      ["POST", "/internal/admin/dma-users/tr01/reconcile", undefined],
    ] as const) {
      const res = await call(h, method, path, body);
      expect(res.status, `${method} ${path}`).toBe(200);
    }

    const deadlineAt = NOW + 10_000;
    expect(reconcile.mock.calls.map((c) => c[1])).toEqual([
      { password: PASSWORD, adminEmail: ADMIN, deadlineAt },
      { adminEmail: ADMIN, deadlineAt },
      { adminEmail: ADMIN, deadlineAt },
      { adminEmail: ADMIN, deadlineAt },
    ]);
    expect(password.mock.calls.map((c) => c[3])).toEqual([{ deadlineAt }]);
    expect(remove.mock.calls.map((c) => c[2])).toEqual([{ deadlineAt }]);
  });

  it("M2 생성 — 무응답 서버는 마감에 timeout 으로 접혀 200(502 아님) · 뒤 반영이 끝나면 실제 결과 기록 · reconcile 도 200 + 접힌 결과", async () => {
    h = await startHarness({ commandTimeoutMs: 800, adminDeadlineMs: 300 });
    h.gateways.KB121!.onAdminCommand(null); // KB121 은 86 을 보내지 않는다(느린 · 멈춘 서버)

    const t0 = Date.now();
    const res = await call(h, "POST", "/internal/admin/dma-users", createBody());
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        { server: "KB120", outcome: "ok", usersRev: "2" },
        { server: "KB121", outcome: "timeout", message: DEADLINE_MESSAGE },
      ],
    });
    // 86 대기 상한(800ms)보다 먼저 — 마감(300ms)에 응답했다.
    expect(elapsed).toBeLessThan(700);
    expect(h.db.callsTo("dma_admin_record_results")).toHaveLength(1);

    // 뒤 반영(KB121 86 타임아웃)이 끝나면 실제 결과로 한 번 더 기록한다.
    await waitFor(() => h.db.callsTo("dma_admin_record_results").length === 2, "뒤 반영 기록");
    expect(h.db.callsTo("dma_admin_record_results")[1]!.args.p_results).toEqual([
      { server: "KB120", outcome: "ok" },
      { server: "KB121", outcome: "timeout" },
    ]);

    // 「다시 반영」 — KB121 은 여전히 무응답 → 마감에 200 + 접힌 결과.
    const again = await call(h, "POST", "/internal/admin/dma-users/tr01/reconcile");
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({
      results: [
        { server: "KB120", outcome: "ok", usersRev: "2" },
        { server: "KB121", outcome: "timeout", message: DEADLINE_MESSAGE },
      ],
    });
  });
});

describe("relay Admin 내부 HTTP — DB 등록만 지우고 삭제 (29-34 WR-04)", () => {
  const SKIPPED_DELETE = "사용이 꺼진 서버 — 켜고 다시 삭제하거나, DB 등록만 지우고 삭제";
  const SKIPPED_SETTLED = "사용이 꺼진 서버 — DB 등록만 지웠어요(켜면 「서버에만 있음」)";
  let h: Harness;
  let logs: LogCall[];

  beforeEach(async () => {
    logs = await spyLogs();
  });

  afterEach(async () => {
    await h.close();
    vi.restoreAllMocks();
  });

  it("K1 꺼진 KB121 등록 사용자 — 쿼리 없으면 deleted false + 사유 · ?skipDisabled=1 이면 KB121 44 0건 · settle · deleted true · 감사 skipDisabled", async () => {
    h = await startHarness({ disabled: ["KB121"] });
    expect((await call(h, "POST", "/internal/admin/dma-users", createBody())).status).toBe(200);

    const plain = await call(h, "DELETE", "/internal/admin/dma-users/tr01");
    expect(plain.status).toBe(200);
    const plainBody = (await plain.json()) as { results: Array<{ server: string; outcome: string; message?: string }>; deleted: boolean };
    expect(plainBody.deleted).toBe(false);
    expect(plainBody.results.find((r) => r.server === "KB121")).toEqual({ server: "KB121", outcome: "skipped", message: SKIPPED_DELETE });
    expect(h.db.callsTo("dma_admin_delete_dma_user")).toEqual([]);

    const res = await call(h, "DELETE", "/internal/admin/dma-users/tr01?skipDisabled=1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [{ server: "KB121", outcome: "skipped", message: SKIPPED_SETTLED }],
      deleted: true,
    });
    expect(h.commands("KB121")).toEqual([]);
    expect(h.db.callsTo("dma_admin_delete_dma_user")).toHaveLength(1);
    expect(h.db.dmaUsers.has("tr01")).toBe(false);

    const deletes = logs.filter(
      (c) => c.level === "info" && String(c.args[1] ?? "").startsWith("[admin-audit]") && (c.args[0] as { route: string }).route === "DELETE /dma-users/:dma",
    );
    expect(deletes.map((c) => (c.args[0] as { skipDisabled?: boolean }).skipDisabled)).toEqual([undefined, true]);
  });

  it("K2 쿼리 해석 — skipDisabled=1 만 참 · true · 0 · 없음은 dispatcher 옵션에 skipDisabled 키가 없다", async () => {
    const NOW = 1_800_000_000_000;
    h = await startHarness({ now: () => NOW });
    const remove = vi.spyOn(AdminDispatcher.prototype, "deleteUser").mockResolvedValue({ results: [], deleted: false });
    for (const q of ["?skipDisabled=1", "?skipDisabled=true", "?skipDisabled=0", ""]) {
      expect((await call(h, "DELETE", `/internal/admin/dma-users/tr01${q}`)).status).toBe(200);
    }
    const deadlineAt = NOW + 10_000;
    expect(remove.mock.calls.map((c) => c[2])).toEqual([
      { deadlineAt, skipDisabled: true },
      { deadlineAt },
      { deadlineAt },
      { deadlineAt },
    ]);
  });
});
