import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntradayOhlcUpdate } from "@gh-radar/shared";
import { logger } from "../logger";

const CHUNK_SIZE = 1000;

/**
 * STEP2 RPC #2 — supabase.rpc("intraday_upsert_ohlc", { p_rows })
 * RESEARCH §3.2 + §3.5. hot set ~250 row → 단일 chunk.
 * 항상 RPC #1 후 호출 (STEP1 → STEP2 순서, runIntradayCycle 책임).
 *
 * payload 컬럼 = code/date/open/high/low
 *   - close/volume/trade_amount/change_amount/change_rate 의도적 omit
 *     (STEP1 이 매분 갱신하는 컬럼, STEP2 가 덮어쓰면 데이터 손실, D-34)
 */
export async function intradayUpsertOhlc(
  supabase: SupabaseClient,
  updates: IntradayOhlcUpdate[],
): Promise<{ count: number }> {
  if (updates.length === 0) return { count: 0 };

  let total = 0;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    const payload = chunk.map((u) => ({
      code: u.code,
      date: u.date,
      open: u.open,
      high: u.high,
      low: u.low,
    }));

    const { error } = await supabase.rpc("intraday_upsert_ohlc", { p_rows: payload });
    if (error) {
      logger.error(
        { err: error, chunkStart: i, chunkSize: chunk.length },
        "intradayUpsertOhlc chunk failed",
      );
      throw error;
    }
    total += chunk.length;
  }

  return { count: total };
}
