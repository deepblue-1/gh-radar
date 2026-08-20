import "dotenv/config";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { getKiwoomToken } from "./kiwoom/tokenStore";
import { createKiwoomClient } from "./kiwoom/client";
import { fetchKa10027 } from "./kiwoom/fetchRanking";
import { fetchKa10081LatestDt } from "./kiwoom/fetchDailyChart";
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
import { detectStaleSnapshot, fetchPrevDayRows } from "./pipeline/staleGuard";
import { runEodClosePass } from "./pipeline/eodClose";
import { isDailyWriteWindow, isEodClosePass } from "./marketWindow";
import { createSupabaseClient } from "./services/supabase";
import { withRetry } from "./retry";
import type { IntradayCloseUpdate } from "@gh-radar/shared";
import {
  isKrxHoliday,
  isKrxCalendarStale,
  KRX_HOLIDAYS_SEEDED_THROUGH,
} from "@gh-radar/shared";
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

function todayIsoKst(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function kstHour(now: Date): number {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
}

/**
 * intraday-sync 의 매 cycle entry point.
 *
 * STEP1 → STEP2 순서 보장 (RESEARCH §3.5, T-09.1-20):
 *   1. STEP1 — ka10027 페이지네이션 → bootstrap → mapping+dedupe → market join → RPC #1 + stock_quotes + top_movers
 *   2. STEP2 — hot set 산출 → ka10001 Promise.allSettled → mapping → RPC #2 + stock_quotes
 *
 * 휴장일/프리마켓 4단 가드 (quick-260817-f1a 에서 0차·1차 추가):
 *   (0) KRX 휴장일 캘린더 → 알려진 휴장일이면 즉시 skip (비용 0, 결정적)
 *   (1) ka10081 최신 dt !== 오늘 → 직전 거래일 재방출 판정, skip (결정적).
 *       임시공휴일·임시휴장처럼 캘린더에 없는 날까지 커버한다. 09:00 이전(NXT 프리마켓)
 *       사이클은 정상 거래일에도 오늘 봉이 없으므로 판정 보류(관측 로그만).
 *   (2) ka10027 0 row → warn + exit 정상 (no-op)
 *   (3) stale snapshot 감지 → 키움이 직전 거래일 데이터를 그대로 반환한 경우
 *       (휴장일/프리마켓), 저장된 직전 거래일 close/change_rate 와 내용 비교해
 *       일치율이 높으면 skip. 오늘 날짜 가짜 상한가 행 INSERT 방지.
 *       (2026-07-20 quick-260720-kbf: 044380 7/17 가짜 '상' 마커 근본 원인)
 *   (partial 가드(< MIN_EXPECTED_ROWS)는 제거 — sort_tp=1 상승 종목 수는 시장 따라 변동, 2026-06-08)
 */
export async function runIntradayCycle(): Promise<{
  step1Count: number;
  step2Count: number;
  failed: number;
}> {
  const config = loadConfig();
  const supabase = createSupabaseClient(config);
  const now = new Date();
  const dateIso = todayIsoKst(now);
  const log = logger.child({ dateIso });

  // 일봉 쓰기 창 / EOD 종가 패스 판정 (quick-260820-fh2).
  //   dailyWrite=false 인 사이클(08:00~08:59, 15:31~15:59)은 stock_daily_ohlcv 를 건드리지 않는다.
  //   NXT 프리/애프터마켓 체결가가 일봉 종가를 오염시키던 경로를 근본 차단 (D-fh2-01).
  //   eodPass=true 인 사이클(15:35~15:55)은 KRX 전용 종가로 당일 일봉을 확정한다 (D-fh2-02).
  const dailyWrite = isDailyWriteWindow(now);
  const eodPass = isEodClosePass(now);

  // rate limiter 설정 (config 의 KA10001_RATE_LIMIT 적용)
  configureKiwoomRateLimiter({
    capacity: config.ka10001RateLimitPerSec,
    refillRatePerSec: config.ka10001RateLimitPerSec,
  });

  log.info(
    {
      ka10001Rate: config.ka10001RateLimitPerSec,
      hotSetTopN: config.hotSetTopN,
      dailyWrite,
      eodPass,
    },
    "intraday cycle start",
  );

  // 0차 KRX 휴장일 가드 (quick-260817-f1a) — 비용 0 의 결정적 신호.
  //   키움은 휴장일에 빈 응답이 아니라 직전 거래일 + 시간외 보정 스냅샷을 재방출하므로
  //   값 비교 휴리스틱(staleGuard)만으로는 구조적으로 막을 수 없다(2026-08-17 사고).
  if (isKrxCalendarStale(dateIso)) {
    log.warn(
      { dateIso, seededThrough: KRX_HOLIDAYS_SEEDED_THROUGH },
      "KRX 휴장일 캘린더 seed 만료 — 0차 가드 무력. krxCalendar.ts 에 이듬해 휴장일 추가 필요",
    );
  }
  // 0. Token — 0차 게이트보다 앞. 휴장일에도 ka10081 probe 결과를 로그에 남겨
  //    "휴장일엔 오늘 dt 봉이 생기지 않는다"(가정 A1)를 프로덕션에서 실측하기 위함.
  //    휴장일 비용은 토큰 1 + REST 2회/분 수준(24 req/s 버킷 대비 무시 가능).
  const token = await withRetry(() => getKiwoomToken(supabase, config), "getKiwoomToken");
  const kiwoom = createKiwoomClient(config.kiwoomBaseUrl);

  // 1차 ka10081 dt 가드 — probe (판정은 0차 게이트 뒤에서).
  const todayBasDd = dateIso.replace(/-/g, "");
  const hourKst = kstHour(now);
  type DtProbe = { code: string; latestDt: string | null; error?: string };
  const probes: DtProbe[] = [];
  if (config.dtGuardEnabled) {
    for (const code of config.dtGuardProbeCodes) {
      // withRetry 미적용 — 재시도는 skip 판정을 지연시킬 뿐이고, 실패는 어차피 fail-open.
      // 개별 실패가 cycle 을 죽이면 안 된다 (T-f1a-03).
      try {
        const latestDt = await fetchKa10081LatestDt(
          kiwoom,
          token.accessToken,
          code,
          todayBasDd,
        );
        probes.push({ code, latestDt });
      } catch (err) {
        probes.push({
          code,
          latestDt: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    log.info(
      { probes, todayBasDd, hourKst, isHoliday: isKrxHoliday(dateIso) },
      "ka10081 dt probe",
    );
  }

  if (isKrxHoliday(dateIso)) {
    log.warn({ dateIso }, "KRX 휴장일 — cycle skip (0차 캘린더 가드, DB 쓰기 없음)");
    return { step1Count: 0, step2Count: 0, failed: 0 };
  }

  if (config.dtGuardEnabled) {
    const okProbes = probes.filter((p) => p.error === undefined && p.latestDt !== null);
    if (okProbes.length === 0) {
      log.warn(
        { probes },
        "ka10081 probe 전부 실패 — dt 가드 fail-open, 0차/2차/3차 가드로 진행",
      );
    } else if (okProbes.every((p) => p.latestDt !== todayBasDd)) {
      // 보수적 판정: 하나라도 오늘 dt 가 있으면 거래일로 간주해 통과.
      // 역방향 오탐(정상 거래일 전량 skip)이 정방향 미탐보다 훨씬 치명적이다.
      if (hourKst < 9) {
        // 08시대(NXT 프리마켓)는 정상 거래일에도 오늘 일봉이 아직 생성되지 않는다.
        // 여기서 skip 하면 정상 거래일 프리마켓 시세 갱신이 통째로 멈추므로 관측만 한다.
        log.info(
          { probes, todayBasDd, hourKst },
          "프리마켓(09:00 이전) 사이클 — 오늘 dt 봉 미생성은 정상, dt 가드 판정 보류(관측만)",
        );
      } else {
        log.warn(
          { probes, todayBasDd, hourKst },
          "ka10081 최신 dt !== 오늘 — 직전 거래일 재방출 판정, cycle skip (1차 dt 가드)",
        );
        return { step1Count: 0, step2Count: 0, failed: 0 };
      }
    }
  }

  // STEP 1 — ka10027 페이지네이션 (sort_tp 1+3 병합)
  //   상한가 근접 상승 종목만이 아니라 하락 전환 종목도 매분 일봉(stock_daily_ohlcv) 갱신 대상.
  //   sort_tp=1(상승+보합) + sort_tp=3(하락+보합) 을 각각 페이지네이션 호출 후 concat.
  //   concat 후 dedupeMap(Map by code, "마지막 row 승")이 보합 중복(1/3 양쪽 등장)을 자연 제거 —
  //   동일값이라 무해. (2026-07-06 하락 종목 일봉 동결 버그 수정)
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

  // STEP 1 — mapping + dedupe (페이지 경계 중복 제거, RESEARCH §3.3.4)
  //   stale 가드가 저장된 직전 거래일 데이터와 내용 비교를 하려면 매핑 결과가 먼저 필요하므로
  //   bootstrap 보다 앞으로 이동. (가짜 데이터로 stocks 를 부트스트랩하지 않도록 순서 보장)
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

  // 휴장일/프리마켓 stale 가드 (2단 가드 #2):
  //   키움 ka10027 은 휴장일/프리마켓에 직전 거래일 snapshot 을 그대로 반환한다.
  //   0행 가드로는 못 잡으므로, 저장된 직전 거래일 close/change_rate 와 내용 비교해
  //   표본 충분(comparable>=30) + 일치율 높으면(>=0.8) 직전일 재방출로 판정 → cycle skip.
  //   (오늘 날짜로 가짜 상한가 행이 stock_daily_ohlcv 에 INSERT 되는 것을 방지)
  const sample = step1Updates.map((u) => u.code).slice(0, 100);
  const prevRows = await withRetry(
    () => fetchPrevDayRows(supabase, sample, dateIso),
    "fetchPrevDayRows",
  );
  const staleResult = detectStaleSnapshot(step1Updates, prevRows);
  if (staleResult.stale) {
    log.warn(
      {
        comparable: staleResult.comparable,
        matched: staleResult.matched,
        ratio: staleResult.ratio,
      },
      "stale snapshot 감지 — 휴장일/프리마켓 직전 거래일 재방출, cycle skip",
    );
    return { step1Count: 0, step2Count: 0, failed: 0 };
  }

  // STEP 1 — bootstrap (FK orphan 회피). stale 가드 통과 후에만 실행.
  await withRetry(
    () => bootstrapMissingStocks(supabase, ka10027Rows),
    "bootstrapMissingStocks",
  );

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

  // STEP 1 — RPC #1 (일봉) + stock_quotes + top_movers
  //   일봉 쓰기만 dailyWrite 게이트 대상. upsertQuotesStep1/rebuildTopMovers 는 표시 계층이라
  //   정규장 밖에도 계속 갱신해야 NXT 프리/애프터마켓 현재가가 화면에 살아있다 (D-fh2-01).
  let step1Count = 0;
  if (dailyWrite) {
    ({ count: step1Count } = await withRetry(
      () => intradayUpsertClose(supabase, step1Updates),
      "intradayUpsertClose",
    ));
  } else {
    log.info(
      { candidates: step1Updates.length },
      "정규장(09:00~15:30) 밖 — 일봉 쓰기 skip, quotes 만 갱신",
    );
  }
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

  // STEP 2 — RPC #2 (일봉 OHLC) + stock_quotes
  //   STEP1 과 동일하게 일봉 쓰기만 게이트. upsertQuotesStep2 는 표시 계층이라 항상 갱신.
  if (dailyWrite) {
    await withRetry(
      () => intradayUpsertOhlc(supabase, step2UpdatesRaw),
      "intradayUpsertOhlc",
    );
  } else {
    log.info(
      { candidates: step2UpdatesRaw.length },
      "정규장 밖 — STEP2 일봉 OHLC 쓰기 skip, quotes 만 갱신",
    );
  }
  await withRetry(
    () => upsertQuotesStep2(supabase, step2UpdatesRaw),
    "upsertQuotesStep2",
  );

  // EOD 공식 종가 패스 (15:35~15:55, D-fh2-02).
  //   실패해도 cycle 을 죽이지 않는다 — 5분 뒤 다음 슬롯이 재시도하며 upsert 는 idempotent.
  if (eodPass) {
    try {
      const { count: eodCount } = await runEodClosePass({
        supabase,
        kiwoom,
        accessToken: token.accessToken,
        dateIso,
        hardCap: config.paginationHardCap,
        log,
      });
      log.info({ eodCount }, "EOD 종가 패스 완료");
    } catch (err) {
      log.error({ err }, "EOD 종가 패스 실패 — 다음 5분 슬롯이 재시도 (cycle 계속)");
    }
  }

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
