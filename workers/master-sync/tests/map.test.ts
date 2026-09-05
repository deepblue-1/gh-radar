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

  // ── Phase 15 Plan 10 (D-28 / T-15-31): isin 매핑 + ETP 오염 방어 ────────────

  it("① 정상 12자 ISU_CD → isin 저장 (삼성전자 KR7005930003)", () => {
    const r = krxToMasterRow({
      ISU_CD: "KR7005930003", ISU_SRT_CD: "005930", ISU_ABBRV: "삼성전자",
      SECUGRP_NM: "주권", KIND_STKCERT_TP_NM: "보통주", market: "KOSPI",
    });
    expect(r.isin).toBe("KR7005930003");
    expect(r.isin).not.toBe(r.code); // 단축코드와 별개 값 (산술 유도 금지 — D-28)
  });

  it("② ETP 행(ISU_CD 없음) → isin null", () => {
    // fetchEtpBaseInfo.ts 가 만드는 행의 형태 그대로 — ISU_CD 미설정 (Pitfall 13)
    const r = krxToMasterRow({
      ISU_SRT_CD: "069500", ISU_NM: "KODEX 200", ISU_ABBRV: "KODEX 200",
      SECUGRP_NM: "ETF", KIND_STKCERT_TP_NM: "ETF", market: "KOSPI",
    });
    expect(r.isin).toBeNull();
  });

  it("③ 6자 ISU_CD(단축코드 혼입) → isin null — 정규식 가드 (T-15-31)", () => {
    const r = krxToMasterRow({
      ISU_CD: "069500", ISU_SRT_CD: "069500", ISU_ABBRV: "KODEX 200",
      SECUGRP_NM: "ETF", market: "KOSPI",
    });
    expect(r.isin).toBeNull(); // DB CHECK 에 닿기 전에 애플리케이션에서 차단
  });

  it("④ 공백 패딩된 12자 → trim 후 통과 / 소문자는 거부", () => {
    const padded = krxToMasterRow({
      ISU_CD: "  KR7005931001  ", ISU_SRT_CD: "005935", ISU_ABBRV: "삼성전자우",
      KIND_STKCERT_TP_NM: "구형우선주", market: "KOSPI",
    });
    expect(padded.isin).toBe("KR7005931001");

    const lower = krxToMasterRow({
      ISU_CD: "kr7005930003", ISU_SRT_CD: "005930", ISU_ABBRV: "삼성전자",
      market: "KOSPI",
    });
    expect(lower.isin).toBeNull(); // 표준코드는 대문자 — 소문자는 비정상 응답으로 본다
  });

  it("④-b 11자/13자 등 길이 이탈 + 빈 문자열 → isin null", () => {
    const cases = ["KR700593000", "KR70059300031", "", "   ", "KR7005930-03"];
    for (const ISU_CD of cases) {
      const r = krxToMasterRow({
        ISU_CD, ISU_SRT_CD: "005930", ISU_ABBRV: "삼성전자", market: "KOSPI",
      });
      expect(r.isin, `ISU_CD="${ISU_CD}"`).toBeNull();
    }
  });

  it("우선주 isin 은 보통주 isin 에서 산술 유도한 값과 다르다 (D-28 근거)", () => {
    const common = krxToMasterRow({
      ISU_CD: "KR7005930003", ISU_SRT_CD: "005930", ISU_ABBRV: "삼성전자",
      market: "KOSPI",
    });
    const preferred = krxToMasterRow({
      ISU_CD: "KR7005931001", ISU_SRT_CD: "005935", ISU_ABBRV: "삼성전자우",
      market: "KOSPI",
    });
    // 단축코드는 005930 → 005935 (+5) 인데 isin 본문은 005930 → 005931 (+1) 이고
    // 체크digit 도 3 → 1 로 함께 바뀐다. 같은 규칙이 아니다 — 산술 유도가 불가능하다는
    // 것이 매핑 컬럼(D-28)을 두는 이유이고, Task 3 이 production 값으로 재확인한다.
    expect(preferred.isin).not.toBe(common.isin);
    expect(common.isin).toBe("KR7005930003");
    expect(preferred.isin).toBe("KR7005931001");
  });
});
