import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config";

/**
 * Phase 41-06 — env 계약(41-02 배포 스크립트와 같은 이름).
 * D-01 · 공식 API 운영 기준 ①: 초당 상한은 공식 20건의 75% 이하(1 ~ 15 · 기본 5).
 */
const OPTIONAL_KEYS = [
  "KIS_BASE_URL",
  "KIS_NEWS_MAX_RPS",
  "KIS_NEWS_DAILY_BUDGET",
  "KIS_NEWS_MODE",
  "KIS_NEWS_TARGET_CAP",
  "LOG_LEVEL",
  "APP_VERSION",
];

describe("loadConfig (41-06 env 계약)", () => {
  let snapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    snapshot = { ...process.env };
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-role-VALUE-123";
    process.env.KIS_APPKEY = "appkey-VALUE-456";
    process.env.KIS_APPSECRET = "appsecret-VALUE-789";
    for (const k of OPTIONAL_KEYS) delete process.env[k];
  });

  afterEach(() => {
    process.env = snapshot;
  });

  it("필수 넷만 있으면 기본값으로 채운다", () => {
    const cfg = loadConfig();
    expect(cfg).toEqual({
      supabaseUrl: "https://x.supabase.co",
      supabaseServiceRoleKey: "svc-role-VALUE-123",
      kisAppKey: "appkey-VALUE-456",
      kisAppSecret: "appsecret-VALUE-789",
      kisBaseUrl: "https://openapi.koreainvestment.com:9443",
      maxRps: 5,
      dailyBudget: 200000,
      mode: "auto",
      targetCap: 450,
      logLevel: "info",
      appVersion: "dev",
    });
  });

  it("KIS_APPSECRET 이 없으면 이름만 담은 오류 — 다른 비밀 값은 메시지에 없다", () => {
    delete process.env.KIS_APPSECRET;
    let message = "";
    try {
      loadConfig();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("KIS_APPSECRET");
    expect(message).not.toContain("appkey-VALUE-456");
    expect(message).not.toContain("svc-role-VALUE-123");
  });

  it.each(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "KIS_APPKEY"])(
    "필수 %s 가 비어 있으면 그 이름으로 멈춘다",
    (key) => {
      process.env[key] = "";
      expect(() => loadConfig()).toThrow(new RegExp(key));
    },
  );

  it("KIS_NEWS_MAX_RPS=15 → 15 (상한 경계)", () => {
    process.env.KIS_NEWS_MAX_RPS = "15";
    expect(loadConfig().maxRps).toBe(15);
  });

  it.each(["16", "0", "abc", "2.5", "-1"])("KIS_NEWS_MAX_RPS=%s → 시작하지 않는다", (v) => {
    process.env.KIS_NEWS_MAX_RPS = v;
    expect(() => loadConfig()).toThrow(/KIS_NEWS_MAX_RPS/);
  });

  it("KIS_NEWS_MODE=probe → probe", () => {
    process.env.KIS_NEWS_MODE = "probe";
    expect(loadConfig().mode).toBe("probe");
  });

  it.each(["fast", "slow", "auto"])("KIS_NEWS_MODE=%s 를 받는다", (v) => {
    process.env.KIS_NEWS_MODE = v;
    expect(loadConfig().mode).toBe(v);
  });

  it("KIS_NEWS_MODE=turbo → 오류", () => {
    process.env.KIS_NEWS_MODE = "turbo";
    expect(() => loadConfig()).toThrow(/KIS_NEWS_MODE/);
  });

  it.each(["0", "-5", "abc"])("KIS_NEWS_DAILY_BUDGET=%s → 오류", (v) => {
    process.env.KIS_NEWS_DAILY_BUDGET = v;
    expect(() => loadConfig()).toThrow(/KIS_NEWS_DAILY_BUDGET/);
  });

  it("KIS_NEWS_DAILY_BUDGET · KIS_NEWS_TARGET_CAP · KIS_BASE_URL 덮어쓰기", () => {
    process.env.KIS_NEWS_DAILY_BUDGET = "120000";
    process.env.KIS_NEWS_TARGET_CAP = "300";
    process.env.KIS_BASE_URL = "https://openapivts.koreainvestment.com:29443";
    const cfg = loadConfig();
    expect(cfg.dailyBudget).toBe(120000);
    expect(cfg.targetCap).toBe(300);
    expect(cfg.kisBaseUrl).toBe("https://openapivts.koreainvestment.com:29443");
  });

  it("KIS_NEWS_TARGET_CAP=0 → 오류", () => {
    process.env.KIS_NEWS_TARGET_CAP = "0";
    expect(() => loadConfig()).toThrow(/KIS_NEWS_TARGET_CAP/);
  });
});
