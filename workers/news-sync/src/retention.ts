import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 07 — news_articles 90일 retention.
 *
 * NOTE: supabase 클라이언트는 반드시 service_role 키로 생성되어야 한다.
 * news_articles RLS 는 anon SELECT 만 허용 → service_role 이 RLS bypass 해야 DELETE 가
 * 실제 행을 삭제한다. 아니면 0 row 삭제로 silent 실패.
 */
export async function runRetention(
  supabase: SupabaseClient,
  days = 90,
): Promise<number> {
  // 90일 이전 threshold (86400 초 × 1000 ms × days)
  const threshold = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const { count, error } = await supabase
    .from("news_articles")
    .delete({ count: "exact" })
    .lt("created_at", threshold);
  if (error) throw error;
  return count ?? 0;
}
