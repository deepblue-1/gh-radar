import type { Stock, Market } from "@gh-radar/shared";
import type { KisInquirePriceRow } from "../kis/inquirePrice.js";

// === 레거시: scanner 가 사용하는 단일 stocks 테이블 row (Plan 05 전환 전까지 보존) ===

export type StockRow = {
  code: string;
  name: string;
  market: string;
  price: string;
  change_amount: string;
  change_rate: string;
  volume: number;
  trade_amount: number;
  open: string | null;
  high: string | null;
  low: string | null;
  market_cap: number | null;
  upper_limit: string;
  lower_limit: string;
  updated_at: string;
};

export type StockWithProximity = Stock & { upperLimitProximity: number };

export function rowToStock(r: StockRow): StockWithProximity {
  const upper = Number(r.upper_limit);
  const price = Number(r.price);
  return {
    code: r.code,
    name: r.name,
    market: r.market as Market,
    price,
    changeAmount: Number(r.change_amount),
    changeRate: Number(r.change_rate),
    volume: r.volume,
    tradeAmount: r.trade_amount,
    open: Number(r.open ?? 0),
    high: Number(r.high ?? 0),
    low: Number(r.low ?? 0),
    marketCap: Number(r.market_cap ?? 0),
    upperLimit: upper,
    lowerLimit: Number(r.lower_limit),
    updatedAt: r.updated_at,
    upperLimitProximity: upper > 0 ? price / upper : 0,
  };
}

// === 신규: 3-테이블 구조 (stocks 마스터 + stock_quotes) ===

export type StockMasterRow = {
  code: string;
  name: string;
  market: string;
  sector: string | null;
  security_type: string;
  listing_date: string | null;
  is_delisted: boolean;
  updated_at: string;
};

export type StockQuoteRow = {
  code: string;
  price: string;
  change_amount: string;
  change_rate: string;
  volume: number;
  trade_amount: number;
  open: string | null;
  high: string | null;
  low: string | null;
  market_cap: number | null;
  upper_limit: string;
  lower_limit: string;
  updated_at: string;
};

export type StockWithProximityResponse = Stock & { upperLimitProximity: number };

export function mergeMasterAndQuote(
  master: StockMasterRow,
  quote: StockQuoteRow | null,
): StockWithProximityResponse {
  const price = quote ? Number(quote.price) : 0;
  const upper = quote ? Number(quote.upper_limit) : 0;
  return {
    code: master.code,
    name: master.name,
    market: master.market as Market,
    price,
    changeAmount: quote ? Number(quote.change_amount) : 0,
    changeRate: quote ? Number(quote.change_rate) : 0,
    volume: quote ? quote.volume : 0,
    tradeAmount: quote ? quote.trade_amount : 0,
    open: quote ? Number(quote.open ?? 0) : 0,
    high: quote ? Number(quote.high ?? 0) : 0,
    low: quote ? Number(quote.low ?? 0) : 0,
    marketCap: quote ? Number(quote.market_cap ?? 0) : 0,
    upperLimit: upper,
    lowerLimit: quote ? Number(quote.lower_limit) : 0,
    updatedAt: quote ? quote.updated_at : master.updated_at,
    upperLimitProximity: upper > 0 ? price / upper : 0,
  };
}

// KIS inquirePrice 응답 → stock_quotes upsert row
export function inquirePriceToQuoteRow(
  code: string,
  price: KisInquirePriceRow,
): StockQuoteRow {
  return {
    code,
    price: price.stck_prpr,
    change_amount: price.prdy_vrss,
    change_rate: price.prdy_ctrt,
    volume: Number(price.acml_vol),
    trade_amount: Number(price.acml_tr_pbmn),
    open: price.stck_oprc,
    high: price.stck_hgpr,
    low: price.stck_lwpr,
    market_cap: Number(price.stck_avls),
    upper_limit: price.stck_mxpr,
    lower_limit: price.stck_llam,
    updated_at: new Date().toISOString(),
  };
}
