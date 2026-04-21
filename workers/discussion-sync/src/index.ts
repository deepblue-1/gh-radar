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
import { checkBudget, incrementUsage, kstDateString } from "./apiUsage.js";
import { runRetention } from "./retention.js";

/**
 * Phase 08 — discussion-sync cycle entry point.
 *
 * Flow:
 *  1. loadConfig + service_role Supabase + Bright Data proxy client 초기화
 *  2. loadTargets (top_movers ∪ watchlists, stocks 마스터로 FK 검증)
 *  3. checkBudget — 예상 요청량 초과 시 cycle skip (옵션 5 채택 후 per-stock 1 req)
 *  4. p-limit(concurrency) 로 per-stock collectDiscussions → upsertDiscussions
 *     - onRequest 콜백에서 incrementUsage + 초과 시 stopAll
 *     - ProxyAuthError / ProxyBudgetExhaustedError → stopAll = true
 *     - ProxyBlockedError / NaverRateLimitError → per-stock skip (failure isolation)
 *     - NaverApiValidationError → per-stock skip + logger warn (fetcher 버그 알림)
 *  5. runRetention(90) 으로 90일 초과 행 DELETE
 *  6. summary 로그
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

  // 옵션 5 (JSON API) — incremental 종목 1 req, backfill 종목 최대 backfillMaxPages req.
  // 보수적 상한: 모든 종목이 backfill 모드라고 가정하고 cap 검사. 실제 사용량은 훨씬 낮음.
  const expectedPerStock = cfg.discussionSyncBackfillMaxPages;
  const expectedTotal = targets.length * expectedPerStock;
  if (budgetBefore + expectedTotal > cfg.discussionSyncDailyBudget) {
    log.warn(
      {
        budgetBefore,
        expectedTotal,
        cap: cfg.discussionSyncDailyBudget,
      },
      "budget would exceed — skipping cycle",
    );
    return;
  }

  let totalRequests = 0;
  let totalUpserted = 0;
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
              log.warn({ used }, "daily budget exceeded mid-cycle — stopAll");
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
          const { upserted } = await upsertDiscussions(supabase, rows);
          totalUpserted += upserted;
          log.info({ code: t.code, mode, requests, upserted }, "per-stock done");
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
