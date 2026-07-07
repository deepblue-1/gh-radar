import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "../src/retry";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("성공 시 1회 호출 후 반환", async () => {
    const fn = vi.fn().mockResolvedValueOnce("ok");
    const p = withRetry(fn, "test");
    await vi.runAllTimersAsync();
    expect(await p).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("일반 에러는 200/400ms backoff 후 3회 시도", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("ok");
    const p = withRetry(fn, "test");
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(400);
    expect(await p).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("키움 429 에러는 1000/2000ms backoff (긴 회복 시간)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("키움 429 — rate limit"))
      .mockRejectedValueOnce(new Error("키움 429 — rate limit"))
      .mockResolvedValueOnce("ok");

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const p = withRetry(fn, "ka10027");
    await vi.runAllTimersAsync();
    expect(await p).toBe("ok");

    const waitMs = setTimeoutSpy.mock.calls.map((c) => c[1]);
    expect(waitMs).toContain(1000);
    expect(waitMs).toContain(2000);
    setTimeoutSpy.mockRestore();
  });

  it("키움 429 는 최대 5회 시도 (1s/2s/4s/8s backoff)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("키움 429 — rate limit"))
      .mockRejectedValueOnce(new Error("키움 429 — rate limit"))
      .mockRejectedValueOnce(new Error("키움 429 — rate limit"))
      .mockRejectedValueOnce(new Error("키움 429 — rate limit"))
      .mockResolvedValueOnce("ok");

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const p = withRetry(fn, "ka10027");
    await vi.runAllTimersAsync();
    expect(await p).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(5);

    const waitMs = setTimeoutSpy.mock.calls.map((c) => c[1]);
    expect(waitMs).toContain(1000);
    expect(waitMs).toContain(2000);
    expect(waitMs).toContain(4000);
    expect(waitMs).toContain(8000);
    setTimeoutSpy.mockRestore();
  });

  it("429 5회 모두 실패 시 마지막 에러 throw (6회 시도 없음)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("키움 429 — rate limit"));
    const p = withRetry(fn, "ka10027").catch((e) => (e as Error).message);
    await vi.runAllTimersAsync();
    expect(await p).toBe("키움 429 — rate limit");
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it("일반 에러 후 429 발생 시에도 5회까지 승격", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockRejectedValueOnce(new Error("transient"))
      .mockRejectedValueOnce(new Error("키움 429 — rate limit"))
      .mockRejectedValueOnce(new Error("키움 429 — rate limit"))
      .mockResolvedValueOnce("ok");
    const p = withRetry(fn, "ka10027");
    await vi.runAllTimersAsync();
    expect(await p).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it("3회 모두 실패 시 마지막 에러 throw", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("e1"))
      .mockRejectedValueOnce(new Error("e2"))
      .mockRejectedValueOnce(new Error("e3"));
    const p = withRetry(fn, "test").catch((e) => (e as Error).message);
    await vi.runAllTimersAsync();
    expect(await p).toBe("e3");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("rate-limit 키워드 만으로도 긴 backoff 적용 (case-insensitive 영문)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("hit rate limit upstream"))
      .mockResolvedValueOnce("ok");
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const p = withRetry(fn, "test");
    await vi.runAllTimersAsync();
    await p;
    expect(setTimeoutSpy.mock.calls.some((c) => c[1] === 1000)).toBe(true);
    setTimeoutSpy.mockRestore();
  });
});
