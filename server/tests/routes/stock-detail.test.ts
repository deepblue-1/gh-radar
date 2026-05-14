import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";
import { allMasters, samsungQuote } from "../fixtures/stocks";

// Phase 09.1 D-17 — server 가 키움 ka10001 호출로 전환됨.
// 기존 KIS rt_cd / output 패턴 → 키움 return_code / top-level fields 패턴.

const okKa10001 = {
  return_code: 0,
  return_msg: "정상",
  stk_cd: "005930",
  cur_prc: "+70500",
  pred_pre: "+500",
  flu_rt: "+0.71",
  open_pric: "+70000",
  high_pric: "+71000",
  low_pric: "+69500",
  upl_pric: "91000",
  lst_pric: "49000",
  mac: "4180000",
};

function mockKiwoomRuntime(impl: (code: string) => Promise<any>) {
  return {
    client: {
      post: vi
        .fn()
        .mockImplementation(async (_path: string, body: { stk_cd: string }) => {
          const data = await impl(body.stk_cd);
          return { data };
        }),
    },
    getToken: vi.fn().mockResolvedValue("TEST_TOKEN"),
  } as any;
}

describe("/api/stocks/:code (마스터 universe + on-demand 키움 inquirePrice)", () => {
  it("마스터 존재 + 키움 호출 성공 → 200 + on-demand 값 우선 + stock_quotes upsert", async () => {
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const supa = mockSupabase(state);
    const kiwoomRuntime = mockKiwoomRuntime(async () => okKa10001);
    const r = await request(
      createApp({ supabase: supa, kiwoomRuntime }),
    ).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.code).toBe("005930");
    expect(r.body.price).toBe(70500); // on-demand 값 (절댓값)
    expect(r.body.open).toBe(70000);
    expect(r.body.high).toBe(71000);
    expect(r.body.low).toBe(69500);
    // STEP1 worker 의 volume/trade_amount 보존 (D-22)
    expect(r.body.volume).toBe(samsungQuote.volume);
    expect(r.body.tradeAmount).toBe(samsungQuote.trade_amount);
    // stock_quotes upsert 발생 확인
    expect(
      state.upserts.some((u: any) => u.table === "stock_quotes"),
    ).toBe(true);
    // upsert payload 에 volume / trade_amount 키 omit (D-22)
    const upsertPayload = state.upserts.find(
      (u: any) => u.table === "stock_quotes",
    );
    expect(upsertPayload.rows[0]).not.toHaveProperty("volume");
    expect(upsertPayload.rows[0]).not.toHaveProperty("trade_amount");
  });

  it("마스터 존재 + 키움 호출 실패 → cached stock_quotes 폴백", async () => {
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const supa = mockSupabase(state);
    const kiwoomRuntime = mockKiwoomRuntime(async () => {
      throw new Error("키움 429");
    });
    const r = await request(
      createApp({ supabase: supa, kiwoomRuntime }),
    ).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.price).toBe(70000); // cached 값
    expect(r.body.volume).toBe(samsungQuote.volume);
  });

  it("마스터 부재 → 404 STOCK_NOT_FOUND, 키움 호출 미실행", async () => {
    const state: any = { masters: allMasters, quotes: [] };
    const supa = mockSupabase(state);
    const kiwoomRuntime = mockKiwoomRuntime(async () => okKa10001);
    const r = await request(
      createApp({ supabase: supa, kiwoomRuntime }),
    ).get("/api/stocks/000000");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("STOCK_NOT_FOUND");
    expect(kiwoomRuntime.client.post).not.toHaveBeenCalled();
    expect(kiwoomRuntime.getToken).not.toHaveBeenCalled();
  });

  it("마스터 존재 + 키움 호출 실패 + cached 없음 → 200 + price=0", async () => {
    const state: any = { masters: allMasters, quotes: [] };
    const supa = mockSupabase(state);
    const kiwoomRuntime = mockKiwoomRuntime(async () => {
      throw new Error("network");
    });
    const r = await request(
      createApp({ supabase: supa, kiwoomRuntime }),
    ).get("/api/stocks/999999");
    expect(r.status).toBe(200);
    expect(r.body.code).toBe("999999");
    expect(r.body.price).toBe(0);
    expect(r.body.upperLimitProximity).toBe(0);
  });

  it("kiwoomRuntime 미주입 → cached 만으로 응답 + 키움 호출 0건 (BLOCKER #1 커버리지)", async () => {
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const r = await request(
      createApp({ supabase: mockSupabase(state) }),
    ).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.price).toBe(70000);
    expect(r.body.volume).toBe(samsungQuote.volume);
  });

  it("키움 return_code != 0 → throw → cached fallback (Wave 1 plan 04 패턴)", async () => {
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const supa = mockSupabase(state);
    const kiwoomRuntime = {
      client: {
        post: vi.fn().mockResolvedValue({
          data: { return_code: 1700, return_msg: "허용된 요청 개수를 초과" },
        }),
      },
      getToken: vi.fn().mockResolvedValue("T"),
    } as any;
    const r = await request(
      createApp({ supabase: supa, kiwoomRuntime }),
    ).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.price).toBe(70000); // cached
  });

  it("잘못된 형식 → 400", async () => {
    const r = await request(
      createApp({ supabase: mockSupabase({ masters: allMasters }) }),
    ).get("/api/stocks/!!@@");
    expect(r.status).toBe(400);
  });
});
