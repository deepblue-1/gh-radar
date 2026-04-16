import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";
import { allRows, allMasters, samsungQuote } from "../fixtures/stocks";

const app = () =>
  createApp({ supabase: mockSupabase({ stocks: allRows }) });

describe("/api/stocks/:code", () => {
  it("기존 코드 → 200 + stock", async () => {
    const r = await request(app()).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.code).toBe("005930");
    expect(r.body.name).toBe("삼성전자");
    expect(typeof r.body.upperLimitProximity).toBe("number");
  });

  it("없는 코드 → 404 STOCK_NOT_FOUND", async () => {
    const r = await request(app()).get("/api/stocks/000000");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("STOCK_NOT_FOUND");
    expect(r.body.error.message).toContain("000000");
  });

  it("잘못된 형식 → 400 INVALID_QUERY_PARAM", async () => {
    const r = await request(app()).get("/api/stocks/!!@@");
    expect(r.status).toBe(400);
  });
});

describe("/api/stocks/:code 마스터 universe + on-demand inquirePrice (Plan 04 구현)", () => {
  it("마스터 존재 + inquirePrice 성공 → 200 + 시세 병합", async () => {
    const inquirePriceImpl = vi.fn().mockResolvedValue({
      stck_mxpr: "91000",
      stck_llam: "49000",
      stck_oprc: "70000",
      stck_avls: "418000000000000",
      acml_tr_pbmn: "900000000000",
      stck_prpr: "70500",
      prdy_vrss: "500",
      prdy_ctrt: "0.71",
      acml_vol: "1234567",
      stck_hgpr: "71000",
      stck_lwpr: "69500",
    });
    const supa = mockSupabase({
      masters: allMasters,
      quotes: [samsungQuote],
      inquirePriceImpl,
    });
    const r = await request(createApp({ supabase: supa })).get(
      "/api/stocks/005930",
    );
    expect(r.status).toBe(200);
    expect(r.body.code).toBe("005930");
    expect(r.body.price).toBe(70500);
    expect(inquirePriceImpl).toHaveBeenCalledWith("005930");
  });

  it("마스터 존재 + inquirePrice 실패 → 200 + cached stock_quotes 폴백", async () => {
    const inquirePriceImpl = vi.fn().mockRejectedValue(new Error("EGW00201"));
    const supa = mockSupabase({
      masters: allMasters,
      quotes: [samsungQuote],
      inquirePriceImpl,
    });
    const r = await request(createApp({ supabase: supa })).get(
      "/api/stocks/005930",
    );
    expect(r.status).toBe(200);
    expect(r.body.price).toBe(70000);
  });

  it("마스터 부재 → 404 (inquirePrice 미호출)", async () => {
    const inquirePriceImpl = vi.fn();
    const supa = mockSupabase({
      masters: allMasters,
      quotes: [],
      inquirePriceImpl,
    });
    const r = await request(createApp({ supabase: supa })).get(
      "/api/stocks/000000",
    );
    expect(r.status).toBe(404);
    expect(inquirePriceImpl).not.toHaveBeenCalled();
  });

  it("마스터 존재 + 시세도 cached 도 없음 → 200 + price=0 (em-dash 폴백)", async () => {
    const inquirePriceImpl = vi
      .fn()
      .mockRejectedValue(new Error("network"));
    const supa = mockSupabase({
      masters: allMasters,
      quotes: [],
      inquirePriceImpl,
    });
    const r = await request(createApp({ supabase: supa })).get(
      "/api/stocks/999999",
    );
    expect(r.status).toBe(200);
    expect(r.body.price).toBe(0);
  });
});
