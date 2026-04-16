import { describe, it, expect, vi } from "vitest";
import type { Stock } from "@gh-radar/shared";

// Dynamic import so we can test either old or new API
const mod = await import("../../src/pipeline/upsert");

const mk = (code: string, over: Partial<Stock> = {}): Stock => ({
  code,
  name: `name-${code}`,
  market: "KOSPI",
  price: 70000,
  changeAmount: 1000,
  changeRate: 1.5,
  volume: 1000,
  tradeAmount: 70_000_000,
  open: 69000,
  high: 70500,
  low: 68500,
  marketCap: 1_000_000,
  upperLimit: 91000,
  lowerLimit: 49000,
  updatedAt: "2026-04-15T05:00:00Z",
  ...over,
});

const mkSupa = () => {
  const upsertFn = vi.fn().mockResolvedValue({ error: null });
  const fromFn = vi.fn().mockReturnValue({ upsert: upsertFn });
  return { fromFn, upsertFn, supa: { from: fromFn } as any };
};

describe("upsertStockQuotes", () => {
  it("빈 배열 → no-op", async () => {
    const { fromFn, supa } = mkSupa();
    const r = await mod.upsertStockQuotes(supa, []);
    expect(r.count).toBe(0);
    expect(fromFn).not.toHaveBeenCalled();
  });

  it("from('stock_quotes').upsert(rows, {onConflict:'code'})", async () => {
    const { fromFn, upsertFn, supa } = mkSupa();
    await mod.upsertStockQuotes(supa, [mk("005930"), mk("000660")]);
    expect(fromFn).toHaveBeenCalledWith("stock_quotes");
    const passed = upsertFn.mock.calls[0][0];
    expect(passed).toHaveLength(2);
    // 시세 컬럼만 (마스터 컬럼 sector/security_type/listing_date 없음)
    expect(passed[0]).toHaveProperty("price");
    expect(passed[0]).not.toHaveProperty("sector");
    expect(passed[0]).not.toHaveProperty("security_type");
    expect(passed[0]).not.toHaveProperty("name"); // 시세에는 name 없음
  });

  it("dedup by code", async () => {
    const { upsertFn, supa } = mkSupa();
    await mod.upsertStockQuotes(supa, [
      mk("005930", { price: 1 }),
      mk("005930", { price: 2 }),
    ]);
    expect(upsertFn.mock.calls[0][0]).toHaveLength(1);
    expect(upsertFn.mock.calls[0][0][0].price).toBe(2);
  });
});

describe("upsertTopMovers", () => {
  it("from('top_movers').upsert — rank 부여 + scan_id + ranked_at", async () => {
    const { fromFn, upsertFn, supa } = mkSupa();
    await mod.upsertTopMovers(
      supa,
      [
        mk("A", { changeRate: 1 }),
        mk("B", { changeRate: 5 }),
        mk("C", { changeRate: 3 }),
      ],
      "scan-123",
      "2026-04-15T05:00:00Z",
    );
    expect(fromFn).toHaveBeenCalledWith("top_movers");
    const rows = upsertFn.mock.calls[0][0];
    // rank: changeRate 내림차순 = B(5)→C(3)→A(1)
    expect(rows.find((r: any) => r.code === "B").rank).toBe(1);
    expect(rows.find((r: any) => r.code === "C").rank).toBe(2);
    expect(rows.find((r: any) => r.code === "A").rank).toBe(3);
    expect(rows[0].scan_id).toBe("scan-123");
    expect(rows[0].ranked_at).toBe("2026-04-15T05:00:00Z");
    // 시세 컬럼 없음
    expect(rows[0]).not.toHaveProperty("price");
  });

  it("ingestion 은 stocks 테이블 절대 안 건드림 (회귀 가드)", async () => {
    const { fromFn, supa } = mkSupa();
    await mod.upsertStockQuotes(supa, [mk("005930")]);
    await mod.upsertTopMovers(
      supa,
      [mk("005930")],
      "s",
      "2026-04-15T05:00:00Z",
    );
    const tableCalls = fromFn.mock.calls.map((c: any[]) => c[0]);
    expect(tableCalls).not.toContain("stocks");
  });
});
