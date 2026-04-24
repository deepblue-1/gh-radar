/**
 * Phase 08.1 Plan 05 — 일회성 backfill 스크립트.
 *
 * 목적: 기존 15k+ discussions (classified_at IS NULL) 을 chunk 단위로 분류.
 *
 * 사용:
 *   pnpm --filter @gh-radar/discussion-sync backfill:dev       # 로컬 tsx
 *   pnpm --filter @gh-radar/discussion-sync build
 *   pnpm --filter @gh-radar/discussion-sync backfill           # node dist/backfill.js
 *
 * 환경변수:
 *   ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (필수)
 *   MAX_BACKFILL_ROWS (기본 20000)
 *   BACKFILL_CHUNK_SIZE (기본 100) — chunk per classifyBatch
 *   BACKFILL_SELECT_PAGE (기본 10000) — 단일 SELECT 한도
 *   STOCK_CODES (옵션) — CSV 로 특정 종목만 backfill (예: "005930,000660"). 미지정 시 전체.
 *
 * 종료 조건:
 *   - unclassified 잔여 0 → complete
 *   - 누적 처리 >= MAX_BACKFILL_ROWS → complete (재실행으로 이어가기)
 *   - SIGINT/SIGTERM → graceful shutdown (현재 chunk 완료 후 종료)
 *
 * 재실행 안전: `classified_at IS NULL` 만 pickup 하므로 처음부터 idempotent.
 */
import "dotenv/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createSupabaseClient } from "./services/supabase.js";
import { classifyBatch } from "./classify/classifyBatch.js";
import { persistRelevance } from "./classify/persistRelevance.js";

const DEFAULT_MAX_BACKFILL_ROWS = 20000;
const DEFAULT_CHUNK_SIZE = 100;
const DEFAULT_SELECT_PAGE = 10000;
const PROGRESS_EVERY = 500;

export interface BackfillOptions {
  supabase: SupabaseClient;
  log: pino.Logger;
  maxRows: number;
  chunkSize: number;
  selectPage: number;
  /** 옵션 — 지정 시 해당 stock_code 만 backfill. 미지정 시 전체. */
  stockCodes?: string[];
  /** DI — 테스트에서 fake classify 주입 가능. 프로덕션은 classifyBatch 를 그대로 전달. */
  classify: typeof classifyBatch;
  /** DI — 테스트에서 fake persist 주입 가능. 프로덕션은 persistRelevance 그대로 전달. */
  persist: typeof persistRelevance;
  /** Graceful shutdown 신호 — true 반환 시 현재 chunk 완료 후 탈출. */
  shouldStop?: () => boolean;
}

export interface BackfillResult {
  processed: number;
  classified: number;
  failed: number;
  elapsedMs: number;
}

/**
 * Phase 08.1 Plan 05 — backfill 루프 본체 (DI-friendly).
 *
 * 구조:
 *   1. SELECT page (selectPage rows) where classified_at IS NULL, order posted_at desc
 *   2. chunk 단위로 classify + persist
 *   3. progress 로그 (PROGRESS_EVERY row 마다)
 *   4. 조건: page.length === 0 → complete / processed >= maxRows → stop / shouldStop() → graceful
 */
export async function runBackfill(opts: BackfillOptions): Promise<BackfillResult> {
  const { supabase, log, maxRows, chunkSize, selectPage, stockCodes, classify, persist, shouldStop } = opts;

  let processed = 0;
  let classified = 0;
  let failed = 0;
  const startedAt = Date.now();

  while (!(shouldStop?.() ?? false) && processed < maxRows) {
    let query = supabase
      .from("discussions")
      .select("id,title,body")
      .is("classified_at", null)
      .order("posted_at", { ascending: false })
      .limit(selectPage);
    if (stockCodes && stockCodes.length > 0) {
      query = query.in("stock_code", stockCodes);
    }
    const { data, error } = await query;

    if (error) {
      log.error({ err: error.message }, "backfill select failed");
      throw new Error(`backfill select failed: ${error.message}`);
    }

    const page = (data ?? []) as Array<{ id: string; title: string; body: string | null }>;
    if (page.length === 0) {
      log.info({ processed, classified, failed }, "no more unclassified rows — complete");
      break;
    }

    // chunk 분할 처리
    let chunkAborted = false;
    for (let i = 0; i < page.length; i += chunkSize) {
      if (shouldStop?.() ?? false) {
        chunkAborted = true;
        break;
      }
      if (processed >= maxRows) {
        chunkAborted = true;
        break;
      }
      const chunk = page.slice(i, i + chunkSize);
      const labels = await classify(chunk, log);
      const updated = await persist(supabase, labels);
      classified += updated;
      failed += chunk.length - updated;
      processed += chunk.length;
      if (processed % PROGRESS_EVERY < chunkSize) {
        const elapsedMs = Date.now() - startedAt;
        const ratePerMin = elapsedMs > 0 ? processed / (elapsedMs / 60000) : 0;
        log.info(
          { processed, classified, failed, ratePerMin: Math.round(ratePerMin) },
          "backfill progress",
        );
      }
    }
    if (chunkAborted) break;
  }

  const elapsedMs = Date.now() - startedAt;
  log.info(
    { processed, classified, failed, elapsedSec: Math.round(elapsedMs / 1000) },
    "backfill complete",
  );

  return { processed, classified, failed, elapsedMs };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const log = createLogger(cfg.logLevel).child({
    app: "discussion-sync-backfill",
    version: cfg.appVersion,
  });
  const supabase = createSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);

  const maxRows = Number(process.env.MAX_BACKFILL_ROWS ?? DEFAULT_MAX_BACKFILL_ROWS);
  const chunkSize = Number(process.env.BACKFILL_CHUNK_SIZE ?? DEFAULT_CHUNK_SIZE);
  const selectPage = Number(process.env.BACKFILL_SELECT_PAGE ?? DEFAULT_SELECT_PAGE);
  const stockCodesRaw = process.env.STOCK_CODES?.trim();
  const stockCodes = stockCodesRaw
    ? stockCodesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  let shuttingDown = false;
  const onSignal = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.warn({}, "shutdown signal — finishing current chunk then exit");
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  log.info(
    {
      maxRows,
      chunkSize,
      selectPage,
      stockCodesCount: stockCodes?.length ?? 0,
      model: cfg.classifyModel,
      concurrency: cfg.classifyConcurrency,
    },
    "backfill start",
  );

  await runBackfill({
    supabase,
    log,
    maxRows,
    chunkSize,
    selectPage,
    stockCodes,
    classify: classifyBatch,
    persist: persistRelevance,
    shouldStop: () => shuttingDown,
  });

  process.exit(0);
}

// CLI 진입점 (vitest import 시에는 실행 안 함)
if (
  process.argv[1] &&
  (process.argv[1].endsWith("backfill.js") || process.argv[1].endsWith("backfill.ts"))
) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[backfill] fatal", err);
    process.exit(1);
  });
}
