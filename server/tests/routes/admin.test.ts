import { describe, it, expect } from "vitest";
import request from "supertest";
import { deriveAdminUsersOverview, type AdminUsersRaw } from "@gh-radar/shared";

import { createApp } from "../../src/app";
import {
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

function makeApp(opts: AdminSupabaseOpts = {}) {
  const sb = makeAdminSupabase({ users: baseUsers, appUsers: baseAppUsers(), raw, ...opts });
  const app = createApp({ supabase: sb.client });
  return { app, ...sb };
}

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
