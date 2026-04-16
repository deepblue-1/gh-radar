import { describe, it, expect } from "vitest";
import { krxToMasterRow } from "../src/pipeline/map";

describe("krxToMasterRow (Plan 03 가 구현)", () => {
  it("ISU_SRT_CD -> code, ISU_ABBRV -> name, MKT_TP_NM -> market", () => {
    const result = krxToMasterRow({
      ISU_SRT_CD: "005930",
      ISU_ABBRV: "삼성전자",
      ISU_NM: "삼성전자보통주",
      MKT_TP_NM: "KOSPI",
      SECUGRP_NM: "주권",
      LIST_DD: "19750611",
      SECT_TP_NM: "전기·전자",
      KIND_STKCERT_TP_NM: "보통주",
      market: "KOSPI",
    });
    expect(result.code).toBe("005930");
    expect(result.name).toBe("삼성전자");
    expect(result.market).toBe("KOSPI");
    expect(result.securityType).toBe("보통주");
    expect(result.listingDate).toBe("1975-06-11");
    expect(result.sector).toBeNull();
    expect(result.isDelisted).toBe(false);
  });
});
