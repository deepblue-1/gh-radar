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
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * stocks 마스터 조회 — codes 를 CHUNK 단위로 나눠 .in() URL 한계(414)를 회피.
 * 강세장에 codes 가 수천 개로 늘면 단일 .in() 이 통째로 실패하므로 청크 필수.
 * error 는 throw — 조용히 빈 결과로 진행하면 eligibleCodes 가 비어 top_movers 가 비워진다.
 * (2026-06-09 회귀 대응: 강세장 codes 2838 → .in() 실패 → eligibleCodes 빈 Set → top_movers 0)
 */
export async function fetchStocksMasterChunked(
  supabase: SupabaseClient,
  codes: string[],
): Promise<Array<{ code: string; market: string; security_group: string | null }>> {
  const CHUNK = 500;
  const out: Array<{ code: string; market: string; security_group: string | null }> = [];
  for (let i = 0; i < codes.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("stocks")
      .select("code, market, security_group")
      .in("code", codes.slice(i, i + CHUNK));
    if (error) throw error;
    if (data) {
      out.push(
        ...(data as Array<{ code: string; market: string; security_group: string | null }>),
      );
    }
  }
  return out;
}

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
 *   (partial 가드(< MIN_EXPECTED_ROWS)는 제거 — sort_tp=1 상승 종목 수는 시장 따라 변동, 2026-06-08)
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

  // STEP 1 — ka10027 페이지네이션 (sort_tp 1+3 병합)
  //   상한가 근접 상승 종목만이 아니라 하락 전환 종목도 매분 일봉(stock_daily_ohlcv) 갱신 대상.
  //   sort_tp=1(상승+보합) + sort_tp=3(하락+보합) 을 각각 페이지네이션 호출 후 concat.
  //   concat 후 dedupeMap(Map by code, "마지막 row 승")이 보합 중복(1/3 양쪽 등장)을 자연 제거 —
  //   동일값이라 무해. (2026-07-06 하락 종목 일봉 동결 버그 수정)
  const kiwoom = createKiwoomClient(config.kiwoomBaseUrl);
  const upRows = await withRetry(
    () => fetchKa10027(kiwoom, token.accessToken, "1", config.paginationHardCap),
    "fetchKa10027(sort_tp=1)",
  );
  const downRows = await withRetry(
    () => fetchKa10027(kiwoom, token.accessToken, "3", config.paginationHardCap),
    "fetchKa10027(sort_tp=3)",
  );
  const ka10027Rows = [...upRows, ...downRows];
  log.info(
    { upRows: upRows.length, downRows: downRows.length, rows: ka10027Rows.length },
    "STEP1 ka10027 fetched (sort_tp 1+3 merged)",
  );

  // 휴장일 가드 (RESEARCH §2.5): 병합 0 row 는 휴장/키움 미응답 → no-op exit.
  // partial 가드(< MIN_EXPECTED_ROWS)는 제거 — 상승/하락 종목 수는 시장 상황에 따라
  // 자연 변동하므로 고정 하한 검증은 오탐(2026-06-08 회귀).
  if (ka10027Rows.length === 0) {
    log.warn("ka10027 0 rows — 휴장일 또는 키움 미응답");
    return { step1Count: 0, step2Count: 0, failed: 0 };
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
  // stocks 마스터 조회 — codes 가 강세장에 수천 개까지 늘면 단일 .in() 이 URL 한계(414)로
  // 통째로 실패한다. fetchStocksMasterChunked 가 500 개씩 나눠 조회 + error 처리로 회피.
  // (2026-06-09 회귀: 강세장 codes 2838 → .in() 실패 → eligibleCodes 빈 Set → top_movers 0)
  const masterRows = await withRetry(
    () => fetchStocksMasterChunked(supabase, codes),
    "fetchStocksMaster",
  );
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
  for (const m of masterRows) {
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
  const {
    successful: ka10001Rows,
    failed,
    failures,
  } = await fetchKa10001ForHotSet(kiwoom, token.accessToken, hotSet);
  log.info(
    {
      successful: ka10001Rows.length,
      failed,
      // 실패 sample — error 메시지별 그룹 카운트 + 첫 5건 (code+err) 로 패턴 진단.
      failureSample: failures.slice(0, 5).map((f) => ({
        code: f.code,
        error: f.error.slice(0, 120),
      })),
      failureGroups: Object.entries(
        failures.reduce<Record<string, number>>((acc, f) => {
          // 에러 메시지 앞 80자만 정규화 키
          const key = f.error.slice(0, 80);
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    },
    "STEP2 ka10001 fetched",
  );

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

  // STEP2 는 step2UpdatesRaw 를 필터 없이 그대로 UPSERT.
  //   과거엔 step1Codes intersect 필터로 watchlist 종목(ka10027 미응답)을 걸러냈으나,
  //   그 원 사유(upsertQuotesStep2 신규 INSERT 시 NOT NULL violation)는 이미 소멸:
  //     - upsertQuotesStep2 (upsertQuotes.ts): UPSERT→UPDATE 전환 → 없는 row 에 no-op.
  //     - intradayUpsertOhlc (intraday_upsert_ohlc RPC): INSERT 폴백 분기 보유 → 없는 종목도 안전.
  //   필터를 두면 watchlist 종목의 정확 OHLC 가 stock_daily_ohlcv 에 반영되지 않는 회귀가 발생.
  //   (2026-07-06 watchlist 일봉 미반영 버그 수정)

  // STEP 2 — RPC #2 + stock_quotes
  await withRetry(
    () => intradayUpsertOhlc(supabase, step2UpdatesRaw),
    "intradayUpsertOhlc",
  );
  await withRetry(
    () => upsertQuotesStep2(supabase, step2UpdatesRaw),
    "upsertQuotesStep2",
  );

  log.info(
    { step1Count, step2Count: step2UpdatesRaw.length, failed },
    "intraday cycle complete",
  );

  return { step1Count, step2Count: step2UpdatesRaw.length, failed };
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
