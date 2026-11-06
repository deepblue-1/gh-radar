// workers/intraday-sync/src/floatSync.ts
//
// quick 261106-ldl — 유통주식수 야간 배치(JOB_MODE=float, Job gh-radar-float-sync).
// - 평일 21:30 KST 고정 배치 — 호출량이 사용자 수와 독립(CLAUDE.md 공식 API 운영 기준). 공개 라우트는 DB 만 읽는다.
// - 키움 ka10001 의 주식수 단위(주 vs 천주) 미확인 — pipeline/floatShares.ts 가 stocks.listing_shares 와 비교해
//   정규화하고, run 마다 배수 표 · raw 표본 1행을 로그로 남겨 첫 실행 스모크에서 확인한다.
// - 연속 실패 차단기: maxConsecutiveFailures 에 닿으면 남은 호출을 멈추고(차단 신호를 재시도로 두드리지 않음)
//   이미 받은 행만 저장한 뒤 aborted 로 돌려준다(main 이 exit 1).

import type { AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isKrxHoliday, isKrxCalendarStale, KRX_HOLIDAYS_SEEDED_THROUGH } from "@gh-radar/shared";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { withRetry } from "./retry";
import { createSupabaseClient } from "./services/supabase";
import { createKiwoomClient } from "./kiwoom/client";
import { configureKiwoomRateLimiter } from "./kiwoom/rateLimiter";
import { getKiwoomToken } from "./kiwoom/tokenStore";
import { fetchKa10001One } from "./kiwoom/fetchHotSet";
import {
  decideRunMultiplier,
  pickUnitMultiplier,
  toFloatRaw,
  toStockFloatRow,
  type FloatRaw,
  type RunMultiplierDecision,
  type UnitMultiplier,
} from "./pipeline/floatShares";

export type FloatSyncDeps = {
  supabase: SupabaseClient;
  kiwoom: AxiosInstance;
  getToken: () => Promise<string>;
  now?: Date;
  concurrency?: number;
  pageSize?: number;
  upsertBatchSize?: number;
  tokenRefreshEvery?: number;
  maxConsecutiveFailures?: number;
  retryAttempts?: number;
};

export type FloatSyncResult = {
  dateIso: string;
  universe: number;
  ok: number;
  nullCount: number;
  failed: number;
  aborted: boolean;
  skipped: "holiday" | null;
  multiplier: UnitMultiplier | null;
  votes: RunMultiplierDecision["votes"];
  upserted: number;
};

type FloatSample = {
  code: string;
  flo_stk: string | undefined;
  dstr_stk: string | undefined;
  dstr_rt: string | undefined;
  listing_shares: number | null;
};

type UniverseRow = { code: string; listingShares: number | null };

/** KST 날짜 YYYY-MM-DD (index.ts todayIsoKst 와 같은 계산 — index.ts import 는 순환). */
function kstDateIso(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

/** stocks 마스터 전량 — 상폐 · ELW · ETN 제외(ETF 포함), PostgREST 1000행 한도 때문에 range 페이지 반복. */
async function fetchFloatUniverse(
  supabase: SupabaseClient,
  pageSize: number,
): Promise<UniverseRow[]> {
  const out: UniverseRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("stocks")
      .select("code, listing_shares")
      .eq("is_delisted", false)
      .not("security_group", "in", '("ELW","ETN")')
      .order("code", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ code: string; listing_shares: number | string | null }>;
    for (const r of rows) {
      const ls = r.listing_shares === null ? null : Number(r.listing_shares);
      out.push({ code: r.code, listingShares: ls !== null && Number.isFinite(ls) && ls > 0 ? ls : null });
    }
    if (rows.length < pageSize) break;
  }
  return out;
}

export async function syncStockFloat(deps: FloatSyncDeps): Promise<FloatSyncResult> {
  const {
    supabase,
    kiwoom,
    getToken,
    now = new Date(),
    concurrency = 4,
    pageSize = 1000,
    upsertBatchSize = 500,
    tokenRefreshEvery = 500,
    maxConsecutiveFailures = 20,
    retryAttempts = 3,
  } = deps;
  const startedAt = Date.now();
  const dateIso = kstDateIso(now);
  const log = logger.child({ job: "float-sync", dateIso });

  if (isKrxCalendarStale(dateIso)) {
    log.warn(
      { seededThrough: KRX_HOLIDAYS_SEEDED_THROUGH },
      "KRX 휴장일 캘린더 seed 만료 — krxCalendar.ts 에 이듬해 휴장일 추가 필요",
    );
  }
  if (isKrxHoliday(dateIso)) {
    log.warn("KRX 휴장일 — float sync skip (키움 · DB 호출 없음)");
    return {
      dateIso,
      universe: 0,
      ok: 0,
      nullCount: 0,
      failed: 0,
      aborted: false,
      skipped: "holiday",
      multiplier: null,
      votes: { 1: 0, 1000: 0 },
      upserted: 0,
    };
  }

  // 1. universe
  const universe = await fetchFloatUniverse(supabase, pageSize);
  log.info({ universe: universe.length }, "float universe loaded");

  // 2. 수집 — 덩어리마다 토큰 재확인(만료 5분 전 갱신이 긴 run 에서도 걸리도록), 덩어리 안은 concurrency 워커.
  const raws: FloatRaw[] = [];
  const failures: Array<{ code: string; error: string }> = [];
  let consecutiveFailures = 0;
  let aborted = false;
  // 스모크용 원문 표본 — 005930 우선, 없으면 listing_shares 가 있는 첫 행.
  let sample: FloatSample | null = null;

  for (let start = 0; start < universe.length && !aborted; start += tokenRefreshEvery) {
    const chunk = universe.slice(start, start + tokenRefreshEvery);
    const token = await getToken();
    let next = 0;
    const worker = async () => {
      while (!aborted) {
        const idx = next++;
        if (idx >= chunk.length) return;
        const { code, listingShares } = chunk[idx];
        try {
          const row = await withRetry(
            () => fetchKa10001One(kiwoom, token, code),
            `ka10001 ${code}`,
            retryAttempts,
          );
          raws.push(toFloatRaw(code, row, listingShares));
          consecutiveFailures = 0;
          if (code === "005930" || (sample === null && listingShares !== null)) {
            sample = {
              code,
              flo_stk: row.flo_stk,
              dstr_stk: row.dstr_stk,
              dstr_rt: row.dstr_rt,
              listing_shares: listingShares,
            };
          }
        } catch (err) {
          failures.push({ code, error: err instanceof Error ? err.message : String(err) });
          consecutiveFailures += 1;
          if (consecutiveFailures >= maxConsecutiveFailures && !aborted) {
            aborted = true;
            log.error(
              { consecutiveFailures, lastCode: code, err: err instanceof Error ? err.message : String(err) },
              "연속 실패 한도 도달 — 남은 호출 중단, 받은 행만 저장",
            );
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, chunk.length) }, () => worker()));
  }

  // 3. 정규화 — 배수 결정 로그(스모크: 단위가 주인지 천주인지 여기서 확인).
  const decision = decideRunMultiplier(raws);
  // 워커 클로저 안 대입은 제어 흐름 분석이 못 본다 — 선언 타입으로 되돌린다.
  const sampleRow = sample as FloatSample | null;
  const sampleRaw = sampleRow ? raws.find((r) => r.code === sampleRow.code) : undefined;
  const sampleLog = sampleRow
    ? {
        ...sampleRow,
        multiplier:
          sampleRaw && sampleRaw.flo !== null && sampleRaw.listingShares !== null
            ? pickUnitMultiplier(sampleRaw.flo, sampleRaw.listingShares)
            : decision.multiplier,
      }
    : null;
  const decisionLog = {
    votes: decision.votes,
    multiplier: decision.multiplier,
    disagree: decision.disagree,
    sample: sampleLog,
  };
  if (decision.multiplier === null) {
    log.warn(decisionLog, "float unit multiplier undecided — listing_shares 없는 행은 null 로 저장");
  } else {
    log.info(decisionLog, "float unit multiplier decided");
  }

  const updatedAt = new Date().toISOString();
  const rows = raws.map((r) => toStockFloatRow(r, decision.multiplier, dateIso, updatedAt));
  const ok = rows.filter((r) => r.float_shares !== null).length;
  const nullCount = rows.length - ok;

  // 4. 저장 — 실패 종목의 기존 행은 건드리지 않는다(as_of 가 오래된 채 남아 신선도를 보여 준다).
  let upserted = 0;
  for (let i = 0; i < rows.length; i += upsertBatchSize) {
    const batch = rows.slice(i, i + upsertBatchSize);
    await withRetry(async () => {
      const { error } = await supabase.from("stock_float").upsert(batch, { onConflict: "code" });
      if (error) throw error;
    }, "upsertStockFloat");
    upserted += batch.length;
  }

  log.info(
    {
      dateIso,
      universe: universe.length,
      ok,
      null: nullCount,
      failed: failures.length,
      aborted,
      multiplier: decision.multiplier,
      upserted,
      elapsedMs: Date.now() - startedAt,
      failureSample: failures.slice(0, 5).map((f) => ({ code: f.code, error: f.error.slice(0, 120) })),
      failureGroups: Object.entries(
        failures.reduce<Record<string, number>>((acc, f) => {
          const key = f.error.slice(0, 80);
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    },
    "float sync complete",
  );

  return {
    dateIso,
    universe: universe.length,
    ok,
    nullCount,
    failed: failures.length,
    aborted,
    skipped: null,
    multiplier: decision.multiplier,
    votes: decision.votes,
    upserted,
  };
}

/** Job 진입 — 설정 · 클라이언트를 만들고 syncStockFloat 를 부른다. 배치 몫 req/s 는 배포 env KA10001_RATE_LIMIT. */
export async function runFloatSyncJob(): Promise<FloatSyncResult> {
  const config = loadConfig();
  const supabase = createSupabaseClient(config);
  configureKiwoomRateLimiter({
    capacity: config.ka10001RateLimitPerSec,
    refillRatePerSec: config.ka10001RateLimitPerSec,
  });
  const kiwoom = createKiwoomClient(config.kiwoomBaseUrl);
  const getToken = async () =>
    (await withRetry(() => getKiwoomToken(supabase, config), "getKiwoomToken")).accessToken;
  logger.info({ ka10001Rate: config.ka10001RateLimitPerSec }, "float sync start");
  return syncStockFloat({ supabase, kiwoom, getToken });
}
