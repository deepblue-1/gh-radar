import { describe, it, expect, vi, beforeEach } from "vitest";

// index 모듈은 dotenv/config + loadConfig() 가 import 시점 실행될 수 있어
// 환경변수 stub 후 동적 import.
function stubEnv() {
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "key";
  process.env.KIWOOM_APPKEY = "appkey";
  process.env.KIWOOM_SECRETKEY = "secret";
  process.env.MIN_EXPECTED_ROWS = "100";
  process.env.HOT_SET_TOP_N = "5";
}

describe("runIntradayCycle — 가드 동작", () => {
  beforeEach(() => {
    stubEnv();
    vi.resetModules();
  });

  it("ka10027 0 row → step1Count=0, step2Count=0, failed=0 (warn + exit 정상)", async () => {
    vi.doMock("../src/kiwoom/tokenStore", () => ({
      getKiwoomToken: vi
        .fn()
        .mockResolvedValue({ accessToken: "TOK", expiresAt: new Date() }),
    }));
    vi.doMock("../src/kiwoom/fetchRanking", () => ({
      fetchKa10027: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("../src/services/supabase", () => ({
      createSupabaseClient: vi.fn().mockReturnValue({}),
    }));

    const { runIntradayCycle } = await import("../src/index");
    const out = await runIntradayCycle();
    expect(out).toEqual({ step1Count: 0, step2Count: 0, failed: 0 });
  });

  it("ka10027 < MIN_EXPECTED → throw 'partial response'", async () => {
    vi.doMock("../src/kiwoom/tokenStore", () => ({
      getKiwoomToken: vi
        .fn()
        .mockResolvedValue({ accessToken: "TOK", expiresAt: new Date() }),
    }));
    vi.doMock("../src/kiwoom/fetchRanking", () => ({
      fetchKa10027: vi.fn().mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => ({
          stk_cd: String(i + 1).padStart(6, "0") + "_AL",
          cur_prc: "+1000",
        })),
      ),
    }));
    vi.doMock("../src/services/supabase", () => ({
      createSupabaseClient: vi.fn().mockReturnValue({}),
    }));

    const { runIntradayCycle } = await import("../src/index");
    await expect(runIntradayCycle()).rejects.toThrow(/partial response/);
  });
});
