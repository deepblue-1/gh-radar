import type { Stock, Market, KiwoomKa10001Row } from "@gh-radar/shared";

// === 공통 parser (worker 와 별도 모듈 인스턴스 — cross-workspace import 회피) ===

function parseSignedPrice(s: string | undefined): number {
  if (!s) throw new Error("missing signed price");
  const trimmed = s.trim();
  if (trimmed === "") throw new Error("missing signed price");
  const sign = trimmed[0];
  const rest = sign === "+" || sign === "-" ? trimmed.slice(1) : trimmed;
  const abs = Number(rest.replace(/,/g, ""));
  if (!Number.isFinite(abs)) throw new Error(`invalid signed price: "${s}"`);
  return abs;
}

function parseOptionalSignedNumber(s: string | undefined): number | null {
  if (!s || s.trim() === "") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseMac(s: string | undefined): number | null {
  if (!s || s.trim() === "") return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  // 가설 단위 = 억원 (Plan 04/05 fixture 기준 — R2). 잘못된 경우 본 줄만 변경.
  return Math.round(n * 100_000_000);
}

// === 레거시 — Plan 05 전환 전 stocks 테이블 row (scanner 테스트가 사용) ===

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

/**
 * stock_quotes UPSERT 시 명시 컬럼만 갱신하는 partial row 타입.
 * Phase 09.1 D-22 충돌 해소 (R3 RESOLVED) — server on-demand 호출이 worker 의
 * STEP1 매분 trade_amount/volume UPSERT 결과를 덮어쓰지 않도록 두 컬럼을 omit.
 */
export type StockQuoteRowUpsert = Omit<StockQuoteRow, "volume" | "trade_amount">;

/**
 * 키움 ka10001 응답 → stock_quotes UPSERT (부분 컬럼) row.
 * Phase 09.1 D-17/D-18 — server 도 키움 동기 호출.
 * RESEARCH §2.4 + Open Q R3 RESOLVED.
 *
 * volume / trade_amount 키 omit (D-22 충돌 해소):
 *   - STEP1 ka10027 가 매분 1898 종목의 정확값 (volume × close 근사) UPSERT
 *   - server on-demand 호출은 가격/등락/OHLC/limits/market_cap 만 갱신
 *   - Supabase upsert({ onConflict: "code" }) 가 row 의 명시 키만 SET — 미언급
 *     컬럼 (volume, trade_amount) 은 기존 값 유지
 */
export function inquirePriceToQuoteRow(
  code: string,
  ka10001: KiwoomKa10001Row,
): StockQuoteRowUpsert {
  const price = parseSignedPrice(ka10001.cur_prc);
  const open = parseSignedPrice(ka10001.open_pric);
  const high = parseSignedPrice(ka10001.high_pric);
  const low = parseSignedPrice(ka10001.low_pric);
  const changeAmount = parseOptionalSignedNumber(ka10001.pred_pre);
  const changeRate = parseOptionalSignedNumber(ka10001.flu_rt);
  const upperLimit = parseOptionalSignedNumber(ka10001.upl_pric);
  const lowerLimit = parseOptionalSignedNumber(ka10001.lst_pric);
  const marketCap = parseMac(ka10001.mac);

  // 명시 키만 — volume / trade_amount 는 의도적으로 omit (D-22)
  return {
    code,
    price: price.toString(),
    change_amount: (changeAmount ?? 0).toString(),
    change_rate: (changeRate ?? 0).toString(),
    open: open.toString(),
    high: high.toString(),
    low: low.toString(),
    market_cap: marketCap,
    upper_limit: (upperLimit !== null ? Math.abs(upperLimit) : 0).toString(),
    lower_limit: (lowerLimit !== null ? Math.abs(lowerLimit) : 0).toString(),
    updated_at: new Date().toISOString(),
  };
}
