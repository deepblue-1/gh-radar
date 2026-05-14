import { describe, it, expect, vi } from "vitest";
import { computeHotSet } from "../src/pipeline/hotSet";
import type { IntradayCloseUpdate } from "@gh-radar/shared";

function mockSupabase(watchlistRows: { stock_code: string }[] | null, error?: any) {
  const select = vi.fn().mockResolvedValue({ data: watchlistRows, error: error ?? null });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as any;
}

function makeStep1(codes: string[]): IntradayCloseUpdate[] {
  return codes.map((code) => ({
    code,
    date: "2026-05-14",
    price: 1000,
    changeAmount: 0,
    changeRate: 0,
    volume: 0,
    tradeAmount: 0,
  }));
}

describe("computeHotSet", () => {
  it("watchlist 빈 → top N 만 반환", async () => {
    const step1 = makeStep1([...Array(300)].map((_, i) => String(i + 1).padStart(6, "0")));
    const supabase = mockSupabase([]);
    const result = await computeHotSet(supabase, step1, 200);
    expect(result).toHaveLength(200);
    expect(result[0]).toBe("000001");
    expect(result).not.toContain("000201");
  });

  it("watchlist 30 unique + top 5 가 watchlist 와 겹침 → 200 + 25 = 225", async () => {
    const step1 = makeStep1([...Array(300)].map((_, i) => String(i + 1).padStart(6, "0")));
    const watchlist = [
      { stock_code: "000001" }, // 겹침
      { stock_code: "000002" }, // 겹침
      { stock_code: "000003" }, // 겹침
      { stock_code: "000004" }, // 겹침
      { stock_code: "000005" }, // 겹침
      ...Array(25)
        .fill(null)
        .map((_, i) => ({ stock_code: String(900000 + i).padStart(6, "0") })),
    ];
    const supabase = mockSupabase(watchlist);
    const result = await computeHotSet(supabase, step1, 200);
    expect(result).toHaveLength(225);
  });

  it("step1Updates 가 topN 미만 → 모두 + watchlist", async () => {
    const step1 = makeStep1(["000001", "000002", "000003"]);
    const supabase = mockSupabase([{ stock_code: "999999" }]);
    const result = await computeHotSet(supabase, step1, 200);
    expect(new Set(result)).toEqual(new Set(["000001", "000002", "000003", "999999"]));
  });

  it("supabase 에러 → throw", async () => {
    const step1 = makeStep1([]);
    const supabase = mockSupabase(null, new Error("supabase down"));
    await expect(computeHotSet(supabase, step1, 200)).rejects.toThrow(/supabase down/);
  });
});
