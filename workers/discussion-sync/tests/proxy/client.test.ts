import { describe, it, expect, vi } from "vitest";
import {
  createProxyClient,
  fetchViaProxy,
} from "../../src/proxy/client";
import {
  ProxyAuthError,
  ProxyBadRequestError,
  ProxyBudgetExhaustedError,
  NaverRateLimitError,
} from "../../src/proxy/errors";
import type { DiscussionSyncConfig } from "../../src/config";

const BASE_CFG: DiscussionSyncConfig = {
  supabaseUrl: "https://x.supabase.co",
  supabaseServiceRoleKey: "sk",
  brightdataApiKey: "PKEY",
  brightdataZone: "gh_radar_naver",
  brightdataUrl: "https://api.brightdata.com/request",
  naverDiscussionApiBase:
    "https://stock.naver.com/api/community/discussion/posts/by-item",
  discussionSyncDailyBudget: 5000,
  discussionSyncConcurrency: 8,
  discussionSyncPageSize: 50,
  appVersion: "test",
  logLevel: "info",
};

describe("createProxyClient (T-09 HTTPS enforcement)", () => {
  it("throws when baseURL is not https", () => {
    expect(() =>
      createProxyClient({ ...BASE_CFG, brightdataUrl: "http://x" }),
    ).toThrow(/must be https/);
  });

  it("accepts https baseURL with timeout + Authorization", () => {
    const c = createProxyClient(BASE_CFG);
    expect(c.defaults.baseURL).toBe("https://api.brightdata.com/request");
    expect(c.defaults.timeout).toBe(30_000);
    // Authorization 헤더에 Bearer token 주입
    const headers = c.defaults.headers as Record<string, unknown> & {
      Authorization?: string;
    };
    expect(headers.Authorization).toBe("Bearer PKEY");
  });
});

describe("fetchViaProxy (Bright Data Web Unlocker)", () => {
  it("posts { zone, url, format: 'raw', country: 'kr' }", async () => {
    const post = vi.fn().mockResolvedValue({ data: '{"posts":[]}' });
    const client = { post } as unknown as import("axios").AxiosInstance;
    const out = await fetchViaProxy(
      client,
      BASE_CFG,
      "https://stock.naver.com/api/community/discussion/posts/by-item?itemCode=005930",
    );
    expect(out).toBe('{"posts":[]}');
    expect(post).toHaveBeenCalledWith(
      "",
      expect.objectContaining({
        zone: "gh_radar_naver",
        url: "https://stock.naver.com/api/community/discussion/posts/by-item?itemCode=005930",
        format: "raw",
        country: "kr",
      }),
      expect.objectContaining({ responseType: "text" }),
    );
  });

  it("maps 401 → ProxyAuthError", async () => {
    const err = Object.assign(new Error("x"), { response: { status: 401 } });
    const client = {
      post: vi.fn().mockRejectedValue(err),
    } as unknown as import("axios").AxiosInstance;
    await expect(fetchViaProxy(client, BASE_CFG, "https://x")).rejects.toBeInstanceOf(
      ProxyAuthError,
    );
  });

  it("maps 402 → ProxyBudgetExhaustedError", async () => {
    const err = Object.assign(new Error("x"), { response: { status: 402 } });
    const client = {
      post: vi.fn().mockRejectedValue(err),
    } as unknown as import("axios").AxiosInstance;
    await expect(fetchViaProxy(client, BASE_CFG, "https://x")).rejects.toBeInstanceOf(
      ProxyBudgetExhaustedError,
    );
  });

  it("maps 400 → ProxyBadRequestError", async () => {
    const err = Object.assign(new Error("x"), { response: { status: 400 } });
    const client = {
      post: vi.fn().mockRejectedValue(err),
    } as unknown as import("axios").AxiosInstance;
    await expect(fetchViaProxy(client, BASE_CFG, "https://x")).rejects.toBeInstanceOf(
      ProxyBadRequestError,
    );
  });

  it("maps 403 → ProxyBadRequestError", async () => {
    const err = Object.assign(new Error("x"), { response: { status: 403 } });
    const client = {
      post: vi.fn().mockRejectedValue(err),
    } as unknown as import("axios").AxiosInstance;
    await expect(fetchViaProxy(client, BASE_CFG, "https://x")).rejects.toBeInstanceOf(
      ProxyBadRequestError,
    );
  });

  it("retries 429 once then NaverRateLimitError", async () => {
    const err = Object.assign(new Error("x"), { response: { status: 429 } });
    const post = vi.fn().mockRejectedValue(err);
    const client = { post } as unknown as import("axios").AxiosInstance;
    await expect(fetchViaProxy(client, BASE_CFG, "https://x")).rejects.toBeInstanceOf(
      NaverRateLimitError,
    );
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("retries 503 once then NaverRateLimitError", async () => {
    const err = Object.assign(new Error("x"), { response: { status: 503 } });
    const post = vi.fn().mockRejectedValue(err);
    const client = { post } as unknown as import("axios").AxiosInstance;
    await expect(fetchViaProxy(client, BASE_CFG, "https://x")).rejects.toBeInstanceOf(
      NaverRateLimitError,
    );
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("recovers on second attempt when first is transient", async () => {
    const err = Object.assign(new Error("x"), { response: { status: 504 } });
    const post = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ data: "OK" });
    const client = { post } as unknown as import("axios").AxiosInstance;
    const out = await fetchViaProxy(client, BASE_CFG, "https://x");
    expect(out).toBe("OK");
    expect(post).toHaveBeenCalledTimes(2);
  });
});
