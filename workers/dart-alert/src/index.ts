import { randomUUID } from "node:crypto";
import type { AxiosAdapter } from "axios";
import type { DestinationStream } from "pino";
import { checkBudget, DART_KEY_SERVICES, readQuotaStrikes, recordQuotaStrike, UsageCounter } from "./apiUsage";
import { runCollector, type CollectorDeps, type CollectorExit } from "./collector";
import { loadConfig, type DartAlertConfig } from "./config";
import { createDartHttp, fetchListPage, fetchWatchRows, PageTracker } from "./dart/client";
import { createDartAlertDb } from "./db";
import { createLogger } from "./logger";
import { safeErrorFields } from "./safeError";
import { createSupabaseClient } from "./services/supabase";
import { createTelegramHttp, sendMessage } from "./telegram/client";
import { buildWatches, type DartKeyId, type WatchId } from "./watches";

/**
 * Phase 43-05 — dart-alert Cloud Run Job 진입점(kis-news-sync index.ts 꼴).
 *
 * 실제 의존성(Supabase 서비스롤 · OpenDART axios · 텔레그램 axios · 시계 · sleep)을 runCollector 에 결선하고
 * 종료 코드를 돌려준다.
 * - DB 는 43-02 `createDartAlertDb(supabase, holder)` 한 곳만 쓴다 — RPC 이름 · `p_*` 인자 · 반환 키 · 55000 →
 *   `LeaseLostError` 를 tests/dbContract.test.ts 가 마이그레이션과 자동 대조해 잠갔다. 여기서 supabase rpc 를
 *   직접 부르지 않는다(계약 테스트 밖 호출이 생기면 그 보장이 깨진다). 사용량 · 한도 의심 표시는 apiUsage.ts.
 * - holder = `${CLOUD_RUN_EXECUTION}:${임의 8자}` — 임대 보유자 이름(실행마다 다름).
 * - OpenDART 키 2개(261113-rn7 U-2): 감시 대상의 `key` 로 키 1(`OPENDART_API_KEY`) · 키 2(`OPENDART_API_KEY_2`)를
 *   고르고, 사용량 · 한도 의심 표시도 그 키의 service(`DART_KEY_SERVICES`)로 센다. 키마다 `UsageCounter` 하나.
 * - OpenDART: 감시 대상마다 `PageTracker` 하나로 `fetchWatchRows`(100건 넘는 날 쪽 넘김 · 43-04) — 날이 바뀌면 새로.
 *   탐침은 그 키로 1쪽 1회 — 키 1 공개매수(D004) · 키 2 거래소 수시공시(I001). probe 모드는 키 2.
 * - 텔레그램: 클로저가 쥔 현재 방 id 로 `sendMessage`. `switchChat` 은 이 실행 동안만 방 id 를 바꾼다(비밀은 그대로 —
 *   사용자가 비밀 스크립트로 고친다 · 43-06).
 * - SIGTERM(Cloud Run 취소 · 타임아웃) → AbortController → 루프가 다음 걸음에서 끝내고 사용량 flush · 임대 해제.
 * - 종료 코드: 0 = 정상(임대 없음 · 창 끝 · 창 밖 · probe · seed→창 끝 · test-send) · 1 = 오류(설정 · 한도 · 키 ·
 *   예산 · seed 실패 · 예외). Job 은 재시도 0 — 재시작은 Scheduler 깨움 + 임대가 맡는다.
 * - 설정 오류는 env 이름(비밀 값 없음)만, 예외는 `safeErrorFields` 만 로그 — 로거 redact 가 마지막 그물.
 */

/** 단독 탐침 유형 — 키 1 공개매수 · 키 2 거래소 수시공시(그 키가 실제로 부르는 유형) */
const PROBE_DETAIL_TY: Readonly<Record<DartKeyId, string>> = { 1: "D004", 2: "I001" };

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

/** 테스트용 가짜 전송(axios adapter) — 운영에서는 넘기지 않는다 */
export interface Transports {
  dartAdapter?: AxiosAdapter;
  telegramAdapter?: AxiosAdapter;
}

export function buildDeps(
  cfg: DartAlertConfig,
  log: CollectorDeps["log"],
  signal: AbortSignal,
  transports: Transports = {},
): CollectorDeps {
  const supabase = createSupabaseClient(cfg);
  const dartHttp = createDartHttp(cfg.dartBaseUrl, transports.dartAdapter);
  const telegramHttp = createTelegramHttp(cfg.telegramBaseUrl, transports.telegramAdapter);
  const counters: Record<DartKeyId, UsageCounter> = {
    1: new UsageCounter(DART_KEY_SERVICES[1].usage),
    2: new UsageCounter(DART_KEY_SERVICES[2].usage),
  };
  const apiKeyOf: Record<DartKeyId, string> = { 1: cfg.dartApiKey, 2: cfg.dartApiKey2 };
  const holder = `${process.env.CLOUD_RUN_EXECUTION ?? "local"}:${randomUUID().slice(0, 8)}`;
  const watches = buildWatches({ b001Kinds: cfg.b001Kinds });

  // 감시 대상마다 쪽 넘김 기억 하나 — 날이 바뀌면 전날 total_count 가 남지 않게 새로 만든다(43-04 인계)
  let trackerDay = "";
  const trackers = new Map<WatchId, PageTracker>();
  const trackerFor = (id: WatchId, day: string): PageTracker => {
    if (day !== trackerDay) {
      trackers.clear();
      trackerDay = day;
    }
    let t = trackers.get(id);
    if (!t) {
      t = new PageTracker();
      trackers.set(id, t);
    }
    return t;
  };

  let chatId = cfg.telegramChatId;

  return {
    cfg: { dailyBudget: cfg.dailyBudget, mode: cfg.mode },
    log,
    clock: { now: () => Date.now() },
    sleep: abortableSleep(signal),
    signal,
    holder,
    watches,
    judge: { b001Corrections: cfg.b001Corrections },
    db: {
      ...createDartAlertDb(supabase, holder),
      usage: {
        read: (d, key) => checkBudget(supabase, d, DART_KEY_SERVICES[key].usage),
        add: (n, key) => counters[key].add(n),
        flush: (d, key) => counters[key].flush(supabase, d),
      },
      strikes: {
        read: (d, key) => readQuotaStrikes(supabase, d, DART_KEY_SERVICES[key].strike),
        record: (d, key) => recordQuotaStrike(supabase, d, DART_KEY_SERVICES[key].strike),
      },
    },
    dart: {
      list: (watch, day) =>
        fetchWatchRows(dartHttp, apiKeyOf[watch.key], { detailTy: watch.pblntfDetailTy, day }, trackerFor(watch.id, day), Date.now()),
      probe: async (day, key) => {
        const page = await fetchListPage(dartHttp, apiKeyOf[key], { detailTy: PROBE_DETAIL_TY[key], day, pageNo: 1 });
        return { total: page.total, calls: 1 };
      },
    },
    telegram: {
      send: (text, opts) => sendMessage(telegramHttp, cfg.telegramBotToken, chatId, text, opts),
      switchChat: (id) => {
        chatId = id;
      },
    },
  };
}

export interface MainOptions {
  /** 로그 출력(테스트) — 기본 stdout */
  logDestination?: DestinationStream;
  /** 수집기 대역(테스트) — 기본 runCollector */
  run?: (deps: CollectorDeps) => Promise<CollectorExit>;
}

/** 종료 코드를 돌려준다(process.exit 는 CLI 가드에서) */
export async function main(opts: MainOptions = {}): Promise<number> {
  let cfg: DartAlertConfig;
  try {
    cfg = loadConfig();
  } catch (err) {
    // 설정 오류 메시지는 env 이름(비밀 값 없음)만 담는다(config.ts)
    createLogger("info", opts.logDestination).error({ msg1: err instanceof Error ? err.message : String(err) }, "dart-alert config error");
    return 1;
  }
  let log: ReturnType<typeof createLogger>;
  try {
    log = createLogger(cfg.logLevel, opts.logDestination).child({ app: "dart-alert", version: cfg.appVersion });
  } catch (err) {
    // pino 는 모르는 level(LOG_LEVEL 오타 등)이면 던진다 — 기본 level 로거로 error 를 남기고 1(무로그 실패 금지 · 리뷰 IN-02)
    createLogger("info", opts.logDestination).error(
      { err: safeErrorFields(err), logLevel: String(cfg.logLevel).slice(0, 20) },
      "dart-alert logger setup failed",
    );
    return 1;
  }

  const ac = new AbortController();
  const onSignal = (sig: string) => () => {
    log.info({ signal: sig }, "signal received — stopping after current step");
    ac.abort();
  };
  const onTerm = onSignal("SIGTERM");
  const onInt = onSignal("SIGINT");
  process.once("SIGTERM", onTerm);
  process.once("SIGINT", onInt);

  try {
    const deps = buildDeps(cfg, log, ac.signal);
    log.info({ holder: deps.holder, mode: cfg.mode, budget: cfg.dailyBudget, watches: deps.watches.length }, "dart-alert start");
    const result = await (opts.run ?? runCollector)(deps);
    return result.code;
  } catch (err) {
    log.error({ err: safeErrorFields(err) }, "dart-alert failed");
    return 1;
  } finally {
    process.off("SIGTERM", onTerm);
    process.off("SIGINT", onInt);
  }
}

/**
 * main 이 예상 밖으로 reject 했을 때 남길 한 줄 — 로거를 믿을 수 없는 자리라 pino 꼴 JSON(level 60 · 안전 필드만)을
 * 직접 만든다. level ≥ 50 이라 error 로그 이메일 정책에도 걸린다(리뷰 IN-02).
 */
export function crashLine(err: unknown, nowMs = Date.now()): string {
  return JSON.stringify({ level: 60, time: nowMs, app: "dart-alert", msg: "dart-alert crashed", err: safeErrorFields(err) });
}

// CLI 진입점 (vitest import 시에는 실행 안 함)
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stdout.write(`${crashLine(err)}\n`);
      process.exit(1);
    },
  );
}
