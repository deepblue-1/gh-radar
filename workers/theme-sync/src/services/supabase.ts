import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 10 — theme-sync 는 `SUPABASE_SERVICE_ROLE_KEY` 로 Supabase 클라이언트를 생성한다.
 * themes / theme_stocks RLS 는 anon SELECT 만 허용 → service_role 이 RLS bypass 해야
 * 배치 수집의 upsert + soft-제외(effective_to) DELETE 가 동작한다
 * (discussion-sync/src/services/supabase.ts 선례).
 */
export function createSupabaseClient(
  url: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
