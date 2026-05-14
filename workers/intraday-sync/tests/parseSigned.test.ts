import { describe, it, expect } from "vitest";
import {
  parseSignedPrice,
  parseOptionalSignedNumber,
  parseOptionalNumber,
  stripAlSuffix,
} from "../src/pipeline/map";

describe("parseSignedPrice", () => {
  it("'+6760' → { value: 6760, direction: 'up' }", () => {
    expect(parseSignedPrice("+6760")).toEqual({ value: 6760, direction: "up" });
  });

  it("'-274250' → { value: 274250, direction: 'down' }", () => {
    expect(parseSignedPrice("-274250")).toEqual({ value: 274250, direction: "down" });
  });

  it("'6760' → { value: 6760, direction: 'flat' } (부호 없음)", () => {
    expect(parseSignedPrice("6760")).toEqual({ value: 6760, direction: "flat" });
  });

  it("'0' → { value: 0, direction: 'flat' } (보합)", () => {
    expect(parseSignedPrice("0")).toEqual({ value: 0, direction: "flat" });
  });

  it("'+1,234,567' → 천단위 콤마 처리", () => {
    expect(parseSignedPrice("+1,234,567")).toEqual({ value: 1234567, direction: "up" });
  });

  it("'' → throws 'missing signed price'", () => {
    expect(() => parseSignedPrice("")).toThrow(/missing signed price/);
  });

  it("undefined → throws 'missing signed price'", () => {
    expect(() => parseSignedPrice(undefined)).toThrow(/missing signed price/);
  });

  it("'abc' → throws (invalid)", () => {
    expect(() => parseSignedPrice("abc")).toThrow(/invalid signed price/);
  });
});

describe("parseOptionalSignedNumber", () => {
  it("'+1.50' → 1.5", () => {
    expect(parseOptionalSignedNumber("+1.50")).toBe(1.5);
  });

  it("'-1.50' → -1.5", () => {
    expect(parseOptionalSignedNumber("-1.50")).toBe(-1.5);
  });

  it("'' → null", () => {
    expect(parseOptionalSignedNumber("")).toBeNull();
  });

  it("undefined → null", () => {
    expect(parseOptionalSignedNumber(undefined)).toBeNull();
  });

  it("천단위 콤마 처리", () => {
    expect(parseOptionalSignedNumber("+1,234")).toBe(1234);
  });
});

describe("parseOptionalNumber", () => {
  it("'1234567' → 1234567", () => {
    expect(parseOptionalNumber("1234567")).toBe(1234567);
  });

  it("'' → null", () => {
    expect(parseOptionalNumber("")).toBeNull();
  });

  it("undefined → null", () => {
    expect(parseOptionalNumber(undefined)).toBeNull();
  });

  it("천단위 콤마 처리", () => {
    expect(parseOptionalNumber("1,234,567")).toBe(1234567);
  });
});

describe("stripAlSuffix", () => {
  it("'007460_AL' → '007460'", () => {
    expect(stripAlSuffix("007460_AL")).toBe("007460");
  });

  it("'005930' → '005930' (no suffix)", () => {
    expect(stripAlSuffix("005930")).toBe("005930");
  });
});
