import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/krx/fetchBaseInfo", () => ({
  fetchMasterFromKrx: vi.fn(),
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
import { upsertMasters } from "../src/pipeline/upsert";
import { createSupabaseClient } from "../src/services/supabase";

const mockFetch = fetchMasterFromKrx as any;
const mockUpsert = upsertMasters as any;
const mockCreateSupabase = createSupabaseClient as any;

const baseConfig = {
  krxAuthKey: "k", krxBaseUrl: "https://x",
  supabaseUrl: "u", supabaseServiceRoleKey: "s",
  logLevel: "silent", appVersion: "test",
  basDd: "20260415",
} as any;

// Helper — delist-sweep 용 supabase chain mock
function mkSupabaseMock(existingActive: string[] = []) {
  const updateIn = vi.fn().mockResolvedValue({ error: null });
  const updateFn = vi.fn().mockReturnValue({ in: updateIn });
  const eq = vi.fn().mockResolvedValue({ data: existingActive.map((code) => ({ code })), error: null });
  const select = vi.fn().mockReturnValue({ eq });
  // from('stocks') 를 호출할 때마다 적절한 chain 반환
  const from = vi.fn().mockImplementation(() => ({ select, update: updateFn }));
  return { client: { from } as any, updateFn, updateIn, select };
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

describe("runMasterSync", () => {
  beforeEach(() => {
    mockFetch.mockReset();
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
