import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockMaster } from "@gh-radar/shared";

export async function upsertMasters(
  supabase: SupabaseClient,
  rows: StockMaster[],
): Promise<{ count: number }> {
  throw new Error("NOT_IMPLEMENTED — Plan 03");
}
