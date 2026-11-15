import { describe, expect, it, vi } from "vitest";
import { SUPABASE_FETCH_TIMEOUT_MS, fetchWithTimeout } from "../src/services/supabase";

/**
 * IN-04 — Supabase 호출 상한 시간. 매달린 DB 호출이 임대 TTL(90초)을 넘기지 않게 끊는다.
 */

/** signal 이 끊길 때까지 매달리는 가짜 fetch */
function hangingFetch() {
  return vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")), {
          once: true,
        });
      }),
  );
}

describe("fetchWithTimeout", () => {
  it("상한(30초)은 임대 연장 주기와 같고 임대 TTL 90초보다 짧다", () => {
    expect(SUPABASE_FETCH_TIMEOUT_MS).toBe(30_000);
  });

  it("상한 시간이 지나면 매달린 요청을 끊는다(TimeoutError)", async () => {
    const base = hangingFetch();
    const f = fetchWithTimeout(20, base as unknown as typeof fetch);
    const err = await f("https://example.invalid/rest/v1/rpc/x", { method: "POST" }).catch((e) => e);
    expect((err as Error).name).toBe("TimeoutError");
    expect(base).toHaveBeenCalledTimes(1);
    // 호출부 옵션은 그대로 넘긴다
    expect(base.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("호출부 signal 이 먼저 끊기면 그쪽으로 끊긴다", async () => {
    const base = hangingFetch();
    const f = fetchWithTimeout(10_000, base as unknown as typeof fetch);
    const ac = new AbortController();
    const p = f("https://example.invalid/", { signal: ac.signal }).catch((e) => e);
    ac.abort(new Error("caller abort"));
    expect(((await p) as Error).message).toBe("caller abort");
  });

  it("제때 오면 응답을 그대로 돌려준다", async () => {
    const res = new Response("ok");
    const base = vi.fn(async () => res);
    const f = fetchWithTimeout(1_000, base as unknown as typeof fetch);
    await expect(f("https://example.invalid/")).resolves.toBe(res);
  });
});
