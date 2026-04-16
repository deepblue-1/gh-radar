import { describe, it, expect } from "vitest";
import { krxToMasterRow } from "../src/pipeline/map";

describe("krxToMasterRow (2026-04-16 실측 응답 기반)", () => {
  it("KOSPI 삼성전자 실측 row — code/name/market/securityType/securityGroup/listingDate 매핑", () => {
    const r = krxToMasterRow({
      ISU_CD: "KR7005930003", ISU_SRT_CD: "005930",
      ISU_NM: "삼성전자보통주", ISU_ABBRV: "삼성전자",
      ISU_ENG_NM: "SamsungElectronics",
      MKT_TP_NM: "KOSPI", SECUGRP_NM: "주권", SECT_TP_NM: "",
      KIND_STKCERT_TP_NM: "보통주",
      LIST_DD: "19750611", PARVAL: "100", LIST_SHRS: "5846278608",
      market: "KOSPI",
    });
    expect(r.code).toBe("005930");
    expect(r.name).toBe("삼성전자");             // ISU_ABBRV 우선
    expect(r.market).toBe("KOSPI");
    expect(r.securityType).toBe("보통주");       // KIND_STKCERT_TP_NM (C2)
    expect(r.securityGroup).toBe("주권");        // SECUGRP_NM 보존 (C2)
    expect(r.sector).toBeNull();                 // C1: KRX 응답에 업종 없음 — 항상 NULL
    expect(r.kosdaqSegment).toBeNull();          // KOSPI 는 SECT_TP_NM 빈 문자열
    expect(r.englishName).toBe("SamsungElectronics");
    expect(r.listingDate).toBe("1975-06-11");
    expect(r.parValue).toBe(100);
    expect(r.listingShares).toBe(5846278608);
    expect(r.isDelisted).toBe(false);
  });

  it("KOSDAQ row — SECT_TP_NM='중견기업부' → kosdaqSegment 채움, sector 는 여전히 NULL", () => {
    const r = krxToMasterRow({
      ISU_CD: "KR7098120009", ISU_SRT_CD: "098120",
      ISU_NM: "(주)마이크로컨텍솔루션", ISU_ABBRV: "마이크로컨텍솔",
      MKT_TP_NM: "KOSDAQ", SECUGRP_NM: "주권", SECT_TP_NM: "중견기업부",
      KIND_STKCERT_TP_NM: "보통주",
      LIST_DD: "20080923", PARVAL: "500", LIST_SHRS: "8312766",
      market: "KOSDAQ",
    });
    expect(r.market).toBe("KOSDAQ");
    expect(r.kosdaqSegment).toBe("중견기업부");
    expect(r.sector).toBeNull();                 // C1: 여전히 NULL
    expect(r.securityGroup).toBe("주권");
    expect(r.securityType).toBe("보통주");
  });

  it("SECUGRP_NM='부동산투자회사' (REIT) 보존", () => {
    const r = krxToMasterRow({
      ISU_SRT_CD: "330590", ISU_ABBRV: "맥쿼리인프라",
      MKT_TP_NM: "KOSPI", SECUGRP_NM: "부동산투자회사", SECT_TP_NM: "",
      KIND_STKCERT_TP_NM: "보통주", market: "KOSPI",
    });
    expect(r.securityGroup).toBe("부동산투자회사");
    expect(r.securityType).toBe("보통주");
  });

  it("KIND_STKCERT_TP_NM='구형우선주' → securityType='구형우선주'", () => {
    const r = krxToMasterRow({
      ISU_SRT_CD: "005935", ISU_ABBRV: "삼성전자우",
      MKT_TP_NM: "KOSPI", SECUGRP_NM: "주권", SECT_TP_NM: "",
      KIND_STKCERT_TP_NM: "구형우선주", market: "KOSPI",
    });
    expect(r.securityType).toBe("구형우선주");
  });

  it("ISU_ABBRV 누락 시 ISU_NM fallback", () => {
    const r = krxToMasterRow({
      ISU_SRT_CD: "999999", ISU_NM: "풀네임만",
      market: "KOSDAQ",
    });
    expect(r.name).toBe("풀네임만");
  });

  it("KIND_STKCERT_TP_NM 누락 시 보통주 기본, SECUGRP_NM 누락 시 '주권' 기본", () => {
    const r = krxToMasterRow({
      ISU_SRT_CD: "111111", ISU_ABBRV: "X", market: "KOSPI",
    });
    expect(r.securityType).toBe("보통주");
    expect(r.securityGroup).toBe("주권");
  });

  it("SECT_TP_NM 빈 문자열 → kosdaqSegment null, sector 는 항상 null", () => {
    const r = krxToMasterRow({
      ISU_SRT_CD: "111111", ISU_ABBRV: "X", SECT_TP_NM: "  ", market: "KOSPI",
    });
    expect(r.kosdaqSegment).toBeNull();
    expect(r.sector).toBeNull();
  });

  it("LIST_DD 누락 시 listingDate null, PARVAL/LIST_SHRS 누락 시 nullable 정수", () => {
    const r = krxToMasterRow({
      ISU_SRT_CD: "111111", ISU_ABBRV: "X", market: "KOSPI",
    });
    expect(r.listingDate).toBeNull();
    expect(r.parValue).toBeNull();
    expect(r.listingShares).toBeNull();
    expect(r.englishName).toBeNull();
  });

  it("ISU_SRT_CD 누락 시 throw", () => {
    expect(() => krxToMasterRow({ market: "KOSPI" } as any)).toThrow(/ISU_SRT_CD/);
  });
});
