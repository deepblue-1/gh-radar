import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { PnlReport } from "@gh-radar/shared";

import { createApp } from "../../src/app";
import {
  ADMIN_TOKEN,
  TRADER_TOKEN,
  baseAppUsers,
  baseUsers,
  makeAdminSupabase,
  type AdminSupabaseOpts,
} from "../fixtures/admin-supabase";

/**
 * Phase 36 (36-07) — `GET /api/admin/pnl` 어드민 일자별 매매손익(D-17 ① · D-19).
 *
 * RPC(`dma_pnl_daily_for_admin`) 응답을 그대로(snake_case · 계정 · 계좌 포함) 통과시키는지, 관문(requireAuth → requireAdmin)이
 * /pnl 경로에만 걸려 요청당 역할 조회가 1회인지, 입력 오류가 RPC 0회로 끝나는지를 증명한다. 묶음 · 정렬 · 미상 · overflow 는
 * pgTAP(`dma_pnl_daily.test.sql`)이 정본이다. 시각은 2026-10-27 12:00 KST 고정.
 */

type RpcHandler = NonNullable<AdminSupabaseOpts["rpc"]>[string];

const report: PnlReport = {
  from: "2026-09-28",
  to: "2026-10-27",
  groups: [
    {
      key: "ezmesya",
      accounts: [{ broker: "KB", gateway: "KB120", account_no: "37728502101" }],
      dma_user_ids: ["ezmesya"],
      account_name: null,
      total: { pnl: 1230000, fee: 16000, tax: 22000, buy: 15000000, sell: 16400000, fills: 7 },
      days: [],
    },
    {
      key: "",
      accounts: [{ broker: "KYOBO", gateway: "KYOBO119", account_no: "88800011" }],
      dma_user_ids: [],
      account_name: null,
      total: { pnl: -500, fee: 500, tax: 0, buy: 100000, sell: 0, fills: 1 },
      days: [],
    },
  ],
};

const roleLookups = (rec: ReturnType<typeof makeAdminSupabase>["rec"]) =>
  rec.ops.filter((o) => o.table === "app_users" && o.kind === "select").length;

function makeApp(rpc: Record<string, RpcHandler> = {}) {
  const sb = makeAdminSupabase({
    users: baseUsers,
    appUsers: baseAppUsers(),
    rpc: {
      dma_pnl_daily_for_admin: () => ({ data: report, error: null }),
      ...rpc,
    },
  });
  const app = createApp({ supabase: sb.client });
  return { app, ...sb };
}

const auth = (r: request.Test, tok = ADMIN_TOKEN) => r.set("Authorization", `Bearer ${tok}`);

describe("GET /api/admin/pnl — 어드민 일자별 매매손익 (D-17 ①)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T03:00:00Z")); // 12:00 KST
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("① 무토큰 → 401 · RPC 0회", async () => {
    const { app, rec } = makeApp();
    const res = await request(app).get("/api/admin/pnl");
    expect(res.status).toBe(401);
    expect(rec.rpcCalls).toEqual([]);
  });

  it("② trader → 403 FORBIDDEN · RPC 0회", async () => {
    const { app, rec } = makeApp();
    const res = await auth(request(app).get("/api/admin/pnl"), TRADER_TOKEN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(rec.rpcCalls).toEqual([]);
  });

  it("③ admin 기본 → 200 · 응답 = RPC 값 그대로 · RPC 1회 { p_from: 30일 전, p_to: KST 오늘, p_group: user } · 역할 조회 1회", async () => {
    const { app, rec } = makeApp();
    const res = await auth(request(app).get("/api/admin/pnl"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(report);
    expect(rec.rpcCalls).toEqual([
      { fn: "dma_pnl_daily_for_admin", params: { p_from: "2026-09-28", p_to: "2026-10-27", p_group: "user" } },
    ]);
    expect(roleLookups(rec)).toBe(1);
  });

  it("④ group=account · range=90 → p_group account · p_from 89일 전 / range=month → 그달 1일", async () => {
    const a = makeApp();
    expect((await auth(request(a.app).get("/api/admin/pnl?group=account&range=90"))).status).toBe(200);
    expect(a.rec.rpcCalls).toEqual([
      { fn: "dma_pnl_daily_for_admin", params: { p_from: "2026-07-30", p_to: "2026-10-27", p_group: "account" } },
    ]);

    const m = makeApp();
    expect((await auth(request(m.app).get("/api/admin/pnl?range=month"))).status).toBe(200);
    expect(m.rec.rpcCalls[0]?.params).toEqual({ p_from: "2026-10-01", p_to: "2026-10-27", p_group: "user" });
  });

  it.each(["group=x", "group=", "range=1", "range=365", "group=account&range=week"])(
    "⑤ ?%s → 400 VALIDATION_FAILED · RPC 0회",
    async (qs) => {
      const { app, rec } = makeApp();
      const res = await auth(request(app).get(`/api/admin/pnl?${qs}`));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls).toEqual([]);
    },
  );

  it("⑥ RPC 오류 → 500 DB_ERROR(원문 비노출)", async () => {
    const { app } = makeApp({
      dma_pnl_daily_for_admin: () => ({ data: null, error: { code: "22023", message: "p_group must be user or account" } }),
    });
    const res = await auth(request(app).get("/api/admin/pnl"));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("p_group must");
  });

  it.each([
    ["groups 가 객체", { from: "a", to: "b", groups: {} }],
    ["groups 누락", { from: "a", to: "b" }],
    ["data 가 배열", []],
    ["data 가 null", null],
  ])("⑦ 모양 위반(%s) → 500 DB_ERROR", async (_label, data) => {
    const { app } = makeApp({ dma_pnl_daily_for_admin: () => ({ data, error: null }) });
    const res = await auth(request(app).get("/api/admin/pnl"));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
  });

  it("⑧ 마운트 순서 회귀 — /api/admin/users 도 역할 조회 1회 그대로(매매손익 관문이 끼지 않는다)", async () => {
    const { app, rec } = makeApp({
      admin_users_raw: () => ({
        data: { appUsers: [], pending: [], intent: [], snapshots: [], snapshotAccounts: [], results: [], servers: [] },
        error: null,
      }),
    });
    const res = await auth(request(app).get("/api/admin/users"));
    expect(res.status).toBe(200);
    expect(rec.rpcCalls.map((c) => c.fn)).toEqual(["admin_users_raw"]);
    expect(roleLookups(rec)).toBe(1);
  });
});
