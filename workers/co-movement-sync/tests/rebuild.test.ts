import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "pino";
import { runRebuild } from "../src/rebuild";

function makeLog(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
}

describe("runRebuild (co-movement-sync 단일 cycle)", () => {
  it("rpc 성공 시 jsonb 결과 반환 + 'rebuild_comovement complete' 로깅", async () => {
    const result = { theme_comovement_rows: 7500, cosurge_edge_rows: 12000 };
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const log = makeLog();

    const out = await runRebuild({ supabase, log, lookbackMonths: 24 });

    expect(rpc).toHaveBeenCalledWith("rebuild_comovement", { p_lookback_months: 24 });
    expect(out).toEqual(result);
    expect(out.cosurge_edge_rows).toBe(12000);
    // 결과 로깅 메시지 확인
    const infoCalls = (log.info as ReturnType<typeof vi.fn>).mock.calls;
    expect(infoCalls.some((c) => c[1] === "rebuild_comovement complete")).toBe(true);
  });

  it("rpc 가 null data 반환 시 빈 객체 반환", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;

    const out = await runRebuild({ supabase, log: makeLog(), lookbackMonths: 12 });

    expect(rpc).toHaveBeenCalledWith("rebuild_comovement", { p_lookback_months: 12 });
    expect(out).toEqual({});
  });

  it("rpc error 반환 시 throw (rebuild_comovement failed)", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "statement timeout" } });
    const supabase = { rpc } as unknown as SupabaseClient;

    await expect(
      runRebuild({ supabase, log: makeLog(), lookbackMonths: 24 }),
    ).rejects.toThrow(/rebuild_comovement failed: statement timeout/);
  });
});
