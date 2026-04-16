import type { StockRow } from "../../src/mappers/stock";
import type { StockMaster, StockQuote } from "@gh-radar/shared";

export const samsungRow: StockRow = {
  code: "005930",
  name: "삼성전자",
  market: "KOSPI",
  price: "70000.00",
  change_amount: "1000.00",
  change_rate: "1.4500",
  volume: 12345678,
  open: "69500.00",
  high: "70500.00",
  low: "69000.00",
  market_cap: 418000000000000,
  upper_limit: "91000.00",
  lower_limit: "49000.00",
  updated_at: "2026-04-13T10:00:00Z",
};

export const kakaoRow: StockRow = {
  ...samsungRow,
  code: "035720",
  name: "카카오",
  price: "55000.00",
  change_amount: "500.00",
  change_rate: "0.9100",
  volume: 2345678,
  upper_limit: "71500.00",
  lower_limit: "38500.00",
  market_cap: 24000000000000,
};

export const kosdaqRow: StockRow = {
  ...samsungRow,
  code: "091990",
  name: "셀트리온헬스케어",
  market: "KOSDAQ",
  price: "80000.00",
  change_amount: "-1000.00",
  change_rate: "-1.2300",
  volume: 987654,
  upper_limit: "104000.00",
  lower_limit: "56000.00",
  market_cap: 13000000000000,
};

export const allRows = [samsungRow, kakaoRow, kosdaqRow];

// === 마스터 universe 테스트용 row (Plan 04 가 사용) ===

export const samsungMaster: StockMaster = {
  code: "005930",
  name: "삼성전자",
  market: "KOSPI",
  sector: null,
  kosdaqSegment: null,
  securityType: "보통주",
  securityGroup: "주권",
  englishName: "SamsungElectronics",
  listingDate: "1975-06-11",
  parValue: 100,
  listingShares: 5846278608,
  isDelisted: false,
  updatedAt: "2026-04-15T00:00:00Z",
};

export const samsungQuote: StockQuote = {
  code: "005930",
  price: 70000,
  changeAmount: 1000,
  changeRate: 1.45,
  volume: 12345678,
  tradeAmount: 900000000000,
  open: 69500,
  high: 70500,
  low: 69000,
  marketCap: 418000000000000,
  upperLimit: 91000,
  lowerLimit: 49000,
  updatedAt: "2026-04-13T10:00:00Z",
};

// 마스터에는 있지만 시세 없는 종목 (em-dash 폴백 시나리오)
export const masterOnly: StockMaster = {
  code: "999999",
  name: "신규상장종목",
  market: "KOSDAQ",
  sector: null,
  kosdaqSegment: "기술성장기업부",
  securityType: "보통주",
  securityGroup: "주권",
  englishName: null,
  listingDate: null,
  parValue: null,
  listingShares: null,
  isDelisted: false,
  updatedAt: "2026-04-15T00:00:00Z",
};

export const allMasters: StockMaster[] = [samsungMaster, masterOnly];
export const allQuotes: StockQuote[] = [samsungQuote];
