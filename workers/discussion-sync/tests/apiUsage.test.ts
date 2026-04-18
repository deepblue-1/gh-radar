import { describe, it, expect, vi } from "vitest";
import { kstDateString, checkBudget, incrementUsage } from "../src/apiUsage";

describe("kstDateString", () => {
  it("UTC 15:00 → KST 다음날 (자정 경계)", () => {
    expect(kstDateString(new Date("2026-04-16T15:00:00Z"))).toBe("2026-04-17");
  });
  it("UTC 14:59 → KST 23:59 (당일)", () => {
    expect(kstDateString(new Date("2026-04-16T14:59:00Z"))).toBe("2026-04-16");
  });
});

describe("incrementUsage — service='proxy_naver_discussion'", () => {
  it("calls rpc('incr_api_usage') with proxy_naver_discussion label", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 42, error: null });
    const supa = { rpc } as never;
    const n = await incrementUsage(supa, "2026-04-17", 2);
    expect(n).toBe(42);
    expect(rpc).toHaveBeenCalledWith("incr_api_usage", {
      p_service: "proxy_naver_discussion",
      p_date: "2026-04-17",
      p_amount: 2,
    });
  });

  it("amount 기본값 1", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const supa = { rpc } as never;
    await incrementUsage(supa, "2026-04-17");
    expect(rpc.mock.calls[0][1].p_amount).toBe(1);
  });

  it("rpc error → throw", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("rpc fail") });
    const supa = { rpc } as never;
    await expect(incrementUsage(supa, "2026-04-17")).rejects.toThrow(/rpc fail/);
  });
});

describe("checkBudget", () => {
  it("returns 0 when no row", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const supa = { from: vi.fn().mockReturnValue(chain) } as never;
    expect(await checkBudget(supa, "2026-04-17")).toBe(0);
    expect(chain.eq).toHaveBeenCalledWith("service", "proxy_naver_discussion");
    expect(chain.eq).toHaveBeenCalledWith("usage_date", "2026-04-17");
  });

  it("returns count when row exists", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { count: 1234 }, error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const supa = { from: vi.fn().mockReturnValue(chain) } as never;
    expect(await checkBudget(supa, "2026-04-17")).toBe(1234);
  });
});
