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

describe("runRebuild (limit-up-sync 단일 cycle)", () => {
  it("rpc 성공 시 jsonb 결과 반환 + 'rebuild_limit_up complete' 로깅", async () => {
    const result = { event_rows: 320, stock_stat_rows: 180, theme_stat_rows: 64 };
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const log = makeLog();

    const out = await runRebuild({ supabase, log, lookbackMonths: 24 });

    expect(rpc).toHaveBeenCalledWith("rebuild_limit_up", { p_lookback_months: 24 });
    expect(out).toEqual(result);
    expect(out.event_rows).toBe(320);
    // 결과 로깅 메시지 확인
    const infoCalls = (log.info as ReturnType<typeof vi.fn>).mock.calls;
    expect(infoCalls.some((c) => c[1] === "rebuild_limit_up complete")).toBe(true);
  });

  it("rpc 가 null data 반환 시 빈 객체 반환", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;

    const out = await runRebuild({ supabase, log: makeLog(), lookbackMonths: 12 });

    expect(rpc).toHaveBeenCalledWith("rebuild_limit_up", { p_lookback_months: 12 });
    expect(out).toEqual({});
  });

  it("rpc error 반환 시 throw (rebuild_limit_up failed)", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "statement timeout" } });
    const supabase = { rpc } as unknown as SupabaseClient;

    await expect(
      runRebuild({ supabase, log: makeLog(), lookbackMonths: 24 }),
    ).rejects.toThrow(/rebuild_limit_up failed: statement timeout/);
  });
});
