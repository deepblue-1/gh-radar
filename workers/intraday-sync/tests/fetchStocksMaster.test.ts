import { describe, it, expect, vi } from "vitest";
import { fetchStocksMasterChunked } from "../src/index";

// supabase.from("stocks").select(...).in("code", chunk) 체인을 mock + .in() 인자 길이 캡처.
function mockSupabaseWithCapture() {
  const inCalls: number[] = [];
  const inFn = vi.fn((_col: string, arr: string[]) => {
    inCalls.push(arr.length);
    return Promise.resolve({
      data: arr.map((c) => ({ code: c, market: "KOSPI", security_group: "주권" })),
      error: null,
    });
  });
  const select = vi.fn().mockReturnValue({ in: inFn });
  const from = vi.fn().mockReturnValue({ select });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: { from } as any, inCalls };
}

describe("fetchStocksMasterChunked", () => {
  it("codes <= 500 → 단일 .in() 호출", async () => {
    const { supabase, inCalls } = mockSupabaseWithCapture();
    const codes = Array.from({ length: 300 }, (_, i) => String(i).padStart(6, "0"));
    const rows = await fetchStocksMasterChunked(supabase, codes);
    expect(rows).toHaveLength(300);
    expect(inCalls).toEqual([300]);
  });

  it("회귀 가드 — codes > 500 (강세장) 이면 청크 분할 + 결과 합산 (단일 .in URL 한계 회피)", async () => {
    // 2026-06-09 회귀: 강세장 codes 2838 → 단일 .in() URL 한계(414) 실패 → eligibleCodes 빈 Set
    //   → top_movers 0 → 스캐너 빈 화면. 500 개씩 청크로 나눠 조회해야 한다.
    const { supabase, inCalls } = mockSupabaseWithCapture();
    const codes = Array.from({ length: 2838 }, (_, i) => String(i).padStart(6, "0"));
    const rows = await fetchStocksMasterChunked(supabase, codes);
    expect(rows).toHaveLength(2838);
    // 2838 = 500*5 + 338 → 6 청크
    expect(inCalls).toEqual([500, 500, 500, 500, 500, 338]);
  });

  it("청크 중 error → throw (조용한 실패로 top_movers 비워지는 회귀 차단)", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: null, error: new Error("URI too long") });
    const select = vi.fn().mockReturnValue({ in: inFn });
    const from = vi.fn().mockReturnValue({ select });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from } as any;
    const codes = Array.from({ length: 600 }, (_, i) => String(i).padStart(6, "0"));
    await expect(fetchStocksMasterChunked(supabase, codes)).rejects.toThrow(/URI too long/);
  });

  it("빈 codes → 빈 결과, .in() 미호출", async () => {
    const { supabase, inCalls } = mockSupabaseWithCapture();
    const rows = await fetchStocksMasterChunked(supabase, []);
    expect(rows).toEqual([]);
    expect(inCalls).toEqual([]);
  });
});
