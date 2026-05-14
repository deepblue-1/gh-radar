import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntradayCloseUpdate } from "@gh-radar/shared";
import { logger } from "../logger";

const CHUNK_SIZE = 1000;

/**
 * STEP1 RPC #1 — supabase.rpc("intraday_upsert_close", { p_rows })
 * RESEARCH §3.1 + §3.5 (STEP1 → STEP2 순서 보장).
 * chunked 1000 row 분할 (Supabase PostgREST jsonb 페이로드 제한 회피).
 *
 * payload 컬럼 = code/date/close/volume/trade_amount/change_amount/change_rate
 *   - open/high/low 의도적 omit (RPC #1 INSERT branch 는 close 임시값, RPC #2 가 정확값 덮어쓰기, D-33)
 */
export async function intradayUpsertClose(
  supabase: SupabaseClient,
  updates: IntradayCloseUpdate[],
): Promise<{ count: number }> {
  if (updates.length === 0) return { count: 0 };

  let total = 0;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    const payload = chunk.map((u) => ({
      code: u.code,
      date: u.date,
      close: u.price, // RPC #1 INSERT 시 open/high/low/close 모두 u.price 임시
      volume: u.volume,
      trade_amount: u.tradeAmount,
      change_amount: u.changeAmount,
      change_rate: u.changeRate,
    }));

    const { error } = await supabase.rpc("intraday_upsert_close", { p_rows: payload });
    if (error) {
      logger.error(
        { err: error, chunkStart: i, chunkSize: chunk.length },
        "intradayUpsertClose chunk failed",
      );
      throw error;
    }
    total += chunk.length;
  }

  return { count: total };
}
