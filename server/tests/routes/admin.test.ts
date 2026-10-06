import { afterAll, afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import pino from "pino";
import request from "supertest";
import { deriveAdminUsersOverview, type AdminUsersRaw } from "@gh-radar/shared";

import { createApp } from "../../src/app";
import { requireRelayAdmin } from "../../src/routes/admin";
import { createRelayAdminClient, type RelayAdminClient } from "../../src/services/relay-admin-client";
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

/** deps 주입 가짜 relay — reloadAccess 호출(요청자 이메일)만 기록하고 정해 둔 status 를 돌려준다. */
function fakeRelay(status = 200) {
  const calls: { op: string; adminEmail: string }[] = [];
  const client: RelayAdminClient = {
    request: async () => ({ status, data: null }),
    reloadAccess: async (adminEmail) => {
      calls.push({ op: "access", adminEmail });
      return { status, data: status === 200 ? { ok: true, changed: true } : null };
    },
    reloadRegistry: async (adminEmail) => {
      calls.push({ op: "registry", adminEmail });
      return { status, data: status === 200 ? { ok: true, changed: false } : null };
    },
  };
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

describe("DELETE /api/admin/users/:email — DMA 연결 없는 사용자만", () => {
  it("본인 → 409 SELF_LOCKOUT (삭제 0)", async () => {
    const { app, rec } = makeApp({}, fakeRelay().client);
    const res = await auth(request(app).delete(`/api/admin/users/${encodeURIComponent(ADMIN_EMAIL)}`));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SELF_LOCKOUT");
    expect(rec.ops.filter((o) => o.kind === "delete")).toHaveLength(0);
  });

  it("dma_user_id 가 있는 사용자 → 409 HAS_DMA · 행 유지 · 통보 0", async () => {
    const relay = fakeRelay();
    const { app, rows } = makeApp({}, relay.client);
    const res = await auth(request(app).delete("/api/admin/users/trader%40gmail.com"));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("HAS_DMA");
    expect(rows.has("trader@gmail.com")).toBe(true);
    expect(relay.calls).toHaveLength(0);
  });

  it("DMA 없는 사용자 → 삭제는 「dma_user_id is null」 조건 한 문장 → 200 · 통보 1건", async () => {
    const relay = fakeRelay();
    const { app, rec, rows } = makeApp({}, relay.client);
    const res = await auth(request(app).delete("/api/admin/users/viewer%40gmail.com"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, relayNotified: true });
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
