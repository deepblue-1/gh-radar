import { describe, it, expect } from "vitest";
import { createNaverClient } from "../src/naver/client";
import type { NewsSyncConfig } from "../src/config";

const mkCfg = (over: Partial<NewsSyncConfig> = {}): NewsSyncConfig => ({
  supabaseUrl: "https://x.supabase.co",
  supabaseServiceRoleKey: "svc",
  naverClientId: "cid",
  naverClientSecret: "csecret",
  naverBaseUrl: "https://openapi.naver.com",
  naverDailyBudget: 24500,
  newsSyncConcurrency: 8,
  appVersion: "test",
  logLevel: "info",
  ...over,
});

describe("createNaverClient", () => {
  it("X-Naver-Client-Id / X-Naver-Client-Secret 헤더 주입 (V-08)", () => {
    const c = createNaverClient(mkCfg());
    expect(c.defaults.headers["X-Naver-Client-Id"]).toBe("cid");
    expect(c.defaults.headers["X-Naver-Client-Secret"]).toBe("csecret");
  });

  it("baseURL + timeout 기본값", () => {
    const c = createNaverClient(mkCfg());
    expect(c.defaults.baseURL).toBe("https://openapi.naver.com");
    expect(c.defaults.timeout).toBe(15_000);
  });

  it("User-Agent 에 appVersion 반영", () => {
    const c = createNaverClient(mkCfg({ appVersion: "1.2.3" }));
    expect(String(c.defaults.headers["User-Agent"])).toContain("1.2.3");
  });

  it("http:// baseURL 이면 throw (T-09 MITM 방지)", () => {
    expect(() =>
      createNaverClient(mkCfg({ naverBaseUrl: "http://insecure.example.com" })),
    ).toThrow(/https/);
  });

  it("빈 문자열 baseURL 도 throw", () => {
    expect(() =>
      createNaverClient(mkCfg({ naverBaseUrl: "" })),
    ).toThrow(/https/);
  });
});
