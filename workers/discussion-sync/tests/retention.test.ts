import { describe, it, expect, vi } from "vitest";
import { runRetention } from "../src/retention";

describe("runRetention — discussions 90일 (scraped_at 기준)", () => {
  it("DELETE WHERE scraped_at < threshold (created_at 아님)", async () => {
    const lt = vi.fn().mockResolvedValue({ count: 5, error: null });
    const del = vi.fn().mockReturnValue({ lt });
    const sb = { from: vi.fn().mockReturnValue({ delete: del }) } as never;
    const deleted = await runRetention(sb, 90);
    expect(deleted).toBe(5);
    expect((sb as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith(
      "discussions",
    );
    expect(del).toHaveBeenCalledWith({ count: "exact" });
    const [col, iso] = lt.mock.calls[0];
    expect(col).toBe("scraped_at");
    expect(typeof iso).toBe("string");
    expect(new Date(iso as string).toString()).not.toBe("Invalid Date");
  });

  it("threshold ≈ now - 90일 (±1초 여유)", async () => {
    const lt = vi.fn().mockResolvedValue({ count: 0, error: null });
    const del = vi.fn().mockReturnValue({ lt });
    const sb = { from: vi.fn().mockReturnValue({ delete: del }) } as never;
    const before = Date.now();
    await runRetention(sb, 90);
    const after = Date.now();
    const [, iso] = lt.mock.calls[0];
    const t = new Date(iso as string).getTime();
    expect(t).toBeGreaterThanOrEqual(before - 90 * 86_400_000 - 1000);
    expect(t).toBeLessThanOrEqual(after - 90 * 86_400_000 + 1000);
  });

  it("count=null → 0 반환", async () => {
    const lt = vi.fn().mockResolvedValue({ count: null, error: null });
    const del = vi.fn().mockReturnValue({ lt });
    const sb = { from: vi.fn().mockReturnValue({ delete: del }) } as never;
    expect(await runRetention(sb, 90)).toBe(0);
  });

  it("error → throw", async () => {
    const lt = vi.fn().mockResolvedValue({ count: null, error: new Error("denied") });
    const del = vi.fn().mockReturnValue({ lt });
    const sb = { from: vi.fn().mockReturnValue({ delete: del }) } as never;
    await expect(runRetention(sb, 90)).rejects.toThrow(/denied/);
  });
});
