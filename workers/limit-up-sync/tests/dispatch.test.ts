import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * quick-260817-f1a — limit-up-sync 0차 KRX 휴장일 가드 (직전일 기준).
 *
 * Scheduler cron `0 2 * * 2-6` (화~토 새벽 2시) → 대상 거래일은 "오늘"이 아니라 D-1.
 * 오늘 기준으로 판정하면 8/18(화) 02:00 실행이 8/17(휴장일) 오염 데이터를 그대로 rebuild 한다.
 */
function stubEnv() {
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "key";
}

describe("dispatch — KRX 휴장일 0차 가드 (직전일 기준)", () => {
  beforeEach(() => {
    stubEnv();
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("직전일이 휴장일(8/17) → runRebuild 미호출 + skipped", async () => {
    // 2026-08-18(화) 02:00 KST = 2026-08-17T17:00:00Z → D-1 = 2026-08-17 (광복절 대체공휴일)
    vi.setSystemTime(new Date("2026-08-17T17:00:00Z"));
    const runRebuild = vi.fn().mockResolvedValue({});
    vi.doMock("../src/rebuild", () => ({ runRebuild }));
    vi.doMock("../src/services/supabase", () => ({
      createSupabaseClient: vi.fn().mockReturnValue({}),
    }));

    const { dispatch } = await import("../src/index");
    const out = await dispatch();

    expect(runRebuild).not.toHaveBeenCalled();
    expect(out).toMatchObject({ skipped: true, reason: "krx_holiday", prevDateIso: "2026-08-17" });
  });

  it("직전일이 정상 거래일(8/18) → runRebuild 정상 호출", async () => {
    // 2026-08-19(수) 02:00 KST = 2026-08-18T17:00:00Z → D-1 = 2026-08-18 (정상 거래일)
    vi.setSystemTime(new Date("2026-08-18T17:00:00Z"));
    const runRebuild = vi.fn().mockResolvedValue({ event_rows: 10 });
    vi.doMock("../src/rebuild", () => ({ runRebuild }));
    vi.doMock("../src/services/supabase", () => ({
      createSupabaseClient: vi.fn().mockReturnValue({}),
    }));

    const { dispatch } = await import("../src/index");
    const out = await dispatch();

    expect(runRebuild).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ event_rows: 10 });
  });
});
