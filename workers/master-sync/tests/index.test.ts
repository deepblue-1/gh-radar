import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/krx/fetchBaseInfo", () => ({
  fetchMasterFromKrx: vi.fn(),
}));
vi.mock("../src/krx/fetchEtpBaseInfo", () => ({
  fetchEtpMastersFromKrx: vi.fn(),
}));
vi.mock("../src/pipeline/upsert", () => ({
  upsertMasters: vi.fn(),
}));
vi.mock("../src/services/supabase", () => ({
  createSupabaseClient: vi.fn(),
}));
vi.mock("../src/krx/client", () => ({
  createKrxClient: vi.fn().mockReturnValue({}),
}));

import { runMasterSync } from "../src/index";
import { fetchMasterFromKrx } from "../src/krx/fetchBaseInfo";
import { fetchEtpMastersFromKrx } from "../src/krx/fetchEtpBaseInfo";
import { upsertMasters } from "../src/pipeline/upsert";
import { createSupabaseClient } from "../src/services/supabase";

const mockFetch = fetchMasterFromKrx as any;
const mockFetchEtp = fetchEtpMastersFromKrx as any;
const mockUpsert = upsertMasters as any;
const mockCreateSupabase = createSupabaseClient as any;

const baseConfig = {
  krxAuthKey: "k", krxBaseUrl: "https://x",
  supabaseUrl: "u", supabaseServiceRoleKey: "s",
  logLevel: "silent", appVersion: "test",
  basDd: "20260415",
} as any;

// Helper — delist-sweep 용 supabase chain mock
// HIGH-3 fix: delist-sweep select 에 .limit(10000) 체이닝 추가됨 — mock 도 해당 체인 지원.
function mkSupabaseMock(existingActive: string[] = []) {
  const updateIn = vi.fn().mockResolvedValue({ error: null });
  const updateFn = vi.fn().mockReturnValue({ in: updateIn });
  const result = { data: existingActive.map((code) => ({ code })), error: null };
  const limit = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ eq });
  // from('stocks') 를 호출할 때마다 적절한 chain 반환
  const from = vi.fn().mockImplementation(() => ({ select, update: updateFn }));
  return { client: { from } as any, updateFn, updateIn, select, limit };
}

// KRX 실측 fixture row builder (MIN_EXPECTED_MASTERS=1000 가드 통과용 대량 생성)
function mkKrxRows(total: number) {
  return Array.from({ length: total }, (_, i) => ({
    ISU_SRT_CD: String(100000 + i).padStart(6, "0"),
    ISU_ABBRV: `종목${i}`,
    ISU_NM: `종목${i}`,
    MKT_TP_NM: i % 2 === 0 ? "KOSPI" : "KOSDAQ",
    SECUGRP_NM: "주권",
    SECT_TP_NM: i % 2 === 0 ? "" : "중견기업부",
    KIND_STKCERT_TP_NM: "보통주",
    LIST_DD: "20000101",
    market: (i % 2 === 0 ? "KOSPI" : "KOSDAQ") as "KOSPI" | "KOSDAQ",
  }));
}

// ETP(ETF/ETN/ELW) fixture — fetchEtpMastersFromKrx 반환 형태 (KrxBaseInfoRow)
function mkEtpRows(total: number) {
  return Array.from({ length: total }, (_, i) => ({
    ISU_SRT_CD: String(580000 + i).padStart(6, "0"),
    ISU_ABBRV: `ETN${i}`,
    ISU_NM: `종목${i} ETN`,
    SECUGRP_NM: "ETN",
    KIND_STKCERT_TP_NM: "ETN",
    market: "KOSPI" as const,
  }));
}

describe("runMasterSync", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetchEtp.mockReset();
    mockFetchEtp.mockResolvedValue([]); // 기본 — ETP 0 행 (개별 테스트에서 override 가능)
    mockUpsert.mockReset();
    mockCreateSupabase.mockReset();
  });

  it("정상 흐름 — KRX rows → map → upsert → delist-sweep(0건) → return {count, delistedCount}", async () => {
    const rows = mkKrxRows(1200); // MIN_EXPECTED_MASTERS 통과
    mockFetch.mockResolvedValue(rows);
    mockUpsert.mockResolvedValue({ count: rows.length });
    const supaMock = mkSupabaseMock(rows.map((r) => r.ISU_SRT_CD!)); // 모두 active 로 존재
    mockCreateSupabase.mockReturnValue(supaMock.client);

    const res = await runMasterSync({ config: baseConfig });
    expect(res.count).toBe(1200);
    expect(res.delistedCount).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(expect.anything(), "20260415");
    expect(supaMock.updateIn).not.toHaveBeenCalled();
  });

  it("delist-sweep — 응답에 없는 활성 종목을 is_delisted=true 마킹", async () => {
    const rows = mkKrxRows(1200);
    mockFetch.mockResolvedValue(rows);
    mockUpsert.mockResolvedValue({ count: rows.length });
    // 기존 활성: 응답의 1200 + 추가 2개 (→ 2개 delist 대상)
    const existing = [...rows.map((r) => r.ISU_SRT_CD!), "999998", "999999"];
    const supaMock = mkSupabaseMock(existing);
    mockCreateSupabase.mockReturnValue(supaMock.client);

    const res = await runMasterSync({ config: baseConfig });
    expect(res.delistedCount).toBe(2);
    expect(supaMock.updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ is_delisted: true }),
    );
    expect(supaMock.updateIn).toHaveBeenCalledWith("code", ["999998", "999999"]);
  });

  it("ETP 병합 — 주식+ETP upsert, security_group='ETN' 정확 매핑, activeCodes 포함(ETP 오삭제 0)", async () => {
    const rows = mkKrxRows(1200);
    const etp = mkEtpRows(3); // 580000~580002
    mockFetch.mockResolvedValue(rows);
    mockFetchEtp.mockResolvedValue(etp);
    mockUpsert.mockResolvedValue({ count: rows.length + etp.length });
    // 기존 활성: 주식 1200 + ETP 3 모두 존재 → ETP 가 activeCodes 에 포함되어 delist 0 이어야
    const existing = [
      ...rows.map((r) => r.ISU_SRT_CD!),
      ...etp.map((r) => r.ISU_SRT_CD),
    ];
    const supaMock = mkSupabaseMock(existing);
    mockCreateSupabase.mockReturnValue(supaMock.client);

    const res = await runMasterSync({ config: baseConfig });

    // upsert 인자(masters)에 ETP 코드 포함 + 정확 분류
    const upsertArg = mockUpsert.mock.calls[0][1] as Array<{
      code: string;
      securityGroup: string;
    }>;
    const etn = upsertArg.find((m) => m.code === "580000");
    expect(etn).toBeDefined();
    expect(etn!.securityGroup).toBe("ETN");
    // ETP 가 활성 universe 에 포함 → delist-sweep churn 없음
    expect(res.delistedCount).toBe(0);
    expect(supaMock.updateIn).not.toHaveBeenCalled();
  });

  it("ETP fetch 실패 → fault-tolerant (throw 안 함, 주식-only upsert 계속)", async () => {
    const rows = mkKrxRows(1200);
    mockFetch.mockResolvedValue(rows);
    mockFetchEtp.mockRejectedValue(new Error("KRX 401 — ETP 미승인"));
    mockUpsert.mockResolvedValue({ count: rows.length });
    const supaMock = mkSupabaseMock(rows.map((r) => r.ISU_SRT_CD!));
    mockCreateSupabase.mockReturnValue(supaMock.client);

    const res = await runMasterSync({ config: baseConfig });
    expect(res.count).toBe(1200);
    // upsert 는 주식만 (ETP 0 행)
    const upsertArg = mockUpsert.mock.calls[0][1] as unknown[];
    expect(upsertArg.length).toBe(1200);
  });

  it("MASS_DELIST_RISK 가드 — KRX 응답 row < 1000 시 throw (delist-sweep 실행 안 됨)", async () => {
    const rows = mkKrxRows(500); // 가드 임계 미만
    mockFetch.mockResolvedValue(rows);
    const supaMock = mkSupabaseMock([]);
    mockCreateSupabase.mockReturnValue(supaMock.client);

    await expect(runMasterSync({ config: baseConfig })).rejects.toThrow(/partial response|mass-delist/i);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(supaMock.updateIn).not.toHaveBeenCalled();
  });

  it("KRX 빈 응답 → count=0, delistedCount=0 (sweep 스킵, exit 0)", async () => {
    mockFetch.mockResolvedValue([]);
    const supaMock = mkSupabaseMock([]);
    mockCreateSupabase.mockReturnValue(supaMock.client);

    const res = await runMasterSync({ config: baseConfig });
    expect(res.count).toBe(0);
    expect(res.delistedCount).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("KRX fetch 실패 (3회 retry 모두 실패) → throw", async () => {
    mockFetch.mockRejectedValue(new Error("HTTP 500"));
    const supaMock = mkSupabaseMock([]);
    mockCreateSupabase.mockReturnValue(supaMock.client);

    await expect(runMasterSync({ config: baseConfig })).rejects.toThrow(/HTTP 500/);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
