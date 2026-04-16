import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockMaster } from "@gh-radar/shared";
import { logger } from "../logger";

export async function upsertMasters(
  supabase: SupabaseClient,
  rows: StockMaster[],
): Promise<{ count: number }> {
  if (rows.length === 0) return { count: 0 };

  // dedup by code (마지막 값 우선)
  const deduped = new Map<string, StockMaster>();
  for (const r of rows) deduped.set(r.code, r);

  const dbRows = [...deduped.values()].map((m) => ({
    code: m.code,
    name: m.name,
    market: m.market,
    sector: m.sector,
    kosdaq_segment: m.kosdaqSegment,
    security_type: m.securityType,
    security_group: m.securityGroup,
    english_name: m.englishName,
    listing_date: m.listingDate,
    par_value: m.parValue,
    listing_shares: m.listingShares,
    is_delisted: m.isDelisted,
    updated_at: m.updatedAt,
  }));

  const { error } = await supabase
    .from("stocks")
    .upsert(dbRows, { onConflict: "code" });

  if (error) {
    logger.error({ error }, "upsertMasters failed");
    throw error;
  }

  return { count: dbRows.length };
}
