import { afterAll, afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import pino from "pino";
import request from "supertest";
import {
  deriveAdminUsersOverview,
  type AdminAccountCostsRaw,
  type AdminOrderEndpointsRaw,
  type AdminUsersRaw,
} from "@gh-radar/shared";

import { createApp } from "../../src/app";
import { requireRelayAdmin } from "../../src/routes/admin";
import {
  createRelayAdminClient,
  relayAdminClientFrom,
  type RelayAdminClient,
} from "../../src/services/relay-admin-client";
import { logger, loggerOptions } from "../../src/logger";
import { ApiError } from "../../src/errors";
import {
  ADMIN_EMAIL,
  ADMIN_TOKEN,
  PENDING_TOKEN,
  TRADER_TOKEN,
  baseAppUsers,
  baseUsers,
  makeAdminSupabase,
  type AdminSupabaseOpts,
} from "../fixtures/admin-supabase";
import { makeFakeRelay } from "../fixtures/fake-relay-admin";

/**
 * Phase 29 (29-10) — `/api/admin` 라우트. 역할 판정 · 개요 파생은 목 Supabase 위에서 증명한다(원격 DB 무관).
 *
 * ★ GET /users 의 응답 단언은 shared `deriveAdminUsersOverview` 결과 그 자체와 비교한다 — 칩 규칙의 정본은 shared
 *   한 곳이고, server 가 「RPC 원자료를 그대로 넘겨 파생 한 번」 만 한다는 것을 잠근다.
 */

const raw: AdminUsersRaw = {
  appUsers: [
    { email: "alex@jx1.io", role: "admin", dmaUserId: null, signedUp: true },
    { email: "trader@gmail.com", role: "trader", dmaUserId: "kim01", signedUp: true },
    { email: "pre@gmail.com", role: "viewer", dmaUserId: null, signedUp: false },
  ],
  pending: [
    { email: "old@gmail.com", signedUpAt: "2026-10-01T00:00:00Z" },
    { email: "new@gmail.com", signedUpAt: "2026-10-05T00:00:00Z" },
  ],
  intent: [
    {
      dmaUserId: "kim01",
      broker: "KB",
      serverKey: "KB120",
      state: "active",
      accountNo: "12345678901",
      name: "김",
      branchNo: "00123",
      traderId: "T00001",
      priority: 0,
    },
  ],
  snapshots: [{ serverKey: "KB120", usersRev: "7", receivedAt: "2026-10-06T00:00:00Z" }],
  snapshotAccounts: [
    {
      serverKey: "KB120",
      dmaUserId: "kim01",
      accountNo: "12345678901",
      name: "김",
      branchNo: "00123",
      traderId: "T00001",
      priority: 0,
    },
  ],
  results: [],
  servers: [
    { key: "KB120", broker: "KB", enabled: true },
    { key: "KYOBO119", broker: "KYOBO", enabled: true },
  ],
};

function makeApp(opts: AdminSupabaseOpts = {}, relayAdmin?: RelayAdminClient) {
  const sb = makeAdminSupabase({ users: baseUsers, appUsers: baseAppUsers(), raw, ...opts });
  const app = createApp({ supabase: sb.client, relayAdmin });
  return { app, ...sb };
}

/**
 * deps 주입 가짜 relay — reload 호출(요청자 이메일)만 기록하고 정해 둔 status 를 돌려준다.
 * 29-13: 실제 `relayAdminClientFrom` 래퍼 위에 저수준 request 만 바꾼다(타입드 메서드가 늘어도 이 가짜는 그대로 맞는다).
 */
function fakeRelay(status = 200) {
  const calls: { op: string; adminEmail: string }[] = [];
  const client: RelayAdminClient = relayAdminClientFrom(async <T,>(_m: string, path: string, adminEmail: string) => {
    const reload = /\/(access|registry)\/reload$/.exec(path);
    if (reload) calls.push({ op: reload[1], adminEmail });
    const data =
      status !== 200 ? null : reload ? { ok: true, changed: reload[1] === "access" } : { results: [] };
    return { status, data: data as T | null };
  });
  return { client, calls };
}

const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ADMIN_TOKEN}`);

describe("GET /api/admin/users", () => {
  it("Authorization 없음 → 401 UNAUTHENTICATED · RPC 0회", async () => {
    const { app, rec } = makeApp();
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("무효 토큰 → 401", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/admin/users").set("Authorization", "Bearer bad");
    expect(res.status).toBe(401);
  });

  it("승인 대기 · trader → 403 FORBIDDEN · RPC 0회", async () => {
    const { app, rec } = makeApp();
    for (const tok of [PENDING_TOKEN, TRADER_TOKEN]) {
      const res = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${tok}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: { code: "FORBIDDEN", message: "관리자만 사용할 수 있어요." } });
    }
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("admin → RPC admin_users_raw 1회 → 200 = shared 파생 결과(users · pending · serverOnly · servers)", async () => {
    const { app, rec } = makeApp();
    const res = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(rec.rpcCalls).toEqual([{ fn: "admin_users_raw", params: undefined }]);
    expect(Object.keys(res.body).sort()).toEqual(["pending", "serverOnly", "servers", "users"]);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(deriveAdminUsersOverview(raw))));
    // 파생이 실제로 돌았다 — 승인 대기는 가입 시각 내림차순, admin 이 먼저.
    expect(res.body.pending.map((p: { email: string }) => p.email)).toEqual(["new@gmail.com", "old@gmail.com"]);
    expect(res.body.users[0].email).toBe("alex@jx1.io");
    // 왕복: 역할 조회 1회 + RPC 1회. 쓰기 0.
    expect(rec.ops.map((o) => o.kind)).toEqual(["select"]);
  });

  it("RPC 오류 → 500 DB_ERROR · 원문 미노출", async () => {
    const { app } = makeApp({ rpcError: { message: "permission denied SECRET-DETAIL", code: "42501" } });
    const res = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("SECRET-DETAIL");
  });

  it("RPC 가 객체가 아닌 값(null)을 주면 → 500 DB_ERROR (빈 목록으로 감추지 않는다)", async () => {
    const sb = makeAdminSupabase({ users: baseUsers, appUsers: baseAppUsers(), raw: null });
    const app = createApp({ supabase: sb.client });
    const res = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
  });

  it("app_users 조회 오류 → 500 DB_ERROR (403 으로 위장하지 않는다)", async () => {
    const { app, rec } = makeApp({ dbError: { select: { message: "timeout" } } });
    const res = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(rec.rpcCalls).toHaveLength(0);
  });
});

// ============================================================
// Phase 30 (30-03) — GET /users 에 relay 87 캐시 IP/MAC 병합 (D-09 · D-10)
//   E1 relay order-endpoints 200 → body = deriveAdminUsersOverview(raw, endpoints) · 계좌 orderEndpoints.KB120 = 87 값
//   E2 relay 500 → 200 · deriveAdminUsersOverview(raw, null) · warn 에 relay status 만
//   E3 relay 호출 throw → 200 · 「확인 전」(null)
//   E4 모양 위반(servers 가 배열 · data null) → 200 · null
// ============================================================

describe("P30 GET /users orderEndpoints 병합 (D-09)", () => {
  const IP = "010041001124";
  const MAC = "1CFD087D978E";
  const endpoints: AdminOrderEndpointsRaw = {
    servers: { KB120: [{ dmaUserId: "kim01", accountNo: "12345678901", orderIp: IP, orderMac: MAC }] },
  };
  const ORDER_PATH = "/internal/admin/order-endpoints";

  afterEach(() => vi.restoreAllMocks());

  it("E1 relay order-endpoints 200 → 200 · body = shared 파생(raw, endpoints) · 계좌 orderEndpoints.KB120 = 87 값", async () => {
    const relay = makeFakeRelay((c) => (c.path === ORDER_PATH ? { status: 200, data: endpoints } : undefined));
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/users"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(deriveAdminUsersOverview(raw, endpoints))));
    const kim = res.body.users.find((u: { dmaUserId: string | null }) => u.dmaUserId === "kim01");
    expect(kim.accounts[0].orderEndpoints).toEqual({ KB120: { orderIp: IP, orderMac: MAC } });
    expect(rec.rpcCalls).toEqual([{ fn: "admin_users_raw", params: undefined }]);
    // 36-04 — 예수금·비용률 GET 이 함께 나간다(병렬 · 순서 무관). order-endpoints 는 1회.
    expect(relay.calls.filter((c) => c.path === ORDER_PATH)).toEqual([{ method: "GET", path: ORDER_PATH, adminEmail: ADMIN_EMAIL }]);
  });

  it("E2 relay 500 → 200 · 파생(raw, null) = 전 서버 「확인 전」 · warn 에 relay status 만", async () => {
    const warn = vi.spyOn(logger, "warn");
    const relay = makeFakeRelay((c) => (c.path === ORDER_PATH ? { status: 500, data: null } : undefined));
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/users"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(deriveAdminUsersOverview(raw, null))));
    const kim = res.body.users.find((u: { dmaUserId: string | null }) => u.dmaUserId === "kim01");
    expect(kim.accounts[0].orderEndpoints).toEqual({ KB120: null });
    const relayWarns = warn.mock.calls.filter((args) => (args[0] as { relay?: { op?: string } })?.relay?.op === "order-endpoints");
    expect(relayWarns).toHaveLength(1);
    expect(relayWarns[0]![0]).toEqual({ relay: { op: "order-endpoints", status: 500 } });
  });

  it("E3 relay 호출이 throw 해도 → 200 · 「확인 전」", async () => {
    const relay = makeFakeRelay((c) => {
      if (c.path === ORDER_PATH) throw new Error("socket hang up");
      return undefined;
    });
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/users"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(deriveAdminUsersOverview(raw, null))));
  });

  it("E4 모양 위반(servers 배열 · data null) → 200 · 「확인 전」 · RPC 오류는 종전대로 500", async () => {
    for (const data of [{ servers: [] }, null, { servers: null }]) {
      const relay = makeFakeRelay((c) => (c.path === ORDER_PATH ? { status: 200, data } : undefined));
      const { app } = makeApp({}, relay.client);
      const res = await auth(request(app).get("/api/admin/users"));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(JSON.parse(JSON.stringify(deriveAdminUsersOverview(raw, null))));
    }
    const relay = makeFakeRelay((c) => (c.path === ORDER_PATH ? { status: 200, data: endpoints } : undefined));
    const { app } = makeApp({ rpcError: { message: "permission denied", code: "42501" } }, relay.client);
    const res = await auth(request(app).get("/api/admin/users"));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
  });

  it("E5 (30 WR-02) 서버 · 행 단위 모양 위반 → 200 · 그 서버 · 그 행만 버림(「확인 전」) · warn 에 버린 수만", async () => {
    const warn = vi.spyOn(logger, "warn");
    const good = endpoints.servers.KB120![0]!;
    const data = {
      servers: {
        KB120: [good, null, {}, { dmaUserId: "kim01", orderIp: IP, orderMac: MAC }, { ...good, orderIp: 1 }],
        KB121: null,
        KYOBO119: {},
      },
    };
    const relay = makeFakeRelay((c) => (c.path === ORDER_PATH ? { status: 200, data } : undefined));
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/users"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(deriveAdminUsersOverview(raw, endpoints))));
    const kim = res.body.users.find((u: { dmaUserId: string | null }) => u.dmaUserId === "kim01");
    expect(kim.accounts[0].orderEndpoints).toEqual({ KB120: { orderIp: IP, orderMac: MAC } });
    const relayWarns = warn.mock.calls.filter((args) => (args[0] as { relay?: { op?: string } })?.relay?.op === "order-endpoints");
    expect(relayWarns).toHaveLength(1);
    expect(relayWarns[0]![0]).toEqual({
      relay: { op: "order-endpoints", status: 200, droppedServers: 2, droppedRows: 4 },
    });
    expect(JSON.stringify(relayWarns)).not.toContain(IP);
    expect(JSON.stringify(relayWarns)).not.toContain(MAC);
  });
});

// ============================================================
// Phase 36 (36-04) — GET /users 에 relay 예수금 · 비용률 병합 (D-05)
//   K1 relay account-costs 200 → 계좌 costs.KB120 = live 값(budgetSource live) · 파생(raw, endpoints, costs) 그대로
//   K2 live null → 87 값(snapshot)
//   K3 relay 500 · throw · 모양 위반 → 200 · costs 전부 null(「확인 전」) · warn 에 status 만
//   K4 order-endpoints 실패와 독립 — 한쪽만 실패해도 다른 쪽은 채운다
//   K5 세 왕복은 Promise.all 병렬 — account-costs 가 끝나기 전에 order-endpoints 가 이미 나갔다
//   K6 행 단위 모양 위반은 그 행만 버림
// ============================================================

describe("P36 GET /users costs 병합 (D-05)", () => {
  const ORDER_PATH = "/internal/admin/order-endpoints";
  const COSTS_PATH = "/internal/admin/account-costs";
  const row = {
    dmaUserId: "kim01",
    accountNo: "12345678901",
    budgetKrw: 100_000_000,
    feePpm: 100,
    sellTaxPpm: 2000,
    liveBudgetKrw: 99_000_000,
  };
  const costs: AdminAccountCostsRaw = { servers: { KB120: [row] } };
  const kimCosts = (body: { users: Array<{ dmaUserId: string | null; accounts: Array<{ costs?: unknown }> }> }) =>
    body.users.find((u) => u.dmaUserId === "kim01")!.accounts[0]!.costs;

  afterEach(() => vi.restoreAllMocks());

  it("K1 relay 200 → costs.KB120 = live 예수금(budgetSource live) · 87 비용률 · 파생(raw, endpoints, costs) 그대로", async () => {
    const relay = makeFakeRelay((c) => (c.path === COSTS_PATH ? { status: 200, data: costs } : undefined));
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/users"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(deriveAdminUsersOverview(raw, { servers: {} }, costs))));
    expect(kimCosts(res.body)).toEqual({
      KB120: { budgetKrw: 99_000_000, feePpm: 100, sellTaxPpm: 2000, budgetSource: "live" },
    });
    expect(relay.calls.filter((c) => c.path === COSTS_PATH)).toEqual([
      { method: "GET", path: COSTS_PATH, adminEmail: ADMIN_EMAIL },
    ]);
  });

  it("K2 live null → 87 예수금(budgetSource snapshot)", async () => {
    const data = { servers: { KB120: [{ ...row, liveBudgetKrw: null }] } };
    const relay = makeFakeRelay((c) => (c.path === COSTS_PATH ? { status: 200, data } : undefined));
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/users"));
    expect(kimCosts(res.body)).toEqual({
      KB120: { budgetKrw: 100_000_000, feePpm: 100, sellTaxPpm: 2000, budgetSource: "snapshot" },
    });
  });

  it("K3 relay 500 · throw · 모양 위반 → 200 · costs 전부 null · warn 에 relay status 만", async () => {
    const cases: Array<(c: { path: string }) => { status: number; data: unknown } | undefined> = [
      (c) => (c.path === COSTS_PATH ? { status: 500, data: null } : undefined),
      (c) => {
        if (c.path === COSTS_PATH) throw new Error("socket hang up");
        return undefined;
      },
      (c) => (c.path === COSTS_PATH ? { status: 200, data: { servers: [] } } : undefined),
      (c) => (c.path === COSTS_PATH ? { status: 200, data: null } : undefined),
    ];
    for (const handler of cases) {
      const warn = vi.spyOn(logger, "warn");
      const relay = makeFakeRelay(handler as Parameters<typeof makeFakeRelay>[0]);
      const { app } = makeApp({}, relay.client);
      const res = await auth(request(app).get("/api/admin/users"));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(JSON.parse(JSON.stringify(deriveAdminUsersOverview(raw, { servers: {} }, null))));
      expect(kimCosts(res.body)).toEqual({ KB120: null });
      const costWarns = warn.mock.calls.filter((a) => (a[0] as { relay?: { op?: string } })?.relay?.op === "account-costs");
      expect(costWarns).toHaveLength(1);
      expect(Object.keys((costWarns[0]![0] as { relay: object }).relay)).toEqual(["op", "status"]);
      warn.mockRestore();
    }
  });

  it("K4 order-endpoints 실패와 독립 — 한쪽만 실패해도 다른 쪽은 채운다", async () => {
    const endpoints: AdminOrderEndpointsRaw = {
      servers: { KB120: [{ dmaUserId: "kim01", accountNo: "12345678901", orderIp: "010041001124", orderMac: "1CFD087D978E" }] },
    };
    // ① order-endpoints 500 · account-costs 200
    let relay = makeFakeRelay((c) =>
      c.path === ORDER_PATH ? { status: 500, data: null } : c.path === COSTS_PATH ? { status: 200, data: costs } : undefined,
    );
    let res = await auth(request(makeApp({}, relay.client).app).get("/api/admin/users"));
    expect(res.status).toBe(200);
    let kim = res.body.users.find((u: { dmaUserId: string | null }) => u.dmaUserId === "kim01");
    expect(kim.accounts[0].orderEndpoints).toEqual({ KB120: null });
    expect(kim.accounts[0].costs.KB120).toMatchObject({ budgetKrw: 99_000_000, budgetSource: "live" });
    // ② order-endpoints 200 · account-costs throw
    relay = makeFakeRelay((c) => {
      if (c.path === COSTS_PATH) throw new Error("ECONNRESET");
      return c.path === ORDER_PATH ? { status: 200, data: endpoints } : undefined;
    });
    res = await auth(request(makeApp({}, relay.client).app).get("/api/admin/users"));
    expect(res.status).toBe(200);
    kim = res.body.users.find((u: { dmaUserId: string | null }) => u.dmaUserId === "kim01");
    expect(kim.accounts[0].orderEndpoints.KB120).toEqual({ orderIp: "010041001124", orderMac: "1CFD087D978E" });
    expect(kim.accounts[0].costs).toEqual({ KB120: null });
  });

  it("K5 세 왕복은 병렬 — account-costs 응답을 붙잡아 둔 동안 order-endpoints 도 이미 나갔다", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const relay = makeFakeRelay(async (c) => {
      if (c.path === COSTS_PATH) {
        await gate;
        return { status: 200, data: costs };
      }
      return undefined;
    });
    const { app } = makeApp({}, relay.client);
    const pending = auth(request(app).get("/api/admin/users")).then((r) => r);
    // account-costs 가 매달린 동안 order-endpoints 호출이 이미 기록돼 있어야 한다(순차라면 하나만 나간 상태).
    for (let i = 0; i < 50 && relay.calls.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
    expect(new Set(relay.calls.map((c) => c.path))).toEqual(new Set([ORDER_PATH, COSTS_PATH]));
    release();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(kimCosts(res.body)).toEqual({
      KB120: { budgetKrw: 99_000_000, feePpm: 100, sellTaxPpm: 2000, budgetSource: "live" },
    });
  });

  it("K6 행 단위 모양 위반은 그 행만 버림 · 서버 행 목록이 배열 아니면 그 서버만", async () => {
    const warn = vi.spyOn(logger, "warn");
    const data = {
      servers: {
        KB120: [row, null, { ...row, budgetKrw: "1" }, { ...row, liveBudgetKrw: Number.NaN }, { ...row, feePpm: undefined }],
        KYOBO119: {},
      },
    };
    const relay = makeFakeRelay((c) => (c.path === COSTS_PATH ? { status: 200, data } : undefined));
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/users"));
    expect(res.status).toBe(200);
    expect(kimCosts(res.body)).toEqual({
      KB120: { budgetKrw: 99_000_000, feePpm: 100, sellTaxPpm: 2000, budgetSource: "live" },
    });
    const costWarns = warn.mock.calls.filter((a) => (a[0] as { relay?: { op?: string } })?.relay?.op === "account-costs");
    expect(costWarns[0]![0]).toEqual({ relay: { op: "account-costs", status: 200, droppedServers: 1, droppedRows: 4 } });
  });
});

// ============================================================
// 허용 / 역할 쓰기 (D-01 · D-03 · D-04) — Express 가 DB 에 직접 쓰고 relay 에 best-effort 통보
// ============================================================

describe("POST /api/admin/users — 사전 등록 · 승인 · 생성", () => {
  it("이메일 trim · 소문자 → app_users upsert(onConflict email · updated_at) → 200 { ok, relayNotified: true } · 통보 1건(요청자)", async () => {
    const relay = fakeRelay();
    const { app, rec, rows } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/users")).send({ email: " Lee.New@Gmail.com ", role: "trader" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, relayNotified: true });
    const up = rec.ops.find((o) => o.kind === "upsert")!;
    expect(up.table).toBe("app_users");
    expect(up.payload).toMatchObject({ email: "lee.new@gmail.com", role: "trader" });
    expect(typeof up.payload!.updated_at).toBe("string");
    expect(up.options).toEqual({ onConflict: "email" });
    expect(rows.get("lee.new@gmail.com")?.role).toBe("trader");
    expect(relay.calls).toEqual([{ op: "access", adminEmail: ADMIN_EMAIL }]);
  });

  it.each([
    ["잘못된 role", { email: "a@gmail.com", role: "owner" }],
    ["이메일 형식", { email: "not-an-email", role: "viewer" }],
    ["빈 body", {}],
    ["254자 초과 이메일", { email: `${"a".repeat(250)}@gmail.com`, role: "viewer" }],
  ])("%s → 400 VALIDATION_FAILED · 쓰기 0 · 통보 0", async (_label, body) => {
    const relay = fakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/users")).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(rec.ops.filter((o) => o.kind !== "select")).toHaveLength(0);
    expect(relay.calls).toHaveLength(0);
  });

  it("본인 이메일을 admin 아닌 역할로 → 409 SELF_LOCKOUT (쓰기 0)", async () => {
    const { app, rec } = makeApp({}, fakeRelay().client);
    const res = await auth(request(app).post("/api/admin/users")).send({ email: "ALEX@jx1.io", role: "viewer" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SELF_LOCKOUT");
    expect(rec.ops.filter((o) => o.kind !== "select")).toHaveLength(0);
  });

  it("trader 토큰 → 403 (쓰기 0)", async () => {
    const { app, rec } = makeApp({}, fakeRelay().client);
    const res = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${TRADER_TOKEN}`)
      .send({ email: "x@gmail.com", role: "admin" });
    expect(res.status).toBe(403);
    expect(rec.ops.filter((o) => o.kind !== "select")).toHaveLength(0);
  });

  it("upsert 오류 → 500 DB_ERROR · 통보 0", async () => {
    const relay = fakeRelay();
    const { app } = makeApp({ dbError: { upsert: { message: "boom SECRET-DETAIL" } } }, relay.client);
    const res = await auth(request(app).post("/api/admin/users")).send({ email: "x@gmail.com", role: "viewer" });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("SECRET-DETAIL");
    expect(relay.calls).toHaveLength(0);
  });
});

describe("PATCH /api/admin/users/:email — 역할 변경", () => {
  it("본인 role trader → 409 SELF_LOCKOUT", async () => {
    const { app, rec } = makeApp({}, fakeRelay().client);
    const res = await auth(request(app).patch(`/api/admin/users/${encodeURIComponent(ADMIN_EMAIL)}`)).send({ role: "trader" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SELF_LOCKOUT");
    expect(rec.ops.filter((o) => o.kind === "update")).toHaveLength(0);
  });

  it("타인(경로 인코딩 · 대문자) → 소문자 키로 update → 200 · 통보 1건", async () => {
    const relay = fakeRelay();
    const { app, rec, rows } = makeApp({}, relay.client);
    const res = await auth(request(app).patch(`/api/admin/users/${encodeURIComponent("Trader@Gmail.com")}`)).send({ role: "viewer" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, relayNotified: true });
    const up = rec.ops.find((o) => o.kind === "update")!;
    expect(up.filters).toEqual([["eq", "email", "trader@gmail.com"]]);
    expect(up.payload).toMatchObject({ role: "viewer" });
    expect(typeof up.payload!.updated_at).toBe("string");
    expect(rows.get("trader@gmail.com")?.role).toBe("viewer");
    expect(relay.calls).toHaveLength(1);
  });

  it("없는 이메일 → 404 NOT_FOUND · 통보 0", async () => {
    const relay = fakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).patch("/api/admin/users/ghost%40gmail.com")).send({ role: "viewer" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(relay.calls).toHaveLength(0);
  });

  it("잘못된 role · 잘못된 경로 이메일 → 400 VALIDATION_FAILED", async () => {
    const { app } = makeApp({}, fakeRelay().client);
    const a = await auth(request(app).patch("/api/admin/users/trader%40gmail.com")).send({ role: "root" });
    expect(a.status).toBe(400);
    expect(a.body.error.code).toBe("VALIDATION_FAILED");
    const b = await auth(request(app).patch("/api/admin/users/not-an-email")).send({ role: "viewer" });
    expect(b.status).toBe(400);
    expect(b.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("DELETE /api/admin/users/:email — DMA 연결 없는 사용자 (DMA 있는 사용자는 admin-dma.test.ts)", () => {
  it("본인 → 409 SELF_LOCKOUT (삭제 0)", async () => {
    const { app, rec } = makeApp({}, fakeRelay().client);
    const res = await auth(request(app).delete(`/api/admin/users/${encodeURIComponent(ADMIN_EMAIL)}`));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SELF_LOCKOUT");
    expect(rec.ops.filter((o) => o.kind === "delete")).toHaveLength(0);
  });

  it("DMA 없는 사용자 → 삭제는 「dma_user_id is null」 조건 한 문장 → 200 { ok, deleted: true } · 통보 1건", async () => {
    const relay = fakeRelay();
    const { app, rec, rows } = makeApp({}, relay.client);
    const res = await auth(request(app).delete("/api/admin/users/viewer%40gmail.com"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: true, relayNotified: true });
    const del = rec.ops.find((o) => o.kind === "delete")!;
    expect(del.filters).toEqual([
      ["eq", "email", "viewer@gmail.com"],
      ["is", "dma_user_id", null],
    ]);
    expect(rows.has("viewer@gmail.com")).toBe(false);
    expect(relay.calls).toEqual([{ op: "access", adminEmail: ADMIN_EMAIL }]);
  });

  it("없는 사용자 → 404 NOT_FOUND · 통보 0", async () => {
    const relay = fakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).delete("/api/admin/users/ghost%40gmail.com"));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(relay.calls).toHaveLength(0);
  });
});

describe("relay 통보 — best-effort (실패해도 쓰기는 200 · relay 60초 재적재가 따라잡는다)", () => {
  it("relay 클라이언트 없음(env 미설정) → 200 · relayNotified: false", async () => {
    const { app } = makeApp();
    const res = await auth(request(app).post("/api/admin/users")).send({ email: "a@gmail.com", role: "viewer" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, relayNotified: false });
  });

  it("relay 타임아웃(status 0) → 200 · relayNotified: false", async () => {
    const { app } = makeApp({}, fakeRelay(0).client);
    const res = await auth(request(app).patch("/api/admin/users/viewer%40gmail.com")).send({ role: "trader" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, relayNotified: false });
  });

  describe("실제 클라이언트 → 로컬 가짜 relay", () => {
    const SECRET = "route-test-relay-secret";
    let server: http.Server;
    let base: string;
    let seen: { url: string; headers: http.IncomingHttpHeaders }[] = [];
    let status = 200;

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        seen.push({ url: req.url ?? "", headers: req.headers });
        req.resume();
        req.on("end", () => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(status === 200 ? { ok: true, changed: true } : { error: { code: "INTERNAL" } }));
        });
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    });
    afterEach(() => {
      seen = [];
      status = 200;
      vi.restoreAllMocks();
    });

    const realClient = () => createRelayAdminClient({ baseUrl: base, secret: SECRET, timeoutMs: 2000, nodeEnv: "test" });

    it("POST /users → relay 에 POST /internal/admin/access/reload 1건 · x-admin-email = 요청자 · X-Relay-Secret", async () => {
      const { app } = makeApp({}, realClient());
      const res = await auth(request(app).post("/api/admin/users")).send({ email: "lee@gmail.com", role: "viewer" });
      expect(res.body).toEqual({ ok: true, relayNotified: true });
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toBe("/internal/admin/access/reload");
      expect(seen[0].headers["x-admin-email"]).toBe(ADMIN_EMAIL);
      expect(seen[0].headers["x-relay-secret"]).toBe(SECRET);
    });

    it("relay 500 → 200 · relayNotified: false + warn 로그(비밀 · 헤더 값 없음)", async () => {
      status = 500;
      const warn = vi.spyOn(logger, "warn");
      const { app } = makeApp({}, realClient());
      const res = await auth(request(app).post("/api/admin/users")).send({ email: "lee@gmail.com", role: "viewer" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, relayNotified: false });
      const relayWarns = warn.mock.calls.filter((c) => JSON.stringify(c).includes("access reload"));
      expect(relayWarns).toHaveLength(1);
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain(SECRET);
    });
  });
});

describe("requireRelayAdmin — relay 의존 라우트(29-13)의 503", () => {
  it("클라이언트가 없으면 503 RELAY_UNAVAILABLE · 있으면 그대로", () => {
    const reqWithout = { app: { locals: {} } } as never;
    expect(() => requireRelayAdmin(reqWithout)).toThrow(ApiError);
    try {
      requireRelayAdmin(reqWithout);
    } catch (e) {
      expect((e as ApiError).status).toBe(503);
      expect((e as ApiError).code).toBe("RELAY_UNAVAILABLE");
    }
    const c = fakeRelay().client;
    expect(requireRelayAdmin({ app: { locals: { relayAdmin: c } } } as never)).toBe(c);
  });
});

describe("로그 위생 (RESEARCH Pitfall 13)", () => {
  it("요청 바디 password · x-relay-secret 헤더 · 중첩 password 가 [REDACTED]", () => {
    const out: string[] = [];
    const dest = new Writable({
      write(chunk, _enc, cb) {
        out.push(String(chunk));
        cb();
      },
    });
    const log = pino(loggerOptions(), dest);
    log.warn(
      {
        req: { body: { password: "pw-REQ-BODY" }, headers: { "x-relay-secret": "hdr-SECRET" } },
        dma: { password: "pw-NESTED" },
      },
      "probe",
    );
    const line = out.join("");
    expect(line).not.toContain("pw-REQ-BODY");
    expect(line).not.toContain("hdr-SECRET");
    expect(line).not.toContain("pw-NESTED");
    expect(line).toContain("[REDACTED]");
  });
});
