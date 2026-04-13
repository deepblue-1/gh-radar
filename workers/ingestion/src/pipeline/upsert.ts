import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stock } from "@gh-radar/shared";
import { logger } from "../logger";

export async function upsertStocks(
  supabase: SupabaseClient,
  stocks: Stock[]
): Promise<{ count: number }> {
  if (stocks.length === 0) return { count: 0 };

  const deduped = new Map<string, Stock>();
  for (const s of stocks) {
    deduped.set(s.code, s);
  }

  const rows = [...deduped.values()].map((s) => ({
    code: s.code,
    name: s.name,
    market: s.market,
    price: s.price,
    change_amount: s.changeAmount,
    change_rate: s.changeRate,
    volume: s.volume,
    open: s.open,
    high: s.high,
    low: s.low,
    market_cap: s.marketCap,
    upper_limit: s.upperLimit,
    lower_limit: s.lowerLimit,
    updated_at: s.updatedAt,
  }));

  const { error } = await supabase
    .from("stocks")
    .upsert(rows, { onConflict: "code" });

  if (error) {
    logger.error({ error }, "upsert failed");
    throw error;
  }

  return { count: rows.length };
}
