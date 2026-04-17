import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 07 — Naver Search API 일일 호출량 집계/제한.
 * T-04 mitigation: atomic RPC `incr_api_usage` 로 race-free 증가 → cycle 시작 시
 * pre-check + page 단위 abort 로 25K/day 하드 상한 위반 방지.
 *
 * 반드시 service_role 클라이언트로 호출 (api_usage 테이블은 RLS 로 anon 읽기만 허용).
 */

const SERVICE = "naver_search_news";

/**
 * UTC 기준 now → KST 기준 YYYY-MM-DD.
 * api_usage.usage_date 는 KST 하루 경계로 집계.
 */
export function kstDateString(now: Date = new Date()): string {
  const t = new Date(now.getTime() + 9 * 3600_000);
  return t.toISOString().slice(0, 10);
}

/**
 * 오늘 사용량을 읽어서 반환. 행이 없으면 0.
 */
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

/**
 * `incr_api_usage` RPC 호출 — atomic 증가. 새 count 를 반환.
 */
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
