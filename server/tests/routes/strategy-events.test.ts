import { describe, it, expect } from "vitest";
import request from "supertest";
import { kstDateIso } from "@gh-radar/shared";
import { createApp } from "../../src/app";

/**
 * `GET /api/strategy-events` — 하루치 주문로그 평면 목록 (Phase 25 D-07 · 작업대 「주문로그」 탭 복원 · 창 분리 과거일 이동).
 *
 * server 는 `dma_strategy_events_for_user` RPC 를 **왕복 1회** 부르고 공유 매퍼 `toStrategyEventRow` 로 camelCase 행을
 * 만든다. 가시성(주문 이벤트 계좌 조인 · 시세 kind 1·2 게이트웨이 공개)은 RPC 안의 조인이 정본이라 mock 은 필터를
 * 흉내 내지 않고 **무엇을 넘겼는지**만 기록한다(`orders.test.ts` 와 같은 모양의 최소 mock).
 */

let userSeq = 0;
const nextUser = () => ({ id: `00000000-0000-4000-8000-${String(2500 + ++userSeq).padStart(12, "0")}` });

type Rec = { rpcCalls: { fn: string; params: Record<string, unknown> }[] };

function makeSupabase(opts: {
  user?: { id: string } | null;
  rows?: Record<string, unknown>[];
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
      if (fn === "dma_strategy_events_for_user") return { data: opts.rows ?? [], error: null };
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
  };
  return { client, rec };
}

/** RPC 반환 행 1건 — 공개 45키 snake_case. bigint 칸은 직렬화 방어를 잠그려고 문자열. */
const eventRow = (over: Record<string, unknown> = {}) => ({
  gateway: "KB", journal_epoch: "ep-25", seq: "2", trade_date: "2026-09-29",
  gw_time_ms: String(Date.parse("2026-09-29T09:45:02.861+09:00")),
  kind: 3, group: 1, exchange: "KRX", isin: "KR7005930003", stock_code: "005930", cum_volume: "861800",
  account_no: "1234567801", order_no: "12451", price: 12350, qty: 300, order_condition: "",
  reason_code: "", cond_threshold: "50000", cond_actual: "38200", cond_metric: 1, ev_kind: 1,
  ev_price: 12350, ev_qty_before: "52100", ev_qty_after: "38200", ev_trade_qty: "0",
  limit_bid_qty: "0", bid1_price: 0, bid1_qty: "0", accept_latency_us: 18000,
  immediate_fill_qty: "0", queue_case: 0, base_cum: "0", ahead_qty: "0", expected_cum: "0",
  error_volume: "0", remaining_volume: "0", has_remaining: false, cancel_reason: 0, result_code: 0,
  message: "", entry_round: 0, snap_qty: [], snap_cum: [], ask_qty_at_limit: "0", open_at_limit: false,
  ...over,
});

describe("GET /api/strategy-events (Phase 25 D-07)", () => {
  it("① 미인증 → 401 · RPC 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client })).get("/api/strategy-events");
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("② 형식 위반 date(2026-9-29) · 날짜 아닌 값(2026-02-30) → 400 VALIDATION_FAILED · RPC 0회 (T-25-17)", async () => {
    for (const bad of ["2026-9-29", "2026-02-30", "2026-13-45", "abc"]) {
      const { client, rec } = makeSupabase({ user: nextUser() });
      const r = await request(createApp({ supabase: client }))
        .get(`/api/strategy-events?date=${bad}`)
        .set("Authorization", "Bearer tok");
      expect(r.status, bad).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls).toHaveLength(0);
    }
  });

  it("③ date 생략 → RPC 1회 {p_user_id: 인증 사용자, p_trade_date: KST 오늘} · 쿼리 user_id 무시 (T-19-17)", async () => {
    const user = nextUser();
    const other = nextUser();
    const { client, rec } = makeSupabase({ user, rows: [] });
    const r = await request(createApp({ supabase: client }))
      .get(`/api/strategy-events?user_id=${other.id}&p_user_id=${other.id}`)
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
    expect(rec.rpcCalls).toEqual([
      { fn: "dma_strategy_events_for_user", params: { p_user_id: user.id, p_trade_date: kstDateIso() } },
    ]);
  });

  it("④ date=2026-09-26 → p_trade_date 그대로", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, rows: [] });
    const r = await request(createApp({ supabase: client }))
      .get("/api/strategy-events?date=2026-09-26")
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(200);
    expect(rec.rpcCalls[0].params).toEqual({ p_user_id: user.id, p_trade_date: "2026-09-26" });
  });

  it("⑤ 200 bare array — toStrategyEventRow 결과 · 순서 유지 · dma_user_id 가 섞여 와도 응답에 없다 (T-19-08)", async () => {
    const { client } = makeSupabase({
      user: nextUser(),
      rows: [
        eventRow({ seq: "1", kind: 1, group: 0, account_no: "", order_no: "", dma_user_id: "dma-leak", applied_at: "x" }),
        eventRow({ dma_user_id: "dma-leak" }),
      ],
    });
    const r = await request(createApp({ supabase: client }))
      .get("/api/strategy-events")
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.map((x: any) => x.seq)).toEqual([1, 2]);
    expect(r.body[1]).toMatchObject({
      gateway: "KB",
      journalEpoch: "ep-25",
      seq: 2,
      kind: 3,
      group: 1,
      accountNo: "1234567801",
      orderNo: "12451",
      cumVolume: 861800,
      condActual: 38200,
      stockCode: "005930",
    });
    for (const row of r.body) {
      expect(row).not.toHaveProperty("dmaUserId");
      expect(row).not.toHaveProperty("dma_user_id");
    }
    expect(r.text).not.toContain("dma-leak");
    expect(r.text).not.toContain("applied_at");
  });

  it("⑥ RPC 오류 → 500 DB_ERROR · 원문 비노출", async () => {
    const { client } = makeSupabase({
      user: nextUser(),
      rpcError: { message: "permission denied for function dma_strategy_events_for_user" },
    });
    const r = await request(createApp({ supabase: client }))
      .get("/api/strategy-events")
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
    expect(r.text).not.toContain("permission denied");
  });
});
