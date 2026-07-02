import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서비스롤 Supabase 클라이언트 (RLS bypass).
 *
 * Phase 14 (D-02): requireAuth 미들웨어가 이 클라의 `auth.getUser(jwt)` 로 사용자 JWT 를
 * 검증한다 — 서비스롤 키로 생성된 클라도 `auth.getUser` 는 전달된 access_token 을 Supabase
 * Auth 서버로 검증 위임하므로 정상 동작한다(서비스롤 권한과 무관). 데이터 read/write 는
 * `WHERE user_id` 명시 필터로 소유권을 강제한다(chat-history).
 */

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabase: SupabaseClient = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function createSupabase(u = url!, k = key!): SupabaseClient {
  return createClient(u, k, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
