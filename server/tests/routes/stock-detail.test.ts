import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";
import { allRows } from "../fixtures/stocks";

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
