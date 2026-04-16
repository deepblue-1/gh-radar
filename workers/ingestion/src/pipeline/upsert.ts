import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stock } from "@gh-radar/shared";
import { logger } from "../logger";

// 시세 upsert (stock_quotes)
export async function upsertStockQuotes(
  supabase: SupabaseClient,
  stocks: Stock[],
): Promise<{ count: number }> {
  if (stocks.length === 0) return { count: 0 };

  const deduped = new Map<string, Stock>();
  for (const s of stocks) deduped.set(s.code, s);

  const rows = [...deduped.values()].map((s) => ({
    code: s.code,
    price: s.price,
    change_amount: s.changeAmount,
    change_rate: s.changeRate,
    volume: s.volume,
    trade_amount: s.tradeAmount,
    open: s.open,
    high: s.high,
    low: s.low,
    market_cap: s.marketCap,
    upper_limit: s.upperLimit,
    lower_limit: s.lowerLimit,
    updated_at: s.updatedAt,
  }));

  const { error } = await supabase
    .from("stock_quotes")
    .upsert(rows, { onConflict: "code" });

  if (error) {
    logger.error({ error }, "upsertStockQuotes failed");
    throw error;
  }
  return { count: rows.length };
}

// 랭킹 캐시 upsert (top_movers) — 시세 컬럼 없음
export async function upsertTopMovers(
  supabase: SupabaseClient,
  stocks: Stock[],
  scanId: string,
  rankedAt: string,
): Promise<{ count: number }> {
  if (stocks.length === 0) return { count: 0 };

  const deduped = new Map<string, Stock>();
  for (const s of stocks) deduped.set(s.code, s);

  // rank 는 changeRate 내림차순 (등락률 순위 = KIS API 가 이미 정렬해 보냄)
  const sorted = [...deduped.values()].sort(
    (a, b) => b.changeRate - a.changeRate,
  );

  const rows = sorted.map((s, i) => ({
    code: s.code,
    name: s.name,
    market: s.market,
    rank: i + 1,
    ranked_at: rankedAt,
    scan_id: scanId,
    updated_at: rankedAt,
  }));

  const { error } = await supabase
    .from("top_movers")
    .upsert(rows, { onConflict: "code" });

  if (error) {
    logger.error({ error }, "upsertTopMovers failed");
    throw error;
  }
  return { count: rows.length };
}
