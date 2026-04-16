import { describe, it, expect, beforeEach } from "vitest";
import { waitForSlot, resetRateLimiter } from "../../src/kis/rateLimiter.js";

describe("server rate limiter (5 req/sec, 별도 버킷)", () => {
  beforeEach(() => resetRateLimiter());

  it("5번 호출은 1초 미만 (버킷 가득)", async () => {
    const start = Date.now();
    for (let i = 0; i < 5; i++) await waitForSlot();
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("6번째 호출은 ~200ms 대기 (1/5 sec)", async () => {
    for (let i = 0; i < 5; i++) await waitForSlot();
    const start = Date.now();
    await waitForSlot();
    expect(Date.now() - start).toBeGreaterThan(150);
  });
});
