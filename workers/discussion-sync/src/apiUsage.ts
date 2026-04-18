import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 08 — Bright Data 프록시 경유 Naver discussion JSON API 호출량 집계/제한.
 * T-05 mitigation: atomic RPC `incr_api_usage` 로 race-free 증가 → cycle 시작 시
 * pre-check + per-request abort 로 일일 하드 상한 위반 방지.
 *
 * service label 은 `proxy_naver_discussion` — Phase 7 생성한 api_usage 테이블을 공유.
 * 반드시 service_role 클라이언트로 호출.
 */

const SERVICE = "proxy_naver_discussion";

/**
 * UTC 기준 now → KST 기준 YYYY-MM-DD.
 */
export function kstDateString(now: Date = new Date()): string {
  const t = new Date(now.getTime() + 9 * 3600_000);
  return t.toISOString().slice(0, 10);
}

export async function checkBudget(
  supabase: SupabaseClient,
  dateKst: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("api_usage")
    .select("count")
    .eq("service", SERVICE)
    .eq("usage_date", dateKst)
    .maybeSingle();
  if (error) throw error;
  const count = (data as { count?: number | string } | null)?.count;
  return Number(count ?? 0);
}

export async function incrementUsage(
  supabase: SupabaseClient,
  dateKst: string,
  amount = 1,
): Promise<number> {
  const { data, error } = await supabase.rpc("incr_api_usage", {
    p_service: SERVICE,
    p_date: dateKst,
    p_amount: amount,
  });
  if (error) throw error;
  return Number(data);
}
