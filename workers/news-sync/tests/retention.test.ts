import { describe, it, expect, vi } from "vitest";
import { runRetention } from "../src/retention";

describe("runRetention — V-11 90일 DELETE", () => {
  it("from('news_articles').delete({count:'exact'}).lt('created_at', <iso>)", async () => {
    const ltSpy = vi.fn().mockResolvedValue({ count: 42, error: null });
    const deleteSpy = vi.fn().mockReturnValue({ lt: ltSpy });
    const from = vi.fn().mockReturnValue({ delete: deleteSpy });
    const supa = { from } as any;

    const deleted = await runRetention(supa, 90);
    expect(from).toHaveBeenCalledWith("news_articles");
    expect(deleteSpy).toHaveBeenCalledWith({ count: "exact" });
    expect(ltSpy).toHaveBeenCalledTimes(1);
    const [col, iso] = ltSpy.mock.calls[0];
    expect(col).toBe("created_at");
    expect(typeof iso).toBe("string");
    expect(new Date(iso as string).toString()).not.toBe("Invalid Date");
    expect(deleted).toBe(42);
  });

  it("threshold 는 대략 now - 90일 (±1 day 여유)", async () => {
    const ltSpy = vi.fn().mockResolvedValue({ count: 0, error: null });
    const deleteSpy = vi.fn().mockReturnValue({ lt: ltSpy });
    const from = vi.fn().mockReturnValue({ delete: deleteSpy });
    const supa = { from } as any;

    const before = Date.now();
    await runRetention(supa, 90);
    const after = Date.now();

    const [, iso] = ltSpy.mock.calls[0];
    const threshold = new Date(iso as string).getTime();
    const expectedLow = before - 90 * 86_400_000 - 1000;
    const expectedHigh = after - 90 * 86_400_000 + 1000;
    expect(threshold).toBeGreaterThanOrEqual(expectedLow);
    expect(threshold).toBeLessThanOrEqual(expectedHigh);
  });

  it("days=7 호출 → 7일 임계값", async () => {
    const ltSpy = vi.fn().mockResolvedValue({ count: 3, error: null });
    const deleteSpy = vi.fn().mockReturnValue({ lt: ltSpy });
    const from = vi.fn().mockReturnValue({ delete: deleteSpy });
    const supa = { from } as any;
    await runRetention(supa, 7);
    const [, iso] = ltSpy.mock.calls[0];
    const threshold = new Date(iso as string).getTime();
    expect(Date.now() - threshold).toBeGreaterThan(6 * 86_400_000);
    expect(Date.now() - threshold).toBeLessThan(8 * 86_400_000);
  });

  it("error 면 throw, count=null 이면 0 반환", async () => {
    // error case
    const ltErr = vi
      .fn()
      .mockResolvedValue({ count: null, error: new Error("denied") });
    const deleteSpy1 = vi.fn().mockReturnValue({ lt: ltErr });
    const supa1 = { from: vi.fn().mockReturnValue({ delete: deleteSpy1 }) } as any;
    await expect(runRetention(supa1, 90)).rejects.toThrow(/denied/);

    // null count case
    const ltNull = vi.fn().mockResolvedValue({ count: null, error: null });
    const deleteSpy2 = vi.fn().mockReturnValue({ lt: ltNull });
    const supa2 = { from: vi.fn().mockReturnValue({ delete: deleteSpy2 }) } as any;
    expect(await runRetention(supa2, 90)).toBe(0);
  });
});
