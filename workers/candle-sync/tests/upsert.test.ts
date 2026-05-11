import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertOhlcv } from "../src/pipeline/upsert";
import type { StockDailyOhlcv } from "@gh-radar/shared";

function row(code: string, date: string = "2026-05-09"): StockDailyOhlcv {
  return {
    code,
    date,
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 1000,
    tradeAmount: 100000,
    changeAmount: 5,
    changeRate: 5.0,
  };
}

function mockSupabase(opts?: { firstChunkError?: boolean }) {
  let chunkIdx = 0;
  const upsert = vi.fn((_dbRows: any[], _options: any) => {
    chunkIdx += 1;
    if (opts?.firstChunkError && chunkIdx === 1) {
      return Promise.resolve({ error: new Error("chunk 1 fail") });
    }
    return Promise.resolve({ error: null });
  });
  const from = vi.fn((_table: string) => ({ upsert }));
  return { client: { from } as unknown as SupabaseClient, from, upsert };
}

describe("upsertOhlcv chunked UPSERT", () => {
  it("빈 배열 입력 시 supabase 호출 없음, count=0", async () => {
    const m = mockSupabase();
    const out = await upsertOhlcv(m.client, []);
    expect(out.count).toBe(0);
    expect(m.from).not.toHaveBeenCalled();
  });

  it("500 row → 1 chunk", async () => {
    const m = mockSupabase();
    const rows = Array.from({ length: 500 }, (_, i) =>
      row(`A${i.toString().padStart(5, "0")}`),
    );
    const out = await upsertOhlcv(m.client, rows);
    expect(out.count).toBe(500);
    expect(m.upsert).toHaveBeenCalledTimes(1);
  });

  it("1500 row → 2 chunk (1000 + 500)", async () => {
    const m = mockSupabase();
    const rows = Array.from({ length: 1500 }, (_, i) =>
      row(`A${i.toString().padStart(5, "0")}`),
    );
    const out = await upsertOhlcv(m.client, rows);
    expect(out.count).toBe(1500);
    expect(m.upsert).toHaveBeenCalledTimes(2);
    // 1st chunk = 1000 rows, 2nd = 500
    expect((m.upsert.mock.calls[0][0] as any[]).length).toBe(1000);
    expect((m.upsert.mock.calls[1][0] as any[]).length).toBe(500);
  });

  it("3500 row → 4 chunk (1000+1000+1000+500)", async () => {
    const m = mockSupabase();
    const rows = Array.from({ length: 3500 }, (_, i) =>
      row(`A${i.toString().padStart(5, "0")}`),
    );
    const out = await upsertOhlcv(m.client, rows);
    expect(out.count).toBe(3500);
    expect(m.upsert).toHaveBeenCalledTimes(4);
  });

  it("onConflict = 'code,date'", async () => {
    const m = mockSupabase();
    await upsertOhlcv(m.client, [row("005930")]);
    expect(m.upsert).toHaveBeenCalledWith(expect.any(Array), {
      onConflict: "code,date",
    });
  });

  it("camelCase → snake_case 변환 (tradeAmount → trade_amount)", async () => {
    const m = mockSupabase();
    await upsertOhlcv(m.client, [row("005930")]);
    const dbRow = (m.upsert.mock.calls[0][0] as any[])[0];
    expect(dbRow.trade_amount).toBe(100000);
    expect(dbRow.change_amount).toBe(5);
    expect(dbRow.change_rate).toBe(5.0);
    expect(dbRow).not.toHaveProperty("tradeAmount");
    expect(dbRow).not.toHaveProperty("changeAmount");
  });

  it("첫 chunk 에러 시 즉시 throw — 나머지 chunk 호출 안 됨", async () => {
    const m = mockSupabase({ firstChunkError: true });
    const rows = Array.from({ length: 2500 }, (_, i) =>
      row(`A${i.toString().padStart(5, "0")}`),
    );
    await expect(upsertOhlcv(m.client, rows)).rejects.toThrow(/chunk 1 fail/);
    // 첫 chunk 에서 throw — 2번째/3번째 chunk 미호출
    expect(m.upsert).toHaveBeenCalledTimes(1);
  });

  it("from('stock_daily_ohlcv') 테이블 이름 정확", async () => {
    const m = mockSupabase();
    await upsertOhlcv(m.client, [row("005930")]);
    expect(m.from).toHaveBeenCalledWith("stock_daily_ohlcv");
  });
});
