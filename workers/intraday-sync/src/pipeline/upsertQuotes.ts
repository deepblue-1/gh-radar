import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntradayCloseUpdate, IntradayOhlcUpdate } from "@gh-radar/shared";
import { logger } from "../logger";

const CHUNK = 1000;

/**
 * STEP1 stock_quotes UPSERT — 1,898 row × 8 컬럼. RESEARCH §3.3.1 + Pattern 3.
 *
 * D-20: 활성 1,898 종목 매분 누적 UPSERT (onConflict: code).
 * D-21: stale cleanup 없음 (top_movers 와 의도적 차이) — 비활성 종목 마지막 가격 유지.
 *
 * payload 컬럼: code/name/market/price/change_amount/change_rate/volume/trade_amount/updated_at
 *   - open/high/low/upper_limit/lower_limit/market_cap 의도적 omit (STEP2 가 정확값 UPSERT, §3.3.3)
 */
export async function upsertQuotesStep1(
  supabase: SupabaseClient,
  updates: IntradayCloseUpdate[],
  market: Map<string, "KOSPI" | "KOSDAQ">,
): Promise<{ count: number }> {
  if (updates.length === 0) return { count: 0 };

  const now = new Date().toISOString();
  const rows = updates.map((u) => ({
    code: u.code,
    name: u.name ?? u.code,
    market: market.get(u.code) ?? "KOSPI",
    price: u.price,
    change_amount: u.changeAmount,
    change_rate: u.changeRate,
    volume: u.volume,
    trade_amount: u.tradeAmount,
    updated_at: now,
  }));

  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("stock_quotes")
      .upsert(chunk, { onConflict: "code" });
    if (error) {
      logger.error(
        { err: error, chunkStart: i, chunkSize: chunk.length },
        "upsertQuotesStep1 chunk failed",
      );
      throw error;
    }
    total += chunk.length;
  }
  return { count: total };
}

/**
 * STEP2 stock_quotes UPSERT — ~250 row × 6 다른 컬럼. RESEARCH §3.3.2.
 *
 * STEP1 과 서로 다른 컬럼 집합 → 페이로드 만 UPDATE 되어 충돌 없음 (§3.3.3).
 *
 * payload 컬럼: code/open/high/low/upper_limit/lower_limit/market_cap/updated_at
 *   - price/change/volume/trade_amount 의도적 omit (STEP1 매분 갱신 컬럼 보호)
 */
export async function upsertQuotesStep2(
  supabase: SupabaseClient,
  updates: IntradayOhlcUpdate[],
): Promise<{ count: number }> {
  if (updates.length === 0) return { count: 0 };

  const now = new Date().toISOString();
  const rows = updates.map((u) => ({
    code: u.code,
    open: u.open,
    high: u.high,
    low: u.low,
    upper_limit: u.upperLimit,
    lower_limit: u.lowerLimit,
    market_cap: u.marketCap,
    updated_at: now,
  }));

  const { error } = await supabase
    .from("stock_quotes")
    .upsert(rows, { onConflict: "code" });
  if (error) {
    logger.error({ err: error, count: rows.length }, "upsertQuotesStep2 failed");
    throw error;
  }
  return { count: rows.length };
}
