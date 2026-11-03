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
 *   다시 75     2초 + 0~0.5초 지터 뒤 재시도 · 실패로 세지 않는다(동시 1 바쁨 · 색인 준비 안 됨 — gh-trade 4f474b1f 가 넓힘)
 *   인자 64     그 키 blocked · 60초 뒤 재시도(날짜 경계 · 계약 차이 — 37-17 이 인덱서 회신으로 맞춘다)
 *   캐시 가득   리스가 살아 있는 키는 LRU 보호(cache.setProtect) — 자리를 못 만들면 붙이지 않고 실패처럼 백오프(커서 그대로 · WR-33)
 *   너무 큼     키 하나의 하루치가 캐시 상한을 넘으면 그 키(그날) 폴링을 멈춘다 · blocked · complete=false(승격 안 함 · WR-33)
 *   도달 불가   ssh 255 + 연결 오류 문구 3회 연속 → 전역 60초 차단(모든 키 delayed · 호출 0) ·
 *               차단이 풀린 뒤 첫 호출(탐침)이 또 연결 실패면 곧바로 다시 60초 차단
 *
 * ── 상태 전이(X-Tick-State) ──────────────────────────────────────────
 *   | 조건(위가 우선)                                   | state   | queue |
 *   |---------------------------------------------------|---------|-------|
 *   | 엔트리 closed(마감 마무리 끝)                      | ready   | 0     |
 *   | 리스 살아 있는 키 중 순번 > MAX_KEYS               | queued  | k     |
 *   | 전역 차단 중(119 도달 불가)                        | delayed | 0     |
 *   | 너무 큼(그날 하루치 > 캐시 상한 · WR-33)          | blocked | 0     |
 *   | 인자 오류(64) 뒤 재시도 대기                       | blocked | 0     |
 *   | 실패 백오프 중(failures ≥ 1)                       | delayed | 0     |
 *   | 08:00 하루치(+이어받기) 아직                       | loading | 0     |
 *   | 그 밖                                              | ready   | 0     |
 *
 * ── 20:01 마감 마무리(closeSweep) — 승격본 = 장 마감 하루치 전체 또는 없음(D-07 · D-04) ──
 *   KST 20:00 + CLOSE_DELAY(60초)가 지나면 하루 한 번: 오늘 complete(08:00 시작 ∧ 끊김 없음 ∧ 압축으로 건너뛴 원본 0 — CR-31) 이고
 *   closed 아닌 키마다
 *   **리스와 무관하게** 마무리 폴링(from = lastRecvNs+1 · to 0 · has_more 면 이어받기)을 같은 동시성 1 · 같은 차단 규율로 돈다.
 *   성공(종료 0 ∧ has_more false)하면 closed · closedThroughNs = 그 폴링 시작 시각 − 2초(기록 지연 여유 · ≥ 그날 20:00:00 KST).
 *   실패는 백오프(5 · 10초)로 최대 3회 뒤 closed 아님 · LRU 로 밀려난 키도 closed 아님 → export 에 안 나와 승격되지 않는다.
 *   closed 키는 더 폴링하지 않는다.
 *
 * ── 19:55 따라잡기(catchup · CR-31 후속 — 승격률 보전) ──────────────────────
 *   왜: 119 기록기는 07:00~20:00 시간 파일을 `.pcap` 으로 쥐고 있다가 20:00 회전부터 오래된 시간 파일부터 하나씩(FIFO)
 *   `zstd --rm` 으로 압축한다. 압축된 파일은 인덱서가 건너뛰고 `compressed_files_skipped` 로 세며, 그러면 CR-31 이 그 키를
 *   complete=false(승격 안 함)로 둔다. 낮에 리스가 끝난 키(브라우저를 닫음)는 lastRecvNs 이후 빈 구간을 20:01 마감 마무리에서야
 *   채우는데, 그때는 이른 시간 파일이 이미 압축 중이라 대부분 승격에서 빠진다.
 *   무엇: KST TICKGW_CATCHUP_AT(기본 19:55 · `off` 면 끔) 부터 20:00 전까지 하루 한 번 — 그 순간 오늘 complete ∧ closed 아님 ∧
 *   너무 큼 아님 ∧ **리스가 끝난**(보통 루프가 폴링하지 않는) 키를 모아, 키마다 lastRecvNs+1(이어받기 중이면 그 커서 · 받은 적
 *   없으면 08:00)부터 to 0 으로 has_more 가 false 가 될 때까지 받는다. 그러면 20:01 마감 마무리는 마지막 몇 분(가장 늦게 압축되는
 *   19시 · 20시 파일)만 읽는다. 대상은 시작 순간에 고정한다(19:55 뒤 리스가 끝난 키는 이미 몇 분 안쪽까지 받았다).
 *   규율: 보통 폴링과 **같은 호출 슬롯**(step 사슬 · 동시성 1 · 전역 차단 · 75 = 2초 재시도 · 실패 백오프 5→60초 · 인자 64 = 60초 ·
 *   캐시 가득 = 붙이지 않고 백오프 · 너무 큼 = 그 키 중단 · WR-33 LRU 보호 그대로).
 *   공정 교대: 리스가 살아 있는 키와 따라잡기가 **둘 다** 할 일이 있으면 번갈아 한 호출씩 한다(직전 슬롯의 반대편이 간다).
 *   그래서 활성 키는 따라잡기 호출 하나 이상 기다리지 않고(평소엔 5초 간격 그대로 · 포화 때만 최대 2배), 따라잡기도 활성 키가
 *   포화돼 있어도 슬롯 절반을 얻는다(순수 우선순위면 활성 8키 포화 때 따라잡기가 굶어 승격률을 못 지킨다).
 *   도중에 다시 touch 된 키는 보통 루프로 넘기고 따라잡기에서 뺀다. 20:00 까지 못 끝낸 키는 그대로 20:01 마감 마무리 몫이다
 *   (따로 재시도하지 않는다). 끝(대상 소진 또는 20:00)에 요약 한 줄 `catchup done`(keys · caught · left · calls · bytes · ms).
 *   119 호출 모양: 19:55 에 한 번 몰리는 연속 호출 — 상한은 「오늘 연 키 수 × 키당 빈 구간(이어받기 페이지 수)」.
 *
 * ── as-of(X-Tick-As-Of-Ms · quick-261104-6lh) ──────────────────────────
 *   entry.asOfMs = 그 키를 마지막으로 끝까지(has_more 없이) 읽은 인덱서 호출의 시작 시각(tickgw 벽시계 ms) — 새 레코드 0건이어도
 *   앞당긴다. 실패 · 바쁨 · 인자 오류 · 전역 차단은 건드리지 않는다(마지막 완결 읽기에 정직하게 멈춘다). 응답 시각이 아닌 까닭:
 *   캐시는 5초 폴링 · 최대 60초 백오프라 응답 시각보다 수 초~수십 초 늦을 수 있다(closedThroughNs 와 같은 뜻 · 여유는 쓰는 쪽이 뺀다).
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
  /** 19:55 따라잡기 시작 KST hhmm(TICKGW_CATCHUP_AT · 기본 1955) — null · 없음 = 끔. */
  catchupHhmm?: number | null;
}

export interface PollerDeps {
  cache: TickCache;
  runIndexer: RunIndexer;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

export interface StepResult {
  action: "call" | "close" | "catchup" | "idle" | "blocked";
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
  /** 그날 하루치가 캐시 상한을 넘는다 — 폴링하지 않는다(WR-33). */
  tooLarge: boolean;
  calls: number;
}

/** applyOk 결과 — more 이어받기 · done 끝 · full 캐시 자리 없음(붙이지 않음) · tooLarge 그 키 혼자 상한 초과. */
type ApplyResult = "more" | "done" | "full" | "tooLarge";

interface CloseItem {
  key: string;
  attempts: number;
  nextDueAt: number;
  /** 이번 마무리 폴링(이어받기 사슬 포함)의 첫 호출 시각 — closedThroughNs 의 기준. */
  startedAt: number | null;
}

interface CatchupItem {
  key: string;
  nextDueAt: number;
  /** 이 키 따라잡기의 연속 실패 수(백오프 단계) — 보통 폴링의 run.failures 와 따로 센다. */
  failures: number;
}

interface CatchupStats {
  keys: number;
  caught: number;
  calls: number;
  bytes: number;
  startedAt: number;
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
  /** 19:55 따라잡기를 시작한 날 · 끝낸 날(KST YYYYMMDD) — 하루 한 번. */
  private catchupStartedDate: string | null = null;
  private catchupDoneDate: string | null = null;
  private catchupQueue: CatchupItem[] = [];
  private catchupStats: CatchupStats = { keys: 0, caught: 0, calls: 0, bytes: 0, startedAt: 0 };
  /** 직전 호출 슬롯이 따라잡기였는가 — 활성 키와 둘 다 할 일이 있으면 번갈아 간다(공정 교대). */
  private lastWasCatchup = false;
  /** 「너무 큼」 판정 키(키에 날짜 포함) — 엔트리가 지워진 뒤 다시 열어도 08:00 부터 다시 받지 않는다(WR-33). */
  private readonly tooLargeKeys = new Set<string>();
  private chain: Promise<unknown> = Promise.resolve();
  private stopped = true;
  private wakeResolve: (() => void) | null = null;
  private loop: Promise<void> | null = null;

  constructor(
    private readonly cfg: PollerConfig,
    private readonly deps: PollerDeps,
  ) {
    // WR-33 — 리스가 살아 있는 키는 LRU 후보에서 뺀다(폴링 중인 키를 지우고 08:00 부터 다시 받는 고리 방지)
    deps.cache.setProtect((e) => {
      const run = this.runs.get(e.key);
      return !!run && run.epoch === e.epoch && run.leaseUntil > this.deps.now();
    });
  }

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
        tooLarge: this.tooLargeKeys.has(entry.key),
        calls: 0,
      };
      if (run.tooLarge) entry.complete = false;
      this.runs.set(entry.key, run);
    }
    return run;
  }

  /** 리스가 살아 있고 closed 아닌 키를 순번대로. */
  private liveRuns(now: number): KeyRun[] {
    const out: KeyRun[] = [];
    for (const run of this.runs.values()) {
      if (run.leaseUntil <= now) continue;
      if (run.tooLarge) continue;
      if (this.deps.cache.get(run.key)?.closed) continue;
      out.push(run);
    }
    return out.sort((a, b) => a.seq - b.seq);
  }

  private stateOf(run: KeyRun, now: number): KeyState {
    if (this.deps.cache.get(run.key)?.closed) return { state: "ready", queue: 0 };
    if (run.tooLarge) return { state: "blocked", queue: 0 };
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
    // 19:55 따라잡기 — 같은 호출 슬롯. 둘 다 할 일이 있으면 직전 슬롯의 반대편이 간다(공정 교대 · 머리 주석)
    const cu = this.catchupDue(now);
    if (cu && (!pick || !this.lastWasCatchup)) {
      this.lastWasCatchup = true;
      await this.catchupOne(cu);
      return { action: "catchup", key: cu.key, waitMs: 0 };
    }
    if (!pick) {
      for (const item of this.closeQueue) soonest = Math.min(soonest, item.nextDueAt);
      for (const item of this.catchupQueue) soonest = Math.min(soonest, item.nextDueAt);
      return { action: "idle", waitMs: Math.max(1, Math.min(IDLE_MAX_MS, soonest - now)) };
    }
    this.lastWasCatchup = false;
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

  /** 정상 응답을 캐시에 붙인다. startedMs = 이 인덱서 호출의 시작 시각(완결 읽기면 as-of). */
  private applyOk(run: KeyRun, entry: CacheEntry, fromNs: bigint, res: IndexerResult, startedMs: number): ApplyResult {
    const meta = res.meta!;
    if (meta.records > 0) {
      const a = this.deps.cache.append(run.key, res.stdout, meta);
      if (a === "too_large") {
        // 키 하나의 하루치가 캐시 상한을 넘는다 — 지우고 처음부터 다시 받는 무한 고리 대신 그날 폴링을 멈춘다(WR-33)
        run.tooLarge = true;
        this.tooLargeKeys.add(run.key);
        entry.complete = false;
        log("warn", "key too large for cache — polling stopped", { key: run.key, size: entry.size, limit: this.deps.cache.limitBytes });
        return "tooLarge";
      }
      if (a === "full") {
        log("warn", "cache full (leased keys) — retry later", { key: run.key, total: this.deps.cache.totalBytes() });
        return "full"; // 붙이지 않았다 — 커서(pendingFrom · lastRecvNs) 그대로 · 같은 범위를 나중에 다시
      }
    }
    // CR-31 — 119 기록기는 20:00 보류 창이 끝나면 지난 시간 파일을 `zstd --rm` 으로 압축하고, 인덱서는 그 파일을 건너뛰며
    // `compressed_files_skipped` 로 센다(gh-trade server/tools/indexer/README.md 「운영 경계」). 건너뛴 파일이 하나라도 있으면
    // 이 키는 더는 「08:00 부터 끊김 없음」 이 아니다 → complete=false(마감 마무리가 closed 로 닫지 않는다 = 승격 안 함 ·
    // 그날 밤 GCS 변환 몫 · live 는 X-Tick-Complete:false).
    if (meta.compressedFilesSkipped > 0) {
      if (entry.complete) {
        log("warn", "compressed files skipped — not complete", { key: run.key, skipped: meta.compressedFilesSkipped });
      }
      entry.complete = false;
    }
    // 인덱서가 범위 안 레코드를 싣지 못했다고 알리면(`skipped_records` · gh-trade 4e9de34b) 그 응답도 완결이 아니다 — 같은 처리.
    if (meta.skippedRecords > 0) {
      if (entry.complete) {
        log("warn", "records skipped — not complete", { key: run.key, skipped_records: meta.skippedRecords });
      }
      entry.complete = false;
    }
    if (meta.hasMore) {
      if (meta.nextFromNs !== null && meta.nextFromNs > fromNs) {
        run.pendingFrom = meta.nextFromNs;
        return "more";
      }
      // 계약 위반 — 이어받을 커서가 없다. 끊김을 기록(complete=false → 승격 안 됨)하고 lastRecvNs+1 증분으로 넘어간다
      entry.complete = false;
      log("warn", "has_more without next_from_ns", { key: run.key });
    }
    // 완결 읽기(has_more 없음)만 as-of 를 앞당긴다 — 새 레코드 0건이어도(한산한 종목). append 와 같은 동기 블록이라
    // 캐시와 원자적이다. 이어받기 중간 · 계약 위반(has_more 인데 커서 없음)은 끝까지 읽은 게 아니라 그대로 둔다.
    if (!meta.hasMore) entry.asOfMs = startedMs;
    run.pendingFrom = null;
    run.loaded = true;
    return "done";
  }

  private async call(
    run: KeyRun,
    fromNs: bigint,
  ): Promise<{ res: IndexerResult; started: number; at: number; entry: CacheEntry | null }> {
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
      skipped_records: res.meta?.skippedRecords || undefined,
      ms: at - started,
      stderr: okResult(res) ? undefined : res.stderrTail.slice(-200),
    });
    // 호출 사이 엔트리가 지워짐(유휴 · LRU) — 결과를 버린다
    return { res, started, at, entry: entry && entry.epoch === run.epoch ? entry : null };
  }

  private async poll(run: KeyRun): Promise<void> {
    const entry0 = this.deps.cache.get(run.key)!;
    const fromNs = this.fromOf(run, entry0);
    const { res, started, at, entry } = await this.call(run, fromNs);
    const kind = this.classify(res, at);
    if (!entry) return;
    switch (kind) {
      case "ok": {
        const prevFailures = run.failures;
        run.failures = 0;
        run.argBlocked = false;
        const a = this.applyOk(run, entry, fromNs, res, started);
        if (a === "more") run.nextDueAt = at;
        else if (a === "done") run.nextDueAt = at + this.cfg.pollMs + this.jitter();
        else if (a === "full") {
          run.failures = prevFailures + 1; // delayed · 5 → 10 → … 60초(붙일 자리가 날 때까지)
          run.nextDueAt = at + backoffMs(run.failures);
        }
        return;
      }
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

  // ---------------------------------------------------------------- 19:55 따라잡기

  /** 따라잡기 대상 — 오늘 · complete · closed 아님 · 너무 큼 아님 · 리스 끝남(보통 루프가 폴링하지 않는 키). */
  private catchupEligible(e: CacheEntry, today: string, now: number): boolean {
    if (e.date !== today || !e.complete || e.closed || this.tooLargeKeys.has(e.key)) return false;
    const run = this.runs.get(e.key);
    return !(run && run.epoch === e.epoch && run.leaseUntil > now);
  }

  /**
   * 지금 따라잡기 할 키(없으면 null). 창 [TICKGW_CATCHUP_AT, 20:00) 안 첫 step 에 대상을 고정하고, 매 step 대상에서 빠진 키
   * (다시 touch · complete 아님 · 지워짐)를 거른다. 대상이 바닥나거나 20:00 이 되면 요약 한 줄을 남기고 그날은 끝.
   */
  private catchupDue(now: number): CatchupItem | null {
    const at = this.cfg.catchupHhmm;
    if (at === null || at === undefined) return null;
    const today = kstToday(now);
    if (this.catchupDoneDate === today) return null;
    if (now < kstMs(today, String(at).padStart(4, "0"))) return null;
    if (now >= kstMs(today, "2000")) {
      // 창 끝 — 못 끝낸 키는 20:01 마감 마무리 몫(따로 재시도하지 않는다). 창 안에 기동하지 않았으면 아무것도 안 한다.
      if (this.catchupStartedDate === today) this.finishCatchup(today, now);
      return null;
    }
    if (this.catchupStartedDate !== today) {
      this.catchupStartedDate = today;
      this.catchupQueue = this.deps.cache
        .values()
        .filter((e) => this.catchupEligible(e, today, now))
        .map((e) => ({ key: e.key, nextDueAt: now, failures: 0 }));
      this.catchupStats = { keys: this.catchupQueue.length, caught: 0, calls: 0, bytes: 0, startedAt: now };
      log("info", "catchup start", { date: today, keys: this.catchupQueue.length });
    }
    this.catchupQueue = this.catchupQueue.filter((i) => {
      const e = this.deps.cache.get(i.key);
      return !!e && this.catchupEligible(e, today, now);
    });
    if (this.catchupQueue.length === 0) {
      this.finishCatchup(today, now);
      return null;
    }
    let item: CatchupItem | null = null;
    for (const i of this.catchupQueue) {
      if (i.nextDueAt <= now && (!item || i.nextDueAt < item.nextDueAt)) item = i;
    }
    return item;
  }

  private finishCatchup(today: string, now: number): void {
    this.catchupDoneDate = today;
    const s = this.catchupStats;
    log("info", "catchup done", {
      date: today,
      keys: s.keys,
      caught: s.caught,
      left: this.catchupQueue.length,
      calls: s.calls,
      bytes: s.bytes,
      ms: now - s.startedAt,
    });
    this.catchupQueue = [];
  }

  private dropCatchup(item: CatchupItem): void {
    this.catchupQueue = this.catchupQueue.filter((i) => i !== item);
  }

  /** 따라잡기 한 호출 — 보통 폴링과 같은 분류 · 같은 캐시 규칙. 끝까지 받으면(has_more false) 대상에서 뺀다. */
  private async catchupOne(item: CatchupItem): Promise<void> {
    const entry0 = this.deps.cache.get(item.key)!;
    const run = this.runOf(entry0, this.deps.now());
    const fromNs = this.fromOf(run, entry0);
    const { res, started, at, entry } = await this.call(run, fromNs);
    this.catchupStats.calls += 1;
    this.catchupStats.bytes += res.stdout.length;
    const kind = this.classify(res, at);
    if (!entry) {
      this.dropCatchup(item);
      return;
    }
    switch (kind) {
      case "ok": {
        run.failures = 0;
        run.argBlocked = false;
        const a = this.applyOk(run, entry, fromNs, res, started);
        if (a === "more") {
          item.failures = 0;
          item.nextDueAt = at; // 이어받기 — 곧바로(활성 키와는 교대)
        } else if (a === "done") {
          if (entry.complete) this.catchupStats.caught += 1;
          this.dropCatchup(item);
        } else if (a === "full") {
          item.failures += 1; // 붙이지 않았다 — 커서 그대로 · 백오프 뒤 같은 범위(WR-33)
          item.nextDueAt = at + backoffMs(item.failures);
        } else {
          this.dropCatchup(item); // 너무 큼 — 그 키(그날) 중단
        }
        return;
      }
      case "busy":
        item.nextDueAt = at + this.busyDelay();
        return;
      case "arg":
        item.nextDueAt = at + ARG_RETRY_MS;
        return;
      case "fail":
        item.failures += 1;
        item.nextDueAt = at + backoffMs(item.failures);
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
      for (const k of this.tooLargeKeys) if (!k.endsWith(`|${today}`)) this.tooLargeKeys.delete(k); // 지난 날 판정 정리
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
    const { res, started, at, entry } = await this.call(run, fromNs);
    const kind = this.classify(res, at);
    if (!entry) {
      this.dropClose(item);
      return;
    }
    if (kind === "ok") {
      run.failures = 0;
      run.argBlocked = false;
      const a = this.applyOk(run, entry, fromNs, res, started);
      if (a === "more") {
        item.nextDueAt = at; // 이어받기 — 같은 마무리 폴링
        return;
      }
      if (a === "full") {
        // 캐시 자리 없음 — 실패 시도로 센다(같은 범위를 백오프 뒤 다시)
        item.startedAt = null;
        item.attempts += 1;
        if (item.attempts >= CLOSE_MAX_ATTEMPTS) {
          this.dropClose(item);
          log("warn", "close gave up (cache full) — not promoted", { key: item.key, attempts: item.attempts });
          return;
        }
        item.nextDueAt = at + backoffMs(item.attempts);
        return;
      }
      if (a === "tooLarge" || !entry.complete) {
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
