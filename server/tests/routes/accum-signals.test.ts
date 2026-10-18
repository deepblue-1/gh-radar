import { describe, it, expect } from "vitest";
import request from "supertest";
import { kstDateIso } from "@gh-radar/shared";
import { createApp } from "../../src/app";

/**
 * `GET /api/accum-signals` — 그날 kind 16 매집감지 isin 별 최신 1행 (quick-261018-rfy D-03 · 작업대 「매집」 패널 복원).
 *
 * server 는 jsonb RPC `dma_accum_signals_for_user_json` 를 **왕복 1회** 부르고 공유 매퍼 `toStrategyEventRow` 로
 * camelCase 행을 만든다. isin 별 1행 고르기(다른 분 = 최신 분 · 같은 분 = quote-primary 게이트웨이 우선 · 폴백)와
 * 가시성(시세 kind 게이트웨이 공개)은 RPC 가 정본이라 mock 은 **무엇을 넘겼는지**만 기록한다(strategy-events.test.ts 동형).
 */

let userSeq = 0;
const nextUser = () => ({ id: `00000000-0000-4000-8000-${String(2600 + ++userSeq).padStart(12, "0")}` });

type Rec = { rpcCalls: { fn: string; params: Record<string, unknown> }[] };

function makeSupabase(opts: {
  user?: { id: string } | null;
  rows?: Record<string, unknown>[];
  /** RPC data 를 그대로 덮는다(배열 아님 계약 위반 케이스). */
  rawData?: unknown;
  rpcError?: { message: string };
}): { client: any; rec: Rec } {
  const rec: Rec = { rpcCalls: [] };
  const client = {
    auth: {
      getUser: async (_token: string) =>
        opts.user
          ? { data: { user: opts.user }, error: null }
          : { data: { user: null }, error: { message: "invalid token" } },
    },
    async rpc(fn: string, params: Record<string, unknown>) {
      rec.rpcCalls.push({ fn, params });
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      if (fn === "dma_accum_signals_for_user_json") {
        return { data: "rawData" in opts ? opts.rawData : (opts.rows ?? []), error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
  };
  return { client, rec };
}

/** RPC 반환 kind 16 행 1건 — 공개 45키 snake_case · 계좌 없음. bigint 칸은 직렬화 방어를 잠그려고 문자열. */
const accumRow = (over: Record<string, unknown> = {}) => ({
  gateway: "KB120", journal_epoch: "ep-34", seq: "7", trade_date: "2026-10-18",
  gw_time_ms: String(Date.parse("2026-10-18T10:16:00.000+09:00")),
  kind: 16, group: 0, exchange: "KRX", isin: "KR7000020008", stock_code: "000020", cum_volume: "1234567",
  account_no: "", order_no: "", price: 10450, qty: 1, order_condition: "",
  reason_code: "", cond_threshold: "1234000000", cond_actual: "512", cond_metric: 0, ev_kind: 2,
  ev_price: 10120, ev_qty_before: "150000", ev_qty_after: "30000", ev_trade_qty: "120000",
  limit_bid_qty: "1518000000", bid1_price: 9980, bid1_qty: "284000000", accept_latency_us: 0,
  immediate_fill_qty: "1500", queue_case: 1, base_cum: "321000000000", ahead_qty: "45", expected_cum: "2",
  error_volume: "0", remaining_volume: "0", has_remaining: false, cancel_reason: 0, result_code: 3,
  message: "since=20261016|reg=101523|st=1|end=0|cyc=2|carry=0|row=1|our=0|th=100000000/30/500000000000",
  entry_round: 0, snap_qty: ["9900", "10300"], snap_cum: ["100000000", "30"], ask_qty_at_limit: "1600000000",
  open_at_limit: false,
  ...over,
});

describe("GET /api/accum-signals (quick-261018-rfy D-03)", () => {
  it("① 미인증 → 401 · RPC 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client })).get("/api/accum-signals");
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("② 형식 위반 date · 실재하지 않는 날짜 → 400 VALIDATION_FAILED · RPC 0회", async () => {
    for (const bad of ["2026-9-29", "2026-02-30", "2026-13-45", "abc"]) {
      const { client, rec } = makeSupabase({ user: nextUser() });
      const r = await request(createApp({ supabase: client }))
        .get(`/api/accum-signals?date=${bad}`)
        .set("Authorization", "Bearer tok");
      expect(r.status, bad).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls).toHaveLength(0);
    }
  });

  it("③ date 생략 → RPC 1회 {p_user_id: 인증 사용자, p_trade_date: KST 오늘} · 쿼리 user_id 무시", async () => {
    const user = nextUser();
    const other = nextUser();
    const { client, rec } = makeSupabase({ user, rows: [] });
    const r = await request(createApp({ supabase: client }))
      .get(`/api/accum-signals?user_id=${other.id}&p_user_id=${other.id}`)
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
    expect(rec.rpcCalls).toEqual([
      { fn: "dma_accum_signals_for_user_json", params: { p_user_id: user.id, p_trade_date: kstDateIso() } },
    ]);
  });

  it("④ date=2026-10-16 → p_trade_date 그대로", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, rows: [] });
    const r = await request(createApp({ supabase: client }))
      .get("/api/accum-signals?date=2026-10-16")
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toEqual([
      { fn: "dma_accum_signals_for_user_json", params: { p_user_id: user.id, p_trade_date: "2026-10-16" } },
    ]);
  });

  it("⑤ 200 bare array — toStrategyEventRow 결과 · RPC 순서 유지 · dma_user_id 비노출", async () => {
    const { client } = makeSupabase({
      user: nextUser(),
      rows: [
        accumRow({ isin: "KR7000020008", seq: "7", dma_user_id: "dma-leak" }),
        accumRow({ isin: "KR7000040006", seq: "3", gateway: "KYOBO119", qty: 3, cancel_reason: 2 }),
      ],
    });
    const r = await request(createApp({ supabase: client }))
      .get("/api/accum-signals")
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.map((x: any) => x.isin)).toEqual(["KR7000020008", "KR7000040006"]);
    expect(r.body[0]).toMatchObject({
      gateway: "KB120",
      journalEpoch: "ep-34",
      seq: 7,
      kind: 16,
      accountNo: "",
      price: 10450,
      qty: 1,
      condThreshold: 1_234_000_000,
      condActual: 512,
      expectedCum: 2,
      snapQty: [9900, 10300],
      snapCum: [100_000_000, 30],
      stockCode: "000020",
    });
    expect(r.body[1]).toMatchObject({ gateway: "KYOBO119", seq: 3, qty: 3, cancelReason: 2 });
    for (const row of r.body) {
      expect(row).not.toHaveProperty("dmaUserId");
      expect(row).not.toHaveProperty("dma_user_id");
    }
    expect(r.text).not.toContain("dma-leak");
  });

  it("⑥ RPC 오류 → 500 DB_ERROR · 원문 비노출", async () => {
    const { client } = makeSupabase({
      user: nextUser(),
      rpcError: { message: "permission denied for function dma_accum_signals_for_user_json" },
    });
    const r = await request(createApp({ supabase: client }))
      .get("/api/accum-signals")
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
    expect(r.text).not.toContain("permission denied");
  });

  it("⑦ RPC data 가 배열이 아니면(객체 · null) 500 DB_ERROR — 빈 목록으로 감추지 않는다", async () => {
    for (const rawData of [{ gateway: "KB120" }, null]) {
      const { client } = makeSupabase({ user: nextUser(), rawData });
      const r = await request(createApp({ supabase: client }))
        .get("/api/accum-signals")
        .set("Authorization", "Bearer tok");
      expect(r.status, JSON.stringify(rawData)).toBe(500);
      expect(r.body.error.code).toBe("DB_ERROR");
    }
  });
});
