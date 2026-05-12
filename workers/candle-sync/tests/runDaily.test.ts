import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

// loadConfig stub
vi.mock("../src/config", () => ({
  loadConfig: () => ({
    supabaseUrl: "http://test",
    supabaseServiceRoleKey: "sk",
    krxAuthKey: "test-key",
    krxBaseUrl: "http://krx",
    logLevel: "silent",
    appVersion: "test",
    mode: "daily" as const,
    minExpectedRows: 1400,
    recoverLookback: 10,
    recoverThreshold: 0.9,
    recoverMaxCalls: 20,
    basDd: "20260509", // 고정값
  }),
}));

vi.mock("../src/services/supabase", () => ({
  createSupabaseClient: () => ({}),
}));

const mockFetchBydd = vi.fn();
vi.mock("../src/krx/fetchBydd", () => ({
  fetchBydd: (...args: any[]) => mockFetchBydd(...args),
}));

vi.mock("../src/krx/client", () => ({
  createKrxClient: () => ({}),
}));

const mockUpsert = vi.fn();
vi.mock("../src/pipeline/upsert", () => ({
  upsertOhlcv: (...args: any[]) => mockUpsert(...args),
}));

const mockBootstrap = vi.fn();
vi.mock("../src/modes/bootstrapStocks", () => ({
  bootstrapStocks: (...args: any[]) => mockBootstrap(...args),
}));

import { runDaily } from "../src/modes/daily";

const log = pino({ level: "silent" });

function makeRow(code: string) {
  return {
    BAS_DD: "20260509",
    ISU_CD: code,
    ISU_NM: code,
    TDD_OPNPRC: "100",
    TDD_HGPRC: "110",
    TDD_LWPRC: "95",
    TDD_CLSPRC: "105",
    ACC_TRDVOL: "1000",
    ACC_TRDVAL: "100000",
    market: "KOSPI" as const,
  };
}

describe("runDaily", () => {
  beforeEach(() => {
    mockFetchBydd.mockReset();
    mockUpsert.mockReset();
    mockBootstrap.mockReset();
  });

  it("정상 응답 2,800 row → bootstrap + upsert 호출 + return {basDd, count}", async () => {
    const rows = Array.from({ length: 2800 }, (_, i) =>
      makeRow(`A${i.toString().padStart(5, "0")}`),
    );
    mockFetchBydd.mockResolvedValue(rows);
    mockBootstrap.mockResolvedValue({ inserted: 5 });
    mockUpsert.mockResolvedValue({ count: 2800 });

    const out = await runDaily({ log });
    expect(out.basDd).toBe("20260509");
    expect(out.count).toBe(2800);
    expect(mockBootstrap).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("빈 응답 (0 row) → warn + return count=0 (throw 없음)", async () => {
    mockFetchBydd.mockResolvedValue([]);
    const out = await runDaily({ log });
    expect(out.count).toBe(0);
    expect(mockBootstrap).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("row < minExpectedRows (1400) → MIN_EXPECTED 가드 throw", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => makeRow(`A${i}`));
    mockFetchBydd.mockResolvedValue(rows);
    await expect(runDaily({ log })).rejects.toThrow(
      /500 rows.*1400.*partial response/,
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("KRX 401 (fetchBydd throw) → 즉시 throw + retry 후에도 실패", async () => {
    mockFetchBydd.mockRejectedValue(new Error("KRX 401 — AUTH_KEY"));
    await expect(runDaily({ log })).rejects.toThrow(/KRX 401/);
  });
});
