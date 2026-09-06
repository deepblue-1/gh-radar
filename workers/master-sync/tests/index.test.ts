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
//
// delist-sweep 은 `.select().eq().order().range(from, to)` 로 **페이징**한다.
// `.limit(10000)` 은 PostgREST `db-max-rows`(=1000) 를 못 넘어 조용히 잘리기 때문이다
// (실측 2026-09-06: 활성 4,049 중 1,000행만 반환). mock 도 페이지 크기 1000 을
// 그대로 흉내내야 페이징 회귀를 잡을 수 있다.
const PAGE = 1000;

function mkSupabaseMock(existingActive: string[] = []) {
  const updateIn = vi.fn().mockResolvedValue({ error: null });
  const updateFn = vi.fn().mockReturnValue({ in: updateIn });
  const sorted = [...existingActive].sort();
  const range = vi.fn().mockImplementation((from: number, to: number) => {
    const slice = sorted.slice(from, to + 1).map((code) => ({ code }));
    // 서버 상한 모사 — 요청 폭이 더 커도 1000행을 넘겨주지 않는다.
    return Promise.resolve({ data: slice.slice(0, PAGE), error: null });
  });
  const order = vi.fn().mockReturnValue({ range });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  // from('stocks') 를 호출할 때마다 적절한 chain 반환
  const from = vi.fn().mockImplementation(() => ({ select, update: updateFn }));
  return { client: { from } as any, updateFn, updateIn, select, order, range };
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

  it("BAS_DD 고정 + 빈 응답 → throw (조용한 정상 종료 회귀 가드)", async () => {
    // 옛 동작은 warn 후 `{count:0}` 반환이었고, 그래서 2026-06-10 부터 3개월간
    // 아무도 모르게 마스터가 정지했다. 0행은 성공이 아니다.
    mockFetch.mockResolvedValue([]);
    const supaMock = mkSupabaseMock([]);
    mockCreateSupabase.mockReturnValue(supaMock.client);

    await expect(runMasterSync({ config: baseConfig })).rejects.toThrow(
      /partial response|mass-delist/i,
    );
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(supaMock.updateIn).not.toHaveBeenCalled();
  });

  it("KRX fetch 실패 (3회 retry 모두 실패) → throw", async () => {
    mockFetch.mockRejectedValue(new Error("HTTP 500"));
    const supaMock = mkSupabaseMock([]);
    mockCreateSupabase.mockReturnValue(supaMock.client);

    await expect(runMasterSync({ config: baseConfig })).rejects.toThrow(/HTTP 500/);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  // ----------------------------------------------------------
  // basDd 자동 탐색 (2026-06-10 회귀 — KRX 발행이 ~2영업일 지연으로 바뀌었다)
  //
  // `BAS_DD` 가 비어 있으면 오늘(KST)부터 거슬러 올라가며 MIN_EXPECTED_MASTERS 이상
  // 발행된 첫 기준일을 채택한다. 전 후보 미달이면 throw — 조용한 성공은 없다.
  // ----------------------------------------------------------

  /** BAS_DD 없는 설정 — 자동 탐색 경로. */
  const autoConfig = { ...baseConfig, basDd: undefined };

  /** `mockFetch` 호출에 쓰인 basDd 인자들. */
  function calledBasDds(): string[] {
    return mockFetch.mock.calls.map((c: unknown[]) => c[1] as string);
  }

  it("자동 탐색 — 오늘이 미발행이면 거슬러 올라가 발행된 기준일을 채택한다", async () => {
    const rows = mkKrxRows(1200);
    // 오늘·어제는 미발행(0행), 그제부터 발행.
    mockFetch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue(rows);
    mockUpsert.mockResolvedValue({ count: rows.length });
    const supaMock = mkSupabaseMock(rows.map((r) => r.ISU_SRT_CD!));
    mockCreateSupabase.mockReturnValue(supaMock.client);

    const res = await runMasterSync({ config: autoConfig });

    expect(res.count).toBe(1200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // 후보는 오늘 → 어제 → 그제 순으로 하루씩 뒤로 간다(YYYYMMDD 내림차순).
    const tried = calledBasDds();
    expect(tried).toHaveLength(3);
    expect(tried.every((d) => /^\d{8}$/.test(d))).toBe(true);
    expect([...tried].sort().reverse()).toEqual(tried);
    // 채택한 기준일로 ETP 도 조회한다 — 주식과 다른 날짜를 섞지 않는다.
    expect(mockFetchEtp).toHaveBeenCalledWith(expect.anything(), tried[2]);
  });

  it("자동 탐색 — 부분 발행(1000행 미만)인 기준일은 채택하지 않고 더 거슬러 올라간다", async () => {
    // KOSPI 만 발행되고 KOSDAQ 은 아직인 상태. 그 날을 채택하면 KOSDAQ 전 종목이
    // delist-sweep 에 걸린다 — 완전한 날을 찾을 때까지 물러선다.
    const partial = mkKrxRows(943);
    const full = mkKrxRows(1200);
    mockFetch.mockResolvedValueOnce(partial).mockResolvedValue(full);
    mockUpsert.mockResolvedValue({ count: full.length });
    const supaMock = mkSupabaseMock(full.map((r) => r.ISU_SRT_CD!));
    mockCreateSupabase.mockReturnValue(supaMock.client);

    const res = await runMasterSync({ config: autoConfig });

    expect(res.count).toBe(1200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // 부분 응답으로 upsert 하지 않았다 — 채택된 건 1200행 쪽뿐이다.
    expect(mockUpsert.mock.calls[0][1]).toHaveLength(1200);
  });

  it("자동 탐색 — 전 후보가 미발행이면 throw (3개월 무증상 정지 회귀 가드)", async () => {
    mockFetch.mockResolvedValue([]);
    const supaMock = mkSupabaseMock([]);
    mockCreateSupabase.mockReturnValue(supaMock.client);

    await expect(runMasterSync({ config: autoConfig })).rejects.toThrow(
      /발행되지 않았다|stocks 마스터를 갱신하지 못했다/,
    );
    // 상한(10일)까지 훑고 멈춘다 — 무한히 거슬러 올라가지 않는다.
    expect(mockFetch).toHaveBeenCalledTimes(11);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(supaMock.updateIn).not.toHaveBeenCalled();
  });

  it("delist-sweep 은 활성 종목을 페이징으로 전량 읽는다 (1000행 절단 회귀 가드)", async () => {
    // 활성 4,049건 중 1,000건만 읽던 버그: 페이지 밖의 상장폐지 종목이 영영 마킹되지
    // 않는다. 여기서는 KRX 1,200 + 응답에 없는 3,000 = 활성 4,200 을 만들어,
    // 마지막 페이지의 종목까지 delist 대상에 들어오는지 본다.
    const rows = mkKrxRows(1200);
    mockFetch.mockResolvedValue(rows);
    mockUpsert.mockResolvedValue({ count: rows.length });

    const stale = Array.from({ length: 3000 }, (_, i) => `9${String(i).padStart(5, "0")}`);
    const existing = [...rows.map((r) => r.ISU_SRT_CD!), ...stale];
    const supaMock = mkSupabaseMock(existing);
    mockCreateSupabase.mockReturnValue(supaMock.client);

    const res = await runMasterSync({ config: baseConfig });

    expect(res.delistedCount).toBe(3000);
    // 4,200행 = 1000×4 + 200 → 마지막 부분 페이지에서 멈추므로 5회 호출.
    expect(supaMock.range).toHaveBeenCalledTimes(5);
    // 정렬 없이 페이징하면 행이 중복·누락된다 — order 를 반드시 건다.
    expect(supaMock.order).toHaveBeenCalledWith("code", { ascending: true });
    const marked = supaMock.updateIn.mock.calls[0][1] as string[];
    expect(marked).toHaveLength(3000);
    expect(marked).toContain("900000");
    expect(marked).toContain("902999"); // 마지막 페이지 소속
  });

  it("BAS_DD 가 있으면 탐색하지 않고 그 날짜만 조회한다 (운영자 수동 지정)", async () => {
    const rows = mkKrxRows(1200);
    mockFetch.mockResolvedValue(rows);
    mockUpsert.mockResolvedValue({ count: rows.length });
    const supaMock = mkSupabaseMock(rows.map((r) => r.ISU_SRT_CD!));
    mockCreateSupabase.mockReturnValue(supaMock.client);

    await runMasterSync({ config: baseConfig });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(calledBasDds()).toEqual(["20260415"]);
  });
});
