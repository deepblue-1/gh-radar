import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "../src/retry";
import { KisRateLimitError } from "../src/errors";

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

    const promise = withRetry(fn, "test");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(attempt).toBe(3);
  });

  it("MAX_RETRIES(5) 초과하면 최종 에러 throw", async () => {
    let attempt = 0;
    const fn = () => {
      attempt++;
      return Promise.reject(new Error("persistent"));
    };

    const promise = withRetry(fn, "test");
    const assertion = expect(promise).rejects.toThrow("persistent");
    await vi.runAllTimersAsync();
    await assertion;
    expect(attempt).toBe(5);
  });

  it("EGW00201 rate limit 은 재시도 후 성공 가능", async () => {
    let attempt = 0;
    const fn = () => {
      attempt++;
      if (attempt < 3) {
        // KIS API 형태 에러: response.data.msg_cd === "EGW00201"
        return Promise.reject({
          response: { data: { msg_cd: "EGW00201" } },
          message: "rate limited",
        });
      }
      return Promise.resolve("ok");
    };

    const promise = withRetry(fn, "test");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(attempt).toBe(3);
  });

  it("EGW00201 이 5회 모두 실패하면 KisRateLimitError throw", async () => {
    let attempt = 0;
    const fn = () => {
      attempt++;
      return Promise.reject({
        response: { data: { msg_cd: "EGW00201" } },
        message: "rate limited",
      });
    };

    const promise = withRetry(fn, "test");
    const assertion = expect(promise).rejects.toThrow(KisRateLimitError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(attempt).toBe(5);
  });
});
