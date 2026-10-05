import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config";

const ORIG = { ...process.env };
const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LIMITUP_EXPORT_DIR",
  "LIMITUP_KEEP_DAYS",
  "LIMITUP_ALLOC_KEEP_DAYS",
  "LIMITUP_STAGE_CHUNK",
  "KIND15_KEEP_DAYS",
];

describe("loadConfig (limitup-sync)", () => {
  beforeEach(() => {
    for (const k of KEYS) delete process.env[k];
  });
  afterEach(() => {
    process.env = { ...ORIG };
  });

  it("LIMITUP_EXPORT_DIR 없으면 throw(dry-run 도)", () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    expect(() => loadConfig()).toThrow(/LIMITUP_EXPORT_DIR/);
    expect(() => loadConfig({ dryRun: true })).toThrow(/LIMITUP_EXPORT_DIR/);
  });

  it("dry-run 이 아니면 SUPABASE_URL/SERVICE_ROLE_KEY 필수", () => {
    process.env.LIMITUP_EXPORT_DIR = "/mnt/export/export";
    expect(() => loadConfig()).toThrow(/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
    process.env.SUPABASE_URL = "https://x.supabase.co";
    expect(() => loadConfig()).toThrow(/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("dry-run 은 Supabase env 없이 통과", () => {
    process.env.LIMITUP_EXPORT_DIR = "/tmp/export";
    const cfg = loadConfig({ dryRun: true });
    expect(cfg.dryRun).toBe(true);
    expect(cfg.supabaseUrl).toBe("");
  });

  it("숫자 env 기본값 — keep 90 · alloc 30 · chunk 1000 · kind15 30", () => {
    process.env.LIMITUP_EXPORT_DIR = "/tmp/export";
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    const cfg = loadConfig();
    expect(cfg).toMatchObject({ keepDays: 90, allocKeepDays: 30, stageChunk: 1000, kind15KeepDays: 30, dryRun: false });
    expect(cfg.exportDir).toBe("/tmp/export");
  });

  it("숫자 env override 반영", () => {
    process.env.LIMITUP_EXPORT_DIR = "/tmp/export";
    process.env.LIMITUP_KEEP_DAYS = "3650";
    process.env.LIMITUP_STAGE_CHUNK = "250";
    const cfg = loadConfig({ dryRun: true });
    expect(cfg.keepDays).toBe(3650);
    expect(cfg.stageChunk).toBe(250);
  });

  it.each([
    ["LIMITUP_KEEP_DAYS", "abc"],
    ["LIMITUP_ALLOC_KEEP_DAYS", "Infinity"],
    ["LIMITUP_STAGE_CHUNK", "0"],
    ["KIND15_KEEP_DAYS", "1.5"],
  ])("%s=%s 이면 throw", (key, val) => {
    process.env.LIMITUP_EXPORT_DIR = "/tmp/export";
    process.env[key] = val;
    expect(() => loadConfig({ dryRun: true })).toThrow(new RegExp(`Invalid ${key}`));
  });
});
