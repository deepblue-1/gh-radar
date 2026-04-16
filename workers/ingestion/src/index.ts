import crypto from "crypto";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { supabase } from "./services/supabase";
import { getKisToken } from "./kis/tokenStore";
import { createKisClient } from "./kis/client";
import { fetchAllRanking } from "./kis/ranking";
import { isHoliday } from "./holidayGuard";
import { runPipeline } from "./pipeline/run";
import { withRetry } from "./retry";

async function main() {
  const log = logger.child({ job_run_id: crypto.randomUUID() });

  try {
    const cfg = loadConfig();
    log.info("starting ingestion cycle");

    const token = await getKisToken(supabase, cfg);
    const client = createKisClient(cfg, token);

    // CRIT-1 fix: fetchAllRanking 을 한 번만 호출하고 holiday 판정/파이프라인 모두 동일 결과 사용
    const rankings = await withRetry(
      () => fetchAllRanking(client),
      "fetchAllRanking",
    );
    if (isHoliday(rankings)) {
      log.info("non-trading day detected, exiting");
      return;
    }

    const { quotesCount, moversCount } = await runPipeline(
      client,
      supabase,
      rankings,
    );
    log.info({ quotesCount, moversCount }, "cycle complete");
  } catch (err) {
    log.error({ err }, "cycle failed");
    process.exit(1);
  }
}

main();
