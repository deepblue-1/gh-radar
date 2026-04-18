import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 08 — discussion-sync 는 `SUPABASE_SERVICE_ROLE_KEY` 로 Supabase 클라이언트를 생성해야 한다.
 * discussions RLS 는 anon SELECT 만 허용 → service_role 이 RLS bypass 해야 retention DELETE +
 * upsert 가 동작한다 (supabase/migrations/20260413120100_rls_policies.sql 참조).
 */
export function createSupabaseClient(
  url: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
