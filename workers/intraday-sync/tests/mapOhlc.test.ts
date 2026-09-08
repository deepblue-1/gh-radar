import { describe, it, expect } from "vitest";
import { ka10001RowToOhlcUpdate, parseMac } from "../src/pipeline/mapOhlc";
import samsung from "./fixtures/ka10001-005930.json";
import kakao from "./fixtures/ka10001-035720.json";
import jeil from "./fixtures/ka10001-052670.json";
import samsungPref from "./fixtures/ka10001-005935.json";
import kodex200 from "./fixtures/ka10001-069500.json";

describe("parseMac", () => {
  it("가설 단위 = 억원 → ×10^8", () => {
    expect(parseMac("4209000")).toBe(4209000 * 100_000_000);
  });
  it("빈 문자열 → null", () => {
    expect(parseMac("")).toBeNull();
    expect(parseMac(undefined)).toBeNull();
  });
  it("invalid → null", () => {
    expect(parseMac("abc")).toBeNull();
  });
  it("콤마 처리", () => {
    expect(parseMac("4,209,000")).toBe(4209000 * 100_000_000);
  });
});

describe("ka10001RowToOhlcUpdate", () => {
  it("005930 (삼성전자, 보통주 KOSPI)", () => {
    const r = ka10001RowToOhlcUpdate(samsung as any, "2026-05-14");
    expect(r.code).toBe("005930");
    expect(r.open).toBe(70000);
    expect(r.high).toBe(71000);
    expect(r.low).toBe(69500);
    expect(r.upperLimit).toBe(91000);
    expect(r.lowerLimit).toBe(49000);
    expect(r.marketCap).toBe(4209000 * 100_000_000);
  });

  it("035720 (카카오, KOSDAQ 대형) — 정상 응답", () => {
    const r = ka10001RowToOhlcUpdate(kakao as any, "2026-05-14");
    expect(r.code).toBe("035720");
    expect(r.open).toBe(44500);
    expect(r.upperLimit).toBe(57850);
  });

  it("052670 (제일바이오, 변동성) — 음수 cur_prc 환경에서도 open/high/low 양수", () => {
    const r = ka10001RowToOhlcUpdate(jeil as any, "2026-05-14");
    expect(r.code).toBe("052670");
    expect(r.open).toBe(1650);
    expect(r.high).toBe(1700);
    expect(r.low).toBe(1450);
  });

  it("005935 (삼성전자우, 우선주)", () => {
    const r = ka10001RowToOhlcUpdate(samsungPref as any, "2026-05-14");
    expect(r.code).toBe("005935");
    expect(r.open).toBe(57700);
    expect(r.upperLimit).toBe(75400);
  });

  it("069500 (KODEX 200, ETF) — upl_pric/lst_pric/mac 빈 문자열 → null", () => {
    const r = ka10001RowToOhlcUpdate(kodex200 as any, "2026-05-14");
    expect(r.code).toBe("069500");
    expect(r.upperLimit).toBeNull();
    expect(r.lowerLimit).toBeNull();
    expect(r.marketCap).toBeNull();
    expect(r.open).toBe(39900);
  });

  // 2026-09-08 회귀: 영문 포함 단축코드(KRX 숫자 소진분)가 STEP2 에서도 통과해야 한다.
  it("0011T0 (채비, 영문 포함 단축코드) 정상 매핑", () => {
    const r = ka10001RowToOhlcUpdate(
      { ...samsung, stk_cd: "0011T0" } as any,
      "2026-09-08",
    );
    expect(r.code).toBe("0011T0");
    expect(r.open).toBe(70000);
  });

  it("stk_cd 가 6자 단축코드(숫자+대문자) 아니면 throw", () => {
    // 7자
    expect(() => ka10001RowToOhlcUpdate(
      { ...samsung, stk_cd: "INVALID" } as any,
      "2026-05-14",
    )).toThrow(/Invalid ka10001 stk_cd/);
    // 소문자 포함
    expect(() => ka10001RowToOhlcUpdate(
      { ...samsung, stk_cd: "0011t0" } as any,
      "2026-05-14",
    )).toThrow(/Invalid ka10001 stk_cd/);
    // 5자
    expect(() => ka10001RowToOhlcUpdate(
      { ...samsung, stk_cd: "12345" } as any,
      "2026-05-14",
    )).toThrow(/Invalid ka10001 stk_cd/);
  });
});
