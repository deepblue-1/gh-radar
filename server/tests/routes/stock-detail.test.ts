import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase, mockKisClient } from "../fixtures/supabase-mock";
import { allMasters, samsungQuote } from "../fixtures/stocks";

const okPrice = {
  stck_prpr: "70500",
  prdy_vrss: "500",
  prdy_ctrt: "0.71",
  acml_vol: "1234567",
  acml_tr_pbmn: "900000000000",
  stck_oprc: "70000",
  stck_hgpr: "71000",
  stck_lwpr: "69500",
  stck_avls: "418000000000000",
  stck_mxpr: "91000",
  stck_llam: "49000",
};

describe("/api/stocks/:code (마스터 universe + on-demand inquirePrice)", () => {
  it("마스터 존재 + inquirePrice 성공 → 200 + on-demand 값 우선 + stock_quotes upsert", async () => {
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const supa = mockSupabase(state);
    const kis = mockKisClient(async () => okPrice);
    const r = await request(createApp({ supabase: supa, kisClient: kis })).get(
      "/api/stocks/005930",
    );
    expect(r.status).toBe(200);
    expect(r.body.code).toBe("005930");
    expect(r.body.price).toBe(70500); // on-demand 값
    expect(
      state.upserts.some((u: any) => u.table === "stock_quotes"),
    ).toBe(true);
  });

  it("마스터 존재 + inquirePrice 실패 → cached stock_quotes 폴백", async () => {
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const supa = mockSupabase(state);
    const kis = mockKisClient(async () => {
      throw new Error("EGW00201");
    });
    const r = await request(createApp({ supabase: supa, kisClient: kis })).get(
      "/api/stocks/005930",
    );
    expect(r.status).toBe(200);
    expect(r.body.price).toBe(70000); // cached 값
  });

  it("마스터 부재 → 404 STOCK_NOT_FOUND, inquirePrice 미호출", async () => {
    const state: any = { masters: allMasters, quotes: [] };
    const supa = mockSupabase(state);
    const kisGet = vi.fn();
    const kis = { get: kisGet } as any;
    const r = await request(createApp({ supabase: supa, kisClient: kis })).get(
      "/api/stocks/000000",
    );
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("STOCK_NOT_FOUND");
    expect(kisGet).not.toHaveBeenCalled();
  });

  it("마스터 존재 + inquirePrice 실패 + cached 없음 → 200 + price=0", async () => {
    const state: any = { masters: allMasters, quotes: [] };
    const supa = mockSupabase(state);
    const kis = mockKisClient(async () => {
      throw new Error("network");
    });
    const r = await request(createApp({ supabase: supa, kisClient: kis })).get(
      "/api/stocks/999999",
    );
    expect(r.status).toBe(200);
    expect(r.body.code).toBe("999999");
    expect(r.body.price).toBe(0);
    expect(r.body.upperLimitProximity).toBe(0);
  });

  it("kisClient 미주입 → cached 만으로 응답 + KIS 호출 0건 (BLOCKER #1 커버리지)", async () => {
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const kisGet = vi.fn();
    const r = await request(
      createApp({ supabase: mockSupabase(state) }),
    ).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.price).toBe(70000);
    expect(kisGet).not.toHaveBeenCalled();
  });

  it("잘못된 형식 → 400", async () => {
    const r = await request(
      createApp({ supabase: mockSupabase({ masters: allMasters }) }),
    ).get("/api/stocks/!!@@");
    expect(r.status).toBe(400);
  });
});
