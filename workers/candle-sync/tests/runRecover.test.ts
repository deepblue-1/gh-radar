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
    mode: "recover" as const,
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

const mockMissing = vi.fn();
vi.mock("../src/pipeline/missingDates", () => ({
  findMissingDates: (...a: any[]) => mockMissing(...a),
}));

import { runRecover } from "../src/modes/recover";

const log = pino({ level: "silent" });

function row(code: string, basDd: string) {
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

describe("runRecover", () => {
  beforeEach(() => {
    mockFetchBydd.mockReset();
    mockUpsert.mockReset();
    mockBootstrap.mockReset();
    mockMissing.mockReset();
    mockBootstrap.mockResolvedValue({ inserted: 0 });
    mockUpsert.mockResolvedValue({ count: 2800 });
  });

  it("0 결측 일자 → datesProcessed=0, totalRows=0", async () => {
    mockMissing.mockResolvedValue([]);
    const out = await runRecover({ log });
    expect(out.datesProcessed).toBe(0);
    expect(out.totalRows).toBe(0);
    expect(mockFetchBydd).not.toHaveBeenCalled();
  });

  it("3 결측 일자 → 3회 fetch + 3회 upsert + datesProcessed=3", async () => {
    mockMissing.mockResolvedValue(["2026-05-09", "2026-05-08", "2026-05-07"]);
    mockFetchBydd.mockImplementation((_c: unknown, basDd: string) =>
      Promise.resolve(
        Array.from({ length: 2800 }, (_, i) => row(`A${i}`, basDd)),
      ),
    );

    const out = await runRecover({ log });
    expect(out.datesProcessed).toBe(3);
    expect(out.totalRows).toBe(3 * 2800);
    expect(mockFetchBydd).toHaveBeenCalledTimes(3);
  });

  it("per-date 격리 — 1일 실패 시 나머지 continue (best-effort)", async () => {
    mockMissing.mockResolvedValue(["2026-05-09", "2026-05-08", "2026-05-07"]);
    // 특정 일자 (20260508) 만 모든 retry 도 ECONNRESET — 그 외 일자는 정상
    mockFetchBydd.mockImplementation((_c: unknown, basDd: string) => {
      if (basDd === "20260508") {
        return Promise.reject(new Error("ECONNRESET"));
      }
      return Promise.resolve(
        Array.from({ length: 2800 }, (_, i) => row(`A${i}`, basDd)),
      );
    });

    const out = await runRecover({ log });
    expect(out.datesProcessed).toBe(2); // 1 fail, 2 success
  }, 10000);

  it("KRX 빈 응답 (휴장 가능) → skip + datesProcessed 미증가", async () => {
    mockMissing.mockResolvedValue(["2026-05-09"]);
    mockFetchBydd.mockResolvedValue([]);
    const out = await runRecover({ log });
    expect(out.datesProcessed).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
