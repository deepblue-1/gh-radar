import type { Logger } from "pino";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * co-movement-sync 단일 cycle (intraday-sync 선례 — MODE dispatch 없음).
 *
 * rebuild_comovement(p_lookback_months) plpgsql RPC 1줄 호출:
 *   - full-rebuild (TRUNCATE+INSERT) — theme_comovement + cosurge_edges 멱등 재적재.
 *   - 반환 jsonb: { theme_comovement_rows, cosurge_edge_rows, ... } 그대로 로깅.
 *
 * fetch/map/dedup 없음 — 자체 DB 집계라 외부 HTTP 0 (KRX/Naver/Anthropic 미사용).
 */
export async function runRebuild(deps: {
  supabase: SupabaseClient;
  log: Logger;
  lookbackMonths: number;
}): Promise<Record<string, unknown>> {
  const { supabase, log, lookbackMonths } = deps;
  log.info({ lookbackMonths }, "rebuild_comovement start");
  const { data, error } = await supabase.rpc("rebuild_comovement", {
    p_lookback_months: lookbackMonths,
  });
  if (error) throw new Error(`rebuild_comovement failed: ${error.message}`);
  log.info({ result: data }, "rebuild_comovement complete"); // {theme_comovement_rows, cosurge_edge_rows, ...}
  return (data ?? {}) as Record<string, unknown>;
}
