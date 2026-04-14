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
  // cycleStart 는 upsert 시각 기준점. upsert 완료 후 이보다 오래된 row = stale 종목.
  // stocks 는 "현재 상위권 스냅샷" 테이블(Phase 1 D-08)이므로 stale 제거가 원칙.
  const cycleStart = new Date().toISOString();

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

  const { count } = await upsertStocks(supabase, allStocks);

  // 이번 cycle 에 upsert 되지 않은(stale) row 제거 — 등락률 순위에서 밀려난 종목.
  // cycle 자체가 실패해 upsert 가 안 일어났다면 이 DELETE 도 실행되지 않음(안전).
  const { error: delErr, count: delCount } = await supabase
    .from("stocks")
    .delete({ count: "exact" })
    .lt("updated_at", cycleStart);

  if (delErr) {
    logger.warn({ err: delErr }, "stale cleanup 실패 — 다음 cycle 에서 재시도");
  } else {
    logger.info({ deleted: delCount ?? 0 }, "stale stocks cleaned");
  }

  return { count };
}
