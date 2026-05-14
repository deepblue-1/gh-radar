import "dotenv/config";
import { loadConfig } from "./config";
import { logger } from "./logger";

/**
 * intraday-sync entry — placeholder.
 *
 * Wave 1 Plan 06 가 runIntradayCycle (STEP1 + STEP2 + DB writes) 구현.
 * Wave 0 본 plan 은 워크스페이스 스캐폴드 + config/logger/retry/supabase 만.
 */
async function main(): Promise<void> {
  try {
    const config = loadConfig();
    logger.info(
      {
        version: config.appVersion,
        kiwoomBaseUrl: config.kiwoomBaseUrl,
        hotSetTopN: config.hotSetTopN,
      },
      "intraday-sync placeholder — Wave 1 Plan 06 가 runIntradayCycle 추가 예정",
    );
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "intraday-sync failed");
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main();
}
