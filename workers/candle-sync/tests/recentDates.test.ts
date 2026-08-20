import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRecentTradingDates } from "../src/pipeline/recentDates";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * missingDates.ts Query B 와 동일한 체이닝을 mock:
 *   .from('stock_daily_ohlcv').select('date').gte('date', since).order('date', {ascending:false})
 */
function mockSupabase(dates: string[], error: any = null) {
  const orderMock = vi.fn().mockResolvedValue({
    data: error ? null : dates.map((d) => ({ date: d })),
    error,
  });
  const gteMock = vi.fn().mockReturnValue({ order: orderMock });
  const selectMock = vi.fn().mockReturnValue({ gte: gteMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });
  return {
    client: { from: fromMock } as unknown as SupabaseClient,
    fromMock,
    selectMock,
    gteMock,
    orderMock,
  };
}

describe("fetchRecentTradingDates", () => {
  it("distinct date 내림차순 최대 n 개 반환 (중복 row 제거)", async () => {
    // 실제 테이블은 (code,date) 라 한 일자에 수천 row — 클라이언트측 dedupe 필수.
    const m = mockSupabase([
      "2026-08-19",
      "2026-08-19",
      "2026-08-19",
      "2026-08-18",
      "2026-08-18",
      "2026-08-14",
    ]);
    const out = await fetchRecentTradingDates(m.client, 2);
    expect(out).toEqual(["2026-08-19", "2026-08-18"]);
    expect(m.fromMock).toHaveBeenCalledWith("stock_daily_ohlcv");
  });

  it("distinct 일자가 n 보다 적으면 있는 만큼만 반환", async () => {
    const m = mockSupabase(["2026-08-19", "2026-08-19"]);
    const out = await fetchRecentTradingDates(m.client, 5);
    expect(out).toEqual(["2026-08-19"]);
  });

  it("조회 결과 없음 → [] (throw 아님)", async () => {
    const m = mockSupabase([]);
    const out = await fetchRecentTradingDates(m.client, 2);
    expect(out).toEqual([]);
  });

  it("n <= 0 → [] + 쿼리 미실행 (킬 스위치)", async () => {
    const m = mockSupabase(["2026-08-19"]);
    const out = await fetchRecentTradingDates(m.client, 0);
    expect(out).toEqual([]);
    expect(m.fromMock).not.toHaveBeenCalled();
  });

  it("Supabase error → throw (호출부가 fail-open 책임)", async () => {
    const m = mockSupabase([], { message: "connection reset" });
    await expect(fetchRecentTradingDates(m.client, 2)).rejects.toBeTruthy();
  });
});
