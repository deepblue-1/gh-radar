import "dotenv/config";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { createKrxClient } from "./krx/client";

async function main(): Promise<void> {
  const config = loadConfig();
  const log = logger.child({ app: "master-sync", version: config.appVersion });
  log.info("master-sync starting (NOT_IMPLEMENTED — Plan 03)");
  // Plan 03 가 fetch → map → upsert → log 로직 채움
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "master-sync failed");
  process.exit(1);
});
