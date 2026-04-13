import { describe, it, expect } from "vitest";
import { rowToStock } from "../../src/mappers/stock";
import { samsungRow } from "../fixtures/stocks";

describe("rowToStock", () => {
  it("converts string numerics to number", () => {
    const s = rowToStock(samsungRow);
    expect(typeof s.price).toBe("number");
    expect(s.price).toBe(70000);
    expect(s.changeRate).toBeCloseTo(1.45);
  });
  it("computes upperLimitProximity = price/upperLimit", () => {
    const s = rowToStock(samsungRow);
    expect(s.upperLimitProximity).toBeCloseTo(70000 / 91000);
  });
  it("returns 0 for upperLimitProximity when upper_limit is 0", () => {
    const s = rowToStock({ ...samsungRow, upper_limit: "0" });
    expect(s.upperLimitProximity).toBe(0);
  });
  it("handles null market_cap as 0", () => {
    const s = rowToStock({ ...samsungRow, market_cap: null });
    expect(s.marketCap).toBe(0);
  });
  it("preserves market as 'KOSPI' | 'KOSDAQ'", () => {
    expect(rowToStock(samsungRow).market).toBe("KOSPI");
  });
});
