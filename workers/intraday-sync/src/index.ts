import "dotenv/config";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { getKiwoomToken } from "./kiwoom/tokenStore";
import { createKiwoomClient } from "./kiwoom/client";
import { fetchKa10027 } from "./kiwoom/fetchRanking";
import { fetchKa10001ForHotSet } from "./kiwoom/fetchHotSet";
import { configureKiwoomRateLimiter } from "./kiwoom/rateLimiter";
import { ka10027RowToCloseUpdate } from "./pipeline/map";
import { ka10001RowToOhlcUpdate } from "./pipeline/mapOhlc";
import { computeHotSet } from "./pipeline/hotSet";
import { rebuildTopMovers } from "./pipeline/topMovers";
import { bootstrapMissingStocks } from "./pipeline/bootstrapStocks";
import { intradayUpsertClose } from "./pipeline/upsertClose";
import { intradayUpsertOhlc } from "./pipeline/upsertOhlc";
import { upsertQuotesStep1, upsertQuotesStep2 } from "./pipeline/upsertQuotes";
import { createSupabaseClient } from "./services/supabase";
import { withRetry } from "./retry";
import type { IntradayCloseUpdate } from "@gh-radar/shared";

function todayIsoKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

/**
 * intraday-sync 의 매 cycle entry point.
 *
 * STEP1 → STEP2 순서 보장 (RESEARCH §3.5, T-09.1-20):
 *   1. STEP1 — ka10027 페이지네이션 → bootstrap → mapping+dedupe → market join → RPC #1 + stock_quotes + top_movers
 *   2. STEP2 — hot set 산출 → ka10001 Promise.allSettled → mapping → RPC #2 + stock_quotes
 *
 * 휴장일 가드 (RESEARCH §2.5):
 *   - ka10027 0 row → warn + exit 정상 (no-op)
 *   - ka10027 < MIN_EXPECTED → throw "partial response"
 */
export async function runIntradayCycle(): Promise<{
  step1Count: number;
  step2Count: number;
  failed: number;
}> {
  const config = loadConfig();
  const supabase = createSupabaseClient(config);
  const dateIso = todayIsoKst();
  const log = logger.child({ dateIso });

  // rate limiter 설정 (config 의 KA10001_RATE_LIMIT 적용)
  configureKiwoomRateLimiter({
    capacity: config.ka10001RateLimitPerSec,
    refillRatePerSec: config.ka10001RateLimitPerSec,
  });

  log.info(
    { ka10001Rate: config.ka10001RateLimitPerSec, hotSetTopN: config.hotSetTopN },
    "intraday cycle start",
  );

  // 0. Token
  const token = await withRetry(() => getKiwoomToken(supabase, config), "getKiwoomToken");

  // STEP 1 — ka10027 페이지네이션
  const kiwoom = createKiwoomClient(config.kiwoomBaseUrl);
  const ka10027Rows = await withRetry(
    () => fetchKa10027(kiwoom, token.accessToken, config.paginationHardCap),
    "fetchKa10027",
  );
  log.info({ rows: ka10027Rows.length }, "STEP1 ka10027 fetched");

  // 휴장일 / partial 응답 가드 (RESEARCH §2.5 + §6)
  if (ka10027Rows.length === 0) {
    log.warn("ka10027 0 rows — 휴장일 또는 키움 미응답");
    return { step1Count: 0, step2Count: 0, failed: 0 };
  }
  if (ka10027Rows.length < config.minExpectedRows) {
    throw new Error(
      `ka10027 ${ka10027Rows.length} < ${config.minExpectedRows} — partial response`,
    );
  }

  // STEP 1 — bootstrap (FK orphan 회피)
  await withRetry(
    () => bootstrapMissingStocks(supabase, ka10027Rows),
    "bootstrapMissingStocks",
  );

  // STEP 1 — mapping + dedupe (페이지 경계 중복 제거, RESEARCH §3.3.4)
  const dedupeMap = new Map<string, IntradayCloseUpdate>();
  let mapErrors = 0;
  for (const row of ka10027Rows) {
    try {
      const u = ka10027RowToCloseUpdate(row, dateIso);
      dedupeMap.set(u.code, u); // 마지막 row 가 승
    } catch {
      mapErrors += 1;
    }
  }
  const step1Updates = Array.from(dedupeMap.values());
  log.info({ mapped: step1Updates.length, mapErrors }, "STEP1 mapped + deduped");

  // STEP 1 — market + security_group join (stocks 마스터에서)
  //   marketMap: top_movers.market 채우기 (KOSPI/KOSDAQ CHECK 제약)
  //   eligibleCodes: rebuildTopMovers 화이트리스트 — 일반 주식 계열만 통과시켜 ETF/ETN/ELW 자동 제외
  const codes = step1Updates.map((u) => u.code);
  const { data: masterRows } = await supabase
    .from("stocks")
    .select("code, market, security_group")
    .in("code", codes);
  const marketMap = new Map<string, "KOSPI" | "KOSDAQ">();
  const ELIGIBLE_SECGROUPS = new Set<string>([
    "주권",
    "외국주권",
    "주식예탁증권",
    "부동산투자회사",
    "투자회사",
    "사회간접자본투융자회사",
  ]);
  const eligibleCodes = new Set<string>();
  for (const m of (masterRows ?? []) as Array<{
    code: string;
    market: string;
    security_group: string | null;
  }>) {
    if (m.market === "KOSPI" || m.market === "KOSDAQ") marketMap.set(m.code, m.market);
    if (m.security_group && ELIGIBLE_SECGROUPS.has(m.security_group)) {
      eligibleCodes.add(m.code);
    }
  }

  // STEP 1 — RPC #1 + stock_quotes + top_movers
  const { count: step1Count } = await withRetry(
    () => intradayUpsertClose(supabase, step1Updates),
    "intradayUpsertClose",
  );
  await withRetry(
    () => upsertQuotesStep1(supabase, step1Updates),
    "upsertQuotesStep1",
  );
  const { count: topCount } = await withRetry(
    () => rebuildTopMovers(supabase, step1Updates, marketMap, eligibleCodes),
    "rebuildTopMovers",
  );
  log.info({ step1Count, topCount }, "STEP1 DB writes complete");

  // STEP 2 — hot set 산출
  const hotSet = await computeHotSet(supabase, step1Updates, config.hotSetTopN);
  log.info({ hotSetSize: hotSet.length }, "STEP2 hot set computed");

  // STEP 2 — ka10001 호출 (fail-isolation)
  const { successful: ka10001Rows, failed } = await fetchKa10001ForHotSet(
    kiwoom,
    token.accessToken,
    hotSet,
  );
  log.info({ successful: ka10001Rows.length, failed }, "STEP2 ka10001 fetched");

  // STEP 2 — mapping
  const step2UpdatesRaw = ka10001Rows
    .map((r) => {
      try {
        return ka10001RowToOhlcUpdate(r, dateIso);
      } catch {
        return null;
      }
    })
    .filter((u): u is NonNullable<typeof u> => u !== null);

  // STEP1 처리 종목 (stock_quotes 에 row 존재 보장) 만 STEP2 UPSERT 대상.
  // computeHotSet 이 watchlist 종목을 추가하므로 STEP1 ka10027 응답에 없는 종목이
  // 포함될 수 있음 → upsertQuotesStep2 가 신규 row INSERT 시 price NOT NULL violation.
  // (2026-05-15 first cycle 검증) step1Updates 의 code set 으로 intersect 하여 안전.
  // stock_daily_ohlcv RPC (intradayUpsertOhlc) 는 별도 테이블이라 영향 없음.
  const step1Codes = new Set(step1Updates.map((u) => u.code));
  const step2Updates = step2UpdatesRaw.filter((u) => step1Codes.has(u.code));
  const droppedFromStep2 = step2UpdatesRaw.length - step2Updates.length;
  if (droppedFromStep2 > 0) {
    log.info(
      { dropped: droppedFromStep2 },
      "STEP2 dropped non-STEP1 codes (watchlist 종목 중 ka10027 미응답)",
    );
  }

  // STEP 2 — RPC #2 + stock_quotes
  await withRetry(
    () => intradayUpsertOhlc(supabase, step2Updates),
    "intradayUpsertOhlc",
  );
  await withRetry(
    () => upsertQuotesStep2(supabase, step2Updates),
    "upsertQuotesStep2",
  );

  log.info(
    { step1Count, step2Count: step2Updates.length, failed },
    "intraday cycle complete",
  );

  return { step1Count, step2Count: step2Updates.length, failed };
}

async function main(): Promise<void> {
  try {
    const out = await runIntradayCycle();
    logger.info({ ...out }, "intraday-sync complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "intraday-sync failed");
    process.exit(1);
  }
}

// CLI 진입점 (vitest import 시에는 실행 안 함)
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main();
}
