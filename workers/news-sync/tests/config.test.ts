import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig (Phase 07.2)", () => {
  let snapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    snapshot = { ...process.env };
    // 필수 env 기본 세팅
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.NAVER_CLIENT_ID = "cid";
    process.env.NAVER_CLIENT_SECRET = "csecret";
  });

  afterEach(() => {
    process.env = snapshot;
  });

  it("NEWS_SYNC_CONCURRENCY env 미지정 → 기본 3 (Phase 07.2 회귀)", () => {
    delete process.env.NEWS_SYNC_CONCURRENCY;
    const cfg = loadConfig();
    expect(cfg.newsSyncConcurrency).toBe(3);
  });

  it("NEWS_SYNC_CONCURRENCY=10 env override", () => {
    process.env.NEWS_SYNC_CONCURRENCY = "10";
    const cfg = loadConfig();
    expect(cfg.newsSyncConcurrency).toBe(10);
  });

  it("필수 env 누락 시 throw (NAVER_CLIENT_SECRET)", () => {
    delete process.env.NAVER_CLIENT_SECRET;
    expect(() => loadConfig()).toThrow(/NAVER_CLIENT_SECRET/);
  });

  it("naverDailyBudget default = 24500", () => {
    delete process.env.NEWS_SYNC_DAILY_BUDGET;
    const cfg = loadConfig();
    expect(cfg.naverDailyBudget).toBe(24500);
  });
});
