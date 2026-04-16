import { describe, it, expect, vi } from "vitest";
import { createKrxClient } from "../src/krx/client";
import { fetchMasterFromKrx } from "../src/krx/fetchBaseInfo";

const mkConfig = (over: any = {}) => ({
  krxAuthKey: "test-key",
  krxBaseUrl: "https://example.com",
  supabaseUrl: "x", supabaseServiceRoleKey: "x",
  logLevel: "info", appVersion: "test",
  ...over,
} as any);

describe("createKrxClient", () => {
  it("AUTH_KEY 헤더 + baseURL 설정", () => {
    const c = createKrxClient(mkConfig());
    expect(c.defaults.headers["AUTH_KEY"]).toBe("test-key");
    expect(c.defaults.baseURL).toBe("https://example.com");
  });
});

describe("fetchMasterFromKrx", () => {
  it("KOSPI + KOSDAQ 합쳐서 반환 + market 태깅", async () => {
    const client = {
      get: vi.fn()
        .mockResolvedValueOnce({ data: { OutBlock_1: [
          { ISU_CD: "KR7005930003", ISU_SRT_CD: "005930", ISU_NM: "삼성전자보통주", ISU_ABBRV: "삼성전자",
            ISU_ENG_NM: "SamsungElectronics", MKT_TP_NM: "KOSPI",
            SECUGRP_NM: "주권", SECT_TP_NM: "", KIND_STKCERT_TP_NM: "보통주",
            LIST_DD: "19750611", PARVAL: "100", LIST_SHRS: "5846278608" },
          { ISU_CD: "KR7000660001", ISU_SRT_CD: "000660", ISU_NM: "SK하이닉스보통주", ISU_ABBRV: "SK하이닉스",
            MKT_TP_NM: "KOSPI", SECUGRP_NM: "주권", SECT_TP_NM: "", KIND_STKCERT_TP_NM: "보통주",
            LIST_DD: "19960712" },
        ]}})
        .mockResolvedValueOnce({ data: { OutBlock_1: [
          { ISU_CD: "KR7098120009", ISU_SRT_CD: "098120", ISU_NM: "(주)마이크로컨텍솔루션", ISU_ABBRV: "마이크로컨텍솔",
            MKT_TP_NM: "KOSDAQ", SECUGRP_NM: "주권", SECT_TP_NM: "중견기업부", KIND_STKCERT_TP_NM: "보통주",
            LIST_DD: "20080923", PARVAL: "500", LIST_SHRS: "8312766" },
        ]}}),
    } as any;
    const rows = await fetchMasterFromKrx(client, "20260415");
    expect(rows).toHaveLength(3);
    expect(rows[0].market).toBe("KOSPI");
    expect(rows[2].market).toBe("KOSDAQ");
    expect(client.get).toHaveBeenCalledWith("/sto/stk_isu_base_info", { params: { basDd: "20260415" } });
    expect(client.get).toHaveBeenCalledWith("/sto/ksq_isu_base_info", { params: { basDd: "20260415" } });
  });

  it("OutBlock_1 누락 시 빈 배열 반환", async () => {
    const client = {
      get: vi.fn()
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} }),
    } as any;
    const rows = await fetchMasterFromKrx(client, "20260415");
    expect(rows).toEqual([]);
  });

  it("HTTP 에러 propagate", async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error("HTTP 401")),
    } as any;
    await expect(fetchMasterFromKrx(client, "20260415")).rejects.toThrow(/HTTP 401/);
  });

  it("401 응답 시 명확한 에러 메시지 throw", async () => {
    const err = new Error("Request failed") as any;
    err.response = { status: 401 };
    const client = {
      get: vi.fn().mockRejectedValue(err),
    } as any;
    await expect(fetchMasterFromKrx(client, "20260415")).rejects.toThrow(/AUTH_KEY 미승인/);
  });
});
