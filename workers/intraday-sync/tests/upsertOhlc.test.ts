import { describe, it, expect, vi } from "vitest";
import { intradayUpsertOhlc } from "../src/pipeline/upsertOhlc";
import type { IntradayOhlcUpdate } from "@gh-radar/shared";

function make(n: number): IntradayOhlcUpdate[] {
  return Array.from({ length: n }, (_, i) => ({
    code: String(i + 1).padStart(6, "0"),
    date: "2026-05-14",
    open: 100,
    high: 110,
    low: 95,
    upperLimit: null,
    lowerLimit: null,
    marketCap: null,
  }));
}

describe("intradayUpsertOhlc", () => {
  it("payload 가 open/high/low 만 포함 (RPC #2 의 ON CONFLICT 가 close/volume omit)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const supabase = { rpc } as unknown as Parameters<typeof intradayUpsertOhlc>[0];
    await intradayUpsertOhlc(supabase, make(1));
    const callArgs = rpc.mock.calls[0][1] as { p_rows: Array<Record<string, unknown>> };
    expect(callArgs.p_rows[0]).toEqual({
      code: "000001",
      date: "2026-05-14",
      open: 100,
      high: 110,
      low: 95,
    });
    expect(callArgs.p_rows[0].close).toBeUndefined();
    expect(callArgs.p_rows[0].volume).toBeUndefined();
  });

  it("250 row 단일 chunk", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 250, error: null });
    const supabase = { rpc } as unknown as Parameters<typeof intradayUpsertOhlc>[0];
    const out = await intradayUpsertOhlc(supabase, make(250));
    expect(out.count).toBe(250);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("빈 입력 → no-op", async () => {
    const rpc = vi.fn();
    const supabase = { rpc } as unknown as Parameters<typeof intradayUpsertOhlc>[0];
    const out = await intradayUpsertOhlc(supabase, []);
    expect(out.count).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rpc 에러 → throw", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: new Error("rpc ohlc failed") });
    const supabase = { rpc } as unknown as Parameters<typeof intradayUpsertOhlc>[0];
    await expect(intradayUpsertOhlc(supabase, make(1))).rejects.toThrow(/rpc ohlc failed/);
  });
});
