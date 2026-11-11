import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { KisNewsConfig } from "../config.js";

/**
 * Phase 41-06 — kis-news-sync 는 서비스롤 키로 Supabase 클라이언트를 만든다.
 * 새 표(`kis_news*` · `kis_access_tokens`)는 RLS 켜고 정책 0 · RPC 는 service_role 에만 EXECUTE —
 * 서비스롤이어야 들여오기 · 임대 · 정리가 동작한다. 세션은 저장하지 않는다(워커).
 */
export function createSupabaseClient(
  cfg: Pick<KisNewsConfig, "supabaseUrl" | "supabaseServiceRoleKey">,
): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
