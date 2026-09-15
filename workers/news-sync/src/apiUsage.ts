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
 * quick-260915-h3p — 네이버 일일 한도 소진 판정(strike) 마커.
 * 같은 api_usage 테이블에 별도 service 라벨로 센다:
 *  - KST 날짜 키(usage_date)이므로 KST 자정에 자연 리셋된다.
 *  - service 는 CHECK 없는 자유 text 라 마이그레이션이 필요 없다(theme-sync 마커 선례).
 *  - 호출 카운터 naver_search_news 값은 오염시키지 않는다.
 */
export const QUOTA_STRIKE_SERVICE = "naver_search_news_quota_strike";

/** 같은 KST 날짜에 이 수 이상 strike 가 쌓이면 자정까지 run 을 네이버 호출 0 으로 skip. */
export const QUOTA_STRIKES_TO_STOP_DAY = 2;

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
  service: string = SERVICE,
): Promise<number> {
  const { data, error } = await supabase
    .from("api_usage")
    .select("count")
    .eq("service", service)
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
  service: string = SERVICE,
): Promise<number> {
  const { data, error } = await supabase.rpc("incr_api_usage", {
    p_service: service,
    p_date: dateKst,
    p_amount: amount,
  });
  if (error) throw error;
  return Number(data);
}

/** 오늘(KST) 기록된 한도 소진 strike 수. */
export function readQuotaStrikes(
  supabase: SupabaseClient,
  dateKst: string,
): Promise<number> {
  return checkBudget(supabase, dateKst, QUOTA_STRIKE_SERVICE);
}

/** 한도 소진 strike 1회 기록 — 새 누적 수를 반환. */
export function recordQuotaStrike(
  supabase: SupabaseClient,
  dateKst: string,
): Promise<number> {
  return incrementUsage(supabase, dateKst, 1, QUOTA_STRIKE_SERVICE);
}
