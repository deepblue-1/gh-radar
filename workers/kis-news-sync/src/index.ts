import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfig, type KisNewsConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createSupabaseClient } from "./services/supabase.js";
import { createKisHttp, safeErrorFields } from "./kis/client.js";
import { fetchNewsTitlePage } from "./kis/newsTitle.js";
import { getKisAccessToken } from "./kis/token.js";
import { ingestRows } from "./pipeline/ingest.js";
import { loadStockMeta, loadTargets } from "./pipeline/targets.js";
import { runCleanup } from "./retention.js";
import { UsageCounter, checkBudget, readQuotaStrikes, recordQuotaStrike } from "./apiUsage.js";
import { runCollector, type CollectorDeps } from "./collector.js";

/**
 * Phase 41-08 — kis-news-sync Cloud Run Job 진입점.
 *
 * 실제 의존성(Supabase 서비스롤 · 한투 axios · 시계 · sleep)을 runCollector 에 결선하고 종료 코드를 돌려준다.
 * - holder = `${CLOUD_RUN_EXECUTION}:${임의 8자}` — 임대 보유자 이름(실행마다 다름).
 * - SIGTERM(Cloud Run 취소 · 타임아웃) → AbortController → 루프가 다음 걸음에서 끝내고 사용량 flush · 임대 해제.
 * - 종료 코드: 0 = 정상(임대 없음 · 창 끝 · 한 바퀴 끝 · probe) · 1 = 오류(토큰 · 예산 · 한도 의심 · 예외).
 *   Job 은 `--max-retries=0` — 재시작은 Scheduler 깨움 + 임대가 맡는다.
 * - 예외 로그는 `safeErrorFields` 만 — 토큰 · 앱키 · 시크릿은 어떤 로그에도 싣지 않는다(로거 redact 가 마지막 그물).
 */

function pgError(name: string, e: unknown): Error {
  const o = (e ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof o.code === "string" ? ` (${o.code})` : "";
  return new Error(`${name} 실패: ${typeof o.message === "string" ? o.message : "unknown"}${code}`);
}

async function rpcBool(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw pgError(fn, error);
  return data === true;
}

function abortableSleep(signal: AbortSignal): (ms: number) => Promise<void> {
  return (ms) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) return resolve();
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, Math.max(0, ms));
      signal.addEventListener("abort", done, { once: true });
    });
}

export function buildDeps(
  cfg: KisNewsConfig,
  log: CollectorDeps["log"] & Parameters<typeof getKisAccessToken>[0]["log"],
  signal: AbortSignal,
): CollectorDeps {
  const supabase = createSupabaseClient(cfg);
  const http = createKisHttp(cfg.kisBaseUrl);
  const counter = new UsageCounter();
  const holder = `${process.env.CLOUD_RUN_EXECUTION ?? "local"}:${randomUUID().slice(0, 8)}`;

  return {
    cfg: { maxRps: cfg.maxRps, dailyBudget: cfg.dailyBudget, mode: cfg.mode, targetCap: cfg.targetCap },
    log,
    clock: { now: () => Date.now() },
    sleep: abortableSleep(signal),
    signal,
    holder,
    db: {
      leaseAcquire: (h, ttl) => rpcBool(supabase, "kis_news_lease_acquire", { p_holder: h, p_ttl_seconds: ttl }),
      leaseRelease: (h) => rpcBool(supabase, "kis_news_lease_release", { p_holder: h }),
      readState: async () => {
        const { data, error } = await supabase
          .from("kis_news_state")
          .select("last_srno, cleanup_date")
          .eq("id", 1)
          .maybeSingle();
        if (error) throw pgError("kis_news_state 읽기", error);
        const row = data as { last_srno?: string | null; cleanup_date?: string | null } | null;
        return { lastSrno: row?.last_srno ?? null, cleanupDate: row?.cleanup_date ?? null };
      },
      loadTargets: (meta) => loadTargets(supabase, meta),
      loadStockMeta: () => loadStockMeta(supabase),
      ingest: (rows, via, code) => ingestRows(supabase, rows, via, code),
      cleanup: () => runCleanup(supabase),
      usage: {
        read: (d) => checkBudget(supabase, d),
        add: (n) => counter.add(n),
        flush: (d) => counter.flush(supabase, d),
      },
      strikes: {
        read: (d) => readQuotaStrikes(supabase, d),
        record: (d) => recordQuotaStrike(supabase, d),
      },
    },
    kis: {
      token: async ({ canIssue, force }) =>
        (
          await getKisAccessToken({
            supabase,
            http,
            appkey: cfg.kisAppKey,
            appsecret: cfg.kisAppSecret,
            canIssue,
            force,
            now: Date.now(),
            log,
          })
        ).token,
      page: (query, token) =>
        fetchNewsTitlePage(http, { token, appkey: cfg.kisAppKey, appsecret: cfg.kisAppSecret }, query),
    },
  };
}

/** 종료 코드를 돌려준다(process.exit 는 CLI 가드에서) */
export async function main(): Promise<number> {
  let cfg: KisNewsConfig;
  try {
    cfg = loadConfig();
  } catch (err) {
    // 설정 오류 메시지는 env 이름(비밀 값 없음)만 담는다
    createLogger("info").error({ msg1: (err as Error)?.message ?? String(err) }, "kis-news-sync config error");
    return 1;
  }
  const log = createLogger(cfg.logLevel).child({ app: "kis-news-sync", version: cfg.appVersion });

  const ac = new AbortController();
  const onSignal = (sig: string) => () => {
    log.info({ signal: sig }, "signal received — stopping after current step");
    ac.abort();
  };
  process.once("SIGTERM", onSignal("SIGTERM"));
  process.once("SIGINT", onSignal("SIGINT"));

  try {
    const deps = buildDeps(cfg, log, ac.signal);
    log.info({ holder: deps.holder, mode: cfg.mode, maxRps: cfg.maxRps, budget: cfg.dailyBudget }, "kis-news-sync start");
    const result = await runCollector(deps);
    return result.code;
  } catch (err) {
    log.error({ ...safeErrorFields(err) }, "kis-news-sync failed");
    return 1;
  }
}

// CLI 진입점 (vitest import 시에는 실행 안 함)
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main().then(
    (code) => process.exit(code),
    () => process.exit(1),
  );
}
