import type { AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stock } from "@gh-radar/shared";
import { fetchAllRanking } from "../kis/ranking";
import { fetchInquirePrice } from "../kis/inquirePrice";
import { toStock } from "./map";
import { upsertStockQuotes, upsertTopMovers } from "./upsert";
import { withRetry } from "../retry";
import { logger } from "../logger";
import { randomUUID } from "node:crypto";

export async function runPipeline(
  client: AxiosInstance,
  supabase: SupabaseClient,
): Promise<{ quotesCount: number; moversCount: number }> {
  const cycleStart = new Date().toISOString();
  const scanId = randomUUID();

  const rankings = await withRetry(
    () => fetchAllRanking(client),
    "fetchAllRanking",
  );

  const allStocks: Stock[] = [];
  let priceFailCount = 0;

  for (const { market, rows } of rankings) {
    for (const row of rows) {
      let priceData;
      try {
        priceData = await withRetry(
          () => fetchInquirePrice(client, row.stck_shrn_iscd),
          `inquirePrice:${row.stck_shrn_iscd}`,
        );
      } catch (err) {
        priceFailCount += 1;
        logger.warn(
          { code: row.stck_shrn_iscd, error: (err as Error).message },
          "inquirePrice failed — tradeAmount/marketCap/upperLimit/lowerLimit 0으로 저장",
        );
      }
      allStocks.push(toStock(row, market, priceData));
    }
  }

  logger.info(
    { totalStocks: allStocks.length, priceFailCount, scanId },
    "pipeline mapped",
  );

  // D5 — 두 테이블에 분리 쓰기. stocks (마스터) 는 절대 안 건드림.
  const { count: quotesCount } = await upsertStockQuotes(
    supabase,
    allStocks,
  );
  const { count: moversCount } = await upsertTopMovers(
    supabase,
    allStocks,
    scanId,
    cycleStart,
  );

  // Stale cleanup — top_movers 만 대상.
  // 이번 cycle 에 upsert 되지 않은 (= 등락률 순위에서 밀려난) 종목 제거.
  // ⚠ 절대 stocks (마스터) / stock_quotes (영구 캐시) 는 건드리지 말 것.
  const { error: delErr, count: delCount } = await supabase
    .from("top_movers")
    .delete({ count: "exact" })
    .lt("ranked_at", cycleStart);

  if (delErr) {
    logger.warn(
      { err: delErr },
      "top_movers stale cleanup 실패 — 다음 cycle 에서 재시도",
    );
  } else {
    logger.info({ deleted: delCount ?? 0 }, "top_movers stale cleaned");
  }

  return { quotesCount, moversCount };
}
