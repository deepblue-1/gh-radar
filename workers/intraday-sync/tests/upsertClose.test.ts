import { describe, it, expect, vi } from "vitest";
import { intradayUpsertClose } from "../src/pipeline/upsertClose";
import type { IntradayCloseUpdate } from "@gh-radar/shared";

function make(n: number): IntradayCloseUpdate[] {
  return Array.from({ length: n }, (_, i) => ({
    code: String(i + 1).padStart(6, "0"),
    date: "2026-05-14",
    price: 1000 + i,
    changeAmount: 0,
    changeRate: 0,
    volume: 0,
    tradeAmount: 0,
  }));
}

describe("intradayUpsertClose", () => {
  it("빈 입력 → count 0, RPC 미호출", async () => {
    const rpc = vi.fn();
    const supabase = { rpc } as unknown as Parameters<typeof intradayUpsertClose>[0];
    const out = await intradayUpsertClose(supabase, []);
    expect(out.count).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("100 row → 단일 chunk", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 100, error: null });
    const supabase = { rpc } as unknown as Parameters<typeof intradayUpsertClose>[0];
    const out = await intradayUpsertClose(supabase, make(100));
    expect(out.count).toBe(100);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "intraday_upsert_close",
      expect.objectContaining({ p_rows: expect.any(Array) }),
    );
  });

  it("2500 row → 3 chunk (1000 + 1000 + 500)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1000, error: null });
    const supabase = { rpc } as unknown as Parameters<typeof intradayUpsertClose>[0];
    const out = await intradayUpsertClose(supabase, make(2500));
    expect(out.count).toBe(2500);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("payload 가 close=price + open/high/low 미포함 (RPC #1 의 INSERT branch 가 close 만으로 임시 set)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const supabase = { rpc } as unknown as Parameters<typeof intradayUpsertClose>[0];
    await intradayUpsertClose(supabase, make(1));
    const callArgs = rpc.mock.calls[0][1] as { p_rows: Array<Record<string, unknown>> };
    expect(callArgs.p_rows[0]).toEqual(
      expect.objectContaining({
        code: "000001",
        date: "2026-05-14",
        close: 1000,
      }),
    );
    expect(callArgs.p_rows[0].open).toBeUndefined();
    expect(callArgs.p_rows[0].high).toBeUndefined();
  });

  it("rpc 에러 → throw", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: new Error("rpc failed") });
    const supabase = { rpc } as unknown as Parameters<typeof intradayUpsertClose>[0];
    await expect(intradayUpsertClose(supabase, make(1))).rejects.toThrow(/rpc failed/);
  });
});
