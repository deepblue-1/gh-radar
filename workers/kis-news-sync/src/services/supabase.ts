import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { KisNewsConfig } from "../config.js";

/**
 * Phase 41-06 — kis-news-sync 는 서비스롤 키로 Supabase 클라이언트를 만든다.
 * 새 표(`kis_news*` · `kis_access_tokens`)는 RLS 켜고 정책 0 · RPC 는 service_role 에만 EXECUTE —
 * 서비스롤이어야 들여오기 · 임대 · 정리가 동작한다. 세션은 저장하지 않는다(워커).
 *
 * 모든 요청에 상한 시간을 둔다(IN-04). supabase-js 의 fetch 는 기본 상한이 없어, DB 호출이 매달리면 임대 연장이
 * 멈추고(TTL 90초) 다음 깨움이 넘겨받은 뒤에도 매달렸던 실행이 깨어나 남의 임대 아래서 한 걸음을 더 돈다.
 * 30초 = 임대 연장 주기와 같다 — 한 번 매달려도 「확인 못 한 임대」 한계(60초) 안에서 오류로 돌아온다.
 * 하루 1번 정리(`kis_news_cleanup`)도 이 상한 안에 끝나야 한다(넘으면 warn 뒤 다음 slow 가 다시 한다).
 */
export const SUPABASE_FETCH_TIMEOUT_MS = 30_000;

/** 호출부 signal 이 있으면 그것과 상한 시간 중 먼저 오는 쪽으로 끊는 fetch */
export function fetchWithTimeout(ms: number, base: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return base(input, { ...init, signal });
  };
}

export function createSupabaseClient(
  cfg: Pick<KisNewsConfig, "supabaseUrl" | "supabaseServiceRoleKey">,
): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout(SUPABASE_FETCH_TIMEOUT_MS) },
  });
}
