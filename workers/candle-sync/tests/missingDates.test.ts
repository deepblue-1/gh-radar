import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findMissingDates } from "../src/pipeline/missingDates";

/**
 * Supabase mock (옵션 A — RPC 미사용, mock 단순화):
 *   3종 query 패턴을 각 호출별 fresh builder 로 mock — vitest `mockResolvedValue` 직접 활용.
 *
 *   A. .from('stocks').select(_, {count: exact, head: true}).eq('is_delisted', false) → activeCount
 *   B. .from('stock_daily_ohlcv').select('date').gte('date', ...).order('date', desc) → recent dates
 *   C. .from('stock_daily_ohlcv').select(_, {count: exact, head: true}).eq('date', X) → per-date count
 *
 * thenable 직접 구현 대신 builder 의 final method 가 mockResolvedValue 로 result 반환.
 */
function mockSupabase(opts: {
  activeCount: number;
  recentDates: string[]; // distinct dates returned by query B (DESC)
  perDateCounts: Record<string, number>; // date → count
}) {
  const fromMock = vi.fn((table: string) => {
    if (table === "stocks") {
      // Query A: select(_, {count: exact, head: true}).eq('is_delisted', false) → resolves
      const eqMock = vi
        .fn()
        .mockResolvedValue({ count: opts.activeCount, data: null, error: null });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      return { select: selectMock };
    }

    if (table === "stock_daily_ohlcv") {
      // Query B: select('date').gte('date', ...).order('date', {ascending: false}) → resolves data:[{date},...]
      const recentDateRows = opts.recentDates.map((d) => ({ date: d }));

      // Query C: select(_, {count: exact, head: true}).eq('date', X) → resolves count
      const orderMock = vi
        .fn()
        .mockResolvedValue({ count: null, data: recentDateRows, error: null });
      const gteMock = vi.fn().mockReturnValue({ order: orderMock });
      const eqDateMock = vi.fn((_col: string, val: any) => {
        // Query C: head:true + eq('date', X) → resolves count
        return Promise.resolve({
          count: opts.perDateCounts[val] ?? 0,
          data: null,
          error: null,
        });
      });
      const selectMock = vi.fn(
        (_cols: string, options?: { count?: string; head?: boolean }) => {
          if (options?.head) {
            // Query C path: select(_, {count: exact, head: true}).eq('date', X)
            return { eq: eqDateMock };
          }
          // Query B path: select('date').gte('date', ...).order(...)
          return { gte: gteMock };
        },
      );
      return { select: selectMock };
    }

    throw new Error(`Unexpected table in mock: ${table}`);
  });

  return {
    client: { from: fromMock } as unknown as SupabaseClient,
    from: fromMock,
  };
}

describe("findMissingDates", () => {
  it("활성=2800, threshold=0.9 → 결측 임계 = 2520. 5일 중 2일 결측 발견", async () => {
    const m = mockSupabase({
      activeCount: 2800,
      recentDates: [
        "2026-05-09",
        "2026-05-08",
        "2026-05-07",
        "2026-05-06",
        "2026-05-05",
      ],
      perDateCounts: {
        "2026-05-09": 2800, // OK
        "2026-05-08": 2400, // < 2520 missing
        "2026-05-07": 2800, // OK
        "2026-05-06": 1500, // < 2520 missing
        "2026-05-05": 2800, // OK
      },
    });
    const out = await findMissingDates(m.client, {
      lookback: 10,
      threshold: 0.9,
      maxCalls: 20,
    });
    expect(out).toEqual(["2026-05-08", "2026-05-06"]);
  });

  it("모든 일자가 정상이면 빈 배열", async () => {
    const m = mockSupabase({
      activeCount: 2800,
      recentDates: ["2026-05-09", "2026-05-08"],
      perDateCounts: { "2026-05-09": 2800, "2026-05-08": 2800 },
    });
    const out = await findMissingDates(m.client, {
      lookback: 10,
      threshold: 0.9,
      maxCalls: 20,
    });
    expect(out).toEqual([]);
  });

  it("maxCalls 상한 적용 — 결측 30개 중 maxCalls=20 만 반환", async () => {
    const dates = Array.from(
      { length: 30 },
      (_, i) => `2026-04-${(30 - i).toString().padStart(2, "0")}`,
    );
    const counts: Record<string, number> = {};
    dates.forEach((d) => {
      counts[d] = 100;
    }); // 전부 결측
    const m = mockSupabase({
      activeCount: 2800,
      recentDates: dates,
      perDateCounts: counts,
    });
    const out = await findMissingDates(m.client, {
      lookback: 30,
      threshold: 0.9,
      maxCalls: 20,
    });
    expect(out.length).toBe(20);
  });

  it("row_count = 0 인 일자는 휴장 — skip (결측 아님)", async () => {
    const m = mockSupabase({
      activeCount: 2800,
      recentDates: ["2026-05-09", "2026-05-08"],
      perDateCounts: {
        "2026-05-09": 0, // 휴장 — skip
        "2026-05-08": 2800, // OK
      },
    });
    const out = await findMissingDates(m.client, {
      lookback: 10,
      threshold: 0.9,
      maxCalls: 20,
    });
    expect(out).toEqual([]);
  });

  it("activeCount = 0 (DB 비어있음) → 빈 배열 + skip 경고", async () => {
    const m = mockSupabase({
      activeCount: 0,
      recentDates: [],
      perDateCounts: {},
    });
    const out = await findMissingDates(m.client, {
      lookback: 10,
      threshold: 0.9,
      maxCalls: 20,
    });
    expect(out).toEqual([]);
  });
});
