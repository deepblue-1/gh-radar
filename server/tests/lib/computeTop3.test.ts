import { describe, it, expect } from "vitest";
import { computeTop3Avg } from "../../src/lib/computeTop3";
import {
  themeRowToThemeWithStats,
  themeStockRowToMember,
  type ThemeRow,
  type ThemeStockRow,
} from "../../src/mappers/theme";
import type { StockMasterRow, StockQuoteRow } from "../../src/mappers/stock";

describe("computeTop3Avg (테마 소속 종목 등락률 상위 3 평균 — D-14)", () => {
  it("4개 이상이면 desc 정렬 후 상위 3개만 평균", () => {
    // (29.9 + 18.4 + 12.1) / 3 — 5.0 은 상위3 밖이라 제외
    expect(computeTop3Avg([29.9, 18.4, 12.1, 5.0])).toBeCloseTo(
      (29.9 + 18.4 + 12.1) / 3,
    );
  });

  it("입력 순서가 달라도 desc 상위 3 평균 (정렬 비의존)", () => {
    // 5.0 이 맨 앞이어도 상위3(29.9/18.4/12.1) 이 선택되어야 함
    expect(computeTop3Avg([5.0, 12.1, 29.9, 18.4])).toBeCloseTo(
      (29.9 + 18.4 + 12.1) / 3,
    );
  });

  it("종목 2개면 2개 평균", () => {
    expect(computeTop3Avg([10, 4])).toBeCloseTo(7);
  });

  it("종목 1개면 그 값", () => {
    expect(computeTop3Avg([8.5])).toBeCloseTo(8.5);
  });

  it("0개(빈 배열)면 null", () => {
    expect(computeTop3Avg([])).toBeNull();
  });

  it("음수 등락률도 정렬 후 상위3 평균 (전부 음수면 음수)", () => {
    // [-2.4, -5, -8] desc → 상위3 = [-2.4, -5, -8], 평균 음수
    expect(computeTop3Avg([-8, -2.4, -5])).toBeCloseTo((-2.4 + -5 + -8) / 3);
  });

  it("양수/음수 혼합 → 상위 3 양수 우선", () => {
    // [15, 3, -2, -10] desc → 상위3 = [15, 3, -2]
    expect(computeTop3Avg([15, 3, -2, -10])).toBeCloseTo((15 + 3 + -2) / 3);
  });
});

// === theme mapper (ThemeWithStats / ThemeStockMember) ===

const themeRow: ThemeRow = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "HBM",
  description: "고대역폭메모리",
  is_system: true,
  owner_id: null,
  sources: ["naver", "alphasquare"],
  top3_avg_change_rate: "1.2300", // DB precompute (실시간 계산으로 덮어써야 함)
  stats_updated_at: "2026-06-09T00:00:00Z",
  created_at: "2026-06-09T00:00:00Z",
  updated_at: "2026-06-09T00:00:00Z",
};

const quote = (code: string, rate: string): StockQuoteRow => ({
  code,
  price: "10000",
  change_amount: "100",
  change_rate: rate,
  volume: 1000,
  trade_amount: 5_000_000,
  open: "9900",
  high: "10100",
  low: "9800",
  market_cap: 1_000_000_000,
  upper_limit: "13000",
  lower_limit: "7000",
  updated_at: "2026-06-09T01:00:00Z",
});

describe("themeRowToThemeWithStats (목록 항목 — top3AvgChangeRate 실시간 재계산 + stockCount)", () => {
  it("소속 종목 등락률 상위3 평균을 stock_quotes 로 재계산 (DB 컬럼 무시)", () => {
    const codes = ["A", "B", "C", "D"];
    const quoteByCode = new Map<string, StockQuoteRow>([
      ["A", quote("A", "29.9")],
      ["B", quote("B", "18.4")],
      ["C", quote("C", "12.1")],
      ["D", quote("D", "5.0")],
    ]);
    const out = themeRowToThemeWithStats(themeRow, codes, quoteByCode);
    expect(out.top3AvgChangeRate).toBeCloseTo((29.9 + 18.4 + 12.1) / 3);
    // DB precompute(1.23) 이 아닌 실시간 값으로 덮어써야 함
    expect(out.top3AvgChangeRate).not.toBeCloseTo(1.23);
    expect(out.stockCount).toBe(4);
    expect(out.isSystem).toBe(true);
    expect(out.sources).toEqual(["naver", "alphasquare"]);
  });

  it("시세 없는 종목은 등락률에서 제외하되 stockCount 에는 포함", () => {
    const codes = ["A", "B"]; // B 는 시세 부재
    const quoteByCode = new Map<string, StockQuoteRow>([
      ["A", quote("A", "10")],
    ]);
    const out = themeRowToThemeWithStats(themeRow, codes, quoteByCode);
    expect(out.top3AvgChangeRate).toBeCloseTo(10); // A 1개만 평균
    expect(out.stockCount).toBe(2); // 멤버십 기준
  });

  it("소속 종목이 0개면 top3AvgChangeRate null + stockCount 0", () => {
    const out = themeRowToThemeWithStats(
      themeRow,
      [],
      new Map<string, StockQuoteRow>(),
    );
    expect(out.top3AvgChangeRate).toBeNull();
    expect(out.stockCount).toBe(0);
  });
});

describe("themeStockRowToMember (상세 종목 행 — master/quote 조인)", () => {
  const tsRow: ThemeStockRow = {
    theme_id: themeRow.id,
    stock_code: "005930",
    source: "naver",
    confidence: null,
    reason: "메모리 대장주",
    effective_from: "2026-06-09T00:00:00Z",
    effective_to: null,
  };
  const master: StockMasterRow = {
    code: "005930",
    name: "삼성전자",
    market: "KOSPI",
    sector: null,
    security_type: "보통주",
    listing_date: null,
    is_delisted: false,
    updated_at: "2026-06-09T00:00:00Z",
  };

  it("master + quote 있으면 name/market/price/changeRate/tradeAmount 채움", () => {
    const out = themeStockRowToMember(tsRow, master, quote("005930", "15.5"));
    expect(out).toEqual({
      code: "005930",
      name: "삼성전자",
      market: "KOSPI",
      price: 10000,
      changeRate: 15.5,
      tradeAmount: 5_000_000,
      source: "naver",
    });
  });

  it("시세 부재 → price/changeRate/tradeAmount = 0 (em-dash 폴백)", () => {
    const out = themeStockRowToMember(tsRow, master, null);
    expect(out.price).toBe(0);
    expect(out.changeRate).toBe(0);
    expect(out.tradeAmount).toBe(0);
    expect(out.name).toBe("삼성전자");
  });

  it("스키마 외 source 값은 'naver' 로 폴백", () => {
    const out = themeStockRowToMember(
      { ...tsRow, source: "weird-source" },
      master,
      null,
    );
    expect(out.source).toBe("naver");
  });
});
