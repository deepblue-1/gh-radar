import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 41-08 — 보관 정리(41-02 `kis_news_cleanup`).
 * 90일 지난 글(연결 cascade) · 하루 넘게 조회도 수집도 없는 등록 행을 지우고 `cleanup_date` 를 KST 오늘로 찍는다.
 * 수집기는 하루 첫 느린 실행에서 한 번만 부른다(`isCleanupDue`).
 */

export const RETENTION_DAYS = 90;
export const TARGET_IDLE_DAYS = 1;

/** 반환은 RPC 결과 그대로 — {"news_deleted": n, "targets_deleted": n} */
export async function runCleanup(supabase: SupabaseClient): Promise<unknown> {
  const { data, error } = await supabase.rpc("kis_news_cleanup", {
    p_days: RETENTION_DAYS,
    p_target_idle_days: TARGET_IDLE_DAYS,
  });
  if (error) {
    const e = error as { message?: string; code?: string };
    throw new Error(`kis_news_cleanup 실패: ${e.message ?? "unknown"}${e.code ? ` (${e.code})` : ""}`);
  }
  return data;
}
