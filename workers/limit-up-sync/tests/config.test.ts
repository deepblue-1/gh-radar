import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config";

const ORIG = { ...process.env };

describe("loadConfig (limit-up-sync)", () => {
  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.LOOKBACK_MONTHS;
  });
  afterEach(() => {
    process.env = { ...ORIG };
  });

  it("SUPABASE_URL/SERVICE_ROLE_KEY 없으면 throw", () => {
    expect(() => loadConfig()).toThrow(/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("필수 env 있으면 lookbackMonths 기본 24", () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const cfg = loadConfig();
    expect(cfg.lookbackMonths).toBe(24);
    expect(cfg.supabaseUrl).toBe("https://x.supabase.co");
  });

  it("LOOKBACK_MONTHS env override 반영", () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.LOOKBACK_MONTHS = "12";
    expect(loadConfig().lookbackMonths).toBe(12);
  });

  it("LOOKBACK_MONTHS 비숫자면 throw", () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.LOOKBACK_MONTHS = "abc";
    expect(() => loadConfig()).toThrow(/Invalid LOOKBACK_MONTHS/);
  });
});
