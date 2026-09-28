import pLimit from "p-limit";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createSupabaseClient } from "./services/supabase.js";
import { createProxyClient } from "./proxy/client.js";
import {
  ProxyAuthError,
  ProxyBudgetExhaustedError,
  ProxyBlockedError,
  NaverRateLimitError,
  NaverApiValidationError,
} from "./proxy/errors.js";
import { loadTargets } from "./pipeline/targets.js";
import { collectDiscussions } from "./pipeline/collectDiscussions.js";
import { upsertDiscussions } from "./pipeline/upsert.js";
import { classifyBatch } from "./classify/classifyBatch.js";
import { persistRelevance } from "./classify/persistRelevance.js";
import { checkBudget, incrementUsage, kstDateString } from "./apiUsage.js";
import { runRetention } from "./retention.js";

/**
 * 사전 예산 판정의 종목당 최소 요청 수 (quick-260928-nf6).
 *
 * collectDiscussions 는 모드(backfill/incremental)와 상관없이 page 0 에서 onRequest 를
 * 최소 1번 부르므로(maxPages ≥ 1) 이 값은 정확한 하한이다. 상한은 모드와 cutoff 에 따른
 * early-stop 에 달려 있어 종목별 DB 왕복 없이는 사전에 알 수 없다. 그래서 사전 판정은
 * 하한만 보고, 실제 상한은 onRequest 의 원자적 하드캡(incrementUsage → used > cap → stopAll)이
 * 지킨다. 과거에는 종목 수 × 백필 최대 페이지(104 × 30 = 3,120)로 잡아서 하루 사용량
 * ~1,880 이후 KST 자정까지 모든 실행이 skip 됐다.
 */
const MIN_REQUESTS_PER_STOCK = 1;

/**
 * Phase 08 — discussion-sync cycle entry point.
 *
 * Flow:
 *  1. loadConfig + service_role Supabase + Bright Data proxy client 초기화
 *  2. loadTargets (top_movers ∪ watchlists, stocks 마스터로 FK 검증)
 *  3. checkBudget — 남은 예산 < 종목 수 × 1(최소 1페이지) 일 때만 cycle skip, 그 위는 요청 단위 하드캡이 막음
 *  4. p-limit(concurrency) 로 per-stock collectDiscussions → upsertDiscussions
 *     → classifyBatch (Phase 08.1 inline Claude Haiku 분류) → persistRelevance
 *     - onRequest 콜백에서 incrementUsage + 초과 시 stopAll
 *     - ProxyAuthError / ProxyBudgetExhaustedError → stopAll = true
 *     - ProxyBlockedError / NaverRateLimitError → per-stock skip (failure isolation)
 *     - NaverApiValidationError → per-stock skip + logger warn (fetcher 버그 알림)
 *     - classify 실패(unknown 라벨 / API 에러) → classified_at 미업데이트 → 다음 cycle 재시도
 *  5. runRetention(90) 으로 90일 초과 행 DELETE
 *  6. summary 로그 (totalClassified 포함)
 */
export async function runDiscussionSyncCycle(): Promise<void> {
  const cfg = loadConfig();
  const log = createLogger(cfg.logLevel).child({
    app: "discussion-sync",
    version: cfg.appVersion,
  });
  const supabase = createSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);
  const proxy = createProxyClient(cfg);

  const targets = await loadTargets(supabase);
  log.info({ count: targets.length }, "discussion-sync targets loaded");

  const dateKst = kstDateString();
  const budgetBefore = await checkBudget(supabase, dateKst);

  // 사전 판정은 하한(종목당 최소 1요청)만 본다 — 근거는 MIN_REQUESTS_PER_STOCK 주석.
  const cap = cfg.discussionSyncDailyBudget;
  const minRequired = targets.length * MIN_REQUESTS_PER_STOCK;
  const remaining = cap - budgetBefore;
  const precheck = {
    budgetBefore,
    targets: targets.length,
    minRequired,
    remaining,
    cap,
  };
  if (remaining < minRequired) {
    log.warn(precheck, "budget would exceed — skipping cycle");
    return;
  }
  log.info(precheck, "budget precheck passed");

  let totalRequests = 0;
  let totalUpserted = 0;
  let totalClassified = 0;
  let errors = 0;
  let skipped = 0;
  let stopAll = false;
  const limit = pLimit(cfg.discussionSyncConcurrency);

  await Promise.allSettled(
    targets.map((t) =>
      limit(async () => {
        if (stopAll) {
          skipped++;
          return;
        }
        try {
          const onRequest = async (): Promise<boolean> => {
            if (stopAll) return false;
            const used = await incrementUsage(supabase, dateKst, 1);
            totalRequests++;
            if (used > cfg.discussionSyncDailyBudget) {
              log.warn(
                { used, cap: cfg.discussionSyncDailyBudget },
                "daily budget exceeded mid-cycle — stopAll",
              );
              stopAll = true;
              return false;
            }
            return true;
          };

          const { rows, mode, requests } = await collectDiscussions(
            proxy,
            cfg,
            supabase,
            t.code,
            onRequest,
          );
          const { upserted, unclassifiedRows } = await upsertDiscussions(
            supabase,
            rows,
          );
          totalUpserted += upserted;

          // Phase 08.1 — upsert 직후 미분류 행만 Claude Haiku 로 inline 분류.
          // 이미 분류된 행은 skip (비용 통제, approved plan §2). 실패한 분류는
          // Map 에 포함되지 않아 classified_at 미업데이트 → 다음 cycle 재시도.
          let classifiedInBatch = 0;
          if (unclassifiedRows.length > 0) {
            const labels = await classifyBatch(unclassifiedRows, log);
            classifiedInBatch = await persistRelevance(supabase, labels);
            totalClassified += classifiedInBatch;
          }
          log.info(
            {
              code: t.code,
              mode,
              requests,
              upserted,
              unclassified: unclassifiedRows.length,
              classified: classifiedInBatch,
            },
            "per-stock done",
          );
        } catch (err: unknown) {
          if (err instanceof ProxyAuthError || err instanceof ProxyBudgetExhaustedError) {
            log.error(
              { err: (err as Error).message, code: t.code },
              "proxy abort signal — stopAll",
            );
            stopAll = true;
          } else if (err instanceof ProxyBlockedError) {
            log.warn({ code: t.code }, "proxy blocked — per-stock skip");
            errors++;
          } else if (err instanceof NaverRateLimitError) {
            log.warn({ code: t.code }, "naver rate limit after retry — per-stock skip");
            errors++;
          } else if (err instanceof NaverApiValidationError) {
            log.warn(
              { err: (err as Error).message, code: t.code },
              "naver api validation error — per-stock skip",
            );
            errors++;
          } else {
            log.warn(
              { err: (err as Error)?.message, code: t.code },
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
      targets: targets.length,
      totalRequests,
      totalUpserted,
      totalClassified,
      errors,
      skipped,
      retentionDeleted,
      budgetBefore,
      budgetAfter,
      stopAll,
    },
    "discussion-sync cycle complete",
  );
}

async function main(): Promise<void> {
  try {
    await runDiscussionSyncCycle();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[discussion-sync] fatal", err);
    process.exit(1);
  }
}

// CLI 진입점 (vitest import 시에는 실행 안 함)
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main();
}
