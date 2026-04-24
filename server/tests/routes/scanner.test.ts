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

// 스캐너는 급등 포착이 목적 — changeRate ≥ 10% 컷이 적용되므로
// 스캐너용 시세 픽스처는 전부 10% 이상으로 설정 (samsungQuote 기본값 1.45% 덮어씀)
const samsungScannerQuote = {
  ...samsungQuote,
  change_rate: "15.5000",
};
const kakaoQuote = {
  ...samsungQuote,
  code: "035720",
  price: "55000.00",
  change_amount: "6000.00",
  change_rate: "12.3000",
  volume: 2345678,
  upper_limit: "71500.00",
  lower_limit: "38500.00",
  market_cap: 24000000000000,
};
const kosdaqQuote = {
  ...samsungQuote,
  code: "091990",
  price: "80000.00",
  change_amount: "8400.00",
  change_rate: "11.7000",
  volume: 987654,
  upper_limit: "104000.00",
  lower_limit: "56000.00",
  market_cap: 13000000000000,
  updated_at: "2026-04-13T10:05:00Z", // 가장 최신
};

// 저등락 종목 — 10% 컷에 걸려 스캐너 응답에서 제외되어야 함
const lowRateMover = {
  code: "000660",
  name: "SK하이닉스",
  market: "KOSPI",
  rank: 4,
  ranked_at: "2026-04-15T05:00:00Z",
  scan_id: null,
  updated_at: "2026-04-13T10:00:00Z",
};
const lowRateMaster = {
  ...samsungMaster,
  code: "000660",
  name: "SK하이닉스",
};
const lowRateQuote = {
  ...samsungQuote,
  code: "000660",
  price: "120000.00",
  change_amount: "3000.00",
  change_rate: "2.5000", // < 10% → 필터링
  volume: 500000,
};

const fullState = () => ({
  topMovers: [samsungMover, kakaoMover, kosdaqMover],
  masters: [samsungMaster, kakaoMaster, kosdaqMaster],
  quotes: [samsungScannerQuote, kakaoQuote, kosdaqQuote],
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

  it("stock_quotes 없는 종목 → changeRate=0 이므로 10% 컷에 걸려 제외", async () => {
    const noQuoteState = {
      topMovers: [samsungMover],
      masters: [samsungMaster],
      quotes: [],
    };
    const r = await request(app(noQuoteState)).get("/api/scanner");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it("changeRate < 10% 인 종목은 응답에서 제외된다", async () => {
    const mixedState = {
      topMovers: [samsungMover, lowRateMover],
      masters: [samsungMaster, lowRateMaster],
      quotes: [samsungScannerQuote, lowRateQuote],
    };
    const r = await request(app(mixedState)).get("/api/scanner");
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(1);
    expect(r.body[0].code).toBe("005930");
    expect(r.body.some((s: any) => s.code === "000660")).toBe(false);
  });
});
