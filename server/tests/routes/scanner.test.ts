import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";
import { samsungMaster, samsungQuote } from "../fixtures/stocks";

// 회귀 기준선 — 기존 3 종목과 동일 의미
const samsungMover = {
  code: "005930",
  name: "삼성전자",
  market: "KOSPI",
  rank: 1,
  ranked_at: "2026-04-15T05:00:00Z",
  scan_id: null,
  updated_at: "2026-04-13T10:00:00Z",
};
const kakaoMover = {
  code: "035720",
  name: "카카오",
  market: "KOSPI",
  rank: 2,
  ranked_at: "2026-04-15T05:00:00Z",
  scan_id: null,
  updated_at: "2026-04-13T10:00:00Z",
};
const kosdaqMover = {
  code: "091990",
  name: "셀트리온헬스케어",
  market: "KOSDAQ",
  rank: 3,
  ranked_at: "2026-04-15T05:00:00Z",
  scan_id: null,
  updated_at: "2026-04-13T10:00:00Z",
};

const kakaoMaster = { ...samsungMaster, code: "035720", name: "카카오" };
const kosdaqMaster = {
  ...samsungMaster,
  code: "091990",
  name: "셀트리온헬스케어",
  market: "KOSDAQ",
};

const kakaoQuote = {
  ...samsungQuote,
  code: "035720",
  price: "55000.00",
  change_amount: "500.00",
  change_rate: "0.9100",
  volume: 2345678,
  upper_limit: "71500.00",
  lower_limit: "38500.00",
  market_cap: 24000000000000,
};
const kosdaqQuote = {
  ...samsungQuote,
  code: "091990",
  price: "80000.00",
  change_amount: "-1000.00",
  change_rate: "-1.2300",
  volume: 987654,
  upper_limit: "104000.00",
  lower_limit: "56000.00",
  market_cap: 13000000000000,
  updated_at: "2026-04-13T10:05:00Z", // 가장 최신
};

const fullState = () => ({
  topMovers: [samsungMover, kakaoMover, kosdaqMover],
  masters: [samsungMaster, kakaoMaster, kosdaqMaster],
  quotes: [samsungQuote, kakaoQuote, kosdaqQuote],
});

const app = (state = fullState()) =>
  createApp({ supabase: mockSupabase(state) });

describe("/api/scanner (3-테이블 JOIN)", () => {
  it("200 + 전체 종목 + upperLimitProximity", async () => {
    const r = await request(app()).get("/api/scanner");
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(3);
    const s = r.body.find((x: any) => x.code === "005930");
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
    expect(vols).toEqual([...vols].sort((a: number, b: number) => b - a));
  });

  it("limit=1 → 1개", async () => {
    const r = await request(app()).get("/api/scanner?limit=1");
    expect(r.body.length).toBe(1);
  });

  it("Cache-Control: no-store", async () => {
    const r = await request(app()).get("/api/scanner");
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  it("invalid market → 400", async () => {
    const r = await request(app()).get("/api/scanner?market=INVALID");
    expect(r.status).toBe(400);
  });

  it("invalid limit → 400", async () => {
    const r = await request(app()).get("/api/scanner?limit=abc");
    expect(r.status).toBe(400);
  });

  it("limit > 10000 → 400", async () => {
    const r = await request(app()).get("/api/scanner?limit=99999");
    expect(r.status).toBe(400);
  });

  it("market+minRate AND", async () => {
    const r = await request(app()).get(
      "/api/scanner?market=KOSPI&minRate=1.0",
    );
    expect(
      r.body.every(
        (s: any) => s.market === "KOSPI" && s.changeRate >= 1.0,
      ),
    ).toBe(true);
    expect(r.body.some((s: any) => s.code === "091990")).toBe(false);
  });

  it("X-Last-Updated-At = MAX(stock_quotes.updated_at) (SCAN-08)", async () => {
    const r = await request(app()).get("/api/scanner");
    expect(r.headers["x-last-updated-at"]).toBe("2026-04-13T10:05:00.000Z");
  });

  it("top_movers 비어있음 → 200 + 빈 배열, X-Last-Updated-At 헤더 생략", async () => {
    const r = await request(
      app({ topMovers: [], masters: [], quotes: [] }),
    ).get("/api/scanner");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
    expect(r.headers["x-last-updated-at"]).toBeUndefined();
  });

  it("stock_quotes 없는 종목 → price=0, upperLimitProximity=0", async () => {
    const noQuoteState = {
      topMovers: [samsungMover],
      masters: [samsungMaster],
      quotes: [],
    };
    const r = await request(app(noQuoteState)).get("/api/scanner");
    expect(r.body[0].price).toBe(0);
    expect(r.body[0].upperLimitProximity).toBe(0);
  });
});
