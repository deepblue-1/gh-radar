import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockMeta } from "./classify.js";
import type { TargetInfo } from "./scheduler.js";

// RED 스텁 — 41-08 Task 2 GREEN 에서 구현한다.
export async function loadTargets(
  _supabase: SupabaseClient,
  _meta: ReadonlyMap<string, StockMeta>,
): Promise<TargetInfo[]> {
  return [];
}

export async function loadStockMeta(_supabase: SupabaseClient): Promise<Map<string, StockMeta>> {
  return new Map();
}
