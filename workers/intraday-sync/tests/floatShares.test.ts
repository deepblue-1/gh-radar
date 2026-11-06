import { describe, it, expect } from "vitest";
import {
  parseKiwoomCount,
  parseKiwoomRate,
  pickUnitMultiplier,
  decideRunMultiplier,
  toFloatRaw,
  toStockFloatRow,
  type FloatRaw,
} from "../src/pipeline/floatShares";

const raw = (over: Partial<FloatRaw>): FloatRaw => ({
  code: "000000",
  flo: null,
  dstr: null,
  rate: null,
  listingShares: null,
  ...over,
});

describe("parseKiwoomCount", () => {
  it("부호 · 콤마 정리", () => {
    expect(parseKiwoomCount("+5,969,783")).toBe(5969783);
    expect(parseKiwoomCount(" 4500000 ")).toBe(4500000);
  });
  it("빈 값 · 0 · 비숫자 → null", () => {
    expect(parseKiwoomCount("")).toBeNull();
    expect(parseKiwoomCount(undefined)).toBeNull();
    expect(parseKiwoomCount("0")).toBeNull();
    expect(parseKiwoomCount("abc")).toBeNull();
  });
});

describe("parseKiwoomRate", () => {
  it("0 < r ≤ 100 만 통과", () => {
    expect(parseKiwoomRate("75.38")).toBe(75.38);
    expect(parseKiwoomRate("+75.38")).toBe(75.38);
    expect(parseKiwoomRate("100")).toBe(100);
  });
  it("0 · 빈 값 · 범위 밖 → null", () => {
    expect(parseKiwoomRate("0")).toBeNull();
    expect(parseKiwoomRate("")).toBeNull();
    expect(parseKiwoomRate("123.4")).toBeNull();
    expect(parseKiwoomRate(undefined)).toBeNull();
  });
});

describe("pickUnitMultiplier", () => {
  it("천주 응답 → 1000", () => {
    expect(pickUnitMultiplier(5969783, 5969782660)).toBe(1000);
  });
  it("주 응답 → 1", () => {
    expect(pickUnitMultiplier(5969782660, 5969782660)).toBe(1);
    expect(pickUnitMultiplier(5900000000, 5969782660)).toBe(1);
  });
});

describe("decideRunMultiplier", () => {
  it("다수결 1000 (3:1) · disagree 1", () => {
    const out = decideRunMultiplier([
      raw({ code: "A", flo: 1000, listingShares: 1_000_000 }),
      raw({ code: "B", flo: 2000, listingShares: 2_000_000 }),
      raw({ code: "C", flo: 3000, listingShares: 3_000_000 }),
      raw({ code: "D", flo: 4_000_000, listingShares: 4_000_000 }),
      raw({ code: "E", flo: 5000, listingShares: null }), // 표 없음
    ]);
    expect(out.multiplier).toBe(1000);
    expect(out.votes).toEqual({ 1: 1, 1000: 3 });
    expect(out.disagree).toBe(1);
  });
  it("listing_shares 있는 행이 0개 → null", () => {
    const out = decideRunMultiplier([raw({ code: "A", flo: 1000 })]);
    expect(out.multiplier).toBeNull();
    expect(out.votes).toEqual({ 1: 0, 1000: 0 });
  });
  it("동률 → null", () => {
    const out = decideRunMultiplier([
      raw({ code: "A", flo: 1000, listingShares: 1_000_000 }),
      raw({ code: "B", flo: 2_000_000, listingShares: 2_000_000 }),
    ]);
    expect(out.multiplier).toBeNull();
  });
});

describe("toFloatRaw", () => {
  it("요청 code 를 키로 · 네 값만", () => {
    const r = toFloatRaw(
      "005930",
      { stk_cd: "005930_AL", cur_prc: "+1", open_pric: "1", high_pric: "1", low_pric: "1", flo_stk: "5969783", dstr_stk: "4500000", dstr_rt: "75.38" },
      5969782660,
    );
    expect(r).toEqual({ code: "005930", flo: 5969783, dstr: 4500000, rate: 75.38, listingShares: 5969782660 });
  });
});

describe("toStockFloatRow", () => {
  const asOf = "2026-11-06";
  const ts = "2026-11-06T12:30:00.000Z";

  it("삼성(천주 응답) → 주 단위", () => {
    const r = toStockFloatRow(
      raw({ code: "005930", flo: 5969783, dstr: 4500000, rate: 75.38, listingShares: 5969782660 }),
      1000,
      asOf,
      ts,
    );
    expect(r).toEqual({
      code: "005930",
      float_shares: 4500000000,
      float_rate: 75.38,
      listed_shares: 5969783000,
      as_of: asOf,
      updated_at: ts,
    });
    expect(Object.keys(r).sort()).toEqual(
      ["as_of", "code", "float_rate", "float_shares", "listed_shares", "updated_at"],
    );
  });

  it("ETF(dstr 빈 값) → float null · listed 채움", () => {
    const etfRaw = toFloatRaw(
      "069500",
      { stk_cd: "069500", cur_prc: "1", open_pric: "1", high_pric: "1", low_pric: "1", flo_stk: "12345", dstr_stk: "", dstr_rt: "" },
      12_345_000,
    );
    const r = toStockFloatRow(etfRaw, 1000, asOf, ts);
    expect(r.float_shares).toBeNull();
    expect(r.float_rate).toBeNull();
    expect(r.listed_shares).toBe(12_345_000);
  });

  it("listing_shares null → run 배수 적용", () => {
    const r = toStockFloatRow(raw({ code: "X", flo: 1000, dstr: 500, rate: 50 }), 1000, asOf, ts);
    expect(r.listed_shares).toBe(1_000_000);
    expect(r.float_shares).toBe(500_000);
  });

  it("run 배수 null + listing_shares null → 세 값 null", () => {
    const r = toStockFloatRow(raw({ code: "X", flo: 1000, dstr: 500, rate: 50 }), null, asOf, ts);
    expect(r.listed_shares).toBeNull();
    expect(r.float_shares).toBeNull();
    expect(r.float_rate).toBeNull();
  });

  it("rate 없음 → float/listed×100 소수 둘째 자리", () => {
    const r = toStockFloatRow(
      raw({ code: "X", flo: 3000, dstr: 1000, rate: null, listingShares: 3_000_000 }),
      1000,
      asOf,
      ts,
    );
    expect(r.float_rate).toBe(33.33);
  });
});
