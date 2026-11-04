import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConfigError, loadConfig } from "../src/config";

const ORIG = { ...process.env };
const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TICK_ARCHIVE_DIR",
  "TICK_KEEP_DAYS",
  "TICK_CATCHUP_DAYS",
  "TICK_UP_PCT",
  "TICK_ZSTD_LEVEL",
  "TICK_STAGE_CHUNK_BYTES",
  "TICK_NIGHTLY_BUDGET_MS",
  "APP_VERSION",
];

function base(): void {
  process.env.TICK_ARCHIVE_DIR = "/mnt/tick/raw";
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
}

describe("loadConfig (tick-convert)", () => {
  beforeEach(() => {
    for (const k of KEYS) delete process.env[k];
  });
  afterEach(() => {
    process.env = { ...ORIG };
  });

  it("TICK_ARCHIVE_DIR 없으면 throw(dry-run 은 통과)", () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    expect(() => loadConfig()).toThrow(/TICK_ARCHIVE_DIR/);
    expect(loadConfig({ dryRun: true }).archiveDir).toBe("");
  });

  it("backfill-team 은 TICK_ARCHIVE_DIR 없이 통과(Storage 격자만 읽는다 · quick 261103-j4d) · Supabase 는 여전히 필수", () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    expect(loadConfig({ mode: "backfill-team" }).archiveDir).toBe("");
    expect(() => loadConfig({ mode: "nightly" })).toThrow(/TICK_ARCHIVE_DIR/);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => loadConfig({ mode: "backfill-team" })).toThrow(/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("dry-run 이 아니면 SUPABASE_URL/SERVICE_ROLE_KEY 필수", () => {
    process.env.TICK_ARCHIVE_DIR = "/mnt/tick/raw";
    expect(() => loadConfig()).toThrow(/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
    process.env.SUPABASE_URL = "https://x.supabase.co";
    expect(() => loadConfig()).toThrow(/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
    expect(loadConfig({ dryRun: true }).supabaseUrl).toBe("https://x.supabase.co");
  });

  it("숫자 env 기본값 — keep 90 · catchup 10 · up 15 · zstd 9 · chunk 65536 · budget 2,400,000", () => {
    base();
    expect(loadConfig()).toMatchObject({
      archiveDir: "/mnt/tick/raw",
      keepDays: 90,
      catchupDays: 10,
      upPct: 15,
      zstdLevel: 9,
      stageChunkBytes: 65536,
      nightlyBudgetMs: 2_400_000,
      dryRun: false,
    });
  });

  it("숫자 env override 반영", () => {
    base();
    process.env.TICK_KEEP_DAYS = "30";
    process.env.TICK_ZSTD_LEVEL = "19";
    process.env.TICK_NIGHTLY_BUDGET_MS = "60000";
    expect(loadConfig()).toMatchObject({ keepDays: 30, zstdLevel: 19, nightlyBudgetMs: 60000 });
  });

  it.each([
    ["TICK_KEEP_DAYS", "0"],
    ["TICK_CATCHUP_DAYS", "-1"],
    ["TICK_UP_PCT", "1.5"],
    ["TICK_ZSTD_LEVEL", "abc"],
    ["TICK_ZSTD_LEVEL", "23"],
    ["TICK_STAGE_CHUNK_BYTES", ""],
    ["TICK_NIGHTLY_BUDGET_MS", "1e"],
  ])("잘못된 정수 %s=%j → throw", (name, val) => {
    base();
    process.env[name] = val;
    expect(() => loadConfig()).toThrow(new RegExp(`Invalid ${name}`));
  });

  it("launch-live(quick 261104-n7i) — TICK_ARCHIVE_DIR 없이 통과 · TICKGW 없으면 ConfigError `launch-live:` · 공인 URL 은 ConfigError", () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    vi.stubEnv("TICKGW_URL", "http://10.146.0.2:8092/");
    vi.stubEnv("TICKGW_SECRET", "s");
    const c = loadConfig({ mode: "launch-live" });
    expect(c.archiveDir).toBe("");
    expect(c.tickgwUrl).toBe("http://10.146.0.2:8092");
    vi.stubEnv("TICKGW_SECRET", "");
    expect(() => loadConfig({ mode: "launch-live" })).toThrow(ConfigError);
    expect(() => loadConfig({ mode: "launch-live" })).toThrow(/^launch-live: TICKGW_URL and TICKGW_SECRET must be set$/);
    vi.stubEnv("TICKGW_SECRET", "s");
    vi.stubEnv("TICKGW_URL", "http://34.64.1.2:8092");
    expect(() => loadConfig({ mode: "launch-live" })).toThrow(ConfigError);
    // promote 문구는 그대로(requireTickgw 기본 모드 이름)
    vi.stubEnv("TICKGW_URL", "");
    expect(() => loadConfig({ mode: "promote" })).toThrow(/^promote: TICKGW_URL and TICKGW_SECRET must be set$/);
    vi.unstubAllEnvs();
  });
});
