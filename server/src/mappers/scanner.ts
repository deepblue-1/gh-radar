import type { Stock, Market } from "@gh-radar/shared";
import type { StockMasterRow, StockQuoteRow } from "./stock.js";

export type TopMoverRow = {
  code: string;
  name: string;
  market: string;
  rank: number | null;
  ranked_at: string;
  scan_id: string | null;
  updated_at: string;
};

export type ScannerScreenResponse = Stock & { upperLimitProximity: number };

// top_movers (rank 정보) + master (보조) + quote (시세) 평탄화
export function scannerRowToStock(
  mover: TopMoverRow,
  master: StockMasterRow | null,
  quote: StockQuoteRow | null,
): ScannerScreenResponse {
  const price = quote ? Number(quote.price) : 0;
  const upper = quote ? Number(quote.upper_limit) : 0;
  return {
    code: mover.code,
    name: master?.name ?? mover.name,
    market: (master?.market ?? mover.market) as Market,
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
    updatedAt: quote ? quote.updated_at : mover.updated_at,
    upperLimitProximity: upper > 0 ? price / upper : 0,
  };
}
