import "dotenv/config";
import { loadConfig } from "./config";
import { logger } from "./logger";

// NOTE: 실제 MODE dispatch (runBackfill / runDaily / runRecover) 는 Plan 04 에서 구현.
// 본 placeholder 는 Plan 02 가 typecheck/test 통과를 위해 작성.

async function main(): Promise<void> {
  const config = loadConfig();
  const log = logger.child({ app: "candle-sync", version: config.appVersion, mode: config.mode });
  log.info("candle-sync placeholder — Plan 04 에서 MODE dispatch 구현 예정");
  process.exit(0);
}

// CLI 진입점 (vitest import 시에는 실행 안 함) — master-sync 패턴 그대로
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main().catch((err) => {
    logger.error({ err }, "candle-sync placeholder failed");
    process.exit(1);
  });
}
