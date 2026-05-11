import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockDailyOhlcv } from "@gh-radar/shared";
import { logger } from "../logger";

const CHUNK_SIZE = 1000; // RESEARCH §7 T-09-07: PostgREST batch limit 대응

function toDbRow(r: StockDailyOhlcv): Record<string, unknown> {
  return {
    code: r.code,
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    trade_amount: r.tradeAmount,
    change_amount: r.changeAmount,
    change_rate: r.changeRate,
  };
}

/**
 * chunked UPSERT for stock_daily_ohlcv.
 *
 * RESEARCH §7 T-09-07 mitigation — PostgREST batch limit 회피.
 *   - 1000 row/chunk
 *   - onConflict (code, date) DO UPDATE — idempotent (Plan 01 마이그레이션 PK)
 *
 * D-08: backfill / daily / recover 모두 동일 함수 호출 — idempotent UPSERT 이므로 mode 별 분기 불필요.
 */
export async function upsertOhlcv(
  supabase: SupabaseClient,
  rows: StockDailyOhlcv[],
): Promise<{ count: number }> {
  if (rows.length === 0) return { count: 0 };

  let totalCount = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const dbRows = chunk.map(toDbRow);
    const { error } = await supabase
      .from("stock_daily_ohlcv")
      .upsert(dbRows, { onConflict: "code,date" });

    if (error) {
      logger.error(
        { error, chunkStart: i, chunkSize: chunk.length },
        "upsertOhlcv chunk failed",
      );
      throw error;
    }
    totalCount += chunk.length;
  }

  return { count: totalCount };
}
