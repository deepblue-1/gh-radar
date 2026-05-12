import { describe, it, expect } from "vitest";
import { krxBdydToOhlcvRow } from "../src/pipeline/map";
import type { BdydTrdRow } from "@gh-radar/shared";

const baseRow: BdydTrdRow = {
  BAS_DD: "20260509",
  ISU_CD: "005930",
  ISU_NM: "삼성전자",
  TDD_OPNPRC: "70000",
  TDD_HGPRC: "70500",
  TDD_LWPRC: "69500",
  TDD_CLSPRC: "70200",
  ACC_TRDVOL: "12345678",
  ACC_TRDVAL: "865432100000",
  CMPPREVDD_PRC: "200",
  FLUC_RT: "0.29",
  market: "KOSPI",
};

describe("krxBdydToOhlcvRow", () => {
  it("정상 row 매핑 — OHLCV/volume/tradeAmount/change*", () => {
    const out = krxBdydToOhlcvRow(baseRow);
    expect(out.code).toBe("005930");
    expect(out.date).toBe("2026-05-09");
    expect(out.open).toBe(70000);
    expect(out.high).toBe(70500);
    expect(out.low).toBe(69500);
    expect(out.close).toBe(70200);
    expect(out.volume).toBe(12345678);
    expect(out.tradeAmount).toBe(865432100000);
    expect(out.changeAmount).toBe(200);
    expect(out.changeRate).toBe(0.29);
  });

  it("CMPPREVDD_PRC 없으면 changeAmount=null", () => {
    const out = krxBdydToOhlcvRow({ ...baseRow, CMPPREVDD_PRC: undefined });
    expect(out.changeAmount).toBeNull();
  });

  it("FLUC_RT 음수 처리 (하락 종목)", () => {
    const out = krxBdydToOhlcvRow({ ...baseRow, FLUC_RT: "-2.5" });
    expect(out.changeRate).toBe(-2.5);
  });

  it("FLUC_RT 빈 문자열이면 changeRate=null", () => {
    const out = krxBdydToOhlcvRow({ ...baseRow, FLUC_RT: "" });
    expect(out.changeRate).toBeNull();
  });

  it("KRX ',' 천단위 구분 문자열 파싱 (보수적)", () => {
    const out = krxBdydToOhlcvRow({
      ...baseRow,
      ACC_TRDVOL: "12,345,678",
      ACC_TRDVAL: "865,432,100,000",
    });
    expect(out.volume).toBe(12345678);
    expect(out.tradeAmount).toBe(865432100000);
  });

  it("ISU_CD 없으면 throw", () => {
    expect(() =>
      krxBdydToOhlcvRow({ ...baseRow, ISU_CD: "" } as any),
    ).toThrow(/ISU_CD/);
  });

  it("BAS_DD 가 8자 아니면 throw", () => {
    expect(() => krxBdydToOhlcvRow({ ...baseRow, BAS_DD: "2026509" })).toThrow(
      /BAS_DD/,
    );
  });

  it("TDD_CLSPRC 없으면 throw (필수 필드)", () => {
    expect(() =>
      krxBdydToOhlcvRow({ ...baseRow, TDD_CLSPRC: undefined } as any),
    ).toThrow();
  });
});
