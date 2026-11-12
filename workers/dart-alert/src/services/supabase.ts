import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DartAlertConfig } from "../config";

/**
 * Phase 43-03 — dart-alert 는 서비스롤 키로 Supabase 클라이언트를 만든다.
 * 새 표(`dart_alert*`)는 RLS 켜고 정책 0 · RPC 는 service_role 에만 EXECUTE(43-02) — 서비스롤이어야
 * 넣기 · 임대 · 차례 · 기록이 동작한다. 세션은 저장하지 않는다(워커).
 */
export function createSupabaseClient(
  cfg: Pick<DartAlertConfig, "supabaseUrl" | "supabaseServiceRoleKey">,
): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
