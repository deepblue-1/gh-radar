import type { KisNewsConfig } from "./config.js";
import { KisApiError, safeErrorFields } from "./kis/client.js";
import { pageUntilSeen, type NewsTitleQuery } from "./kis/newsTitle.js";
import type { KisNewsTitleRow } from "./kis/types.js";
import { toIngestRows, type ClassifyStats, type IngestRow, type StockMeta } from "./pipeline/classify.js";
import type { IngestResult, IngestVia } from "./pipeline/ingest.js";
import { STOCK_MIN_INTERVAL_MS, TargetQueue, TokenBucket, type TargetInfo } from "./pipeline/scheduler.js";
import { fastWindowEndOf, isCleanupDue, resolveCollectorMode, type CollectorMode } from "./pipeline/cadence.js";
import { BUDGET_WARN_RATIO, budgetStateOf, kstDateString } from "./apiUsage.js";

/**
 * Phase 41-08 — 한투 뉴스 · 공시 수집기 루프(장기 실행 Cloud Run Job 한 실행).
 *
 * 흐름(번호 = 실행 순서):
 *   ① 임대 — `kis_news_lease_acquire(holder, 90초)`. 못 잡으면 다른 실행이 돌고 있다 → 한투 호출 0 · 종료 0
 *      (probe 는 임대 없이도 진행하되 토큰을 새로 받지 않는다). 30초마다 연장 · 거절되면 조용히 종료 0.
 *   ② 예산 — `api_usage` `kis_news_title`(KST 날짜) 가 자체 상한 이상이면 한투를 부르지 않고 종료 0.
 *   ③ 탐침 — 오늘 한도 의심 표시가 있으면 전체 최신 1쪽 단독 탐침 1건 → 실패면 종료 1 · 성공해야 수집 재개
 *      (토큰 무효면 강제 재발급 1번 뒤 탐침 1건 더 — 한도 신호가 아니다).
 *   ④ 토큰 — DB 토큰 재사용 · 1시간 전 재발급(41-13). 발급은 임대 보유자만 · 실패하면 61초 뒤 1번만 다시.
 *   ⑤ 모드 — probe(1쪽 들여오고 「probe ok」) · fast(빠른 창 루프) · slow(한 바퀴).
 *   ⑥ 루프(fast · 200ms 걸음) — 전체 최신 5초(마지막 본 글까지 최대 5쪽) · 공시 F · G 각 60초 1쪽(안전망) ·
 *      대상 10초마다 다시 읽기 · 종목별은 대상 순서대로 · 사용량 10초마다 flush · KST 20:00 이면 끝.
 *      한 번(slow) — 마지막 본 글까지 되감기(최대 30쪽) · F · G · 대상 한 바퀴.
 *   ⑦ 정리 — slow 이고 오늘(KST) 아직 안 했으면 `kis_news_cleanup` 1번.
 *   ⑧ 해제 — 끝날 때(정상 · 오류 · SIGTERM) 사용량 flush · 임대를 가졌으면 `kis_news_lease_release`.
 *
 * 결정 · 규칙:
 *   D-01 10초 안팎 수집 · 한 실행만(임대) · 임대 보유자만 토큰 발급(알림톡 폭탄 Pitfall 1).
 *   D-02 빠른 창 평일 07:00 ~ 20:00 KST(cadence.ts) — 그 밖은 15분마다 slow.
 *   D-05 대상 = 급등 상위 100 ∪ 관심 ∪ 10분 안 등록 · ETP 제외(targets.ts).
 *   D-06 한 번도 모으지 않은 종목 먼저 · 30초 안에 모은 종목은 건너뜀(scheduler.ts) · 글 0건이어도 수집 시각 기록.
 *   공식 API 운영 기준 ① 모든 한투 호출은 초당 `KIS_NEWS_MAX_RPS` 버킷 하나(용량 1 — 버스트 없음)를 지나고,
 *     종목별은 그 절반 속도 버킷을 하나 더 지난다.
 *   운영 기준 ③ 호출량은 사용자 수와 무관 — 대상 수 · 초당 상한 · 고정 주기로만 정해진다.
 *   운영 기준 ④ 한도 · 차단 신호에 재시도로 두드리지 않는다: 초당 초과 1분 안 5번 → 60초 전면 정지 ·
 *     토큰 무효 → 강제 재발급 1번, 10분 안에 또 무효면 종료 1 · 모르는 오류 코드 연속 5번 → 한도 의심 표시 · 종료 1
 *     (다음 실행은 ③ 탐침 1건 — 5xx 와 함께 온 모르는 msg_cd 도 여기다) ·
 *     일시 장애(msg_cd 없는 5xx · 네트워크 · DB) → 그 흐름만 1 · 2 · 4 … 최대 60초 물러섬.
 *   SC-4 자체 상한(기본 200,000 — 공식 한도 아님)의 80% 에서 경고 1번 · 다다르면 error 와 함께 종료 1.
 *   SC-5 실패 로그는 `safeErrorFields`(상태 · msg_cd · msg1 · 종류)만 — 토큰 · 앱키 · 헤더를 싣지 않는다.
 *
 * 메모: 공시 F · G 안전망도 `p_via='feed'` 로 들여온다 — DB `last_srno` 가 공시 쪽 일련번호로 몇 초 앞설 수 있지만
 * 그 값은 다음 실행의 되감기 시작점일 뿐이고, 실행 중 되감기 기준은 전체 최신에서 본 일련번호(메모리)다.
 *
 * 시계 · sleep · DB · 한투는 모두 주입받는다 — 13시간 실행을 가짜 시계 테스트로 돌린다.
 */

/** 임대 TTL — 연장 30초 × 3 */
export const LEASE_TTL_S = 90;
export const LEASE_RENEW_MS = 30_000;
/** 전체 최신 1쪽 주기 */
export const FEED_INTERVAL_MS = 5_000;
/** 공시 F · G 안전망 주기 */
export const DISCLOSURE_SAFETY_MS = 60_000;
export const TARGET_RELOAD_MS = 10_000;
export const USAGE_FLUSH_MS = 10_000;
export const META_RELOAD_MS = 600_000;
export const FEED_MAX_PAGES_FAST = 5;
export const FEED_MAX_PAGES_SLOW = 30;
/** 초당 초과가 1분 안 이 횟수면 전면 정지 */
export const RATE_LIMIT_STRIKES = 5;
export const RATE_LIMIT_PAUSE_MS = 60_000;
/** 모르는 오류 코드가 연속 이 횟수면 한도 의심 */
export const UNKNOWN_ERROR_STRIKES = 5;
/** 종목별 조회 속도 = 초당 상한 × 이 비율 */
export const STOCK_RATE_SHARE = 0.5;

/** 루프 한 걸음 */
export const STEP_MS = 200;
/**
 * fast 한 실행의 최대 길이 — 빠른 창 07:00 ~ 20:00(13시간)과 같다. 강제 `KIS_NEWS_MODE=fast` 를 창 앞(예 05:00)에
 * 주어도 Job `--task-timeout=14h` 에 강제 종료되지 않게 「그날 20:00」과 「시작 + 13시간」 중 이른 쪽에서 끝낸다(IN-03).
 */
export const FAST_MAX_RUN_MS = 13 * 3_600_000;
/** 토큰 발급 실패 뒤 한 번 더 시도하기까지(한투 「1분당 1회 발급」 + 1초) */
export const TOKEN_RETRY_MS = 61_000;
/** 장기 실행 중 DB 토큰 남은 시간 확인 주기(1시간 전 재발급은 41-13 이 판정) */
export const TOKEN_CHECK_MS = 600_000;
/**
 * 강제 재발급 뒤 이 시간 안에 또 토큰 무효면 종료 1 — 그보다 뒤의 무효는 서로 무관한 새 사건으로 보고 다시 1번 재발급한다(IN-01).
 * 종료 1 뒤 다음 깨움(≤ 5분)도 재발급 1번을 할 수 있으므로, 5분보다 긴 창이면 재발급 빈도가 예전보다 늘지 않는다.
 */
export const TOKEN_REFORCE_WINDOW_MS = 600_000;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;
/** 초당 초과 한 번이면 그 흐름만 이만큼 쉰다 */
export const RATE_LIMIT_SKIP_MS = 1_000;
/** 임대 연장 오류가 이만큼 이어지면(남이 넘겨받을 수 있는 시점 전) 끝낸다 */
const LEASE_UNCONFIRMED_MS = LEASE_TTL_S * 1000 - LEASE_RENEW_MS;
const LEASE_RETRY_MS = 5_000;
/** slow 에서 종목별 일시 장애가 이만큼 이어지면 그 바퀴를 접는다 */
const SLOW_STOCK_GIVE_UP = 5;

export interface CollectorLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface CollectorDeps {
  /** 비밀 필드는 받지 않는다 */
  cfg: Pick<KisNewsConfig, "maxRps" | "dailyBudget" | "mode" | "targetCap">;
  log: CollectorLog;
  /** epoch ms */
  clock: { now(): number };
  sleep(ms: number): Promise<void>;
  /** SIGTERM → abort — 다음 걸음에서 끝내고 임대를 푼다 */
  signal?: AbortSignal;
  /** 임대 보유자 이름(실행 id + 임의 8자) */
  holder: string;
  db: {
    leaseAcquire(holder: string, ttlSeconds: number): Promise<boolean>;
    leaseRelease(holder: string): Promise<boolean>;
    readState(): Promise<{ lastSrno: string | null; cleanupDate: string | null }>;
    loadTargets(meta: ReadonlyMap<string, StockMeta>): Promise<TargetInfo[]>;
    loadStockMeta(): Promise<ReadonlyMap<string, StockMeta>>;
    ingest(rows: IngestRow[], via: IngestVia, queriedCode?: string): Promise<IngestResult>;
    cleanup(): Promise<unknown>;
    usage: {
      read(dateKst: string): Promise<number>;
      add(n: number): void;
      /** 새 누적 — 모은 것이 없으면 null */
      flush(dateKst: string): Promise<number | null>;
    };
    strikes: {
      read(dateKst: string): Promise<number>;
      record(dateKst: string): Promise<number>;
    };
  };
  kis: {
    /** 접근 토큰 문자열 — 로그에 싣지 않는다 */
    token(args: { canIssue: boolean; force: boolean }): Promise<string>;
    page(query: NewsTitleQuery, token: string): Promise<KisNewsTitleRow[]>;
  };
}

export interface CollectorExit {
  code: 0 | 1;
  reason: string;
}

type FlowName = "feed" | "F" | "G" | "stock";

interface FlowState {
  nextAt: number;
  fails: number;
}

/** 실행을 끝내는 신호 — 루프 어디서든 던지면 run() 이 종료 코드로 바꾼다 */
class StopRun extends Error {
  constructor(
    readonly code: 0 | 1,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "StopRun";
  }
}

/**
 * 전면 정지(초당 초과 5번 → 60초) 중이라 한투를 부르지 않았다 — `call()` 이 던지고 `runFlow` 가 오류로 세지 않고 건너뛴다.
 * 걸음 시작에서만 정지를 보면 같은 걸음의 나머지 흐름(F · G · 종목별)이 응답이 느릴 때 그대로 나간다(WR-01).
 */
class PausedError extends Error {
  constructor(readonly until: number) {
    super("kis calls paused");
    this.name = "PausedError";
  }
}

const FLOW_INTERVAL: Record<FlowName, number> = {
  feed: FEED_INTERVAL_MS,
  F: DISCLOSURE_SAFETY_MS,
  G: DISCLOSURE_SAFETY_MS,
  stock: 0,
};

function statsFields(s: ClassifyStats): Record<string, number> {
  return { total: s.total, invalid: s.invalid, unlinked: s.unlinked, unknownCodes: s.unknownCodes };
}

export async function runCollector(deps: CollectorDeps): Promise<CollectorExit> {
  return new Collector(deps).run();
}

class Collector {
  private haveLease = false;
  private lastLeaseOkAt = 0;
  private nextLeaseAt = Number.POSITIVE_INFINITY;
  private nextFlushAt = Number.POSITIVE_INFINITY;
  private token = "";
  /** 마지막 강제 재발급 시각(없으면 null) — 그 뒤 TOKEN_REFORCE_WINDOW_MS 안에 또 무효면 종료 1 */
  private tokenForcedAt: number | null = null;
  private meta: ReadonlyMap<string, StockMeta> = new Map();
  /** 전체 최신에서 본 가장 큰 일련번호(되감기 기준) */
  private lastSeen: string | null = null;
  private usedKnown = 0;
  private sinceFlush = 0;
  private warned80 = false;
  private unknownStreak = 0;
  private rateLimitAt: number[] = [];
  private pausedUntil = 0;
  private lastDropped = 0;
  private readonly global: TokenBucket;
  private readonly stockBucket: TokenBucket;
  private readonly queue: TargetQueue;
  private readonly flows: Record<FlowName, FlowState> = {
    feed: { nextAt: 0, fails: 0 },
    F: { nextAt: 0, fails: 0 },
    G: { nextAt: 0, fails: 0 },
    stock: { nextAt: 0, fails: 0 },
  };
  private readonly stats = { calls: 0, feed: 0, F: 0, G: 0, stock: 0, inserted: 0, linked: 0, errors: 0 };
  /** 분류 통계 누적(받은 행 · 무효 · 미연결 · 모르는 코드) — 종료 · 주기 로그에 싣는다(WR-03) */
  private readonly classified = { rows: 0, invalid: 0, unlinked: 0, unknownCodes: 0 };
  /** 「받은 행이 전부 무효」 warn 을 이미 남긴 흐름 — 정상 행이 다시 오면 지운다(같은 warn 을 5초마다 되풀이하지 않게) */
  private readonly allInvalidWarned = new Set<FlowName>();

  constructor(private readonly d: CollectorDeps) {
    const clock = () => d.clock.now();
    this.global = new TokenBucket(d.cfg.maxRps, 1, clock);
    this.stockBucket = new TokenBucket(d.cfg.maxRps * STOCK_RATE_SHARE, 1, clock);
    this.queue = new TargetQueue(STOCK_MIN_INTERVAL_MS, d.cfg.targetCap);
  }

  private now(): number {
    return this.d.clock.now();
  }

  private dateKst(): string {
    return kstDateString(new Date(this.now()));
  }

  async run(): Promise<CollectorExit> {
    const t0 = this.now();
    const mode = resolveCollectorMode(new Date(t0), this.d.cfg.mode);
    let exit: CollectorExit;
    try {
      exit = await this.main(mode, t0);
    } catch (err) {
      if (err instanceof StopRun) {
        exit = { code: err.code, reason: err.reason };
      } else {
        this.d.log.error({ ...safeErrorFields(err), mode }, "collector failed");
        exit = { code: 1, reason: "error" };
      }
    }
    await this.shutdown();
    this.d.log.info(
      {
        mode,
        ...exit,
        ...this.stats,
        classified: { ...this.classified },
        usedToday: this.usedKnown + this.sinceFlush,
        durationMs: this.now() - t0,
      },
      "collector stop",
    );
    return exit;
  }

  // ── ① ~ ⑤ ──────────────────────────────────────────────────────────
  private async main(mode: CollectorMode, t0: number): Promise<CollectorExit> {
    const { log, db, holder, cfg } = this.d;

    // ① 임대
    this.haveLease = await db.leaseAcquire(holder, LEASE_TTL_S);
    if (this.haveLease) {
      this.lastLeaseOkAt = t0;
      this.nextLeaseAt = t0 + LEASE_RENEW_MS;
    } else if (mode !== "probe") {
      log.info({ mode }, "lease held by another run — exiting");
      return { code: 0, reason: "lease_held" };
    }

    // ② 예산
    const date = this.dateKst();
    this.usedKnown = await db.usage.read(date);
    this.nextFlushAt = t0 + USAGE_FLUSH_MS;
    const state = budgetStateOf(this.usedKnown, cfg.dailyBudget);
    if (state === "exhausted") {
      log.warn({ used: this.usedKnown, budget: cfg.dailyBudget }, "daily budget already reached — not calling KIS");
      return { code: 0, reason: "budget_at_start" };
    }
    if (state === "warn") this.warnBudget80();

    const strikes = mode === "probe" ? 0 : await db.strikes.read(date);
    this.meta = await db.loadStockMeta();
    if (this.meta.size === 0) {
      log.warn({}, "stock meta empty — no news can be linked to a stock (check kis_news_stock_meta)");
    }
    const st = await db.readState();
    this.lastSeen = st.lastSrno;

    // ④ 토큰
    this.token = await this.obtainToken(false);

    // ⑤ probe
    if (mode === "probe") {
      const raw = await this.call({}, "feed");
      const r = await this.ingestFeed(raw);
      log.info(
        { fetched: raw.length, rows: r.rows, inserted: r.inserted, revisions: r.revisions, linked: r.linked, lease: this.haveLease },
        "probe ok",
      );
      return { code: 0, reason: "probe" };
    }

    // ③ 한도 의심 표시가 있으면 단독 탐침 1건
    if (strikes > 0) {
      const failed = await this.quotaProbe(strikes);
      if (failed) return failed;
    }

    return mode === "slow" ? this.runSlow(st.cleanupDate) : this.runFast(t0);
  }

  /**
   * ③ 단독 탐침 — 성공이면 null(수집 재개) · 실패면 종료 1.
   * 토큰 무효(EGW00121 · EGW00123)는 한도 신호가 아니다 — 강제 재발급 1번 뒤 탐침 1건만 더 한다(WR-04).
   * 그러지 않으면 DB 토큰이 1시간 넘게 남아 있는 동안 매 깨움이 같은 무효 토큰으로 「탐침 실패」를 되풀이한다.
   */
  private async quotaProbe(strikes: number): Promise<CollectorExit | null> {
    const { log } = this.d;
    for (;;) {
      try {
        const raw = await this.call({}, "feed");
        await this.ingestFeed(raw);
        this.flows.feed.nextAt = this.now() + FEED_INTERVAL_MS;
        log.info({ strikesToday: strikes }, "quota probe ok — resuming collection");
        return null;
      } catch (err) {
        if (err instanceof StopRun) throw err;
        if (err instanceof KisApiError && err.kind === "token_invalid" && this.tokenForcedAt === null) {
          this.tokenForcedAt = this.now();
          log.warn(
            { ...safeErrorFields(err), strikesToday: strikes },
            "quota probe hit an invalid token — forcing one reissue and probing once more",
          );
          this.token = await this.obtainToken(true);
          continue;
        }
        log.warn(
          { ...safeErrorFields(err), strikesToday: strikes },
          "quota probe failed — stopping without retries (next run probes once again)",
        );
        return { code: 1, reason: err instanceof KisApiError ? `quota_probe_failed_${err.kind}` : "quota_probe_failed" };
      }
    }
  }

  // ── ⑥ fast ────────────────────────────────────────────────────────
  private async runFast(t0: number): Promise<CollectorExit> {
    const { log, cfg, holder } = this.d;
    const end = Math.min(fastWindowEndOf(new Date(t0)).getTime(), t0 + FAST_MAX_RUN_MS);
    if (cfg.mode === "fast" && resolveCollectorMode(new Date(t0), "auto") !== "fast") {
      // 강제 fast 가 빠른 창(평일 07:00 ~ 20:00) 밖 — 주말 · 새벽에도 끝까지 돈다. 운영자가 알아채게 남긴다
      log.warn(
        { startedAt: new Date(t0).toISOString(), endAt: new Date(end).toISOString(), maxRunMs: FAST_MAX_RUN_MS },
        "forced fast mode outside the weekday 07:00-20:00 KST window",
      );
    }
    if (t0 >= end) {
      log.warn({ endAt: new Date(end).toISOString() }, "fast window already over — nothing to do");
      return { code: 0, reason: "fast_window_over" };
    }
    log.info(
      { mode: "fast", holder, endAt: new Date(end).toISOString(), maxRps: cfg.maxRps, targetCap: cfg.targetCap },
      "collector start",
    );

    let nextTargetsAt = t0;
    let nextMetaAt = t0 + META_RELOAD_MS;
    let nextTokenAt = t0 + TOKEN_CHECK_MS;
    for (;;) {
      this.checkAbort();
      const now = this.now();
      if (now >= end) {
        log.info({ endAt: new Date(end).toISOString() }, "fast window end — stopping");
        return { code: 0, reason: "window_end" };
      }
      await this.maintain(now);
      if (now >= this.pausedUntil) {
        if (now >= nextMetaAt) {
          nextMetaAt = now + META_RELOAD_MS;
          await this.reloadMeta();
          // 10분 주기 상태 한 줄 — 받은 행이 무효 · 미연결로 빠지는지 운영 로그로 볼 수 있게(WR-03)
          log.info(
            { ...this.stats, classified: { ...this.classified }, usedToday: this.usedKnown + this.sinceFlush },
            "collector stats",
          );
        }
        if (now >= nextTargetsAt) {
          nextTargetsAt = now + TARGET_RELOAD_MS;
          await this.reloadTargets(now);
        }
        if (now >= nextTokenAt) {
          nextTokenAt = now + TOKEN_CHECK_MS;
          await this.refreshToken();
        }
        await this.fastStep();
      }
      await this.d.sleep(STEP_MS);
    }
  }

  /**
   * 한 걸음 — 예정 시각이 된 흐름을 우선순위(전체 최신 → F → G → 종목별)대로, 버킷이 허락하는 만큼.
   * 흐름마다 시각을 다시 읽는다 — 앞 흐름이 세운 전면 정지를 같은 걸음 안에서도 지키고,
   * 다음 예정 · 물러섬을 걸음 시작의 낡은 시각이 아니라 그 흐름의 시각으로 잡는다(WR-01).
   */
  private async fastStep(): Promise<void> {
    for (const name of ["feed", "F", "G"] as const) {
      const now = this.now();
      if (now < this.pausedUntil) return;
      if (now < this.flows[name].nextAt || this.global.msUntilNext() > 0) continue;
      await this.runFlow(name, () => (name === "feed" ? this.doFeed(FEED_MAX_PAGES_FAST) : this.doDisclosure(name)));
    }
    const now = this.now();
    if (now < this.pausedUntil) return;
    if (now < this.flows.stock.nextAt || this.global.msUntilNext() > 0 || this.stockBucket.msUntilNext() > 0) return;
    const t = this.queue.next(now);
    if (!t) return;
    this.stockBucket.tryTake();
    await this.runFlow("stock", () => this.doStock(t));
  }

  // ── ⑥ slow ────────────────────────────────────────────────────────
  private async runSlow(cleanupDate: string | null): Promise<CollectorExit> {
    const { log, db, cfg, holder } = this.d;
    log.info({ mode: "slow", holder, maxRps: cfg.maxRps, lastSeen: this.lastSeen }, "collector start");

    await this.slowFlow("feed", () => this.doFeed(FEED_MAX_PAGES_SLOW));
    await this.slowFlow("F", () => this.doDisclosure("F"));
    await this.slowFlow("G", () => this.doDisclosure("G"));

    // 대상 한 바퀴 — 시작 시점 순서 그대로 각 1번(한 바퀴가 30초보다 길어도 다시 돌지 않는다)
    await this.reloadTargets(this.now());
    const round = this.queue.ordered(this.now());
    for (const t of round) {
      this.checkAbort();
      await this.maintain(this.now());
      await this.waitUntil(Math.max(this.pausedUntil, this.flows.stock.nextAt));
      await this.acquire(this.stockBucket);
      const ok = await this.runFlow("stock", () => this.doStock(t));
      if (!ok && this.flows.stock.fails >= SLOW_STOCK_GIVE_UP) {
        log.warn(
          { fails: this.flows.stock.fails, done: round.indexOf(t) + 1, total: round.length },
          "stock round abandoned after repeated failures — next slow run retries",
        );
        break;
      }
    }

    // ⑦ 정리
    if (isCleanupDue(new Date(this.now()), cleanupDate)) {
      try {
        const result = await db.cleanup();
        log.info({ result }, "retention cleanup done");
      } catch (err) {
        log.warn({ ...safeErrorFields(err) }, "retention cleanup failed — next slow run retries");
      }
    }
    return { code: 0, reason: "slow_done" };
  }

  private async slowFlow(name: FlowName, fn: () => Promise<void>): Promise<void> {
    await this.waitUntil(this.pausedUntil);
    await this.runFlow(name, fn);
  }

  // ── 흐름 본체 ─────────────────────────────────────────────────────
  private async doFeed(maxPages: number): Promise<void> {
    const res = await pageUntilSeen((cursor) => this.call({ cursor }, "feed"), {
      lastSeenSrno: this.lastSeen,
      maxPages,
    });
    if (res.capped) {
      this.d.log.warn(
        { pages: res.pages, maxPages, lastSeen: this.lastSeen },
        "page cap reached — feed may have more (disclosure safety net covers F · G)",
      );
    }
    if (res.stalled) {
      // 커서로 부른 쪽이 앞 쪽과 같아 새 행이 0 — 마지막 본 글에 닿지 못한 채 멈췄다. 되감기 기준(lastSeen)은
      // 아래에서 받은 최신으로 오른다(올리지 않으면 매 걸음 같은 쪽들을 다시 불러 호출만 늘고 풀리지 않는다).
      // 그 아래 틈은 다음 실행도 다시 보지 않으므로 여기서 반드시 남긴다(무로그 탈락 금지).
      const last = res.rows[res.rows.length - 1];
      this.d.log.warn(
        { pages: res.pages, maxPages, lastSeen: this.lastSeen, oldestSrno: last?.cntt_usiq_srno ?? null },
        "feed paging stalled (same page returned) before reaching last seen — older items may be missed",
      );
    }
    await this.ingestFeed(res.rows);
  }

  private async doDisclosure(provider: "F" | "G"): Promise<void> {
    const raw = await this.call({ providerCode: provider }, provider);
    const rows = this.classify(raw, provider);
    this.tally(await this.d.db.ingest(rows, "feed"));
  }

  private async doStock(t: TargetInfo): Promise<void> {
    try {
      const raw = await this.call({ stockCode: t.code }, "stock");
      const rows = this.classify(raw, "stock", t.code);
      // 글 0건이어도 부른다 — 수집 시각(collectedAt) 기록(D-06)
      this.tally(await this.d.db.ingest(rows, "stock", t.code));
    } finally {
      // 실패한 종목을 매 걸음 다시 두드리지 않게 — 성공 · 실패 모두 30초 뒤로
      this.queue.markCollected(t.code, this.now());
    }
  }

  /** 전체 최신 행 들여오기 + 되감기 기준 전진(들여오기 성공 뒤에만) */
  private async ingestFeed(raw: KisNewsTitleRow[]): Promise<{ rows: number } & IngestResult> {
    const rows = this.classify(raw, "feed");
    const r = await this.d.db.ingest(rows, "feed");
    this.tally(r);
    for (const row of raw) {
      const s = (row.cntt_usiq_srno ?? "").trim();
      if (s && (this.lastSeen === null || s > this.lastSeen)) this.lastSeen = s;
    }
    return { rows: rows.length, ...r };
  }

  /**
   * 한투 행 → 들여오기 행. 분류 통계를 누적하고, 받은 행이 전부 무효면(응답 모양이 바뀐 의심) 흐름마다 warn 1번 —
   * 그대로 두면 들여오기는 0건으로 성공하고 수집 시각만 갱신돼 건강해 보인다(무로그 탈락 금지 · WR-03).
   */
  private classify(raw: KisNewsTitleRow[], flow: FlowName, queriedCode?: string): IngestRow[] {
    const { rows, stats } = toIngestRows(raw, { queriedCode, meta: this.meta });
    this.classified.rows += stats.total;
    this.classified.invalid += stats.invalid;
    this.classified.unlinked += stats.unlinked;
    this.classified.unknownCodes += stats.unknownCodes;
    if (stats.total > 0 && stats.invalid === stats.total) {
      if (!this.allInvalidWarned.has(flow)) {
        this.allInvalidWarned.add(flow);
        this.d.log.warn({ flow, ...statsFields(stats) }, "all KIS rows invalid — response shape changed?");
      }
    } else if (stats.total > stats.invalid) {
      this.allInvalidWarned.delete(flow);
    }
    return rows;
  }

  private tally(r: IngestResult): void {
    this.stats.inserted += r.inserted;
    this.stats.linked += r.linked;
  }

  /** 한투 한 쪽 — 예산 · 초당 상한을 지나고 호출 수를 센다(실패한 호출도 센다) */
  private async call(query: NewsTitleQuery, flow: FlowName): Promise<KisNewsTitleRow[]> {
    this.budgetGate();
    await this.acquire(this.global);
    // 전면 정지는 보내기 직전에 본다 — 버킷 대기 · 앞 흐름 응답 사이에 정지가 섰을 수 있다(WR-01)
    if (this.now() < this.pausedUntil) throw new PausedError(this.pausedUntil);
    this.d.db.usage.add(1);
    this.sinceFlush += 1;
    this.stats.calls += 1;
    this.stats[flow] += 1;
    if (budgetStateOf(this.usedKnown + this.sinceFlush, this.d.cfg.dailyBudget) !== "ok") this.warnBudget80();
    return this.d.kis.page(query, this.token);
  }

  private async acquire(bucket: TokenBucket): Promise<void> {
    while (!bucket.tryTake()) {
      this.checkAbort();
      await this.d.sleep(Math.max(1, bucket.msUntilNext()));
    }
  }

  // ── 오류 처리 ─────────────────────────────────────────────────────
  private async runFlow(name: FlowName, fn: () => Promise<void>): Promise<boolean> {
    const flow = this.flows[name];
    const startedAt = this.now();
    try {
      await fn();
      flow.fails = 0;
      // 주기는 흐름 시작 기준(5초 · 60초 박자 유지)
      flow.nextAt = startedAt + FLOW_INTERVAL[name];
      this.unknownStreak = 0;
      return true;
    } catch (err) {
      if (err instanceof StopRun) throw err;
      if (err instanceof PausedError) {
        // 오류가 아니다 — 정지는 이미 error 로 남겼다. 정지가 풀린 뒤 다시 부른다
        flow.nextAt = Math.max(flow.nextAt, err.until);
        this.d.log.info({ flow: name, pausedUntil: new Date(err.until).toISOString() }, "flow skipped — KIS calls paused");
        return false;
      }
      // 정지 시작 · 물러섬은 실패를 받은 시각 기준
      await this.onError(name, err, this.now());
      return false;
    }
  }

  private backoff(name: FlowName, now: number): number {
    const flow = this.flows[name];
    flow.fails += 1;
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (flow.fails - 1));
    flow.nextAt = now + delay;
    return delay;
  }

  private async onError(name: FlowName, err: unknown, now: number): Promise<void> {
    const { log, db } = this.d;
    const isKis = err instanceof KisApiError;
    const safe = safeErrorFields(err);
    // 한투 응답이 아닌 실패(DB · 분류)는 그 흐름만 물러선다 — 한도 의심으로 세지 않는다
    const kind = isKis ? safe.kind : "transient";
    const fields: Record<string, unknown> = { flow: name, ...safe, kind, ...(isKis ? {} : { source: "worker" }) };
    this.stats.errors += 1;

    switch (kind) {
      case "rate_limit": {
        this.rateLimitAt = this.rateLimitAt.filter((x) => now - x < 60_000);
        this.rateLimitAt.push(now);
        if (this.rateLimitAt.length >= RATE_LIMIT_STRIKES) {
          this.pausedUntil = now + RATE_LIMIT_PAUSE_MS;
          this.rateLimitAt = [];
          log.error(
            { ...fields, strikes: RATE_LIMIT_STRIKES, pauseMs: RATE_LIMIT_PAUSE_MS, maxRps: this.d.cfg.maxRps },
            "kis rate limit 5 times within 1 minute — pausing all KIS calls for 60s (check KIS_NEWS_MAX_RPS · shared app key)",
          );
        } else {
          this.flows[name].nextAt = now + RATE_LIMIT_SKIP_MS;
          log.warn(fields, "kis rate limit — skipping this flow for 1s");
        }
        return;
      }
      case "token_invalid": {
        if (this.tokenForcedAt !== null && now - this.tokenForcedAt < TOKEN_REFORCE_WINDOW_MS) {
          log.error(
            { ...fields, sinceForcedMs: now - this.tokenForcedAt },
            "kis token invalid again soon after a forced reissue — stopping",
          );
          throw new StopRun(1, "token_invalid");
        }
        this.tokenForcedAt = now;
        log.warn(fields, "kis token invalid — forcing one reissue");
        this.token = await this.obtainToken(true);
        return;
      }
      case "unknown": {
        this.unknownStreak += 1;
        this.backoff(name, now);
        if (this.unknownStreak >= UNKNOWN_ERROR_STRIKES) {
          let strikesToday: number | null = null;
          try {
            strikesToday = await db.strikes.record(this.dateKst());
          } catch (e) {
            log.warn({ ...safeErrorFields(e) }, "failed to record quota strike — stopping anyway");
          }
          log.error(
            { ...fields, unknownStreak: this.unknownStreak, strikesToday },
            "kis unknown error 5 times in a row — suspecting daily quota; stopping (next run probes once)",
          );
          throw new StopRun(1, "quota_suspected");
        }
        log.warn({ ...fields, unknownStreak: this.unknownStreak }, "kis unknown error");
        return;
      }
      default: {
        const retryInMs = this.backoff(name, now);
        log.warn({ ...fields, retryInMs }, isKis ? "kis transient error — backing off this flow" : "flow failed — backing off this flow");
      }
    }
  }

  // ── 토큰 ──────────────────────────────────────────────────────────
  private async obtainToken(force: boolean): Promise<string> {
    const { log, kis } = this.d;
    const args = { canIssue: this.haveLease, force };
    try {
      return await kis.token(args);
    } catch (err) {
      const safe = safeErrorFields(err);
      if (!this.haveLease) {
        log.error({ ...safe, force }, "kis token unavailable and this run cannot issue one (no lease) — stopping");
        throw new StopRun(1, "token_failed");
      }
      log.warn({ ...safe, force, retryInMs: TOKEN_RETRY_MS }, "kis token failed — retrying once after 61s");
    }
    await this.waitUntil(this.now() + TOKEN_RETRY_MS);
    try {
      return await kis.token(args);
    } catch (err) {
      log.error({ ...safeErrorFields(err), force }, "kis token failed twice — stopping");
      throw new StopRun(1, "token_failed");
    }
  }

  /** 장기 실행 중 — DB 토큰 남은 시간이 1시간 이하면 41-13 이 재발급한다. 실패해도 지금 토큰으로 계속 */
  private async refreshToken(): Promise<void> {
    try {
      this.token = await this.d.kis.token({ canIssue: this.haveLease, force: false });
    } catch (err) {
      this.d.log.warn({ ...safeErrorFields(err) }, "kis token check failed — keeping current token");
    }
  }

  // ── 대상 · 종목 정보 ──────────────────────────────────────────────
  private async reloadTargets(now: number): Promise<void> {
    try {
      const list = await this.d.db.loadTargets(this.meta);
      const { size, dropped } = this.queue.update(list, now);
      if (dropped > 0 && dropped !== this.lastDropped) {
        this.d.log.warn({ size, dropped, cap: this.d.cfg.targetCap }, "targets over cap — lowest priority dropped");
      }
      this.lastDropped = dropped;
    } catch (err) {
      this.d.log.warn({ ...safeErrorFields(err) }, "targets reload failed — keeping previous list");
    }
  }

  private async reloadMeta(): Promise<void> {
    try {
      const next = await this.d.db.loadStockMeta();
      if (next.size === 0 && this.meta.size > 0) {
        // 빈 결과로 바꾸면 그 뒤 모든 글이 미연결로 빠진다 — 지난 목록을 지키고 남긴다
        this.d.log.warn({ previous: this.meta.size }, "stock meta reload returned empty — keeping previous");
        return;
      }
      if (next.size === 0) this.d.log.warn({}, "stock meta still empty — no news can be linked to a stock");
      this.meta = next;
    } catch (err) {
      this.d.log.warn({ ...safeErrorFields(err) }, "stock meta reload failed — keeping previous");
    }
  }

  // ── 예산 · 임대 · 사용량 ──────────────────────────────────────────
  private budgetGate(): void {
    const used = this.usedKnown + this.sinceFlush;
    if (budgetStateOf(used, this.d.cfg.dailyBudget) === "exhausted") {
      this.d.log.error({ used, budget: this.d.cfg.dailyBudget }, "daily budget exhausted — stopping this run");
      throw new StopRun(1, "budget_exhausted");
    }
  }

  private warnBudget80(): void {
    if (this.warned80) return;
    this.warned80 = true;
    this.d.log.warn(
      { used: this.usedKnown + this.sinceFlush, budget: this.d.cfg.dailyBudget, ratio: BUDGET_WARN_RATIO },
      "daily budget 80% reached",
    );
  }

  /** 임대 연장(30초) · 사용량 flush(10초) — 루프 걸음 · 긴 대기 중에 부른다 */
  private async maintain(now: number): Promise<void> {
    if (this.haveLease && now >= this.nextLeaseAt) await this.renewLease(now);
    if (now >= this.nextFlushAt) {
      this.nextFlushAt = now + USAGE_FLUSH_MS;
      await this.flushUsage();
      this.budgetGate();
    }
  }

  /** 거절 → 조용히 종료 0 · DB 오류 → 5초 뒤 다시, 남이 넘겨받을 수 있는 시점 전까지 확인 못 하면 종료 0 */
  private async renewLease(now: number): Promise<void> {
    const { log, db, holder } = this.d;
    let ok: boolean;
    try {
      ok = await db.leaseAcquire(holder, LEASE_TTL_S);
    } catch (err) {
      this.nextLeaseAt = now + LEASE_RETRY_MS;
      log.warn({ ...safeErrorFields(err) }, "lease renewal failed — retrying in 5s");
      if (now - this.lastLeaseOkAt >= LEASE_UNCONFIRMED_MS) {
        log.warn({ sinceOkMs: now - this.lastLeaseOkAt }, "lease unconfirmed too long — stopping before another run takes over");
        throw new StopRun(0, "lease_unconfirmed");
      }
      return;
    }
    if (!ok) {
      this.haveLease = false;
      log.warn({ holder }, "lease renewal rejected — another run owns the lease; stopping quietly");
      throw new StopRun(0, "lease_lost");
    }
    this.lastLeaseOkAt = now;
    this.nextLeaseAt = now + LEASE_RENEW_MS;
  }

  private async flushUsage(): Promise<void> {
    try {
      const total = await this.d.db.usage.flush(this.dateKst());
      if (total !== null) {
        this.usedKnown = total;
        this.sinceFlush = 0;
      }
    } catch (err) {
      this.d.log.warn({ ...safeErrorFields(err) }, "usage flush failed — will retry");
    }
  }

  /** t 까지 — 기다리는 동안에도 임대 연장 · flush · SIGTERM 확인 */
  private async waitUntil(t: number): Promise<void> {
    for (let now = this.now(); now < t; now = this.now()) {
      this.checkAbort();
      await this.maintain(now);
      await this.d.sleep(Math.min(t - now, 1_000));
    }
  }

  private checkAbort(): void {
    if (this.d.signal?.aborted) {
      this.d.log.info({}, "SIGTERM — stopping after current step");
      throw new StopRun(0, "aborted");
    }
  }

  /** ⑧ 끝 — 사용량 flush · 임대 해제(정상 · 오류 · SIGTERM 모두) */
  private async shutdown(): Promise<void> {
    await this.flushUsage();
    if (this.haveLease) {
      try {
        await this.d.db.leaseRelease(this.d.holder);
      } catch (err) {
        this.d.log.warn({ ...safeErrorFields(err) }, "lease release failed — it expires in 90s");
      }
    }
  }
}
