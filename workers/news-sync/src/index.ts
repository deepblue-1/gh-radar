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
import { planRun, type TargetRecord } from "./pipeline/cadence.js";
import { loadLastSeenMap } from "./pipeline/lastSeen.js";
import { mapToNewsRow } from "./pipeline/map.js";
import { upsertNews } from "./pipeline/upsert.js";
import {
  CONSECUTIVE_429_STOCKS_FOR_EXHAUSTION,
  Consecutive429Tracker,
  classifyPerStockError,
} from "./pipeline/classify.js";
import {
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
 *  1b. readQuotaStrikes(오늘 KST) — 1 이상이면 5단계 전에 첫 선택 대상을 재시도 없이 단독 탐침 (quick-260915-il4)
 *  2. loadTargets (top_movers(code, rank) ∪ watchlists, stocks 마스터로 FK 검증)
 *  2b. planRun(now, NEWS_SYNC_MODE, records) — quick-260915-h3p
 *     · 평일 KST 08:00~20:02 = tiered: hot(rank≤30 ∪ 관심종목) 전부 + rest 3조 순환 버킷 1개
 *     · 그 외 시각 · 토·일 = full: 전체 대상
 *  3. checkBudget — 선택 대상 수 기준 예상 호출량 초과 시 cycle skip
 *  4. lastSeenMap 사전 로드(선택 대상) + firstCutoffIso (now 기준 7일)
 *  5. p-limit(concurrency) 로 선택 대상 per-stock collectStockNews → upsertNews
 *     - onPage 콜백에서 incrementUsage + 자체 예산 가드 초과 시 error 로그 1회 + stopAll
 *     - classifyPerStockError 결과로 stopAll/skip 결정
 *       · 탐침 429(본문 무관) → stopAll + strike 1회
 *       · auth (401) → stopAll
 *       · budget-exhausted (429 소진 본문) → stopAll + strike 1회 기록
 *       · rate-limit (429, backoff retry 후 포기) → per-stock skip,
 *         단 연속 5종목이면 소진 의심 → stopAll + strike 1회 기록
 *       · other → per-stock skip (failure isolation)
 *  6. runRetention(90) 으로 90일 초과 행 DELETE
 *  7. summary 로그
 *
 * 한도 소진 설계 판단 (quick-260915-il4):
 *  한 run 의 증거는 그 run 만 중단한다. 이후 run 은 첫 대상 1종목을 재시도 없이 먼저 수집해
 *  회복을 확인하고, 429 가 아니면 나머지를 평소대로 수집한다. 실제 소진이 계속되면 run 당
 *  거절 호출 1건만 쓴다. 당일 중단은 오판(초당 버스트 · 네이버 장애 · [ASSUMED] 코드 매핑)
 *  2회가 하루 뉴스를 끄는 비용이 커서 quick-260915-il4 에서 제거했다.
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

  // quick-260915-il4: 오늘 strike 수는 탐침 여부만 정한다 (사전 skip 없음).
  const strikesToday = await readQuotaStrikes(supabase, dateKst);

  const records = await loadTargets(supabase);
  const { mode, restBucket, selected, counts } = planRun(
    now,
    cfg.newsSyncMode,
    records,
  );
  log.info(
    { mode, restBucket, ...counts, selected: selected.length, strikesToday },
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
  let quotaAbort: null | "explicit" | "suspected" | "probe" = null;
  let quotaProbe: null | "passed" | "rate-limited" = null;
  const tracker = new Consecutive429Tracker(CONSECUTIVE_429_STOCKS_FOR_EXHAUSTION);

  /**
   * 한 run 에서 strike 는 최대 1회만 기록한다 — 동시에 떠 있던 종목들이 같은 에러를 여러 번
   * 던지기 때문. quotaAbort 는 await 전에 동기적으로 세팅해 경합 없이 첫 호출만 통과시킨다.
   * 기록 실패는 로그만 남기고 중단은 그대로 진행한다(throw 하지 않음).
   */
  const strikeOnce = async (
    kind: "explicit" | "suspected" | "probe",
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

  /**
   * 대상 1종목 수집. probe=true 면 429 를 재시도하지 않고(retryOnRateLimit=false),
   * 429 (본문 무관) 는 run 전체를 중단시킨다 — quick-260915-il4.
   */
  const processTarget = async (t: TargetRecord, probe: boolean): Promise<void> => {
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
          retryOnRateLimit: !probe,
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
      if (probe && (cls.kind === "budget-exhausted" || cls.kind === "rate-limit")) {
        // 탐침 429 — 소진 본문이든 일반 본문이든 한도가 아직 회복되지 않은 것으로 보고 중단.
        // 같은 날 판정 run 이 이미 error 를 남겼고, 실제 소진이 이어지면 3분마다 반복될
        // 예상된 거절이라 warn 으로 남긴다. 연속 429 tracker 는 건드리지 않는다.
        stopAll = true;
        errors++;
        const e = err as NaverBudgetExhaustedError | NaverRateLimitError;
        const { first, strikesToday: strikesNow } = await strikeOnce(
          cls.kind === "budget-exhausted" ? "explicit" : "probe",
        );
        if (first) {
          log.warn(
            {
              code: t.code,
              errorCode: e.errorCode,
              // 원문 — 429 코드 형태([ASSUMED]) 확인용
              errorMessage: e.errorMessage,
              quotaAbort,
              strikesToday: strikesNow,
            },
            "quota probe got HTTP 429 — aborting run (no retries); next run probes again",
          );
        }
      } else if (cls.kind === "budget-exhausted") {
        stopAll = true;
        const e = err as NaverBudgetExhaustedError;
        const { first, strikesToday: strikesNow } = await strikeOnce("explicit");
        if (first) {
          log.error(
            {
              code: t.code,
              errorCode: e.errorCode,
              errorMessage: e.errorMessage,
              strikesToday: strikesNow,
            },
            "Naver daily quota exhausted — aborting run (no retries); next runs re-check with a single probe call",
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
          const { first, strikesToday: strikesNow } = await strikeOnce("suspected");
          if (first) {
            log.error(
              {
                consecutive: CONSECUTIVE_429_STOCKS_FOR_EXHAUSTION,
                strikesToday: strikesNow,
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
  };

  // quick-260915-il4: 오늘 strike 가 있으면 첫 대상을 동시성 없이 단독 탐침한 뒤 나머지를 수집한다.
  let rest: TargetRecord[] = selected;
  if (strikesToday >= 1 && selected.length > 0) {
    const probeCode = selected[0].code;
    log.info(
      { strikesToday, probeCode },
      "Naver quota strike recorded earlier today — probing with first target alone",
    );
    await processTarget(selected[0], true);
    if (quotaAbort !== null) {
      quotaProbe = "rate-limited";
    } else {
      quotaProbe = "passed";
      // 401 · 예산 가드로 멈춘 경우는 그 자체 로그로 충분하다.
      if (!stopAll) log.info({ strikesToday, probeCode }, "quota probe passed — resuming");
    }
    rest = selected.slice(1);
  }

  const limit = pLimit(cfg.newsSyncConcurrency);

  // 탐침이 중단시켰어도 나머지를 그대로 넣는다 — processTarget 첫 줄의 stopAll 검사가 skipped 를 센다.
  await Promise.allSettled(rest.map((t) => limit(() => processTarget(t, false))));

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
      strikesToday,
      quotaAbort,
      quotaProbe,
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
