import { afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import type {
  LaunchPlanChangeRow,
  LaunchPlanServer,
  LaunchHeadRow,
  LaunchMapPiece,
  LaunchMapResponse,
  LaunchOrdersResponse,
  LaunchPieceRow,
} from "@gh-radar/shared";

import { createApp } from "../../src/app";
import { logger } from "../../src/logger";
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
import { makeFakeRelay } from "../fixtures/fake-relay-admin";

/**
 * Phase 35 (35-05) — `/api/admin/launch/*`. 35-02 RPC 응답 모양을 그대로(snake_case · 계좌 열 포함) 통과시키는지,
 * 관문(requireAuth → requireAdmin)이 /launch 경로에만 걸려 요청당 역할 조회가 1회인지, 입력 오류가 RPC 0회로 끝나는지를
 * 증명한다. 계좌 · 사용자 값은 가짜다.
 */

type RpcHandler = NonNullable<AdminSupabaseOpts["rpc"]>[string];

const head: LaunchHeadRow = {
  trade_date: "20261026",
  gateway: "KB120",
  profile: "Q16",
  fire_exchange: "KRX",
  fire_base: "16:00:00",
  market: "K",
  offset_used_us: -305,
  fire_at_us: null,
  n_pieces: 2,
  n_accepted: 1,
  n_reject: 1,
  n_other: 0,
  first_accept_idx: 1,
  retries: null,
  abandoned: null,
  gate_lo_us: -305,
  gate_hi_us: -303,
  nonmono: false,
  correction_before_us: null,
  correction_after_us: null,
  step_us: null,
  last_dir: null,
  bracketed: null,
  same_dir_run: null,
  reject_span_us: null,
  jump: null,
  one_way_us: null,
  rtt_min_us: null,
  next_offset_us: null,
  source: "backfill",
  journal_epoch: null,
  seq: null,
  gw_time_ms: null,
};

const piece = (wire: number, sent_rel_us: number, result: string, result_code: number | null): LaunchPieceRow => ({
  trade_date: "20261026",
  gateway: "KB120",
  profile: "Q16",
  fire_exchange: "KRX",
  fire_base: "16:00:00",
  market: "K",
  wire,
  side: "buy",
  queued_id: "q-1",
  piece_idx: wire,
  round: 0,
  probe: false,
  order_no: result === "접수" ? "0000123" : null,
  sent_rel_us,
  result,
  result_code,
  accept_time: result === "접수" ? 160000001 : null,
  retry: 0,
  abandoned: false,
  isin: "KR7005930003",
  price: 70000,
  qty: 1,
  filled_qty: 0,
  account: "99999999901",
  dma_user_id: "test01",
  source: "backfill",
  journal_epoch: null,
  seq: null,
  gw_time_ms: null,
  stock_code: "005930",
  stock_name: "삼성전자",
});

/** 35-02 `launch_orders_for_admin` 계약 모양 그대로. */
const orders: LaunchOrdersResponse = {
  dates: ["20261026", "20261012"],
  date: "20261026",
  heads: [head],
  pieces: [piece(0, -305, "101", 101), piece(1, -303, "접수", 0)],
};

/** 35-02 `launch_map_for_admin` 계약 모양 — 조각은 지도 열 11개만. */
const mapPiece = (p: LaunchPieceRow): LaunchMapPiece => ({
  trade_date: p.trade_date,
  gateway: p.gateway,
  market: p.market,
  profile: p.profile,
  fire_exchange: p.fire_exchange,
  side: p.side,
  wire: p.wire,
  piece_idx: p.piece_idx,
  sent_rel_us: p.sent_rel_us,
  result: p.result,
  retry: p.retry,
});
const map: LaunchMapResponse = {
  days: ["20261026", "20261012"],
  heads: [head],
  pieces: orders.pieces.map(mapPiece),
};

/** 역할 조회(app_users select) 왕복 수 — 관문이 한 번만 돌았는지. */
const roleLookups = (rec: ReturnType<typeof makeAdminSupabase>["rec"]) =>
  rec.ops.filter((o) => o.table === "app_users" && o.kind === "select").length;

function makeApp(rpc: Record<string, RpcHandler> = {}, relayAdmin?: RelayAdminClient) {
  const sb = makeAdminSupabase({
    users: baseUsers,
    appUsers: baseAppUsers(),
    rpc: {
      launch_orders_for_admin: () => ({ data: orders, error: null }),
      launch_map_for_admin: () => ({ data: map, error: null }),
      launch_plan_changes_for_admin: () => ({ data: { changes: [] }, error: null }),
      ...rpc,
    },
  });
  const app = createApp({ supabase: sb.client, relayAdmin });
  return { app, ...sb };
}

const auth = (r: request.Test, tok = ADMIN_TOKEN) => r.set("Authorization", `Bearer ${tok}`);

describe("GET /api/admin/launch/orders — 주문 내역 (LAUNCH-05 · D-20)", () => {
  it("① 무토큰 → 401 · RPC 0회", async () => {
    const { app, rec } = makeApp();
    const res = await request(app).get("/api/admin/launch/orders");
    expect(res.status).toBe(401);
    expect(rec.rpcCalls).toEqual([]);
  });

  it("② trader → 403 · RPC 0회", async () => {
    const { app, rec } = makeApp();
    const res = await auth(request(app).get("/api/admin/launch/orders"), TRADER_TOKEN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(rec.rpcCalls).toEqual([]);
  });

  it("③ admin → 200 · 응답 = RPC 값 그대로(snake_case · account · dma_user_id) · RPC 1회 p_date null · 역할 조회 1회", async () => {
    const { app, rec } = makeApp();
    const res = await auth(request(app).get("/api/admin/launch/orders"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(orders);
    expect(res.body.pieces[0].account).toBe("99999999901");
    expect(res.body.pieces[0].dma_user_id).toBe("test01");
    expect(res.body.heads[0].gate_lo_us).toBe(-305);
    expect(rec.rpcCalls).toEqual([{ fn: "launch_orders_for_admin", params: { p_date: null } }]);
    expect(roleLookups(rec)).toBe(1);
  });

  it("④ ?d=20261012 → p_date \"20261012\"", async () => {
    const { app, rec } = makeApp();
    const res = await auth(request(app).get("/api/admin/launch/orders?d=20261012"));
    expect(res.status).toBe(200);
    expect(rec.rpcCalls).toEqual([{ fn: "launch_orders_for_admin", params: { p_date: "20261012" } }]);
  });

  it.each(["2026-10-12", "20261332", "2026101"])("⑤ ?d=%s → 400 VALIDATION_FAILED · RPC 0회", async (d) => {
    const { app, rec } = makeApp();
    const res = await auth(request(app).get(`/api/admin/launch/orders?d=${d}`));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(rec.rpcCalls).toEqual([]);
  });

  it("⑥ RPC 오류 → 500 DB_ERROR(원문 비노출)", async () => {
    const { app } = makeApp({
      launch_orders_for_admin: () => ({ data: null, error: { code: "22023", message: "launch_orders_for_admin: bad p_date" } }),
    });
    const res = await auth(request(app).get("/api/admin/launch/orders"));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("bad p_date");
  });

  it.each([
    ["pieces 가 객체", { ...orders, pieces: {} }],
    ["heads 누락", { dates: orders.dates, date: orders.date, pieces: orders.pieces }],
    ["dates 가 null", { ...orders, dates: null }],
    ["data 가 배열", []],
    ["data 가 null", null],
  ])("⑦ 모양 위반(%s) → 500 DB_ERROR", async (_label, data) => {
    const { app } = makeApp({ launch_orders_for_admin: () => ({ data, error: null }) });
    const res = await auth(request(app).get("/api/admin/launch/orders"));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
  });

  it("⑧ 마운트 순서 회귀 — /api/admin/users 도 역할 조회 1회 그대로(발사 관문이 끼지 않는다)", async () => {
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

describe("GET /api/admin/launch/map — 경계 지도 (LAUNCH-05 · D-15 · D-20)", () => {
  it("무토큰 401 · trader 403 — RPC 0회", async () => {
    const { app, rec } = makeApp();
    expect((await request(app).get("/api/admin/launch/map")).status).toBe(401);
    const res = await auth(request(app).get("/api/admin/launch/map"), TRADER_TOKEN);
    expect(res.status).toBe(403);
    expect(rec.rpcCalls).toEqual([]);
  });

  it("기본 → p_fire q16 · p_days 10 · 응답 = RPC 값 그대로 · RPC 1회 · 역할 조회 1회", async () => {
    const { app, rec } = makeApp();
    const res = await auth(request(app).get("/api/admin/launch/map"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(map);
    expect(rec.rpcCalls).toEqual([{ fn: "launch_map_for_admin", params: { p_fire: "q16", p_days: 10 } }]);
    expect(roleLookups(rec)).toBe(1);
  });

  it.each([
    ["?range=20d", { p_fire: "q16", p_days: 20 }],
    ["?range=all", { p_fire: "q16", p_days: null }],
    ["?fire=n0930", { p_fire: "n0930", p_days: 10 }],
    ["?fire=n0930&range=all", { p_fire: "n0930", p_days: null }],
  ])("%s → params %j (LAUNCH_RANGE_DAYS)", async (q, params) => {
    const { app, rec } = makeApp();
    const res = await auth(request(app).get(`/api/admin/launch/map${q}`));
    expect(res.status).toBe(200);
    expect(rec.rpcCalls).toEqual([{ fn: "launch_map_for_admin", params }]);
  });

  it.each(["?fire=x", "?range=5d", "?fire=Q16", "?range=all&fire=krx"])(
    "%s → 400 VALIDATION_FAILED · RPC 0회",
    async (q) => {
      const { app, rec } = makeApp();
      const res = await auth(request(app).get(`/api/admin/launch/map${q}`));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls).toEqual([]);
    },
  );

  it("RPC 오류 → 500 DB_ERROR", async () => {
    const { app } = makeApp({
      launch_map_for_admin: () => ({ data: null, error: { code: "22023", message: "launch_map_for_admin: bad p_fire" } }),
    });
    const res = await auth(request(app).get("/api/admin/launch/map"));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
  });

  it.each([
    ["days 누락", { heads: map.heads, pieces: map.pieces }],
    ["heads 가 객체", { ...map, heads: {} }],
    ["pieces 가 문자열", { ...map, pieces: "[]" }],
    ["data 가 null", null],
  ])("모양 위반(%s) → 500 DB_ERROR", async (_label, data) => {
    const { app } = makeApp({ launch_map_for_admin: () => ({ data, error: null }) });
    const res = await auth(request(app).get("/api/admin/launch/map"));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 35 범위 7 (35-13) — 발사 계획 라우트
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_READ_PATH = "/internal/admin/launch-plan?servers=KB120,KYOBO119";

const kb120Plan: LaunchPlanServer = {
  status: "ok",
  plan_rev: 3,
  updated_at: "2026-10-27T22:41:00",
  entries: [
    { profile: "Q16", market: "K", offsets_us: [-340, -335, -320] },
    { profile: "Q16", market: "Q", offsets_us: [-350, -345, -325] },
    { profile: "N", market: "K", offsets_us: [-245] },
    { profile: "N", market: "Q", offsets_us: [-245] },
  ],
};
const kyoboFailed: LaunchPlanServer = { status: "failed", code: 1, message: "알 수 없는 명령입니다" };

const changeRow: LaunchPlanChangeRow = {
  id: 7,
  at: "2026-10-27T13:41:00+00:00",
  admin_email: ADMIN_EMAIL,
  gateway: "KB120",
  fire: "q16",
  market: "Q",
  before_us: [-350, -345, -325],
  after_us: [-340, -335, -322],
  outcome: "ok",
  code: null,
  message: null,
  plan_rev: 4,
};

/** relay 계획 조회 경고만 — 다른 경고(접근 로그 등)와 섞이지 않게 op 로 거른다. */
const planWarns = (warn: ReturnType<typeof vi.spyOn>) =>
  warn.mock.calls.filter((args) => (args[0] as { relay?: { op?: string } })?.relay?.op === "launch-plan-get");

describe("P35 발사 계획 GET — /api/admin/launch/plan (D-25 · D-29 · D-30)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("P35-S1 admin → relay 조회 ‖ 이력 RPC → { servers, changes } · relay 1회(GET · 경로 · 요청자) · RPC 1회 p_limit 20 · 역할 조회 1회", async () => {
    const relay = makeFakeRelay((c) =>
      c.method === "GET" && c.path.startsWith("/internal/admin/launch-plan")
        ? { status: 200, data: { servers: { KB120: kb120Plan, KYOBO119: kyoboFailed } } }
        : undefined,
    );
    const { app, rec } = makeApp(
      { launch_plan_changes_for_admin: () => ({ data: { changes: [changeRow] }, error: null }) },
      relay.client,
    );
    const res = await auth(request(app).get("/api/admin/launch/plan"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ servers: { KB120: kb120Plan, KYOBO119: kyoboFailed }, changes: [changeRow] });
    expect(Object.keys(res.body.servers)).toEqual(["KB120", "KYOBO119"]);
    expect(relay.calls).toEqual([{ method: "GET", path: PLAN_READ_PATH, adminEmail: ADMIN_EMAIL }]);
    expect(rec.rpcCalls).toEqual([{ fn: "launch_plan_changes_for_admin", params: { p_limit: 20 } }]);
    expect(roleLookups(rec)).toBe(1);
  });

  it("P35-S2 trader → 403 · relay 0회 · RPC 0회 / 무토큰 → 401", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    expect((await request(app).get("/api/admin/launch/plan")).status).toBe(401);
    const res = await auth(request(app).get("/api/admin/launch/plan"), TRADER_TOKEN);
    expect(res.status).toBe(403);
    expect(relay.calls).toHaveLength(0);
    expect(rec.rpcCalls).toEqual([]);
  });

  it.each([
    ["status 0(못 닿음)", { status: 0, data: null }, 0],
    ["502", { status: 502, data: { error: { code: "X", message: "y" } } }, 502],
    ["모양 위반 { servers: 'x' }", { status: 200, data: { servers: "x" } }, 200],
  ])("P35-S3 relay %s → 200 · 두 서버 offline(message) · changes = RPC 값 · warn 1줄(status 만)", async (_l, r, status) => {
    const warn = vi.spyOn(logger, "warn");
    const relay = makeFakeRelay((c) => (c.path.startsWith("/internal/admin/launch-plan") ? r : undefined));
    const { app } = makeApp(
      { launch_plan_changes_for_admin: () => ({ data: { changes: [changeRow] }, error: null }) },
      relay.client,
    );
    const res = await auth(request(app).get("/api/admin/launch/plan"));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.servers)).toEqual(["KB120", "KYOBO119"]);
    for (const k of ["KB120", "KYOBO119"]) {
      expect(res.body.servers[k].status).toBe("offline");
      expect(typeof res.body.servers[k].message).toBe("string");
    }
    expect(res.body.changes).toEqual([changeRow]);
    const w = planWarns(warn);
    expect(w).toHaveLength(1);
    expect(w[0]![0]).toEqual({ relay: { op: "launch-plan-get", status } });
  });

  it("P35-S3 relayAdmin 미설정 → 200 · 두 서버 offline 「relay 연결이 설정되지 않았어요」 · RPC 는 그대로", async () => {
    const { app, rec } = makeApp({ launch_plan_changes_for_admin: () => ({ data: { changes: [changeRow] }, error: null }) });
    const res = await auth(request(app).get("/api/admin/launch/plan"));
    expect(res.status).toBe(200);
    expect(res.body.servers).toEqual({
      KB120: { status: "offline", message: "relay 연결이 설정되지 않았어요" },
      KYOBO119: { status: "offline", message: "relay 연결이 설정되지 않았어요" },
    });
    expect(res.body.changes).toEqual([changeRow]);
    expect(rec.rpcCalls.map((c) => c.fn)).toEqual(["launch_plan_changes_for_admin"]);
  });

  it("P35-S3 relay 가 KYOBO119 를 빠뜨림 · 상태 어휘 밖 값 → 그 서버만 offline", async () => {
    const warn = vi.spyOn(logger, "warn");
    const relay = makeFakeRelay((c) =>
      c.path.startsWith("/internal/admin/launch-plan") ? { status: 200, data: { servers: { KB120: kb120Plan } } } : undefined,
    );
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/launch/plan"));
    expect(res.status).toBe(200);
    expect(res.body.servers.KB120).toEqual(kb120Plan);
    expect(res.body.servers.KYOBO119.status).toBe("offline");
    expect(planWarns(warn)).toHaveLength(1);

    const relay2 = makeFakeRelay((c) =>
      c.path.startsWith("/internal/admin/launch-plan")
        ? { status: 200, data: { servers: { KB120: { status: "ok", entries: "x" }, KYOBO119: { status: "weird" } } } }
        : undefined,
    );
    const res2 = await auth(request(makeApp({}, relay2.client).app).get("/api/admin/launch/plan"));
    expect(res2.status).toBe(200);
    expect(res2.body.servers.KB120.status).toBe("offline");
    expect(res2.body.servers.KYOBO119.status).toBe("offline");
  });

  it("P35-S4 이력 RPC 오류 → 500 DB_ERROR(원문 비노출) / { changes: null } → 500", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp(
      { launch_plan_changes_for_admin: () => ({ data: null, error: { code: "22023", message: "bad p_limit secret" } }) },
      relay.client,
    );
    const res = await auth(request(app).get("/api/admin/launch/plan"));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("bad p_limit");

    const res2 = await auth(
      request(makeApp({ launch_plan_changes_for_admin: () => ({ data: { changes: null }, error: null }) }, relay.client).app).get(
        "/api/admin/launch/plan",
      ),
    );
    expect(res2.status).toBe(500);
    expect(res2.body.error.code).toBe("DB_ERROR");
  });
});
