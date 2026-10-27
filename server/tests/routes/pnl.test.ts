import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { PnlReport } from "@gh-radar/shared";
import { createApp } from "../../src/app";

/**
 * `GET /api/pnl` — /me 손익 탭 일자별 매매손익 (Phase 36 D-17 ② · D-19).
 *
 * 가시성 필터는 RPC 안의 `dma_visible_accounts` 조인이 정본이라(pgTAP `dma_pnl_daily.test.sql`) mock 은 필터를
 * 흉내 내지 않고 **무엇을 넘겼는지**만 기록한다: 함수 이름 · 파라미터(p_user_id = 인증 사용자 · 기간 = shared
 * `pnlRangeOf(range, KST 오늘)`). 시각은 2026-10-27 12:00 KST 로 고정한다.
 */

const USER = { id: "00000000-0000-4000-8000-000000003601" };
const ACCOUNT = "37728502101";

type Opts = { user?: { id: string } | null; data?: unknown; rpcError?: { message: string; code?: string } };

function makeSupabase(opts: Opts) {
  const rpcCalls: { fn: string; params: Record<string, unknown> }[] = [];
  const client = {
    auth: {
      getUser: async (_t: string) =>
        opts.user
          ? { data: { user: opts.user }, error: null }
          : { data: { user: null }, error: { message: "invalid token" } },
    },
    async rpc(fn: string, params: Record<string, unknown>) {
      rpcCalls.push({ fn, params });
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return { data: opts.data, error: null };
    },
    from(table: string) {
      throw new Error(`unexpected from(${table})`);
    },
  };
  return { client: client as any, rpcCalls };
}

const report = (): PnlReport => ({
  from: "2026-09-28",
  to: "2026-10-27",
  groups: [
    {
      key: ACCOUNT,
      accounts: [{ broker: "KB", gateway: "KB120", account_no: ACCOUNT }],
      dma_user_ids: [],
      account_name: null,
      total: { pnl: 98990, fee: 395, tax: 2200, buy: 1500000, sell: 1100000, fills: 4 },
      days: [
        {
          date: "2026-10-27",
          pnl: 98990,
          fee: 325,
          tax: 2200,
          buy: 1050000,
          sell: 1100000,
          fills: 3,
          stocks: [
            { isin: "KR7005930003", code: "005930", name: "삼성전자", pnl: 99000, buy: 1000000, sell: 1100000, fills: 2 },
          ],
        },
      ],
    },
  ],
});

const get = (client: unknown, qs: string, auth = true) => {
  const r = request(createApp({ supabase: client as any })).get(`/api/pnl${qs}`);
  return auth ? r.set("Authorization", "Bearer tok") : r;
};

describe("GET /api/pnl — /me 일자별 매매손익 (D-17 ②)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T03:00:00Z")); // 12:00 KST
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("무토큰 → 401 · RPC 0회", async () => {
    const { client, rpcCalls } = makeSupabase({ user: USER, data: report() });
    const r = await get(client, `?account=${ACCOUNT}`, false);
    expect(r.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });

  it("기본 range 30 → 200 · RPC 1회 { p_user_id: 인증 사용자, p_from: 30일 전(오늘 포함), p_to: KST 오늘 } · 응답 그대로", async () => {
    const { client, rpcCalls } = makeSupabase({ user: USER, data: report() });
    const r = await get(client, `?account=${ACCOUNT}&user_id=someone-else`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual(report());
    expect(rpcCalls).toEqual([
      {
        fn: "dma_pnl_daily_for_user",
        params: { p_user_id: USER.id, p_account_no: ACCOUNT, p_from: "2026-09-28", p_to: "2026-10-27" },
      },
    ]);
  });

  it("KST 자정 직후(UTC 전날 15:xx) — p_to 는 KST 날짜", async () => {
    vi.setSystemTime(new Date("2026-10-26T15:30:00Z")); // 10/27 00:30 KST
    const { client, rpcCalls } = makeSupabase({ user: USER, data: report() });
    const r = await get(client, `?account=${ACCOUNT}&range=7`);
    expect(r.status).toBe(200);
    expect(rpcCalls[0]?.params).toMatchObject({ p_from: "2026-10-21", p_to: "2026-10-27" });
  });

  it("range=month → p_from 그달 1일 · range=90 → 89일 전", async () => {
    const m = makeSupabase({ user: USER, data: report() });
    expect((await get(m.client, `?account=${ACCOUNT}&range=month`)).status).toBe(200);
    expect(m.rpcCalls[0]?.params).toMatchObject({ p_from: "2026-10-01", p_to: "2026-10-27" });

    const q = makeSupabase({ user: USER, data: report() });
    expect((await get(q.client, `?account=${ACCOUNT}&range=90`)).status).toBe(200);
    expect(q.rpcCalls[0]?.params).toMatchObject({ p_from: "2026-07-30", p_to: "2026-10-27" });
  });

  it("빈 groups(남의 계좌 · 체결 0) → 200 그대로", async () => {
    const empty = { from: "2026-09-28", to: "2026-10-27", groups: [] };
    const { client } = makeSupabase({ user: USER, data: empty });
    const r = await get(client, `?account=${ACCOUNT}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual(empty);
  });

  it.each([
    ["account 누락", ""],
    ["account 빈 값", "?account="],
    ["account 13자", "?account=1234567890123"],
    ["range=1", `?account=${ACCOUNT}&range=1`],
    ["range=365", `?account=${ACCOUNT}&range=365`],
  ])("%s → 400 · RPC 0회", async (_label, qs) => {
    const { client, rpcCalls } = makeSupabase({ user: USER, data: report() });
    const r = await get(client, qs);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_FAILED");
    expect(rpcCalls).toHaveLength(0);
  });

  it("RPC 오류 → 500 DB_ERROR · 원문 비노출", async () => {
    const { client } = makeSupabase({ user: USER, rpcError: { message: "relation secret_table does not exist", code: "42P01" } });
    const r = await get(client, `?account=${ACCOUNT}`);
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(r.body)).not.toContain("secret_table");
  });

  it.each([
    ["groups 가 객체", { from: "a", to: "b", groups: {} }],
    ["groups 없음", { from: "a", to: "b" }],
    ["data null", null],
    ["data 배열", []],
  ])("모양 위반(%s) → 500 DB_ERROR", async (_label, data) => {
    const { client } = makeSupabase({ user: USER, data });
    const r = await get(client, `?account=${ACCOUNT}`);
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
  });
});
