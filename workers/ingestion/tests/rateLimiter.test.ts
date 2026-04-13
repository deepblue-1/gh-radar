import { describe, it, expect, beforeEach } from "vitest";
import { waitForSlot, resetRateLimiter } from "../src/kis/rateLimiter";

describe("rateLimiter", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it("15개 슬롯은 즉시 통과", async () => {
    const start = Date.now();
    for (let i = 0; i < 15; i++) {
      await waitForSlot();
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("16번째 슬롯은 대기 발생", async () => {
    for (let i = 0; i < 15; i++) {
      await waitForSlot();
    }
    const start = Date.now();
    await waitForSlot();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(30);
  });
});
