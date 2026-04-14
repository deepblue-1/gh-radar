import type { AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stock, Market, KisRankingRow } from "@gh-radar/shared";
import { fetchAllRanking } from "../kis/ranking";
import { fetchInquirePrice } from "../kis/inquirePrice";
import { toStock } from "./map";
import { upsertStocks } from "./upsert";
import { withRetry } from "../retry";
import { logger } from "../logger";

export async function runPipeline(
  client: AxiosInstance,
  supabase: SupabaseClient
): Promise<{ count: number }> {
  const rankings = await withRetry(
    () => fetchAllRanking(client),
    "fetchAllRanking"
  );

  const allStocks: Stock[] = [];
  let priceFailCount = 0;

  for (const { market, rows } of rankings) {
    for (const row of rows) {
      let priceData;
      try {
        priceData = await withRetry(
          () => fetchInquirePrice(client, row.stck_shrn_iscd),
          `inquirePrice:${row.stck_shrn_iscd}`
        );
      } catch (err) {
        priceFailCount += 1;
        logger.warn(
          { code: row.stck_shrn_iscd, error: (err as Error).message },
          "inquirePrice failed — tradeAmount/open/marketCap/upperLimit/lowerLimit 0으로 저장"
        );
      }

      allStocks.push(toStock(row, market, priceData));
    }
  }

  logger.info(
    { totalStocks: allStocks.length, priceFailCount },
    "pipeline mapped all stocks"
  );

  return upsertStocks(supabase, allStocks);
}
