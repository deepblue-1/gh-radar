import crypto from "crypto";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { supabase } from "./services/supabase";
import { getKisToken } from "./kis/tokenStore";
import { createKisClient } from "./kis/client";
import { fetchAllRanking } from "./kis/ranking";
import { isHoliday } from "./holidayGuard";
import { runPipeline } from "./pipeline/run";

async function main() {
  const log = logger.child({ job_run_id: crypto.randomUUID() });

  try {
    const cfg = loadConfig();
    log.info("starting ingestion cycle");

    const token = await getKisToken(supabase, cfg);
    const client = createKisClient(cfg, token);

    const rankings = await fetchAllRanking(client);
    if (isHoliday(rankings)) {
      log.info("non-trading day detected, exiting");
      return;
    }

    const { count } = await runPipeline(client, supabase);
    log.info({ upserted: count }, "cycle complete");
  } catch (err) {
    log.error({ err }, "cycle failed");
    process.exit(1);
  }
}

main();
