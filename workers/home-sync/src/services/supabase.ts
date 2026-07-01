import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 13 — home-sync 는 `SUPABASE_SERVICE_ROLE_KEY` 로 Supabase 클라이언트를 생성한다.
 * home_theme_snapshots RLS 는 anon/authenticated SELECT 만 허용 → service_role 이 RLS bypass 해야
 * 배치 스냅샷 INSERT (append) 가 동작한다. 입력 읽기(top_movers/stock_quotes/news_articles)도 동일
 * 클라이언트로 수행 (theme-sync/src/services/supabase.ts 선례).
 */
export function createSupabaseClient(
  url: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
