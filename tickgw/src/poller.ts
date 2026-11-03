/**
 * tickgw 키 폴러 (Phase 37 · D-05 · D-06 · D-07).
 *
 * ── 무엇 ──────────────────────────────────────────────────────────
 * - 키 = (isin, 거래소, KST 오늘). 키당 폴러 하나 — 브라우저 N 개 · server 인스턴스 여럿이 같은 키를 불러도
 *   119 호출 수는 키당 같다(CLAUDE.md 「호출량은 사용자 수와 독립」).
 * - 첫 touch → 08:00 KST(`kstDayStartNs` — config.ts 로컬 함수 · shared import 없음)부터 to=0(지금까지) 하루치 요청.
 *   has_more 면 next_from_ns 로 곧바로 이어받고, 끝나면 ready. 그 뒤는 lastRecvNs+1 부터 증분만 POLL_MS ± 지터(기본 5초 ± 0.5초).
 * - 119 호출 동시성 전역 1 — `step()` 을 사슬로 직렬화하고 루프 하나가 돌린다(키가 여럿이면 nextDueAt 이 이른 키부터 순환
 *   → 키당 실효 간격 = max(5초, 활성 키 수 × 평균 호출 시간)).
 * - 시계 · 수면 · 난수는 deps 주입 — 시험은 가짜 시계로 `step()` 을 직접 돈다.
 *
 * ── 호출 규율(D-06 · CLAUDE.md 공식 API 운영 기준 4 의 정신 — 차단 신호를 재시도로 두드리지 않는다) ──
 *   리스        server 요청(touch)마다 30초 갱신 · 리스가 끝난 키는 폴링하지 않는다(다시 touch 하면 대기열 맨 뒤로 재개)
 *   키 상한     리스가 살아 있는 키를 처음 touch 순서로 세워 앞 MAX_KEYS(8)만 활성 · 나머지는 queued(대기 k = 순번)
 *   실패        ssh 실패 · 시간 초과 · 깨진 응답 → 그 키 5→10→20→40→60→60초 · 성공하면 다시 5초
 *   바쁨 75     2초 + 0~0.5초 지터 뒤 재시도 · 실패로 세지 않는다
 *   인자 64     그 키 blocked · 60초 뒤 재시도(날짜 경계 · 계약 차이 — 37-17 이 인덱서 회신으로 맞춘다)
 *   도달 불가   ssh 255 + 연결 오류 문구 3회 연속 → 전역 60초 차단(모든 키 delayed · 호출 0) ·
 *               차단이 풀린 뒤 첫 호출(탐침)이 또 연결 실패면 곧바로 다시 60초 차단
 *
 * ── 상태 전이(X-Tick-State) ──────────────────────────────────────────
 *   | 조건(위가 우선)                                   | state   | queue |
 *   |---------------------------------------------------|---------|-------|
 *   | 엔트리 closed(마감 마무리 끝)                      | ready   | 0     |
 *   | 리스 살아 있는 키 중 순번 > MAX_KEYS               | queued  | k     |
 *   | 전역 차단 중(119 도달 불가)                        | delayed | 0     |
 *   | 인자 오류(64) 뒤 재시도 대기                       | blocked | 0     |
 *   | 실패 백오프 중(failures ≥ 1)                       | delayed | 0     |
 *   | 08:00 하루치(+이어받기) 아직                       | loading | 0     |
 *   | 그 밖                                              | ready   | 0     |
 *
 * ── 20:01 마감 마무리(closeSweep) — 승격본 = 장 마감 하루치 전체 또는 없음(D-07 · D-04) ──
 *   KST 20:00 + CLOSE_DELAY(60초)가 지나면 하루 한 번: 오늘 complete(08:00 시작 ∧ 끊김 없음) 이고 closed 아닌 키마다
 *   **리스와 무관하게** 마무리 폴링(from = lastRecvNs+1 · to 0 · has_more 면 이어받기)을 같은 동시성 1 · 같은 차단 규율로 돈다.
 *   성공(종료 0 ∧ has_more false)하면 closed · closedThroughNs = 그 폴링 시작 시각 − 2초(기록 지연 여유 · ≥ 그날 20:00:00 KST).
 *   실패는 백오프(5 · 10초)로 최대 3회 뒤 closed 아님 · LRU 로 밀려난 키도 closed 아님 → export 에 안 나와 승격되지 않는다.
 *   closed 키는 더 폴링하지 않는다.
 */

import { kstDayStartNs, kstMs, kstToday } from "./config.js";
import type { CacheEntry, TickCache } from "./cache.js";
import { parseKey } from "./cache.js";
import { INDEXER_FMT, type Exchange, type IndexerResult, type RunIndexer } from "./indexer.js";
import { log } from "./log.js";

export type TickState = "loading" | "ready" | "queued" | "delayed" | "blocked";

export interface KeyState {
  state: TickState;
  queue: number;
}

export interface PollerConfig {
  pollMs: number;
  pollJitterMs: number;
  leaseMs: number;
  maxKeys: number;
  closeDelayMs: number;
}

export interface PollerDeps {
  cache: TickCache;
  runIndexer: RunIndexer;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

export interface StepResult {
  action: "call" | "close" | "idle" | "blocked";
  key?: string;
  /** 다음 step 까지 기다릴 ms(0 = 곧바로). */
  waitMs: number;
}

interface KeyRun {
  key: string;
  isin: string;
  ex: Exchange;
  date: string;
  /** 이 run 이 쓰는 캐시 엔트리 epoch — 엔트리가 지워지고 새로 만들어지면 run 도 처음부터. */
  epoch: string;
  /** 리스 순번 — 작을수록 먼저 활성. 리스가 끝난 뒤 다시 touch 하면 새 순번(맨 뒤). */
  seq: number;
  leaseUntil: number;
  /** 08:00 하루치(+이어받기)를 다 받았는가. */
  loaded: boolean;
  /** has_more 이어받기 커서. */
  pendingFrom: bigint | null;
  nextDueAt: number;
  failures: number;
  argBlocked: boolean;
  calls: number;
}

interface CloseItem {
  key: string;
  attempts: number;
  nextDueAt: number;
  /** 이번 마무리 폴링(이어받기 사슬 포함)의 첫 호출 시각 — closedThroughNs 의 기준. */
  startedAt: number | null;
}

/** 아무 키도 할 일이 없을 때 최대 대기(새 touch 는 wake 로 깨운다 · 리스 만료 · 마감 시각을 1초 안에 본다). */
const IDLE_MAX_MS = 1_000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;
const BUSY_MS = 2_000;
const BUSY_JITTER_MS = 500;
const ARG_RETRY_MS = 60_000;
const GLOBAL_BLOCK_MS = 60_000;
const UNREACHABLE_STREAK = 3;
const CLOSE_MAX_ATTEMPTS = 3;
/** 마감 마무리 closedThroughNs 여유 — 기록기 1초 지연 + 전송. */
const CLOSE_RECORD_LAG_MS = 2_000;

/** ssh 가 119 에 닿지 못했다는 문구(OpenSSH 255 와 함께). */
const UNREACHABLE_RE =
  /Connection timed out|Operation timed out|No route to host|Network is unreachable|Connection refused|Could not resolve hostname|Timeout, server not responding|Connection reset/i;

export function backoffMs(failures: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1), BACKOFF_MAX_MS);
}

export function isUnreachable(res: IndexerResult): boolean {
  return res.code === 255 && UNREACHABLE_RE.test(res.stderrTail);
}

function okResult(res: IndexerResult): boolean {
  return res.code === 0 && res.meta !== null && res.meta.fmt === INDEXER_FMT;
}

export class Poller {
  private readonly runs = new Map<string, KeyRun>();
  private seqCounter = 0;
  private blockedUntil = 0;
  private unreachableStreak = 0;
  private probeAfterBlock = false;
  /** 마무리를 시작한 날 · 끝낸 날(KST YYYYMMDD) — 하루 한 번. */
  private closeStartedDate: string | null = null;
  private closeDoneDate: string | null = null;
  private closeQueue: CloseItem[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  private stopped = true;
  private wakeResolve: (() => void) | null = null;
  private loop: Promise<void> | null = null;

  constructor(
    private readonly cfg: PollerConfig,
    private readonly deps: PollerDeps,
  ) {}

  // ---------------------------------------------------------------- touch · 상태

  /** server 요청마다 부른다 — 리스를 갱신하고 지금 상태를 돌려준다. */
  touch(key: string): KeyState {
    const now = this.deps.now();
    const entry = this.deps.cache.ensure(key, now);
    const run = this.runOf(entry, now);
    if (run.leaseUntil <= now) run.seq = ++this.seqCounter; // 새로 · 리스가 끝난 뒤 재개 → 대기열 맨 뒤
    run.leaseUntil = now + this.cfg.leaseMs;
    entry.lastAccess = now;
    this.wake();
    return this.stateOf(run, now);
  }

  /** 읽기 전용 상태(리스를 갱신하지 않음). */
  peek(key: string): KeyState | null {
    const run = this.runs.get(key);
    return run ? this.stateOf(run, this.deps.now()) : null;
  }

  private runOf(entry: CacheEntry, now: number): KeyRun {
    let run = this.runs.get(entry.key);
    if (!run || run.epoch !== entry.epoch) {
      const { isin, ex, date } = parseKey(entry.key);
      run = {
        key: entry.key,
        isin,
        ex,
        date,
        epoch: entry.epoch,
        seq: ++this.seqCounter,
        leaseUntil: 0,
        loaded: false,
        pendingFrom: null,
        nextDueAt: now,
        failures: 0,
        argBlocked: false,
        calls: 0,
      };
      this.runs.set(entry.key, run);
    }
    return run;
  }

  /** 리스가 살아 있고 closed 아닌 키를 순번대로. */
  private liveRuns(now: number): KeyRun[] {
    const out: KeyRun[] = [];
    for (const run of this.runs.values()) {
      if (run.leaseUntil <= now) continue;
      if (this.deps.cache.get(run.key)?.closed) continue;
      out.push(run);
    }
    return out.sort((a, b) => a.seq - b.seq);
  }

  private stateOf(run: KeyRun, now: number): KeyState {
    if (this.deps.cache.get(run.key)?.closed) return { state: "ready", queue: 0 };
    const idx = this.liveRuns(now).indexOf(run);
    if (idx >= this.cfg.maxKeys) return { state: "queued", queue: idx - this.cfg.maxKeys + 1 };
    if (now < this.blockedUntil) return { state: "delayed", queue: 0 };
    if (run.argBlocked) return { state: "blocked", queue: 0 };
    if (run.failures > 0) return { state: "delayed", queue: 0 };
    if (!run.loaded) return { state: "loading", queue: 0 };
    return { state: "ready", queue: 0 };
  }

  // ---------------------------------------------------------------- 스케줄

  /** 한 번의 스케줄 결정 — 할 일이 있으면 119 호출 1회. 사슬로 직렬화해 동시성 1 을 지킨다. */
  step(): Promise<StepResult> {
    const p = this.chain.then(() => this.stepInner());
    this.chain = p.catch(() => undefined);
    return p;
  }

  private async stepInner(): Promise<StepResult> {
    const now = this.deps.now();
    for (const k of this.deps.cache.evict(now)) this.runs.delete(k);
    for (const run of [...this.runs.values()]) {
      const e = this.deps.cache.get(run.key); // append 중 LRU 로 밀려난 키
      if (!e || e.epoch !== run.epoch) this.runs.delete(run.key);
    }

    if (now < this.blockedUntil) return { action: "blocked", waitMs: this.blockedUntil - now };

    const closeKey = await this.closeSweep(now);
    if (closeKey) return { action: "close", key: closeKey, waitMs: 0 };

    const active = this.liveRuns(now).slice(0, this.cfg.maxKeys);
    let pick: KeyRun | null = null;
    let soonest = Infinity;
    for (const run of active) {
      if (run.nextDueAt <= now) {
        if (!pick || run.nextDueAt < pick.nextDueAt) pick = run;
      } else {
        soonest = Math.min(soonest, run.nextDueAt);
      }
    }
    if (!pick) {
      for (const item of this.closeQueue) soonest = Math.min(soonest, item.nextDueAt);
      return { action: "idle", waitMs: Math.max(1, Math.min(IDLE_MAX_MS, soonest - now)) };
    }
    await this.poll(pick);
    return { action: "call", key: pick.key, waitMs: 0 };
  }

  private fromOf(run: KeyRun, entry: CacheEntry): bigint {
    if (run.pendingFrom !== null) return run.pendingFrom;
    if (entry.lastRecvNs !== null) return entry.lastRecvNs + 1n;
    return kstDayStartNs(run.date);
  }

  private jitter(): number {
    return Math.round((this.deps.random() * 2 - 1) * this.cfg.pollJitterMs);
  }

  private busyDelay(): number {
    return BUSY_MS + Math.floor(this.deps.random() * BUSY_JITTER_MS);
  }

  // ---------------------------------------------------------------- 도달성(전역)

  private noteReachable(): void {
    this.unreachableStreak = 0;
    this.probeAfterBlock = false;
  }

  private noteUnreachable(at: number): void {
    this.unreachableStreak += 1;
    if (this.probeAfterBlock || this.unreachableStreak >= UNREACHABLE_STREAK) {
      this.blockedUntil = at + GLOBAL_BLOCK_MS;
      this.unreachableStreak = 0;
      this.probeAfterBlock = true;
      log("warn", "indexer unreachable — global block", { block_ms: GLOBAL_BLOCK_MS });
    }
  }

  /** 결과 분류 — 도달성 상태를 갱신하고 종류를 돌려준다. */
  private classify(res: IndexerResult, at: number): "ok" | "busy" | "arg" | "fail" {
    if (okResult(res)) {
      this.noteReachable();
      return "ok";
    }
    if (res.code === 75) {
      this.noteReachable();
      return "busy";
    }
    if (isUnreachable(res)) {
      this.noteUnreachable(at);
      return "fail";
    }
    this.unreachableStreak = 0;
    this.probeAfterBlock = false;
    return res.code === 64 ? "arg" : "fail";
  }

  /** 정상 응답을 캐시에 붙인다. has_more 이어받기면 true. */
  private applyOk(run: KeyRun, entry: CacheEntry, fromNs: bigint, res: IndexerResult): boolean {
    const meta = res.meta!;
    if (meta.records > 0) this.deps.cache.append(run.key, res.stdout, meta);
    if (meta.hasMore) {
      if (meta.nextFromNs !== null && meta.nextFromNs > fromNs) {
        run.pendingFrom = meta.nextFromNs;
        return true;
      }
      // 계약 위반 — 이어받을 커서가 없다. 끊김을 기록(complete=false → 승격 안 됨)하고 lastRecvNs+1 증분으로 넘어간다
      entry.complete = false;
      log("warn", "has_more without next_from_ns", { key: run.key });
    }
    run.pendingFrom = null;
    run.loaded = true;
    return false;
  }

  private async call(run: KeyRun, fromNs: bigint): Promise<{ res: IndexerResult; at: number; entry: CacheEntry | null }> {
    const started = this.deps.now();
    run.calls += 1;
    const res = await this.deps.runIndexer({ isin: run.isin, ex: run.ex, date: run.date, fromNs, toNs: 0n });
    const at = this.deps.now();
    const entry = this.deps.cache.get(run.key) ?? null;
    log(okResult(res) ? "info" : "warn", "indexer", {
      key: run.key,
      from: String(fromNs),
      code: res.code,
      records: res.meta?.records ?? null,
      bytes: res.stdout.length,
      has_more: res.meta?.hasMore ?? null,
      skipped: res.meta?.compressedFilesSkipped || undefined,
      ms: at - started,
      stderr: okResult(res) ? undefined : res.stderrTail.slice(-200),
    });
    // 호출 사이 엔트리가 지워짐(유휴 · LRU) — 결과를 버린다
    return { res, at, entry: entry && entry.epoch === run.epoch ? entry : null };
  }

  private async poll(run: KeyRun): Promise<void> {
    const entry0 = this.deps.cache.get(run.key)!;
    const fromNs = this.fromOf(run, entry0);
    const { res, at, entry } = await this.call(run, fromNs);
    const kind = this.classify(res, at);
    if (!entry) return;
    switch (kind) {
      case "ok":
        run.failures = 0;
        run.argBlocked = false;
        run.nextDueAt = this.applyOk(run, entry, fromNs, res) ? at : at + this.cfg.pollMs + this.jitter();
        return;
      case "busy":
        run.nextDueAt = at + this.busyDelay();
        return;
      case "arg":
        run.argBlocked = true;
        run.nextDueAt = at + ARG_RETRY_MS;
        return;
      case "fail":
        run.failures += 1;
        run.nextDueAt = at + backoffMs(run.failures);
        return;
    }
  }

  // ---------------------------------------------------------------- 20:01 마감 마무리

  /**
   * 마감 마무리 한 걸음 — 할 일이 있으면 119 호출 1회를 하고 그 키를 돌려준다(없으면 null).
   * 1초 틱(step)마다 불려 「KST 20:00 + CLOSE_DELAY 지남 ∧ 오늘 마무리 안 끝남」 이면 돈다. 리스는 보지 않는다.
   */
  async closeSweep(now: number): Promise<string | null> {
    const today = kstToday(now);
    if (this.closeDoneDate === today) return null;
    if (now < kstMs(today, "2000") + this.cfg.closeDelayMs) return null;

    if (this.closeStartedDate !== today) {
      this.closeStartedDate = today;
      this.closeQueue = this.deps.cache
        .values()
        .filter((e) => e.date === today && e.complete && !e.closed)
        .map((e) => ({ key: e.key, attempts: 0, nextDueAt: now, startedAt: null }));
      log("info", "close sweep start", { date: today, keys: this.closeQueue.length });
    }
    this.closeQueue = this.closeQueue.filter((i) => {
      const e = this.deps.cache.get(i.key);
      return !!e && e.complete && !e.closed;
    });
    if (this.closeQueue.length === 0) {
      this.closeDoneDate = today;
      const closed = this.deps.cache.values().filter((e) => e.date === today && e.closed).length;
      log("info", "close sweep done", { date: today, closed });
      return null;
    }

    let item: CloseItem | null = null;
    for (const i of this.closeQueue) {
      if (i.nextDueAt <= now && (!item || i.nextDueAt < item.nextDueAt)) item = i;
    }
    if (!item) return null;
    await this.closeOne(item, now);
    return item.key;
  }

  private dropClose(item: CloseItem): void {
    this.closeQueue = this.closeQueue.filter((i) => i !== item);
  }

  private async closeOne(item: CloseItem, now: number): Promise<void> {
    const entry0 = this.deps.cache.get(item.key)!;
    const run = this.runOf(entry0, now);
    const fromNs = this.fromOf(run, entry0);
    if (item.startedAt === null) item.startedAt = now;
    const { res, at, entry } = await this.call(run, fromNs);
    const kind = this.classify(res, at);
    if (!entry) {
      this.dropClose(item);
      return;
    }
    if (kind === "ok") {
      run.failures = 0;
      run.argBlocked = false;
      if (this.applyOk(run, entry, fromNs, res)) {
        item.nextDueAt = at; // 이어받기 — 같은 마무리 폴링
        return;
      }
      if (!entry.complete) {
        this.dropClose(item); // 이어받기가 끊겼다 — 승격하지 않는다
        return;
      }
      const floor = kstDayStartNs(entry.date, "2000");
      const through = BigInt(item.startedAt - CLOSE_RECORD_LAG_MS) * 1_000_000n;
      entry.closed = true;
      entry.closedThroughNs = through > floor ? through : floor;
      this.dropClose(item);
      log("info", "closed", { key: item.key, records: entry.records, bytes: entry.size, through: String(entry.closedThroughNs) });
      return;
    }
    item.startedAt = null; // 다음 시도는 새 마무리 폴링
    if (kind === "busy") {
      item.nextDueAt = at + this.busyDelay();
      return;
    }
    item.attempts += 1;
    if (item.attempts >= CLOSE_MAX_ATTEMPTS) {
      this.dropClose(item);
      log("warn", "close gave up — not promoted", { key: item.key, attempts: item.attempts });
      return;
    }
    item.nextDueAt = at + backoffMs(item.attempts);
  }

  // ---------------------------------------------------------------- 루프

  private wake(): void {
    const r = this.wakeResolve;
    this.wakeResolve = null;
    r?.();
  }

  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wakeResolve = resolve;
      void this.deps.sleep(ms).then(() => {
        if (this.wakeResolve === resolve) this.wakeResolve = null;
        resolve();
      });
    });
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.loop = (async () => {
      while (!this.stopped) {
        let r: StepResult;
        try {
          r = await this.step();
        } catch (e) {
          log("error", "poller step error", { err: String((e as Error).message ?? e) });
          r = { action: "idle", waitMs: IDLE_MAX_MS };
        }
        if (this.stopped) break;
        // 차단 중에도 1초마다 깨어 상태만 본다(새 touch 는 wake 로 깨우지만 차단이면 다시 잔다)
        if (r.waitMs > 0) await this.wait(Math.min(r.waitMs, IDLE_MAX_MS));
      }
    })();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.wake();
    await this.loop;
    this.loop = null;
  }

  /** 시험 · 진단용. */
  callsOf(key: string): number {
    return this.runs.get(key)?.calls ?? 0;
  }
}
