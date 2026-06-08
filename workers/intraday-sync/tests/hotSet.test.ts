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

function makeStep1WithRates(
  entries: Array<{ code: string; changeRate: number | null }>,
): IntradayCloseUpdate[] {
  return entries.map(({ code, changeRate }) => ({
    code,
    date: "2026-05-14",
    price: 1000,
    changeAmount: 0,
    changeRate,
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

  it("회귀 가드 — changeRate 내림차순 정렬 후 top N 선정 (sort_tp=3 응답이 오름차순)", async () => {
    // 2026-06-08 회귀 대응: ka10027 sort_tp=3 응답은 음수→양수 오름차순.
    // hotSet 는 클라이언트 측에서 명시 정렬(내림차순) 필수. 미적용 시 약세장에서 음수 종목이
    // top N 에 들어가 hot set 이 깨짐 → STEP2 quote/news/discussion 타겟 오류.
    const step1 = makeStep1WithRates([
      { code: "A00001", changeRate: -10 }, // 최하위
      { code: "A00002", changeRate: -2 },
      { code: "A00003", changeRate: 0 },
      { code: "A00004", changeRate: 3 },
      { code: "A00005", changeRate: 15 },
      { code: "A00006", changeRate: 29.9 },
      { code: "A00007", changeRate: 30 }, // 최상위
    ]);
    const supabase = mockSupabase([]);
    const result = await computeHotSet(supabase, step1, 3);
    // top 3 는 changeRate 30, 29.9, 15 의 코드 — 순서 보장.
    expect(result).toEqual(["A00007", "A00006", "A00005"]);
    // 음수/0 코드는 절대 포함되면 안 됨.
    expect(result).not.toContain("A00001");
    expect(result).not.toContain("A00002");
    expect(result).not.toContain("A00003");
  });

  it("회귀 가드 — null changeRate 는 최하위로 정렬 (top N 자리 차지 방지)", async () => {
    const step1 = makeStep1WithRates([
      { code: "A00001", changeRate: null },
      { code: "A00002", changeRate: 5 },
      { code: "A00003", changeRate: null },
      { code: "A00004", changeRate: 10 },
    ]);
    const supabase = mockSupabase([]);
    const result = await computeHotSet(supabase, step1, 2);
    // top 2 는 10, 5 코드 — null 은 후순위.
    expect(result).toEqual(["A00004", "A00002"]);
  });
});
