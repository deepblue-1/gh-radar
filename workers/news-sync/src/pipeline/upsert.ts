import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewsArticleRow } from "./map.js";

/**
 * Phase 07 — news_articles UPSERT.
 * T-08 mitigation: Supabase JS SDK parametric query — 문자열 concat 금지.
 * 충돌 처리: ON CONFLICT (stock_code, url) DO NOTHING (ignoreDuplicates=true) — 중복 skip.
 */
export async function upsertNews(
  supabase: SupabaseClient,
  rows: NewsArticleRow[],
): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };
  const { data, error } = await supabase
    .from("news_articles")
    .upsert(rows, { onConflict: "stock_code,url", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return { inserted: data?.length ?? 0 };
}
