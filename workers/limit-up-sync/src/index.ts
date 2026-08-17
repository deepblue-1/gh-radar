import "dotenv/config";
import {
  isKrxHoliday,
  isKrxCalendarStale,
  kstDateIso,
  KRX_HOLIDAYS_SEEDED_THROUGH,
} from "@gh-radar/shared";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { createSupabaseClient } from "./services/supabase";
import { runRebuild } from "./rebuild";

/**
 * limit-up-sync entry — 단일 cycle (Phase 11 동조 워커 선례 복제).
 *
 * 모드 분기(dispatch) 없음: 이 워커는 rebuild_limit_up RPC 1줄만 호출하는
 * 야간 1회 full-rebuild 워커라 분기 전략이 불필요하다.
 *
 * vitest import 시에는 main() 미실행 — CLI 진입점만 동작 (candle-sync 패턴 mirror).
 */
export async function dispatch(): Promise<Record<string, unknown>> {
  const config = loadConfig();
  const log = logger.child({ app: "limit-up-sync", version: config.appVersion });

  // 0차 KRX 휴장일 가드 (quick-260817-f1a) — **직전일(D-1) 기준**.
  //   Scheduler cron `0 2 * * 2-6` (화~토 새벽 2시) 이므로 대상 거래일은 오늘이 아니라 D-1.
  //   오늘 기준으로 판정하면 8/18(화) 02:00 실행이 8/17(휴장일) 오염 데이터를 그대로 rebuild 한다.
  const prevDateIso = kstDateIso(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (isKrxCalendarStale(prevDateIso)) {
    log.warn(
      { prevDateIso, seededThrough: KRX_HOLIDAYS_SEEDED_THROUGH },
      "KRX 휴장일 캘린더 seed 만료 — 0차 가드 무력. krxCalendar.ts 에 이듬해 휴장일 추가 필요",
    );
  }
  if (isKrxHoliday(prevDateIso)) {
    log.warn({ prevDateIso }, "직전일이 KRX 휴장일 — rebuild skip (0차 캘린더 가드)");
    return { skipped: true, reason: "krx_holiday", prevDateIso };
  }

  const supabase = createSupabaseClient(config);
  return runRebuild({ supabase, log, lookbackMonths: config.lookbackMonths });
}

async function main(): Promise<void> {
  try {
    const out = await dispatch();
    logger.info({ result: out }, "limit-up-sync complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "limit-up-sync failed");
    process.exit(1);
  }
}

// CLI 진입점 (vitest import 시에는 실행 안 함) — candle-sync 패턴 mirror
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main();
}
