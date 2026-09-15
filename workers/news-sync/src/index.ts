import pLimit from "p-limit";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createSupabaseClient } from "./services/supabase.js";
import { createNaverClient } from "./naver/client.js";
import { collectStockNews } from "./naver/collectStockNews.js";
import type {
  NaverBudgetExhaustedError,
  NaverRateLimitError,
} from "./naver/searchNews.js";
import { loadTargets } from "./pipeline/targets.js";
import { planRun } from "./pipeline/cadence.js";
import { loadLastSeenMap } from "./pipeline/lastSeen.js";
import { mapToNewsRow } from "./pipeline/map.js";
import { upsertNews } from "./pipeline/upsert.js";
import {
  CONSECUTIVE_429_STOCKS_FOR_EXHAUSTION,
  Consecutive429Tracker,
  classifyPerStockError,
} from "./pipeline/classify.js";
import {
  QUOTA_STRIKES_TO_STOP_DAY,
  checkBudget,
  incrementUsage,
  kstDateString,
  readQuotaStrikes,
  recordQuotaStrike,
} from "./apiUsage.js";
import { runRetention } from "./retention.js";

/**
 * Phase 07 — news-sync cycle entry point.
 *
 * Flow:
 *  1. loadConfig + service_role Supabase + Naver client 초기화, now 1회 캡처
 *  1b. readQuotaStrikes(오늘 KST) ≥ 2 → 자정까지 skip (네이버 호출 0) — quick-260915-h3p
 *  2. loadTargets (top_movers(code, rank) ∪ watchlists, stocks 마스터로 FK 검증)
 *  2b. planRun(now, NEWS_SYNC_MODE, records) — quick-260915-h3p
 *     · 평일 KST 08:00~20:02 = tiered: hot(rank≤30 ∪ 관심종목) 전부 + rest 3조 순환 버킷 1개
 *     · 그 외 시각 · 토·일 = full: 전체 대상
 *  3. checkBudget — 선택 대상 수 기준 예상 호출량 초과 시 cycle skip
 *  4. lastSeenMap 사전 로드(선택 대상) + firstCutoffIso (now 기준 7일)
 *  5. p-limit(concurrency) 로 선택 대상 per-stock collectStockNews → upsertNews
 *     - onPage 콜백에서 incrementUsage + 자체 예산 가드 초과 시 error 로그 1회 + stopAll
 *     - classifyPerStockError 결과로 stopAll/skip 결정
 *       · auth (401) → stopAll
 *       · budget-exhausted (429 소진 본문) → stopAll + strike 1회 기록
 *       · rate-limit (429, backoff retry 후 포기) → per-stock skip,
 *         단 연속 5종목이면 소진 의심 → stopAll + strike 1회 기록
 *       · other → per-stock skip (failure isolation)
 *  6. runRetention(90) 으로 90일 초과 행 DELETE
 *  7. summary 로그
 *
 * 한도 소진 설계 판단 (quick-260915-h3p):
 *  한 run 의 증거는 그 run 만 중단하고, 같은 KST 날짜 두 번째 증거(strike)에서 당일 중단한다.
 *  오판(초당 버스트를 소진으로 오인)이 하루 뉴스 전체를 끄는 비용이 매우 크다. 반면 실제 소진 시
 *  추가 비용은 다음 1회 run 의 거절된 호출 몇 건뿐이라 "재시도로 두드리지 않음" 을 만족한다.
 */
export async function runNewsSyncCycle(): Promise<void> {
  const cfg = loadConfig();
  const log = createLogger(cfg.logLevel).child({
    app: "news-sync",
    version: cfg.appVersion,
  });
  const supabase = createSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);
  const naver = createNaverClient(cfg);
  // quick-260915-h3p: run 시작 시각을 1회만 캡처 — 모드·버킷·KST 날짜·컷오프가 같은 시각을 본다.
  const now = new Date();
  const dateKst = kstDateString(now);

  // 사전 차단: 오늘 이미 한도 소진 판정이 2회 이상이면 자정까지 네이버를 호출하지 않는다.
  const strikes = await readQuotaStrikes(supabase, dateKst);
  if (strikes >= QUOTA_STRIKES_TO_STOP_DAY) {
    log.warn(
      { strikes, dateKst },
      "Naver daily quota exhausted earlier today — skipping run until KST midnight",
    );
    return;
  }

  const records = await loadTargets(supabase);
  const { mode, restBucket, selected, counts } = planRun(
    now,
    cfg.newsSyncMode,
    records,
  );
  log.info(
    { mode, restBucket, ...counts, selected: selected.length },
    "news-sync targets selected",
  );

  const budgetBefore = await checkBudget(supabase, dateKst);
  if (budgetBefore + selected.length > cfg.naverDailyBudget) {
    log.warn(
      {
        budgetBefore,
        targets: selected.length,
        budget: cfg.naverDailyBudget,
      },
      "budget would exceed — skipping cycle",
    );
    return;
  }

  // R7: 종목별 마지막 수집 MAX(published_at) 선로드 — 증분 종료조건 기준
  const codes = selected.map((t) => t.code);
  const lastSeenMap = await loadLastSeenMap(supabase, codes);
  const firstCutoffIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  let pages = 0;
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  let stopAll = false;
  let budgetGuardLogged = false;
  let quotaAbort: null | "explicit" | "suspected" = null;
  const tracker = new Consecutive429Tracker(CONSECUTIVE_429_STOCKS_FOR_EXHAUSTION);

  /**
   * 한 run 에서 strike 는 최대 1회만 기록한다 — 동시에 떠 있던 종목들이 같은 에러를 여러 번
   * 던지기 때문. quotaAbort 는 await 전에 동기적으로 세팅해 경합 없이 첫 호출만 통과시킨다.
   * 기록 실패는 로그만 남기고 중단은 그대로 진행한다(throw 하지 않음).
   */
  const strikeOnce = async (
    kind: "explicit" | "suspected",
  ): Promise<{ first: boolean; strikesToday: number | null }> => {
    if (quotaAbort !== null) return { first: false, strikesToday: null };
    quotaAbort = kind;
    try {
      return { first: true, strikesToday: await recordQuotaStrike(supabase, dateKst) };
    } catch (e: unknown) {
      log.error(
        { err: (e as Error)?.message, dateKst, kind },
        "failed to record Naver quota strike — aborting run anyway",
      );
      return { first: true, strikesToday: null };
    }
  };

  const limit = pLimit(cfg.newsSyncConcurrency);

  await Promise.allSettled(
    selected.map((t) =>
      limit(async () => {
        if (stopAll) {
          skipped++;
          return;
        }
        try {
          // R7: page 별 budget 증가 콜백 — 초과 시 false 반환 → collectStockNews 즉시 break
          const onPage = async (): Promise<boolean> => {
            const used = await incrementUsage(supabase, dateKst, 1);
            if (used > cfg.naverDailyBudget) {
              if (!budgetGuardLogged) {
                budgetGuardLogged = true;
                log.error(
                  { used, budget: cfg.naverDailyBudget },
                  "news-sync daily budget guard reached — aborting run",
                );
              }
              stopAll = true;
              return false;
            }
            return !stopAll;
          };

          const { items, pages: pagesForStock, stoppedBy } =
            await collectStockNews(naver, t.name, {
              lastSeenIso: lastSeenMap.get(t.code) ?? null,
              firstCutoffIso,
              onPage,
            });
          pages += pagesForStock;
          if (stoppedBy === "api-limit") {
            log.warn(
              { code: t.code, pages: pagesForStock },
              "hit Naver start=1000 hard limit — some articles may be unreachable",
            );
          }

          const rows = items
            .map((it) => mapToNewsRow(t.code, it))
            .filter(
              (r): r is NonNullable<typeof r> => r !== null,
            );
          const { inserted: ins } = await upsertNews(supabase, rows);
          inserted += ins;
          tracker.recordSuccess();
        } catch (err: unknown) {
          const cls = classifyPerStockError(err);
          if (cls.kind === "budget-exhausted") {
            stopAll = true;
            const e = err as NaverBudgetExhaustedError;
            const { first, strikesToday } = await strikeOnce("explicit");
            if (first) {
              log.error(
                {
                  code: t.code,
                  errorCode: e.errorCode,
                  errorMessage: e.errorMessage,
                  strikesToday,
                },
                "Naver daily quota exhausted — aborting run (no retries); second strike today stops news-sync until KST midnight",
              );
            } else {
              log.warn(
                { code: t.code, errorCode: e.errorCode, quotaAbort },
                "Naver daily quota exhausted — run already aborting",
              );
            }
          } else if (cls.kind === "auth") {
            log.error(
              { err: (err as Error).message, code: t.code, kind: cls.kind },
              "abort signal from Naver",
            );
            stopAll = true;
          } else if (cls.kind === "rate-limit") {
            const e = err as NaverRateLimitError;
            // 원문 본문을 남긴다 — 429 코드 형태([ASSUMED])를 첫 실제 발생에서 확인하기 위함
            log.warn(
              {
                err: e.message,
                code: t.code,
                kind: cls.kind,
                errorCode: e.errorCode,
                errorMessage: e.errorMessage,
              },
              "per-stock rate-limited after retries",
            );
            errors++;
            if (tracker.recordRateLimitFailure()) {
              stopAll = true;
              const { first, strikesToday } = await strikeOnce("suspected");
              if (first) {
                log.error(
                  {
                    consecutive: CONSECUTIVE_429_STOCKS_FOR_EXHAUSTION,
                    strikesToday,
                  },
                  "suspected Naver daily quota exhaustion: 5 consecutive stocks 429 after retries — aborting run",
                );
              }
            }
          } else {
            log.warn(
              { err: (err as Error)?.message, code: t.code, kind: cls.kind },
              "per-stock fetch failed",
            );
            errors++;
          }
        }
      }),
    ),
  );

  const retentionDeleted = await runRetention(supabase, 90);
  const budgetAfter = await checkBudget(supabase, dateKst);

  log.info(
    {
      mode,
      restBucket,
      targets: selected.length,
      pages,
      inserted,
      skipped,
      errors,
      retentionDeleted,
      budgetBefore,
      budgetAfter,
      quotaAbort,
    },
    "news-sync cycle complete",
  );
}

async function main(): Promise<void> {
  try {
    await runNewsSyncCycle();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[news-sync] fatal", err);
    process.exit(1);
  }
}

// CLI 진입점 (vitest import 시에는 실행 안 함)
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main();
}
