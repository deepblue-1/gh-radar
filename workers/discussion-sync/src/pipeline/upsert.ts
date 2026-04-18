import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscussionRow } from "./map.js";

/**
 * Phase 08 — discussions UPSERT.
 *
 * RESEARCH §UPSERT 전략 채택: ON CONFLICT (stock_code, post_id) DO UPDATE SET scraped_at = EXCLUDED.scraped_at
 *   → SDK 의 `ignoreDuplicates: false` 가 모든 컬럼 UPDATE 를 수행. title/author/posted_at 는
 *     동일 값으로 no-op. scraped_at 은 최신화되어 TTL 계산이 정확해짐.
 *     body 는 COALESCE 효과를 위해 Postgres 레벨 DO UPDATE SET ... body = EXCLUDED.body 가 필요하지만
 *     Supabase JS SDK 가 전체 컬럼을 UPDATE 하므로 이전에 null 이던 body 가 뒤에 채워지면 반영됨.
 *
 * T-08 mitigation: Supabase JS SDK parametric — 문자열 concat 금지.
 */
export async function upsertDiscussions(
  supabase: SupabaseClient,
  rows: DiscussionRow[],
): Promise<{ upserted: number }> {
  if (rows.length === 0) return { upserted: 0 };
  const { data, error } = await supabase
    .from("discussions")
    .upsert(rows, { onConflict: "stock_code,post_id", ignoreDuplicates: false })
    .select("id");
  if (error) throw error;
  return { upserted: data?.length ?? 0 };
}
