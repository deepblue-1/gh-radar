import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * quick-260913-g4c — 과거 거래일 home_theme_snapshots 를 5분 해상도로 thinning.
 *
 * 저장량 근거: payload 평균 ~11KB × 1분 슬롯 ~725행/일(08:00~20:04) ≈ 8MB/일.
 * 오늘은 1분 해상도를 유지하고(슬라이더 1분 탐색), 과거 거래일은 분이 5의 배수인 슬롯만 남겨
 * ≈145행/일로 줄인다.
 *
 * - 이전 이력(5분 floor · 10분 · :30 슬롯)은 전부 분이 5의 배수라 no-op 이다.
 * - 08:00~08:09 KST 사이클에서만 호출한다. 최대 10회 반복은 idempotent 재시도다(이미 지운 행은
 *   다시 안 잡힌다).
 * - 스캔 창은 `trade_date < 오늘` 최신 1000행(= Supabase max_rows 이내)이다. 하루치 thinning 이
 *   통째로 실패해도 그 날의 1분 행은 다음 거래일 스캔 창(최신 1000행) 안에 남아 자연 복구된다.
 * - 삭제는 RPC 마이그레이션 없이 PostgREST 로 한다("분 % 5" 는 PostgREST 필터로 표현 불가 →
 *   JS 로 후보를 고른다). delete 체인에 `lt("trade_date", 오늘)` 을 걸어 오늘 행은 절대 지우지
 *   않는다(이중 안전장치).
 */

const KST_OFFSET_MS = 9 * 3600_000;
/** thinning 창 시작 08:00 KST (분). */
const THIN_WINDOW_START_MIN = 8 * 60;
/** thinning 창 끝 08:09 KST (분, 포함). */
const THIN_WINDOW_END_MIN = 8 * 60 + 9;
/** 스캔 행 수 — Supabase max_rows(1000) 이내. */
export const THIN_SCAN_ROWS = 1000;
/** delete `.in("captured_at", …)` 청크 — URL 길이(414) 방지. */
export const DELETE_CHUNK = 100;

/** now 가 KST 08:00~08:09 이면 true — 과거 스냅샷 thinning 을 돌릴 사이클. */
export function shouldThinPastSnapshots(now: Date): boolean {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const m = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return m >= THIN_WINDOW_START_MIN && m <= THIN_WINDOW_END_MIN;
}

/**
 * captured_at 이 5분 슬롯(분 % 5 === 0)인가.
 * KST 는 UTC +9시간 정수 오프셋이라 UTC 분 = KST 분이다.
 */
export function isFiveMinuteSlot(capturedAtIso: string): boolean {
  return new Date(capturedAtIso).getUTCMinutes() % 5 === 0;
}

/**
 * 과거 거래일(trade_date < todayTradeDate) 의 1분 슬롯(분이 5의 배수가 아닌 것)을 삭제한다.
 * @returns 삭제 후보(=요청한 삭제) 행 수.
 * @throws select/delete 가 error 를 돌려주면 그대로 throw — caller 가 warn 로그로 기록한다.
 */
export async function thinPastSnapshots(
  supabase: SupabaseClient,
  todayTradeDate: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("home_theme_snapshots")
    .select("trade_date,captured_at")
    .lt("trade_date", todayTradeDate)
    .order("captured_at", { ascending: false })
    .range(0, THIN_SCAN_ROWS - 1);
  if (error) throw error;

  // PostgREST 는 '+00:00' 표기로 돌려준다 — '+' 를 URL 에 싣지 않도록 ISO Z 로 정규화.
  const candidates = ((data ?? []) as Array<{ captured_at: string }>)
    .map((r) => r.captured_at)
    .filter((v) => !isFiveMinuteSlot(v))
    .map((v) => new Date(v).toISOString());

  for (let i = 0; i < candidates.length; i += DELETE_CHUNK) {
    const chunk = candidates.slice(i, i + DELETE_CHUNK);
    const { error: delErr } = await supabase
      .from("home_theme_snapshots")
      .delete()
      .lt("trade_date", todayTradeDate)
      .in("captured_at", chunk);
    if (delErr) throw delErr;
  }

  return candidates.length;
}
