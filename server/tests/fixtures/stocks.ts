import type { StockRow, StockMasterRow, StockQuoteRow } from "../../src/mappers/stock";

// === 레거시 StockRow (scanner 테스트가 사용) ===

export const samsungRow: StockRow = {
  code: "005930",
  name: "삼성전자",
  market: "KOSPI",
  price: "70000.00",
  change_amount: "1000.00",
  change_rate: "1.4500",
  volume: 12345678,
  trade_amount: 900000000000,
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

// === 마스터 universe DB row (snake_case — Plan 04 라우트 테스트용) ===

export const samsungMaster: StockMasterRow = {
  code: "005930",
  name: "삼성전자",
  market: "KOSPI",
  sector: null,
  security_type: "보통주",
  listing_date: "1975-06-11",
  is_delisted: false,
  updated_at: "2026-04-15T00:00:00Z",
};

// 마스터에는 있지만 시세 없는 종목 (em-dash 폴백 시나리오)
export const masterOnly: StockMasterRow = {
  code: "999999",
  name: "신규상장종목",
  market: "KOSDAQ",
  sector: null,
  security_type: "보통주",
  listing_date: null,
  is_delisted: false,
  updated_at: "2026-04-15T00:00:00Z",
};

export const allMasters: StockMasterRow[] = [samsungMaster, masterOnly];

// === stock_quotes DB row (snake_case) ===

export const samsungQuote: StockQuoteRow = {
  code: "005930",
  price: "70000",
  change_amount: "1000",
  change_rate: "1.45",
  volume: 12345678,
  trade_amount: 900000000000,
  open: "69500",
  high: "70500",
  low: "69000",
  market_cap: 418000000000000,
  upper_limit: "91000",
  lower_limit: "49000",
  updated_at: "2026-04-13T10:00:00Z",
};

export const allQuotes: StockQuoteRow[] = [samsungQuote];
