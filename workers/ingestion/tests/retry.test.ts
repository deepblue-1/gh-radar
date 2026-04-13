import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../src/retry";
import { KisRateLimitError } from "../src/errors";

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe("withRetry", () => {
  it("성공하면 바로 반환", async () => {
    const result = await withRetry(() => Promise.resolve(42), "test");
    expect(result).toBe(42);
  });

  it("일시 에러 후 재시도 성공", async () => {
    let attempt = 0;
    const fn = () => {
      attempt++;
      if (attempt < 3) throw new Error("transient");
      return Promise.resolve("ok");
    };

    const result = await withRetry(fn, "test");
    expect(result).toBe("ok");
    expect(attempt).toBe(3);
  });

  it("3회 실패 시 최종 에러 throw", async () => {
    const fn = () => Promise.reject(new Error("persistent"));

    await expect(withRetry(fn, "test")).rejects.toThrow("persistent");
  });

  it("EGW00201 rate limit 에러는 재시도 없이 즉시 throw", async () => {
    const rateLimitErr = {
      response: { data: { msg_cd: "EGW00201" } },
    };
    const fn = () => Promise.reject(rateLimitErr);

    await expect(withRetry(fn, "test")).rejects.toThrow(KisRateLimitError);
  });
});
