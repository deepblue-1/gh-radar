import { describe, it, expect, vi } from "vitest";
import { fetchEtpMastersFromKrx } from "../src/krx/fetchEtpBaseInfo";

/**
 * 2026-09-08 회귀 (quick-260908-fis 후속).
 *
 * 과거 ETP 필터는 `^\d{6}$` 였고, 그 근거 주석은 "키움 ka10027 이 6자리 숫자만 반환하므로
 * 영문코드 ETF/ELW 는 등록해도 매칭 불가" 였다. 그러나 그건 intraday-sync 매퍼가 숫자만
 * 통과시켜서 그렇게 보였던 것이고, 실제로 키움은 영문 포함 단축코드를 그대로 반환한다.
 * 그 결과 영문코드 ETF 297종이 마스터 밖에 남아 security_group='ETF' 를 못 받았고,
 * intraday-sync bootstrap 이 이들을 등록하면서 스캐너 급등 목록이 오염됐다.
 *
 * 따라서 ETP 마스터는 영문 포함 단축코드를 반드시 수용해야 한다.
 */
describe("fetchEtpMastersFromKrx — 단축코드 필터", () => {
  const mkClient = (byKind: Record<string, Array<{ ISU_CD: string; ISU_NM: string }>>) => ({
    get: vi.fn().mockImplementation((path: string) => {
      const kind = path.replace("/etp/", "").replace("_bydd_trd", "");
      return Promise.resolve({ data: { OutBlock_1: byKind[kind] ?? [] } });
    }),
  });

  it("영문 포함 단축코드 ETF/ETN 을 수용하고 SECUGRP_NM 을 정확히 태깅한다", async () => {
    const client = mkClient({
      etf: [
        { ISU_CD: "0193T0", ISU_NM: "KODEX SK하이닉스단일종목레버리지" },
        { ISU_CD: "069500", ISU_NM: "KODEX 200" },
      ],
      etn: [{ ISU_CD: "0220W0", ISU_NM: "영문코드 ETN" }],
      elw: [{ ISU_CD: "58L001", ISU_NM: "영문코드 ELW" }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await fetchEtpMastersFromKrx(client as any, "20260908");
    const byCode = new Map(rows.map((r) => [r.ISU_SRT_CD, r]));

    expect(byCode.get("0193T0")?.SECUGRP_NM).toBe("ETF");
    expect(byCode.get("069500")?.SECUGRP_NM).toBe("ETF");
    expect(byCode.get("0220W0")?.SECUGRP_NM).toBe("ETN");
    expect(byCode.get("58L001")?.SECUGRP_NM).toBe("ELW");
  });

  it("6자 단축코드가 아닌 값(ISIN 12자·빈값·소문자)은 계속 거부한다", async () => {
    const client = mkClient({
      etf: [
        { ISU_CD: "KR7069500007", ISU_NM: "ISIN 혼입" },
        { ISU_CD: "", ISU_NM: "빈값" },
        { ISU_CD: "0193t0", ISU_NM: "소문자" },
        { ISU_CD: "12345", ISU_NM: "다섯자" },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await fetchEtpMastersFromKrx(client as any, "20260908");
    expect(rows).toHaveLength(0);
  });
});
