import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 43-03 — OpenDART list.json 호출 수 카운터 · 예산(SC-4).
 * 원본: workers/kis-news-sync/src/apiUsage.ts (서비스 키 두 개만 다르다).
 *
 * - **공식 한도 20,000/일** · 설계 예산 15,000(75% · `DART_ALERT_DAILY_BUDGET` 상한 — config.ts
 *   `DART_DAILY_BUDGET_LIMIT`). 평일 설계 사용량 약 10,800(cadence.ts `plannedDailyCalls(2)`).
 * - 카운터 `api_usage` service `opendart_list` · KST 날짜 키(usage_date) — KST 자정에 저절로 0.
 *   **실패한 호출도 센다**(OpenDART 는 오류 응답도 한도에 들어갈 수 있다 — 보수적으로 센다).
 * - 한도 의심 표시 `opendart_list_quota_strike` — 한도 소진(status `020`) 신호를 받으면 기록하고 그 실행을
 *   즉시 끝낸다(재시도로 두드리지 않음). 다음 실행은 시작에서 이 수가 1 이상이면 **단독 탐침 1건**으로 회복을
 *   확인한 뒤에만 수집한다(CLAUDE.md 공식 API 운영 기준 ④ · news-sync · kis-news-sync 선례).
 *   service 는 CHECK 없는 자유 text 라 마이그레이션이 필요 없다.
 * - 예산의 80%(BUDGET_WARN_RATIO) 에서 경고 1번 · 다 쓰면 그 실행을 끝낸다.
 * - 호출마다 RPC 1회 대신 메모리에 모았다가 10초마다 `incr_api_usage` 1회(UsageCounter · 왕복 절약).
 *
 * 반드시 service_role 클라이언트로 부른다.
 */

export const DART_USAGE_SERVICE = "opendart_list";
export const DART_QUOTA_STRIKE_SERVICE = "opendart_list_quota_strike";
/** 예산의 이 비율에 닿으면 경고 1번 */
export const BUDGET_WARN_RATIO = 0.8;

export type BudgetState = "ok" | "warn" | "exhausted";

/** now → KST 기준 YYYY-MM-DD (api_usage.usage_date 키) */
export function kstDateString(now: Date = new Date()): string {
  const t = new Date(now.getTime() + 9 * 3_600_000);
  return t.toISOString().slice(0, 10);
}

/** 오늘 사용량 — 행이 없으면 0 */
export async function checkBudget(
  supabase: SupabaseClient,
  dateKst: string,
  service: string = DART_USAGE_SERVICE,
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

/** `incr_api_usage` RPC — 원자적 증가 · 새 누적을 돌려준다 */
export async function incrementUsage(
  supabase: SupabaseClient,
  dateKst: string,
  amount = 1,
  service: string = DART_USAGE_SERVICE,
): Promise<number> {
  const { data, error } = await supabase.rpc("incr_api_usage", {
    p_service: service,
    p_date: dateKst,
    p_amount: amount,
  });
  if (error) throw error;
  return Number(data);
}

/** 오늘(KST) 기록된 한도 의심 표시 수 */
export function readQuotaStrikes(supabase: SupabaseClient, dateKst: string): Promise<number> {
  return checkBudget(supabase, dateKst, DART_QUOTA_STRIKE_SERVICE);
}

/** 한도 의심 표시 1회 기록 — 새 누적을 돌려준다 */
export function recordQuotaStrike(supabase: SupabaseClient, dateKst: string): Promise<number> {
  return incrementUsage(supabase, dateKst, 1, DART_QUOTA_STRIKE_SERVICE);
}

/** used ≥ budget → exhausted · used ≥ budget × 80% → warn · 그 밖 ok */
export function budgetStateOf(used: number, budget: number): BudgetState {
  if (used >= budget) return "exhausted";
  if (used >= budget * BUDGET_WARN_RATIO) return "warn";
  return "ok";
}

/**
 * 호출 수를 메모리에 모았다가 flush 때 `incr_api_usage` 1회로 더한다.
 * flush 가 실패하면 모은 수를 되돌려 다음 flush 에 다시 싣는다(호출 수를 잃지 않는다).
 */
export class UsageCounter {
  private count = 0;

  get pending(): number {
    return this.count;
  }

  add(n = 1): void {
    this.count += n;
  }

  /** 새 누적 — pending 0 이면 RPC 를 부르지 않고 null */
  async flush(supabase: SupabaseClient, dateKst: string): Promise<number | null> {
    if (this.count === 0) return null;
    const take = this.count;
    this.count = 0;
    try {
      return await incrementUsage(supabase, dateKst, take, DART_USAGE_SERVICE);
    } catch (err) {
      this.count += take;
      throw err;
    }
  }
}
