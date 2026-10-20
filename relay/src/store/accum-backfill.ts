/**
 * Phase 34 Plan 02 — D-23 소급 내보내기 (RED 골격 — 구현 전).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const ACCUM_BACKFILL_KEYS = [] as const;

type DbInt = number | string | null;

export type Kind16Row = {
  queue_case: DbInt;
  gw_time_ms: DbInt;
  isin: string | null;
  qty: DbInt;
  cancel_reason: DbInt;
  expected_cum: DbInt;
  entry_round: DbInt;
  message: string | null;
  ev_qty_before: DbInt;
  limit_bid_qty: DbInt;
  ev_qty_after: DbInt;
  bid1_qty: DbInt;
  ev_trade_qty: DbInt;
  cond_threshold: DbInt;
  ev_price: DbInt;
  bid1_price: DbInt;
  ask_qty_at_limit: DbInt;
  immediate_fill_qty: DbInt;
  base_cum: DbInt;
  snap_cum: (number | string)[] | null;
  journal_epoch: string;
  seq: DbInt;
};

export async function exportAccumBackfillDay(opts: {
  sb: SupabaseClient;
  date: string;
  outDir: string;
  force?: boolean;
}): Promise<{ path: string; rows: number; isins: number; missingSince: number; missingReg: number }> {
  void opts;
  return { path: "", rows: 0, isins: 0, missingSince: 0, missingReg: 0 };
}
