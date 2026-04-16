import { describe, it, expect } from "vitest";
import { scannerRowToStock } from "../../src/mappers/scanner";

const mover = {
  code: "005930",
  name: "Mover Cache",
  market: "KOSPI",
  rank: 1,
  ranked_at: "2026-04-15T05:00:00Z",
  scan_id: null,
  updated_at: "2026-04-15T05:00:00Z",
};
const master = {
  code: "005930",
  name: "삼성전자",
  market: "KOSPI",
  sector: null,
  security_type: "보통주",
  listing_date: null,
  is_delisted: false,
  updated_at: "2026-04-15T00:00:00Z",
};
const quote = {
  code: "005930",
  price: "70000",
  change_amount: "1000",
  change_rate: "1.45",
  volume: 1234,
  trade_amount: 5678,
  open: "69000",
  high: "70500",
  low: "68500",
  market_cap: 999,
  upper_limit: "91000",
  lower_limit: "49000",
  updated_at: "2026-04-15T05:00:00Z",
};

describe("scannerRowToStock", () => {
  it("master 우선 — name/market 은 stocks 마스터 캐노니컬 사용", () => {
    const r = scannerRowToStock(mover, master, quote);
    expect(r.name).toBe("삼성전자"); // master 우선
    expect(r.market).toBe("KOSPI");
  });

  it("master 누락 시 mover 의 name/market fallback", () => {
    const r = scannerRowToStock(mover, null, quote);
    expect(r.name).toBe("Mover Cache");
  });

  it("quote 누락 시 시세 0 + upperLimitProximity=0", () => {
    const r = scannerRowToStock(mover, master, null);
    expect(r.price).toBe(0);
    expect(r.upperLimitProximity).toBe(0);
    expect(r.updatedAt).toBe(mover.updated_at);
  });

  it("quote 존재 시 upperLimitProximity = price/upper_limit", () => {
    const r = scannerRowToStock(mover, master, quote);
    expect(r.upperLimitProximity).toBeCloseTo(70000 / 91000);
  });
});
