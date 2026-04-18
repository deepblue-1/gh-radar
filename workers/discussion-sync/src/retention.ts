import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 08 — discussions 90일 retention.
 *
 * NOTE: supabase 클라이언트는 반드시 service_role 키로 생성되어야 한다.
 * discussions RLS 는 anon SELECT 만 허용 → service_role 이 RLS bypass 해야 DELETE 가
 * 실제 행을 삭제한다. 아니면 0 row 삭제로 silent 실패.
 *
 * 주의: discussions 스키마는 `created_at` 컬럼이 없음 (supabase/migrations/20260413120000_init_tables.sql:58-71).
 *   → `scraped_at` 기준으로 retention 수행. 90일 = 반년 단타 트레이딩 관련성 충분.
 */
export async function runRetention(
  supabase: SupabaseClient,
  days = 90,
): Promise<number> {
  const threshold = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const { count, error } = await supabase
    .from("discussions")
    .delete({ count: "exact" })
    .lt("scraped_at", threshold);
  if (error) throw error;
  return count ?? 0;
}
