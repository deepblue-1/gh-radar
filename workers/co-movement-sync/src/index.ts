import "dotenv/config";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { createSupabaseClient } from "./services/supabase";
import { runRebuild } from "./rebuild";

/**
 * co-movement-sync entry — 단일 cycle (intraday-sync 선례).
 *
 * candle-sync 의 모드 분기(dispatch) 제거: 이 워커는 rebuild_comovement RPC
 * 1줄만 호출하는 야간 1회 full-rebuild 워커라 분기 전략이 불필요하다.
 *
 * vitest import 시에는 main() 미실행 — CLI 진입점만 동작 (candle-sync 패턴 mirror).
 */
export async function dispatch(): Promise<Record<string, unknown>> {
  const config = loadConfig();
  const log = logger.child({ app: "co-movement-sync", version: config.appVersion });
  const supabase = createSupabaseClient(config);
  return runRebuild({ supabase, log, lookbackMonths: config.lookbackMonths });
}

async function main(): Promise<void> {
  try {
    const out = await dispatch();
    logger.info({ result: out }, "co-movement-sync complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "co-movement-sync failed");
    process.exit(1);
  }
}

// CLI 진입점 (vitest import 시에는 실행 안 함) — candle-sync 패턴 mirror
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main();
}
