import "dotenv/config";
import { loadConfig, type Mode } from "./config";
import { logger } from "./logger";
import { runBackfill } from "./modes/backfill";
import { runDaily } from "./modes/daily";
import { runRecover } from "./modes/recover";

/**
 * candle-sync entry — D-08 의 MODE dispatch.
 *
 * RESEARCH §4.1 단일 entry + per-mode strategy:
 *   - MODE=daily   → runDaily   (basDd 자동, MIN_EXPECTED 가드)
 *   - MODE=backfill → runBackfill (BACKFILL_FROM/TO 영업일 순회, per-day 격리)
 *   - MODE=recover → runRecover (findMissingDates + per-date 격리)
 *
 * Unknown MODE 는 loadConfig 의 parseMode 에서 throw (Plan 02 config.ts).
 *
 * vitest import 시에는 main() 미실행 — CLI 진입점만 동작 (master-sync 패턴 mirror).
 */
export async function dispatch(): Promise<{ mode: Mode; result: unknown }> {
  const config = loadConfig();
  const log = logger.child({
    app: "candle-sync",
    version: config.appVersion,
    mode: config.mode,
  });

  switch (config.mode) {
    case "backfill":
      return { mode: "backfill", result: await runBackfill({ log }) };
    case "daily":
      return { mode: "daily", result: await runDaily({ log }) };
    case "recover":
      return { mode: "recover", result: await runRecover({ log }) };
    default: {
      // exhaustive check (TS will error if Mode union extended without handling)
      const _exhaustive: never = config.mode;
      throw new Error(`Unhandled MODE: ${String(_exhaustive)}`);
    }
  }
}

async function main(): Promise<void> {
  try {
    const out = await dispatch();
    logger.info({ ...out }, "candle-sync complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "candle-sync failed");
    process.exit(1);
  }
}

// CLI 진입점 (vitest import 시에는 실행 안 함) — master-sync 패턴 mirror
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main();
}
