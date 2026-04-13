import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";
import { allRows } from "../fixtures/stocks";

const app = () =>
  createApp({ supabase: mockSupabase({ stocks: allRows }) });

describe("/api/scanner", () => {
  it("200 + 전체 종목 반환, upperLimitProximity 포함", async () => {
    const r = await request(app()).get("/api/scanner");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBe(3);
    const s = r.body.find((x: any) => x.code === "005930");
    expect(s).toBeDefined();
    expect(typeof s.upperLimitProximity).toBe("number");
    expect(s.upperLimitProximity).toBeCloseTo(70000 / 91000);
  });

  it("market=KOSPI → KOSPI만", async () => {
    const r = await request(app()).get("/api/scanner?market=KOSPI");
    expect(r.body.every((s: any) => s.market === "KOSPI")).toBe(true);
    expect(r.body.length).toBe(2);
  });

  it("minRate=1.0 → changeRate>=1.0 만", async () => {
    const r = await request(app()).get("/api/scanner?minRate=1.0");
    expect(r.body.every((s: any) => s.changeRate >= 1.0)).toBe(true);
  });

  it("sort=volume_desc → volume 내림차순", async () => {
    const r = await request(app()).get("/api/scanner?sort=volume_desc");
    const vols = r.body.map((s: any) => s.volume);
    const sorted = [...vols].sort((a, b) => b - a);
    expect(vols).toEqual(sorted);
  });

  it("limit=1 → 1개만", async () => {
    const r = await request(app()).get("/api/scanner?limit=1");
    expect(r.body.length).toBe(1);
  });

  it("Cache-Control: no-store 헤더", async () => {
    const r = await request(app()).get("/api/scanner");
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  it("invalid market → 400 INVALID_QUERY_PARAM", async () => {
    const r = await request(app()).get("/api/scanner?market=INVALID");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("INVALID_QUERY_PARAM");
  });

  it("invalid limit (non-numeric) → 400", async () => {
    const r = await request(app()).get("/api/scanner?limit=abc");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("INVALID_QUERY_PARAM");
  });

  it("limit > 10000 → 400", async () => {
    const r = await request(app()).get("/api/scanner?limit=99999");
    expect(r.status).toBe(400);
  });

  it("market=KOSPI&minRate=1.0 동시 적용 (AND 시맨틱)", async () => {
    const res = await request(app()).get(
      "/api/scanner?market=KOSPI&minRate=1.0",
    );
    expect(res.status).toBe(200);
    expect(res.body.every((s: any) => s.market === "KOSPI")).toBe(true);
    expect(res.body.every((s: any) => s.changeRate >= 1.0)).toBe(true);
    expect(res.body.some((s: any) => s.code === "091990")).toBe(false);
  });
});
