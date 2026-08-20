import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

// config 는 케이스별로 덮어쓸 수 있게 hoisted 컨테이너 경유 (recoverMaxCalls 상한 테스트용).
const cfg = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
function baseConfig() {
  return {
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
    // D-fh2-03: 결측 판정과 무관하게 무조건 재적재할 최근 영업일 수
    recoverForceRecentDays: 2,
  };
}
vi.mock("../src/config", () => ({
  loadConfig: () => cfg.value,
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

// D-fh2-03: recentDates 를 mock 하지 않으면 실제 모듈이 빈 supabase stub 을 호출해 깨진다.
const mockRecent = vi.fn();
vi.mock("../src/pipeline/recentDates", () => ({
  fetchRecentTradingDates: (...a: any[]) => mockRecent(...a),
}));

import { runRecover } from "../src/modes/recover";

const log = pino({ level: "silent" });

function row(code: string, basDd: string) {
  return {
    BAS_DD: basDd,
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

describe("runRecover", () => {
  beforeEach(() => {
    cfg.value = baseConfig();
    mockFetchBydd.mockReset();
    mockUpsert.mockReset();
    mockBootstrap.mockReset();
    mockMissing.mockReset();
    mockRecent.mockReset();
    mockBootstrap.mockResolvedValue({ inserted: 0 });
    mockUpsert.mockResolvedValue({ count: 2800 });
    // 기존 케이스 기대값 보존 — 강제 재적재 없음이 기본.
    mockRecent.mockResolvedValue([]);
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

describe("runRecover — 최근 N영업일 무조건 재적재 (D-fh2-03)", () => {
  beforeEach(() => {
    cfg.value = baseConfig();
    mockFetchBydd.mockReset();
    mockUpsert.mockReset();
    mockBootstrap.mockReset();
    mockMissing.mockReset();
    mockRecent.mockReset();
    mockBootstrap.mockResolvedValue({ inserted: 0 });
    mockUpsert.mockResolvedValue({ count: 2800 });
    mockMissing.mockResolvedValue([]);
  });

  function okFetch() {
    mockFetchBydd.mockImplementation((_c: unknown, basDd: string) =>
      Promise.resolve(Array.from({ length: 2800 }, (_, i) => row(`A${i}`, basDd))),
    );
  }

  it("결측 0 + forced 2일자 → fetch/upsert 2회, datesProcessed=2", async () => {
    // 구조적 결함 보완의 핵심: intraday-sync 가 매일 전 종목 row 를 만들어
    // 결측 판정(row count < 활성×0.9)이 영영 발동하지 않아 recover overlay 가 죽어 있었다.
    mockRecent.mockResolvedValue(["2026-08-19", "2026-08-18"]);
    okFetch();

    const out = await runRecover({ log });

    expect(out.datesProcessed).toBe(2);
    expect(mockFetchBydd).toHaveBeenCalledTimes(2);
    expect(mockFetchBydd.mock.calls.map((c) => c[1])).toEqual([
      "20260819",
      "20260818",
    ]);
  });

  it("forced 와 missing 이 겹치면 해당 일자는 1회만 fetch (중복 제거)", async () => {
    mockRecent.mockResolvedValue(["2026-08-19", "2026-08-18"]);
    mockMissing.mockResolvedValue(["2026-08-18", "2026-08-14"]);
    okFetch();

    const out = await runRecover({ log });

    expect(out.datesProcessed).toBe(3);
    expect(mockFetchBydd.mock.calls.map((c) => c[1])).toEqual([
      "20260819",
      "20260818",
      "20260814",
    ]);
  });

  it("forced 일자도 KRX 0 row 이면 skip (기존 가드 동일 적용)", async () => {
    mockRecent.mockResolvedValue(["2026-08-19"]);
    mockFetchBydd.mockResolvedValue([]);

    const out = await runRecover({ log });

    expect(out.datesProcessed).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("forced 일자도 OHLV=0 비율 >50% 이면 skip (KRX stale 가드, T-fh2-03)", async () => {
    mockRecent.mockResolvedValue(["2026-08-19"]);
    mockFetchBydd.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => {
        const r = row(`A${i}`, "20260819");
        // 60% 가 OHLV=0 인 stale 응답
        return i < 60 ? { ...r, TDD_OPNPRC: "0" } : r;
      }),
    );

    const out = await runRecover({ log });

    expect(out.datesProcessed).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("forced + missing 합계가 recoverMaxCalls 를 넘어도 forced 는 보존", async () => {
    cfg.value = { ...baseConfig(), recoverMaxCalls: 3 };
    mockRecent.mockResolvedValue(["2026-08-19", "2026-08-18"]);
    mockMissing.mockResolvedValue([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
    ]);
    okFetch();

    await runRecover({ log });

    const called = mockFetchBydd.mock.calls.map((c) => c[1]);
    expect(called).toHaveLength(3);
    expect(called.slice(0, 2)).toEqual(["20260819", "20260818"]);
  });

  it("recoverForceRecentDays=0 → 강제 재적재 비활성 (킬 스위치)", async () => {
    cfg.value = { ...baseConfig(), recoverForceRecentDays: 0 };
    mockRecent.mockResolvedValue(["2026-08-19", "2026-08-18"]);
    okFetch();

    const out = await runRecover({ log });

    expect(mockRecent).not.toHaveBeenCalled();
    expect(out.datesProcessed).toBe(0);
    expect(mockFetchBydd).not.toHaveBeenCalled();
  });

  it("forced 조회 실패해도 missing 경로는 계속 동작 (fail-open)", async () => {
    mockRecent.mockRejectedValue(new Error("connection reset"));
    mockMissing.mockResolvedValue(["2026-08-14"]);
    okFetch();

    const out = await runRecover({ log });

    expect(out.datesProcessed).toBe(1);
    expect(mockFetchBydd.mock.calls.map((c) => c[1])).toEqual(["20260814"]);
  });
});
