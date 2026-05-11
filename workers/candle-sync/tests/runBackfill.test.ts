import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

vi.mock("../src/config", () => ({
  loadConfig: () => ({
    supabaseUrl: "http://test",
    supabaseServiceRoleKey: "sk",
    krxAuthKey: "k",
    krxBaseUrl: "http://krx",
    logLevel: "silent",
    appVersion: "test",
    mode: "backfill" as const,
    backfillFrom: "2026-05-04",
    backfillTo: "2026-05-08",
    minExpectedRows: 1400,
    recoverLookback: 10,
    recoverThreshold: 0.9,
    recoverMaxCalls: 20,
  }),
}));

vi.mock("../src/services/supabase", () => ({
  createSupabaseClient: () => ({}),
}));
vi.mock("../src/krx/client", () => ({ createKrxClient: () => ({}) }));

const mockFetchBydd = vi.fn();
vi.mock("../src/krx/fetchBydd", () => ({
  fetchBydd: (...a: any[]) => mockFetchBydd(...a),
}));

const mockUpsert = vi.fn();
vi.mock("../src/pipeline/upsert", () => ({
  upsertOhlcv: (...a: any[]) => mockUpsert(...a),
}));

const mockBootstrap = vi.fn();
vi.mock("../src/modes/bootstrapStocks", () => ({
  bootstrapStocks: (...a: any[]) => mockBootstrap(...a),
}));

import { runBackfill } from "../src/modes/backfill";

const log = pino({ level: "silent" });

function fixtureRow(code: string, basDd: string) {
  return {
    BAS_DD: basDd,
    ISU_SRT_CD: code,
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

describe("runBackfill", () => {
  beforeEach(() => {
    mockFetchBydd.mockReset();
    mockUpsert.mockReset();
    mockBootstrap.mockReset();
    mockBootstrap.mockResolvedValue({ inserted: 0 });
    mockUpsert.mockResolvedValue({ count: 2800 });
  });

  it("5 영업일 (월~금) 모두 정상 → daysProcessed=5, daysFailed=0", async () => {
    mockFetchBydd.mockImplementation((_c: unknown, basDd: string) =>
      Promise.resolve(
        Array.from({ length: 2800 }, (_, i) => fixtureRow(`A${i}`, basDd)),
      ),
    );

    const out = await runBackfill({ log });
    expect(out.daysProcessed).toBe(5);
    expect(out.daysFailed).toBe(0);
    expect(out.totalRows).toBe(5 * 2800);
    expect(mockFetchBydd).toHaveBeenCalledTimes(5);
  });

  it("빈 응답 (휴장일) → daysProcessed 증가, upsert 안 호출", async () => {
    mockFetchBydd.mockResolvedValue([]);
    const out = await runBackfill({ log });
    expect(out.daysProcessed).toBe(5);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("MIN_EXPECTED 위반 (500 row) → 즉시 throw (per-day 격리 우회)", async () => {
    mockFetchBydd.mockImplementation((_c: unknown, basDd: string) =>
      Promise.resolve(
        Array.from({ length: 500 }, (_, i) => fixtureRow(`A${i}`, basDd)),
      ),
    );
    await expect(runBackfill({ log })).rejects.toThrow(
      /MIN_EXPECTED.*500.*1400/,
    );
  });

  it("KRX 401 → 즉시 throw (per-day 격리 우회)", async () => {
    mockFetchBydd.mockRejectedValue(new Error("KRX 401 — AUTH_KEY"));
    await expect(runBackfill({ log })).rejects.toThrow(/KRX 401/);
  });

  it("일반 에러 (network) → per-day 격리: daysFailed 증가, 나머지 continue", async () => {
    // 특정 날짜 (20260505) 만 모든 retry 도 ECONNRESET — 그 외 날짜는 정상
    mockFetchBydd.mockImplementation((_c: unknown, basDd: string) => {
      if (basDd === "20260505") {
        return Promise.reject(new Error("ECONNRESET"));
      }
      return Promise.resolve(
        Array.from({ length: 2800 }, (_, i) => fixtureRow(`A${i}`, basDd)),
      );
    });

    const out = await runBackfill({ log });
    expect(out.daysFailed).toBe(1);
    expect(out.daysProcessed).toBe(4); // 5 영업일 - 1 fail
  }, 10000);
});
