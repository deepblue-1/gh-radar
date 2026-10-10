import { describe, it, expect } from "vitest";
import request from "supertest";
import { deriveAdminServersOverview, type AdminServersRaw } from "@gh-radar/shared";

import { createApp } from "../../src/app";
import type { RelayAdminClient } from "../../src/services/relay-admin-client";
import {
  ADMIN_EMAIL,
  ADMIN_TOKEN,
  TRADER_TOKEN,
  baseAppUsers,
  baseUsers,
  makeAdminSupabase,
  type AdminSupabaseOpts,
} from "../fixtures/admin-supabase";
import { makeFakeRelay, relayReject } from "../fixtures/fake-relay-admin";

/**
 * Phase 29 (29-13) — `/api/admin/servers/*`. 레지스트리 불변식은 DB(RPC)가 쥐고, 여기는 RPC 오류를 코드로 옮기고
 * relay 재적재 · 시세 전환을 부르는 것만 증명한다. 주소는 전부 TEST-NET(192.0.2.0/24 · RFC 5737).
 */

const raw: AdminServersRaw = {
  servers: [
    { key: "KB120", broker: "KB", host: "192.0.2.10", port: 9100, enabled: true, isOrderServer: true, isQuotePrimary: true, sortOrder: 10 },
    { key: "KB121", broker: "KB", host: "192.0.2.11", port: 9100, enabled: false, isOrderServer: false, isQuotePrimary: false, sortOrder: 20 },
    { key: "KYOBO119", broker: "KYOBO", host: "192.0.2.19", port: 9100, enabled: true, isOrderServer: true, isQuotePrimary: false, sortOrder: 30 },
  ],
  userCounts: [{ serverKey: "KB120", users: 4 }],
  snapshots: [{ serverKey: "KB120", usersRev: "7", receivedAt: "2026-10-06T00:00:00Z" }],
};

const live = {
  KB120: { conn: "ok", journal: "ok", admin: "ok", quote: "live" },
  KYOBO119: { conn: "ok", journal: "ok", admin: "connecting", quote: null },
} as const;

const serverRows = () =>
  raw.servers.map((s) => ({
    key: s.key,
    broker: s.broker,
    host: s.host,
    port: s.port,
    enabled: s.enabled,
    is_order_server: s.isOrderServer,
    is_quote_primary: s.isQuotePrimary,
    sort_order: s.sortOrder,
  }));

type RpcHandler = NonNullable<AdminSupabaseOpts["rpc"]>[string];
const ok: RpcHandler = () => ({ data: null, error: null });
const pgErr = (code: string, message: string): RpcHandler => () => ({ data: null, error: { code, message } });

function makeApp(opts: AdminSupabaseOpts = {}, relayAdmin?: RelayAdminClient) {
  const sb = makeAdminSupabase({
    users: baseUsers,
    appUsers: baseAppUsers(),
    tables: { dma_servers: serverRows() },
    ...opts,
    rpc: {
      admin_servers_raw: () => ({ data: raw, error: null }),
      dma_admin_upsert_server: ok,
      dma_admin_set_server_enabled: ok,
      dma_admin_set_order_server: ok,
      ...opts.rpc,
    },
  });
  const app = createApp({ supabase: sb.client, relayAdmin });
  return { app, ...sb };
}

const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ADMIN_TOKEN}`);
const statusRelay = () =>
  makeFakeRelay((c) => (c.path === "/internal/admin/servers/status" ? { status: 200, data: { servers: live } } : undefined));

describe("GET /api/admin/servers — 레지스트리 개요 (D-17)", () => {
  it("RPC admin_servers_raw 1회 + relay servers/status 1회 → shared deriveAdminServersOverview 그대로 · 역할 조회 1회", async () => {
    const relay = statusRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/servers"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(deriveAdminServersOverview(raw, live as never))));
    expect(rec.rpcCalls.map((c) => c.fn)).toEqual(["admin_servers_raw"]);
    expect(relay.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /internal/admin/servers/status"]);
    expect(relay.calls[0].adminEmail).toBe(ADMIN_EMAIL);
    // 관문은 /servers 라우터 하나만 — adminRouter 가 역할 조회를 한 번 더 하지 않는다(왕복 +1 방지).
    expect(rec.ops.filter((o) => o.table === "app_users" && o.kind === "select")).toHaveLength(1);
    // 파생이 실제로 돌았다 — KB 그룹 먼저 · 상태 붙음 · 유저 수.
    expect(res.body.groups.map((g: { broker: string }) => g.broker)).toEqual(["KB", "KYOBO"]);
    expect(res.body.groups[0].servers[0]).toMatchObject({ key: "KB120", userCount: 4, status: live.KB120 });
  });

  it("(29-38) relay 상태의 staleAccounts(29-43 — 옛 주문 서버에 남은 전략 계좌 수)를 그대로 통과시킨다 · 없는 서버는 필드 없음", async () => {
    const withStale = { ...live, KB120: { ...live.KB120, staleAccounts: 2 } };
    const relay = makeFakeRelay((c) =>
      c.path === "/internal/admin/servers/status" ? { status: 200, data: { servers: withStale } } : undefined,
    );
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/servers"));
    expect(res.status).toBe(200);
    expect(res.body.groups[0].servers[0]).toMatchObject({ key: "KB120", status: { staleAccounts: 2 } });
    expect(res.body.groups[1].servers[0].status).not.toHaveProperty("staleAccounts");
  });

  it("relay 실패(status 0) · relay 500 · 클라이언트 없음 → 같은 응답에 status: null · 200", async () => {
    for (const relay of [
      makeFakeRelay(() => ({ status: 0, data: null })).client,
      makeFakeRelay(() => relayReject(500, "INTERNAL")).client,
      undefined,
    ]) {
      const { app } = makeApp({}, relay);
      const res = await auth(request(app).get("/api/admin/servers"));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(JSON.parse(JSON.stringify(deriveAdminServersOverview(raw, null))));
      for (const g of res.body.groups) for (const s of g.servers) expect(s.status).toBeNull();
    }
  });

  it("RPC 오류 · 계약 위반 → 500 DB_ERROR", async () => {
    const a = makeApp({ rpc: { admin_servers_raw: pgErr("42501", "permission denied") } });
    expect((await auth(request(a.app).get("/api/admin/servers"))).status).toBe(500);
    const b = makeApp({ rpc: { admin_servers_raw: () => ({ data: { servers: null }, error: null }) } });
    const res = await auth(request(b.app).get("/api/admin/servers"));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
  });

  it("미인증 401 · trader 403 · RPC 0", async () => {
    const { app, rec } = makeApp();
    expect((await request(app).get("/api/admin/servers")).status).toBe(401);
    const t = await request(app).get("/api/admin/servers").set("Authorization", `Bearer ${TRADER_TOKEN}`);
    expect(t.status).toBe(403);
    expect(t.body.error.code).toBe("FORBIDDEN");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("GET /api/admin/users 도 역할 조회 1회 그대로(servers 라우터 관문은 /servers 에만)", async () => {
    const { app, rec } = makeApp({ rpc: { admin_users_raw: () => ({ data: { appUsers: [], pending: [], intent: [], snapshots: [], snapshotAccounts: [], results: [], servers: [] }, error: null }) } });
    const res = await auth(request(app).get("/api/admin/users"));
    expect(res.status).toBe(200);
    expect(rec.ops.filter((o) => o.table === "app_users" && o.kind === "select")).toHaveLength(1);
  });
});

describe("POST /api/admin/servers — 서버 추가", () => {
  it("{ key: KB122, broker: KB, host, port } → dma_admin_upsert_server 1회 → relay registry reload → { ok, relayNotified }", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/servers")).send({
      key: "KB122",
      broker: "KB",
      host: "192.0.2.9",
      port: 9100,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, relayNotified: true });
    expect(rec.rpcCalls).toEqual([
      { fn: "dma_admin_upsert_server", params: { p_key: "KB122", p_broker: "KB", p_host: "192.0.2.9", p_port: 9100 } },
    ]);
    expect(relay.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /internal/admin/registry/reload"]);
  });

  it("호스트명 · 앞뒤 공백 trim 허용 · sortOrder 는 upsert 뒤 표 직접 갱신", async () => {
    // 가짜 upsert 가 실제 RPC 처럼 행을 넣는다(신규 = 꺼짐 · 맨 뒤) — 그 뒤 sort_order 갱신이 그 행에 닿는지 본다.
    let tbl: Record<string, Record<string, unknown>[]> = {};
    const sb = makeApp(
      {
        rpc: {
          dma_admin_upsert_server: (p) => {
            const q = p as { p_key: string; p_broker: string; p_host: string; p_port: number };
            tbl.dma_servers.push({ key: q.p_key, broker: q.p_broker, host: q.p_host, port: q.p_port, enabled: false, sort_order: 40 });
            return { data: null, error: null };
          },
        },
      },
      makeFakeRelay().client,
    );
    tbl = sb.tables;
    const res = await auth(request(sb.app).post("/api/admin/servers")).send({
      key: "KYOBO128",
      broker: "KYOBO",
      host: "  gw-1.example.internal ",
      port: 9100,
      sortOrder: 5,
    });
    expect(res.status).toBe(200);
    expect((sb.rec.rpcCalls[0].params as { p_host: string }).p_host).toBe("gw-1.example.internal");
    expect(tbl.dma_servers.find((r) => r.key === "KYOBO128")).toMatchObject({ enabled: false, sort_order: 5 });
  });

  it("relay 재적재 실패 → 200 · relayNotified: false (best-effort)", async () => {
    const { app } = makeApp({}, makeFakeRelay(() => ({ status: 0, data: null })).client);
    const res = await auth(request(app).post("/api/admin/servers")).send({ key: "KB122", broker: "KB", host: "192.0.2.9", port: 9100 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, relayNotified: false });
  });

  it("이미 있는 키 → 409 SERVER_EXISTS · RPC 0(「+ 서버」 가 기존 서버 주소를 덮지 않는다)", async () => {
    const { app, rec } = makeApp({}, makeFakeRelay().client);
    const res = await auth(request(app).post("/api/admin/servers")).send({ key: "KB120", broker: "KB", host: "192.0.2.9", port: 9100 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SERVER_EXISTS");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it.each([
    ["키 접두와 broker 불일치", { key: "KB122", broker: "KYOBO", host: "192.0.2.9", port: 9100 }],
    ["port 0", { key: "KB122", broker: "KB", host: "192.0.2.9", port: 0 }],
    ["port 65536", { key: "KB122", broker: "KB", host: "192.0.2.9", port: 65536 }],
    ["port 소수", { key: "KB122", broker: "KB", host: "192.0.2.9", port: 91.5 }],
    ["port 없음", { key: "KB122", broker: "KB", host: "192.0.2.9" }],
    ["키 형식 위반", { key: "kb122", broker: "KB", host: "192.0.2.9", port: 9100 }],
    ["host 안 공백", { key: "KB122", broker: "KB", host: "192.0 .2.9", port: 9100 }],
    ["host 스킴", { key: "KB122", broker: "KB", host: "http://192.0.2.9", port: 9100 }],
    ["host 포트 붙음", { key: "KB122", broker: "KB", host: "192.0.2.9:9100", port: 9100 }],
    ["host 옥텟 범위 밖", { key: "KB122", broker: "KB", host: "999.0.2.9", port: 9100 }],
    ["host 옥텟 3개", { key: "KB122", broker: "KB", host: "192.0.2", port: 9100 }],
    ["host 빈 값", { key: "KB122", broker: "KB", host: "  ", port: 9100 }],
    ["host 라벨 하이픈 끝", { key: "KB122", broker: "KB", host: "gw-.example", port: 9100 }],
  ])("%s → 400 VALIDATION_FAILED · RPC 0 · relay 0", async (_n, body) => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/servers")).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(rec.rpcCalls).toHaveLength(0);
    expect(relay.calls).toHaveLength(0);
  });
});

describe("PATCH /api/admin/servers/:key — 주소 · 사용 토글 · 정렬", () => {
  it("{ enabled: false } 가 주문 서버면 RPC 'server in use' → 409 SERVER_IN_USE · 재적재 0", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({ rpc: { dma_admin_set_server_enabled: pgErr("P0001", "server in use") } }, relay.client);
    const res = await auth(request(app).patch("/api/admin/servers/KB120")).send({ enabled: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SERVER_IN_USE");
    // 29-38 — 증권사 단위는 「기본 주문 서버」(계좌 줄 「주문 서버」와 이름으로 갈린다)
    expect(res.body.error.message).toBe("기본 주문 서버 · 시세 주 서버는 끌 수 없어요. 먼저 다른 서버로 옮기세요.");
    expect(rec.rpcCalls).toEqual([{ fn: "dma_admin_set_server_enabled", params: { p_key: "KB120", p_enabled: false } }]);
    expect(relay.calls).toHaveLength(0);
  });

  it("{ enabled: true } → dma_admin_set_server_enabled → 재적재 → { ok, relayNotified }", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).patch("/api/admin/servers/KB121")).send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, relayNotified: true });
    expect(rec.rpcCalls.map((c) => c.fn)).toEqual(["dma_admin_set_server_enabled"]);
    expect(relay.calls.map((c) => c.path)).toEqual(["/internal/admin/registry/reload"]);
  });

  it("{ host } → 지금 행을 읽어 증권사 · 포트를 채운 upsert(host 만 바뀜)", async () => {
    const { app, rec } = makeApp({}, makeFakeRelay().client);
    const res = await auth(request(app).patch("/api/admin/servers/KB121")).send({ host: "192.0.2.77" });
    expect(res.status).toBe(200);
    expect(rec.rpcCalls).toEqual([
      { fn: "dma_admin_upsert_server", params: { p_key: "KB121", p_broker: "KB", p_host: "192.0.2.77", p_port: 9100 } },
    ]);
  });

  it("{ port } → host 는 지금 값 그대로", async () => {
    const { app, rec } = makeApp({}, makeFakeRelay().client);
    const res = await auth(request(app).patch("/api/admin/servers/KYOBO119")).send({ port: 9200 });
    expect(res.status).toBe(200);
    expect(rec.rpcCalls[0].params).toEqual({ p_key: "KYOBO119", p_broker: "KYOBO", p_host: "192.0.2.19", p_port: 9200 });
  });

  it("{ sortOrder } → dma_servers 표 직접 update · 없는 키는 404", async () => {
    const { app, tables } = makeApp({}, makeFakeRelay().client);
    const res = await auth(request(app).patch("/api/admin/servers/KB121")).send({ sortOrder: 5 });
    expect(res.status).toBe(200);
    expect(tables.dma_servers.find((r) => r.key === "KB121")?.sort_order).toBe(5);
    const miss = await auth(request(app).patch("/api/admin/servers/KB199")).send({ sortOrder: 5 });
    expect(miss.status).toBe(404);
  });

  it("없는 서버: host 변경 → 404 (RPC 0) · enabled 변경은 RPC P0002 → 404", async () => {
    const a = makeApp({}, makeFakeRelay().client);
    const r1 = await auth(request(a.app).patch("/api/admin/servers/KB199")).send({ host: "192.0.2.5" });
    expect(r1.status).toBe(404);
    expect(a.rec.rpcCalls).toHaveLength(0);
    const b = makeApp({ rpc: { dma_admin_set_server_enabled: pgErr("P0002", "server not found") } }, makeFakeRelay().client);
    const r2 = await auth(request(b.app).patch("/api/admin/servers/KB199")).send({ enabled: true });
    expect(r2.status).toBe(404);
    expect(r2.body.error.code).toBe("NOT_FOUND");
  });

  it("빈 바디 · broker 변경 · 키 형식 위반 · port 0 → 400 · RPC 0", async () => {
    const { app, rec } = makeApp({}, makeFakeRelay().client);
    for (const [path, body] of [
      ["/api/admin/servers/KB120", {}],
      ["/api/admin/servers/KB120", { broker: "KYOBO" }],
      ["/api/admin/servers/XX1", { enabled: true }],
      ["/api/admin/servers/KB120", { port: 0 }],
      ["/api/admin/servers/KB120", { host: "a b" }],
    ] as const) {
      const res = await auth(request(app).patch(path)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("broker 가 키 접두와 같으면 무변경 허용(200)", async () => {
    const { app } = makeApp({}, makeFakeRelay().client);
    const res = await auth(request(app).patch("/api/admin/servers/KB120")).send({ broker: "KB" });
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/admin/servers/:key/order-server — 기본 주문 서버 교체 (G-1 즉시 재수립)", () => {
  it("RPC dma_admin_set_order_server 1회 → 재적재 → { ok, relayNotified }", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/servers/KB121/order-server"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, relayNotified: true });
    expect(rec.rpcCalls).toEqual([{ fn: "dma_admin_set_order_server", params: { p_key: "KB121" } }]);
    expect(relay.calls.map((c) => c.path)).toEqual(["/internal/admin/registry/reload"]);
  });

  it("꺼진 서버 → RPC 'server disabled' → 409 SERVER_DISABLED · 재적재 0", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({ rpc: { dma_admin_set_order_server: pgErr("P0001", "server disabled") } }, relay.client);
    const res = await auth(request(app).put("/api/admin/servers/KB121/order-server"));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SERVER_DISABLED");
    expect(relay.calls).toHaveLength(0);
  });

  it("모르는 DB 오류 → 500 DB_ERROR(원문 미노출)", async () => {
    const { app } = makeApp({ rpc: { dma_admin_set_order_server: pgErr("XX000", "SECRET-DETAIL") } }, makeFakeRelay().client);
    const res = await auth(request(app).put("/api/admin/servers/KB121/order-server"));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("SECRET-DETAIL");
  });
});

describe("PUT /api/admin/servers/:key/quote-primary — 시세 주 서버 전환 (D-11 · relay 실행)", () => {
  it("relay POST /internal/admin/servers/:key/quote-primary 1회 → 200 → { ok: true } · Express 는 DB RPC 를 부르지 않는다", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/servers/KYOBO119/quote-primary"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(relay.calls).toEqual([
      { method: "POST", path: "/internal/admin/servers/KYOBO119/quote-primary", adminEmail: ADMIN_EMAIL },
    ]);
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("relay 409(새 서버 로그인 실패 · 되돌림) → 409 그 오류 그대로 · relay 404 NO_SUCH_SERVER → 404 그대로", async () => {
    const a = makeApp({}, makeFakeRelay(() => relayReject(409, "QUOTE_SWITCH_FAILED", "새 서버 로그인에 실패해 되돌렸어요.")).client);
    const r1 = await auth(request(a.app).put("/api/admin/servers/KYOBO119/quote-primary"));
    expect(r1.status).toBe(409);
    expect(r1.body).toEqual({ error: { code: "QUOTE_SWITCH_FAILED", message: "새 서버 로그인에 실패해 되돌렸어요." } });
    const b = makeApp({}, makeFakeRelay(() => relayReject(404, "NO_SUCH_SERVER")).client);
    const r2 = await auth(request(b.app).put("/api/admin/servers/KB199/quote-primary"));
    expect(r2.status).toBe(404);
    expect(r2.body.error.code).toBe("NO_SUCH_SERVER");
  });

  it("relay 못 닿음 → 502 RELAY_FAILED · 클라이언트 없음 → 503 RELAY_UNAVAILABLE · 키 형식 위반 → 400", async () => {
    const a = makeApp({}, makeFakeRelay(() => ({ status: 0, data: null })).client);
    const r1 = await auth(request(a.app).put("/api/admin/servers/KYOBO119/quote-primary"));
    expect(r1.status).toBe(502);
    expect(r1.body.error.code).toBe("RELAY_FAILED");
    const b = makeApp();
    const r2 = await auth(request(b.app).put("/api/admin/servers/KYOBO119/quote-primary"));
    expect(r2.status).toBe(503);
    expect(r2.body.error.code).toBe("RELAY_UNAVAILABLE");
    const relay = makeFakeRelay();
    const c = makeApp({}, relay.client);
    const r3 = await auth(request(c.app).put("/api/admin/servers/nope/quote-primary"));
    expect(r3.status).toBe(400);
    expect(relay.calls).toHaveLength(0);
  });
});
