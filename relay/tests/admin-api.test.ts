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
 */
import { randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminConn } from "../src/admin/admin-conn.js";
import { createAdminRouter } from "../src/admin/admin-api.js";
import { AdminDispatcher } from "../src/admin/dispatcher.js";
import { AdminIntentStore } from "../src/admin/intent-store.js";
import { createOrderApi } from "../src/order/order-api.js";
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
  close: () => Promise<void>;
};

async function startHarness(opts: { commandTimeoutMs?: number } = {}): Promise<Harness> {
  const credKey = randomBytes(32).toString("base64");
  const rows = [serverRow("KB120", "KB", 1), serverRow("KB121", "KB", 2), serverRow("KYOBO119", "KYOBO", 3)];
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
  const registry = { all: () => rows.map((r) => ({ ...r })), get: (k: string) => rows.find((r) => r.key === k) };
  const pipelines = { get: (k: string) => (conns[k] ? { admin: conns[k]! } : undefined) };
  const dispatcher = new AdminDispatcher({ store, pipelines, registry, credKey });
  const router = createAdminRouter({ store, dispatcher, registry, credKey });

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
});
