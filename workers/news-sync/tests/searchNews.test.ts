import { describe, it, expect, vi } from "vitest";
import {
  searchNews,
  NaverAuthError,
  NaverBudgetExhaustedError,
  NaverRateLimitError,
  NaverBadRequestError,
  NAVER_MAX_DISPLAY,
} from "../src/naver/searchNews";

// axios-compatible mock client
type AnyFn = (...a: unknown[]) => unknown;
function mkClient(getImpl: AnyFn) {
  return { get: vi.fn(getImpl) } as unknown as Parameters<typeof searchNews>[0];
}

describe("searchNews — error mapping", () => {
  it("401 → NaverAuthError", async () => {
    const err = Object.assign(new Error("unauth"), { response: { status: 401 } });
    const client = mkClient(() => Promise.reject(err));
    await expect(searchNews(client, "query")).rejects.toBeInstanceOf(
      NaverAuthError,
    );
  });

  it("429 → NaverRateLimitError throw (Phase 07.2 회귀)", async () => {
    const err = Object.assign(new Error("rate"), { response: { status: 429 } });
    const client = mkClient(() => Promise.reject(err));
    await expect(searchNews(client, "query")).rejects.toBeInstanceOf(
      NaverRateLimitError,
    );
  });

  it("429 → NaverBudgetExhaustedError 로는 throw 되지 않음 (Phase 07.2 명시적 회귀)", async () => {
    const err = Object.assign(new Error("rate"), { response: { status: 429 } });
    const client = mkClient(() => Promise.reject(err));
    await expect(searchNews(client, "query")).rejects.not.toBeInstanceOf(
      NaverBudgetExhaustedError,
    );
  });

  it("400 → NaverBadRequestError (에러 메시지 포함)", async () => {
    const err = Object.assign(new Error("bad"), {
      response: { status: 400, data: { errorMessage: "invalid query" } },
    });
    const client = mkClient(() => Promise.reject(err));
    await expect(searchNews(client, "query")).rejects.toThrow(/invalid query/);
  });

  it("403 → NaverBadRequestError", async () => {
    const err = Object.assign(new Error("forbidden"), { response: { status: 403, data: {} } });
    const client = mkClient(() => Promise.reject(err));
    await expect(searchNews(client, "query")).rejects.toBeInstanceOf(
      NaverBadRequestError,
    );
  });
});

describe("searchNews — 정상 동작", () => {
  it("200 응답 → items 배열 반환", async () => {
    const client = mkClient(() =>
      Promise.resolve({
        data: {
          items: [
            {
              title: "T",
              originallink: "https://x",
              link: "https://y",
              description: "D",
              pubDate: "Fri, 17 Apr 2026 00:00:00 +0900",
            },
          ],
        },
      }),
    );
    const items = await searchNews(client, "q");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("T");
  });

  it("items 필드 없으면 빈 배열", async () => {
    const client = mkClient(() => Promise.resolve({ data: {} }));
    const items = await searchNews(client, "q");
    expect(items).toEqual([]);
  });
});

describe("searchNews — R7 params (V-21)", () => {
  it("기본값: display=100, start=1, sort=date", async () => {
    const getSpy = vi.fn().mockResolvedValue({ data: { items: [] } });
    const client = { get: getSpy } as unknown as Parameters<typeof searchNews>[0];
    await searchNews(client, "삼성전자");
    expect(getSpy).toHaveBeenCalledWith(
      "/v1/search/news.json",
      expect.objectContaining({
        params: {
          query: "삼성전자",
          display: NAVER_MAX_DISPLAY,
          sort: "date",
          start: 1,
        },
      }),
    );
  });

  it("옵션: { start: 101, display: 100 } 이 params 에 그대로 전달", async () => {
    const getSpy = vi.fn().mockResolvedValue({ data: { items: [] } });
    const client = { get: getSpy } as unknown as Parameters<typeof searchNews>[0];
    await searchNews(client, "q", { start: 101, display: 100 });
    expect(getSpy).toHaveBeenCalledWith(
      "/v1/search/news.json",
      expect.objectContaining({
        params: { query: "q", display: 100, sort: "date", start: 101 },
      }),
    );
  });

  it("5xx → 1회 재시도 후 성공하면 items 반환", async () => {
    const err500 = Object.assign(new Error("server"), {
      response: { status: 500 },
    });
    let calls = 0;
    const getSpy = vi.fn(() => {
      calls++;
      if (calls === 1) return Promise.reject(err500);
      return Promise.resolve({
        data: { items: [{ title: "ok", originallink: "", link: "", description: "", pubDate: "" }] },
      });
    });
    const client = { get: getSpy } as unknown as Parameters<typeof searchNews>[0];
    const items = await searchNews(client, "q");
    expect(items).toHaveLength(1);
    expect(getSpy).toHaveBeenCalledTimes(2);
  });
});
