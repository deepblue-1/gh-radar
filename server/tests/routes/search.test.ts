import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";
import { allRows } from "../fixtures/stocks";
import { sanitizeSearchTerm } from "../../src/schemas/search";

const app = () =>
  createApp({ supabase: mockSupabase({ stocks: allRows }) });

describe("/api/stocks/search", () => {
  it("q=삼성 → 삼성전자 매치", async () => {
    const r = await request(app()).get(
      "/api/stocks/search?q=%EC%82%BC%EC%84%B1",
    );
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.some((s: any) => s.name.includes("삼성"))).toBe(true);
    expect(r.body.length).toBeLessThanOrEqual(20);
  });

  it("q=005930 → code 매치", async () => {
    const r = await request(app()).get("/api/stocks/search?q=005930");
    expect(r.body.some((s: any) => s.code === "005930")).toBe(true);
  });

  it("q 누락 → 400", async () => {
    const r = await request(app()).get("/api/stocks/search");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("INVALID_QUERY_PARAM");
  });

  it("q 빈 문자열 → 400", async () => {
    const r = await request(app()).get("/api/stocks/search?q=");
    expect(r.status).toBe(400);
  });
});

describe("sanitizeSearchTerm", () => {
  it("removes ,()%", () => {
    expect(sanitizeSearchTerm("삼성,(주)%")).toBe("삼성주");
  });

  it("preserves Korean/English/digits", () => {
    expect(sanitizeSearchTerm("Samsung 005930 삼성")).toBe(
      "Samsung 005930 삼성",
    );
  });
});
