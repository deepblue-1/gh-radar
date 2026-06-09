import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";

/**
 * Phase 10 — 429/403 24h backoff 상태 관리 (5원칙 #4, RESEARCH §Pitfall 8).
 *
 * 차단 신호(직접+프록시 모두 403/429)는 "명시 차단" 으로 해석 → 해당 source 에 대해
 * 24시간 동안 새 호출을 차단. 자동 지수 재시도로 두드리지 않는다.
 *
 * 저장소: 기존 api_usage 테이블 재사용(신규 마이그레이션 불필요, RESEARCH §Don't Hand-Roll).
 *   - 일일 호출 카운트: service='theme_naver' / 'theme_alpha' (incr_api_usage RPC, 5원칙 #1).
 *   - backoff 상태:    service='theme_naver_backoff' / 'theme_alpha_backoff',
 *                      count = backoff-until epoch milliseconds.
 *   service_role 클라이언트로만 호출(RLS 정책 0 = service_role bypass).
 */

export type ThemeSource = "naver" | "alpha";

const BACKOFF_HOURS = 24;
const BACKOFF_MS = BACKOFF_HOURS * 3600_000;

/** source → api_usage 일일 카운트 service 라벨. */
export function usageService(source: ThemeSource): string {
  return source === "naver" ? "theme_naver" : "theme_alpha";
}

/** source → api_usage backoff service 라벨. */
function backoffService(source: ThemeSource): string {
  return `${usageService(source)}_backoff`;
}

/** UTC now → KST 기준 YYYY-MM-DD (api_usage.usage_date 키, apiUsage 선례). */
export function kstDateString(now: Date = new Date()): string {
  const t = new Date(now.getTime() + 9 * 3600_000);
  return t.toISOString().slice(0, 10);
}

/**
 * 해당 source 가 현재 24h backoff 중인지 검사 — cycle 시작 시 게이트.
 * backoff row 의 count(=epoch ms) 가 now 보다 미래면 backoff 중 → source skip.
 */
export async function isBackedOff(
  supabase: SupabaseClient,
  source: ThemeSource,
  now: Date = new Date(),
): Promise<boolean> {
  // 최근 backoff row 들을 가져와 가장 큰 until(=count) 을 본다. 단일 종결 메소드(.limit)로
  // 배열을 받아 JS 에서 max 계산 — backoff 가 KST 날짜 경계를 넘어 기록됐을 수 있어
  // 특정 usage_date 한정 조회는 위험(어제 23시 기록 → 오늘 까지 유효).
  const { data, error } = await supabase
    .from("api_usage")
    .select("count, usage_date")
    .eq("service", backoffService(source))
    .order("usage_date", { ascending: false })
    .limit(5);
  if (error) {
    // backoff 조회 실패 시 보수적으로 차단하지 않음(가용성 우선) — 단 로그 남김.
    logger.warn({ source, err: error.message }, "isBackedOff lookup failed");
    return false;
  }
  const rows = (data ?? []) as Array<{ count?: number | string }>;
  const untilMs = rows.reduce(
    (max, r) => Math.max(max, Number(r.count ?? 0)),
    0,
  );
  return untilMs > now.getTime();
}

/**
 * 차단 신호 관측 시 24h backoff 기록 (markBackoff).
 * api_usage upsert (service_role) — count 에 backoff-until epoch ms 저장.
 */
export async function markBackoff(
  supabase: SupabaseClient,
  source: ThemeSource,
  now: Date = new Date(),
): Promise<string> {
  const untilMs = now.getTime() + BACKOFF_MS;
  const untilIso = new Date(untilMs).toISOString();
  const { error } = await supabase.from("api_usage").upsert(
    {
      service: backoffService(source),
      usage_date: kstDateString(now),
      count: untilMs,
      updated_at: now.toISOString(),
    },
    { onConflict: "service,usage_date" },
  );
  if (error) {
    logger.error({ source, err: error.message }, "markBackoff write failed");
    throw error;
  }
  logger.warn(
    { source, until: untilIso },
    "source blocked — 24h backoff recorded (no auto-retry, 5원칙 #4)",
  );
  return untilIso;
}

/**
 * 일일 호출 카운트 증가 (5원칙 #1 — 일 1회 배치 캡 검증용). incr_api_usage RPC 재사용.
 */
export async function incrementUsage(
  supabase: SupabaseClient,
  source: ThemeSource,
  amount = 1,
  now: Date = new Date(),
): Promise<number> {
  const { data, error } = await supabase.rpc("incr_api_usage", {
    p_service: usageService(source),
    p_date: kstDateString(now),
    p_amount: amount,
  });
  if (error) throw error;
  return Number(data);
}
