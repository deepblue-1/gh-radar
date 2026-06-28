import type { Logger } from "pino";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * limit-up-sync 단일 cycle (Phase 11 동조 워커 선례 — MODE dispatch 없음).
 *
 * rebuild_limit_up(p_lookback_months) plpgsql RPC 1줄 호출:
 *   - full-rebuild (TRUNCATE+INSERT) — 상한가 이벤트 + 종목 통계 + 테마 통계 멱등 재적재.
 *   - 반환 jsonb: { event_rows, stock_stat_rows, theme_stat_rows, ... } 그대로 로깅.
 *
 * fetch/map/dedup 없음 — 자체 DB 집계라 외부 HTTP 0 (KRX EOD 만, 5원칙 무관).
 */
export async function runRebuild(deps: {
  supabase: SupabaseClient;
  log: Logger;
  lookbackMonths: number;
}): Promise<Record<string, unknown>> {
  const { supabase, log, lookbackMonths } = deps;
  log.info({ lookbackMonths }, "rebuild_limit_up start");
  const { data, error } = await supabase.rpc("rebuild_limit_up", {
    p_lookback_months: lookbackMonths,
  });
  if (error) throw new Error(`rebuild_limit_up failed: ${error.message}`);
  log.info({ result: data }, "rebuild_limit_up complete"); // {event_rows, stock_stat_rows, theme_stat_rows, ...}
  return (data ?? {}) as Record<string, unknown>;
}
