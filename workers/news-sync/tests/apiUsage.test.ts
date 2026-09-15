import { describe, it, expect, vi } from "vitest";
import {
  kstDateString,
  checkBudget,
  incrementUsage,
  readQuotaStrikes,
  recordQuotaStrike,
  QUOTA_STRIKE_SERVICE,
  QUOTA_STRIKES_TO_STOP_DAY,
} from "../src/apiUsage";

describe("quota strike 마커 (quick-260915-h3p)", () => {
  it("상수", () => {
    expect(QUOTA_STRIKE_SERVICE).toBe("naver_search_news_quota_strike");
    expect(QUOTA_STRIKES_TO_STOP_DAY).toBe(2);
  });

  it("recordQuotaStrike → incr_api_usage(strike service, amount 1)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const n = await recordQuotaStrike({ rpc } as any, "2026-09-15");
    expect(rpc).toHaveBeenCalledWith("incr_api_usage", {
      p_service: "naver_search_news_quota_strike",
      p_date: "2026-09-15",
      p_amount: 1,
    });
    expect(n).toBe(1);
  });

  it("readQuotaStrikes → service eq strike service", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { count: 2 }, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) } as any;
    expect(await readQuotaStrikes(supabase, "2026-09-15")).toBe(2);
    expect(chain.eq).toHaveBeenCalledWith("service", "naver_search_news_quota_strike");
    expect(chain.eq).not.toHaveBeenCalledWith("service", "naver_search_news");
    expect(chain.eq).toHaveBeenCalledWith("usage_date", "2026-09-15");
  });
});

describe("kstDateString (V-02)", () => {
  it("UTC 15:00 → KST 다음날 00:00 → 다음날짜 반환", () => {
    expect(kstDateString(new Date("2026-04-16T15:00:00Z"))).toBe("2026-04-17");
  });

  it("UTC 14:59 → KST 23:59 → 당일", () => {
    expect(kstDateString(new Date("2026-04-16T14:59:00Z"))).toBe("2026-04-16");
  });

  it("UTC 00:00 → KST 09:00 → 당일", () => {
    expect(kstDateString(new Date("2026-04-17T00:00:00Z"))).toBe("2026-04-17");
  });
});

describe("checkBudget", () => {
  it("row 없을 때 0 반환", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) } as any;
    const n = await checkBudget(supabase, "2026-04-17");
    expect(n).toBe(0);
    expect(supabase.from).toHaveBeenCalledWith("api_usage");
    expect(chain.eq).toHaveBeenCalledWith("service", "naver_search_news");
    expect(chain.eq).toHaveBeenCalledWith("usage_date", "2026-04-17");
  });

  it("row 존재 시 count 반환", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { count: 1234 }, error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) } as any;
    expect(await checkBudget(supabase, "2026-04-17")).toBe(1234);
  });

  it("error 면 throw", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: null, error: new Error("denied") }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) } as any;
    await expect(checkBudget(supabase, "2026-04-17")).rejects.toThrow(/denied/);
  });
});

describe("incrementUsage (V-09)", () => {
  it("rpc('incr_api_usage', { p_service, p_date, p_amount }) 호출", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 42, error: null });
    const supabase = { rpc } as any;
    const n = await incrementUsage(supabase, "2026-04-17", 3);
    expect(rpc).toHaveBeenCalledWith("incr_api_usage", {
      p_service: "naver_search_news",
      p_date: "2026-04-17",
      p_amount: 3,
    });
    expect(n).toBe(42);
  });

  it("amount 기본값 1", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const supabase = { rpc } as any;
    await incrementUsage(supabase, "2026-04-17");
    expect(rpc.mock.calls[0][1].p_amount).toBe(1);
  });

  it("rpc error → throw", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("rpc fail") });
    const supabase = { rpc } as any;
    await expect(incrementUsage(supabase, "2026-04-17")).rejects.toThrow(
      /rpc fail/,
    );
  });
});
