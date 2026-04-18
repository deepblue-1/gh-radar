import pLimit from "p-limit";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createSupabaseClient } from "./services/supabase.js";
import { createNaverClient } from "./naver/client.js";
import { collectStockNews } from "./naver/collectStockNews.js";
import { loadTargets } from "./pipeline/targets.js";
import { loadLastSeenMap } from "./pipeline/lastSeen.js";
import { mapToNewsRow } from "./pipeline/map.js";
import { upsertNews } from "./pipeline/upsert.js";
import { classifyPerStockError } from "./pipeline/classify.js";
import { checkBudget, incrementUsage, kstDateString } from "./apiUsage.js";
import { runRetention } from "./retention.js";

/**
 * Phase 07 — news-sync cycle entry point.
 *
 * Flow:
 *  1. loadConfig + service_role Supabase + Naver client 초기화
 *  2. loadTargets (top_movers ∪ watchlists, stocks 마스터로 FK 검증)
 *  3. checkBudget — 예상 호출량 초과 시 cycle skip
 *  4. lastSeenMap 사전 로드 + firstCutoffIso (7일)
 *  5. p-limit(concurrency) 로 per-stock collectStockNews → upsertNews
 *     - onPage 콜백에서 incrementUsage + 초과 시 stopAll
 *     - Phase 07.2: classifyPerStockError 결과로 stopAll/skip 결정
 *       · auth (401) / budget-exhausted → stopAll
 *       · rate-limit (429, backoff retry 후 포기) → per-stock skip
 *       · other → per-stock skip (failure isolation)
 *  6. runRetention(90) 으로 90일 초과 행 DELETE
 *  7. summary 로그
 */
export async function runNewsSyncCycle(): Promise<void> {
  const cfg = loadConfig();
  const log = createLogger(cfg.logLevel).child({
    app: "news-sync",
    version: cfg.appVersion,
  });
  const supabase = createSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);
  const naver = createNaverClient(cfg);

  const targets = await loadTargets(supabase);
  log.info({ count: targets.length }, "news-sync targets loaded");

  const dateKst = kstDateString();
  const budgetBefore = await checkBudget(supabase, dateKst);
  if (budgetBefore + targets.length > cfg.naverDailyBudget) {
    log.warn(
      {
        budgetBefore,
        targets: targets.length,
        budget: cfg.naverDailyBudget,
      },
      "budget would exceed — skipping cycle",
    );
    return;
  }

  // R7: 종목별 마지막 수집 MAX(published_at) 선로드 — 증분 종료조건 기준
  const codes = targets.map((t) => t.code);
  const lastSeenMap = await loadLastSeenMap(supabase, codes);
  const firstCutoffIso = new Date(Date.now() - 7 * 86_400_000).toISOString();

  let pages = 0;
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  let stopAll = false;

  const limit = pLimit(cfg.newsSyncConcurrency);

  await Promise.allSettled(
    targets.map((t) =>
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
        } catch (err: unknown) {
          const cls = classifyPerStockError(err);
          if (cls.disposition === "stopAll") {
            log.error(
              { err: (err as Error).message, code: t.code, kind: cls.kind },
              "abort signal from Naver",
            );
            stopAll = true;
          } else {
            log.warn(
              { err: (err as Error)?.message, code: t.code, kind: cls.kind },
              cls.kind === "rate-limit"
                ? "per-stock rate-limited after retries"
                : "per-stock fetch failed",
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
      pages,
      inserted,
      skipped,
      errors,
      retentionDeleted,
      budgetBefore,
      budgetAfter,
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
