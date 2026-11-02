/**
 * tickgw 키 폴러 (Phase 37 · D-05 · D-06 · D-07).
 *
 * - 키 = (isin, 거래소, KST 오늘). 키당 폴러 하나 — 브라우저 N 개 · server 인스턴스 여럿이 같은 키를 불러도
 *   119 호출 수는 키당 같다(CLAUDE.md 「호출량은 사용자 수와 독립」).
 * - 첫 touch → 08:00 KST(`kstDayStartNs` — config.ts 로컬 함수 · shared import 없음)부터 to=0(지금까지) 하루치 요청.
 *   has_more 면 next_from_ns 로 곧바로 이어받고, 끝나면 ready. 그 뒤는 lastRecvNs+1 부터 증분만 POLL_MS ± 지터 간격.
 * - 119 호출 동시성 전역 1 — 루프 하나가 `step()` 을 순서대로 돌린다(키가 여럿이면 nextDueAt 이 이른 키부터 순환).
 * - 시계 · 수면 · 난수는 deps 주입 — 시험은 가짜 시계로 `step()` 을 직접 돈다.
 */

import { kstDayStartNs } from "./config.js";
import type { TickCache } from "./cache.js";
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
  action: "call" | "idle";
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
  /** 08:00 하루치(+이어받기)를 다 받았는가. */
  loaded: boolean;
  /** has_more 이어받기 커서. */
  pendingFrom: bigint | null;
  nextDueAt: number;
  calls: number;
}

/** 아무 키도 할 일이 없을 때 최대 대기(새 touch 는 wake 로 깨운다). */
const IDLE_MAX_MS = 1_000;

export class Poller {
  private readonly runs = new Map<string, KeyRun>();
  private stopped = true;
  private wakeResolve: (() => void) | null = null;
  private loop: Promise<void> | null = null;

  constructor(
    private readonly cfg: PollerConfig,
    private readonly deps: PollerDeps,
  ) {}

  /** server 요청마다 부른다 — run 을 만들거나 이어 쓰고 지금 상태를 돌려준다. */
  touch(key: string): KeyState {
    const now = this.deps.now();
    const run = this.runFor(key, now);
    const entry = this.deps.cache.get(key);
    if (entry) entry.lastAccess = now;
    this.wake();
    return this.stateOf(run);
  }

  /** 읽기 전용 상태(리스를 갱신하지 않음). */
  peek(key: string): KeyState | null {
    const run = this.runs.get(key);
    return run ? this.stateOf(run) : null;
  }

  private runFor(key: string, now: number): KeyRun {
    const entry = this.deps.cache.ensure(key, now);
    let run = this.runs.get(key);
    if (!run || run.epoch !== entry.epoch) {
      const { isin, ex, date } = parseKey(key);
      run = { key, isin, ex, date, epoch: entry.epoch, loaded: false, pendingFrom: null, nextDueAt: now, calls: 0 };
      this.runs.set(key, run);
    }
    return run;
  }

  private stateOf(run: KeyRun): KeyState {
    if (!run.loaded) return { state: "loading", queue: 0 };
    return { state: "ready", queue: 0 };
  }

  /** 한 번의 스케줄 결정 — 할 일이 있으면 119 호출 1회. 동시성 1 은 이 메서드를 순서대로만 부르는 것으로 지킨다. */
  async step(): Promise<StepResult> {
    const now = this.deps.now();
    for (const k of this.deps.cache.evict(now)) this.runs.delete(k);

    let pick: KeyRun | null = null;
    let soonest = Infinity;
    for (const run of this.runs.values()) {
      if (run.nextDueAt <= now) {
        if (!pick || run.nextDueAt < pick.nextDueAt) pick = run;
      } else {
        soonest = Math.min(soonest, run.nextDueAt);
      }
    }
    if (!pick) return { action: "idle", waitMs: Math.max(1, Math.min(IDLE_MAX_MS, soonest - now)) };

    await this.poll(pick);
    return { action: "call", key: pick.key, waitMs: 0 };
  }

  private fromOf(run: KeyRun): bigint {
    if (run.pendingFrom !== null) return run.pendingFrom;
    const entry = this.deps.cache.get(run.key);
    if (entry?.lastRecvNs != null) return entry.lastRecvNs + 1n;
    return kstDayStartNs(run.date);
  }

  private jitter(): number {
    return Math.round((this.deps.random() * 2 - 1) * this.cfg.pollJitterMs);
  }

  private async poll(run: KeyRun): Promise<void> {
    const fromNs = this.fromOf(run);
    const started = this.deps.now();
    run.calls += 1;
    const res = await this.deps.runIndexer({ isin: run.isin, ex: run.ex, date: run.date, fromNs, toNs: 0n });
    const now = this.deps.now();
    const entry = this.deps.cache.get(run.key);
    if (!entry || entry.epoch !== run.epoch) return; // 호출 사이 엔트리가 지워짐 — 결과를 버린다

    if (res.code === 0 && res.meta && res.meta.fmt === INDEXER_FMT) {
      this.applyOk(run, fromNs, res, now);
      log("info", "indexer ok", {
        key: run.key,
        from: String(fromNs),
        records: res.meta.records,
        bytes: res.stdout.length,
        has_more: res.meta.hasMore,
        ms: now - started,
      });
      return;
    }
    log("warn", "indexer fail", { key: run.key, code: res.code, ms: now - started, stderr: res.stderrTail.slice(-200) });
    run.nextDueAt = now + this.cfg.pollMs;
  }

  private applyOk(run: KeyRun, fromNs: bigint, res: IndexerResult, now: number): void {
    const meta = res.meta!;
    if (meta.records > 0) {
      this.deps.cache.append(run.key, res.stdout, meta);
    }
    if (meta.hasMore) {
      if (meta.nextFromNs !== null && meta.nextFromNs > fromNs) {
        run.pendingFrom = meta.nextFromNs;
        run.nextDueAt = now; // 이어받기는 곧바로
        return;
      }
      // 계약 위반 — 이어받을 커서가 없다. 끊김을 기록하고 lastRecvNs+1 증분으로 넘어간다
      const entry = this.deps.cache.get(run.key);
      if (entry) entry.complete = false;
      log("warn", "has_more without next_from_ns", { key: run.key });
    }
    run.pendingFrom = null;
    run.loaded = true;
    run.nextDueAt = now + this.cfg.pollMs + this.jitter();
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
        if (r.waitMs > 0) await this.wait(r.waitMs);
      }
    })();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.wake();
    await this.loop;
    this.loop = null;
  }

  /** 시험 · healthz 용. */
  callsOf(key: string): number {
    return this.runs.get(key)?.calls ?? 0;
  }
}
