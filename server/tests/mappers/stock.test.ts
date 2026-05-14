import { describe, it, expect } from "vitest";
import { rowToStock, inquirePriceToQuoteRow } from "../../src/mappers/stock";
import { samsungRow } from "../fixtures/stocks";
import type { KiwoomKa10001Row } from "@gh-radar/shared";

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

describe("inquirePriceToQuoteRow (Phase 09.1 D-17 — 키움 ka10001)", () => {
  const ka10001: KiwoomKa10001Row = {
    stk_cd: "005930",
    cur_prc: "+70500",
    pred_pre: "+500",
    flu_rt: "+0.71",
    open_pric: "+70000",
    high_pric: "+71000",
    low_pric: "+69500",
    upl_pric: "91000",
    lst_pric: "49000",
    mac: "4209000",
  };

  it("ka10001 응답 → StockQuoteRowUpsert 매핑 (절댓값 + market_cap × 10^8)", () => {
    const row = inquirePriceToQuoteRow("005930", ka10001);
    expect(row.code).toBe("005930");
    expect(row.price).toBe("70500");
    expect(row.open).toBe("70000");
    expect(row.high).toBe("71000");
    expect(row.low).toBe("69500");
    expect(row.upper_limit).toBe("91000");
    expect(row.lower_limit).toBe("49000");
    expect(row.market_cap).toBe(4209000 * 100_000_000);
    expect(row.change_amount).toBe("500");
    expect(row.change_rate).toBe("0.71");
  });

  it("volume / trade_amount 키 omit (D-22 충돌 해소 — R3 RESOLVED)", () => {
    const row = inquirePriceToQuoteRow("005930", ka10001);
    expect(row).not.toHaveProperty("volume");
    expect(row).not.toHaveProperty("trade_amount");
  });

  it("upl_pric / lst_pric / mac 빈 문자열 → null (ETF 패턴)", () => {
    const etf: KiwoomKa10001Row = {
      ...ka10001,
      upl_pric: "",
      lst_pric: "",
      mac: "",
    };
    const row = inquirePriceToQuoteRow("069500", etf);
    expect(row.upper_limit).toBe("0");
    expect(row.lower_limit).toBe("0");
    expect(row.market_cap).toBeNull();
  });

  it("음수 cur_prc → 절댓값 (변동성 종목)", () => {
    const jeil: KiwoomKa10001Row = {
      ...ka10001,
      cur_prc: "-1500",
      pred_pre: "-150",
      flu_rt: "-9.09",
      open_pric: "+1650",
      high_pric: "+1700",
      low_pric: "+1450",
    };
    const row = inquirePriceToQuoteRow("052670", jeil);
    expect(row.price).toBe("1500"); // 절댓값
    expect(row.change_amount).toBe("-150"); // 부호 유지
    expect(row.change_rate).toBe("-9.09");
  });
});
