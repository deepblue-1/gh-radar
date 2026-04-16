import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Watchlist E2E seed/cleanup helper — Phase 06.2 Plan 08 Task 3.
 *
 * service_role 키를 사용하여 watchlists 테이블에 대한 RLS 를 우회하고,
 * 테스트 유저의 row 를 직접 조작한다. **E2E 컨텍스트 전용** — webapp runtime 에서는
 * 절대 사용 금지 (service_role key 는 환경변수 `SUPABASE_SERVICE_ROLE_KEY` 로 주입).
 *
 * 사용처: `e2e/specs/watchlist.spec.ts`
 *
 * 환경변수:
 *   SUPABASE_URL | NEXT_PUBLIC_SUPABASE_URL — 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY — admin 권한 키 (RLS 우회)
 */

/** service_role 로 만든 admin 클라이언트 — E2E 전용. webapp runtime 절대 사용 금지. */
export function createServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required for seed helper",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** 테스트 유저 id 조회 (email 기반). */
export async function getTestUserId(
  admin: SupabaseClient,
  email: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  const found = data.users.find((u) => u.email === email);
  if (!found) throw new Error(`Test user not found: ${email}`);
  return found.id;
}

/** 테스트 유저의 모든 watchlists row 삭제. */
export async function cleanupWatchlists(
  userId: string,
  admin: SupabaseClient,
): Promise<void> {
  const { error } = await admin
    .from("watchlists")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}

/**
 * watchlists 50 row 일괄 시드.
 *
 * stock_code 는 005930..005979 (50개 연번) — stocks/stock_quotes 에 이 코드가
 * 없으면 JOIN 이 실패하는 지점이 있을 수 있으므로, 삽입은 watchlists 테이블만
 * 건드린다. UI 에서는 quote 없음 → "—" 표시지만 row 카운트/limit 동작은 유효.
 *
 * 사전 조건: 기존 row cleanup 선행 권장 (unique constraint user_id+stock_code).
 */
export async function seed50Watchlists(
  userId: string,
  admin: SupabaseClient,
): Promise<void> {
  const rows = Array.from({ length: 50 }, (_, i) => ({
    user_id: userId,
    stock_code: String(5930 + i).padStart(6, "0"),
    position: i,
  }));
  const { error } = await admin.from("watchlists").insert(rows);
  if (error) throw error;
}
