import type { Stock, Market } from "@gh-radar/shared";

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
