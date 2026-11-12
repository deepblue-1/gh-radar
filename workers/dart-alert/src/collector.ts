import { BUDGET_WARN_RATIO, budgetStateOf, kstDateString } from "./apiUsage";
import { coverPointMs, isInWindow, isLateAt, kstYmd, lapIntervalMs } from "./cadence";
import type { DartAlertConfig } from "./config";
import { DartApiError, type DartRow } from "./dart/client";
import { LeaseLostError, type DartAlertDb } from "./db";
import {
  collectOnce,
  deliverPending,
  newLapState,
  type CollectResult,
  type InsertedRow,
  type InsertItem,
  type LapDeps,
  type LapState,
} from "./lap";
import { testSendText } from "./message";
import { safeErrorFields, telegramSafeFields, type SafeErrorFields } from "./safeError";
import type { SendResult } from "./telegram/client";
import type { JudgeOptions, Watch, WatchId } from "./watches";

/**
 * Phase 43-05 — 공시 알림 수집기 루프(장기 실행 Cloud Run Job 한 실행). kis-news-sync collector 골격을
 * 「다음 바퀴 시각」 고정 간격 루프로 단순화했다(200ms 걸음 · 토큰 버킷 · 대상 순서 없음).
 *
 * 흐름(번호 = 실행 순서):
 *   ① 모드 — auto 이고 평일 `07:00` ~ `20:00` 창 밖이면 호출 0 · 종료 0 `outside_window`.
 *      test-send = OpenDART · 임대 없이 시험 글 1건(`test-send ok`) · probe = 임대 없이 공개매수 1쪽 1회(`probe ok`) ·
 *      seed = ② ~ ⑤ 뒤 seed 바퀴(그날 건을 `seeded` 로 · 송신 0 · `seed done`) → 같은 실행이 ⑥ 으로 이어 간다
 *      (창 밖 seed 는 seed 바퀴 1번 뒤 곧바로 `window_end`).
 *   ② 임대 — `dart_alert_lease_acquire(holder, 90초)`. 못 잡으면 다른 실행이 돈다 → OpenDART 0 · 텔레그램 0 · 종료 0.
 *      새로 잡으며 DB 가 오늘 `sending` 을 `pending` 으로 되돌렸으면(reclaimed > 0) warn `possible duplicate after takeover`
 *      — 그 건들은 첫 바퀴 차례에서 이어 보낸다(SC-5 · 드문 중복은 받아들임).
 *   ③ 예산 — `api_usage` `opendart_list`(KST 날짜) 가 하루 예산 이상이면 OpenDART 를 부르지 않고 종료 0.
 *   ④ 탐침 — 오늘 한도 의심 표시가 있으면 공개매수 1쪽 단독 탐침 1건 → 실패면 종료 1 · 성공해야 수집 재개.
 *   ⑤ 기준점 — DB `last_ok`(감시 대상별 마지막 성공 조회)를 메모리로.
 *   ⑥ 루프 — 바퀴 = 감시 대상 순서대로 조회 → 새 건 넣기(늦은 알림 판정은 조회 **전**) → 송신 차례 5건.
 *      다음 바퀴 = 이번 바퀴 시작 + 간격(장전 5초 · 그 밖 10초 — cadence.ts). 이미 지났으면 곧바로 —
 *      밀린 바퀴를 몰아서 부르지 않는다. KST 20:00(창 끝)이면 종료 0 `window_end`.
 *      기다리는 동안 · 바퀴 시작 · 송신 직전: 30초마다 임대 연장(+ `last_ok` 저장) · 10초마다 사용량 flush.
 *   ⑦ 끝 — 정상 · 오류 · SIGTERM 모두 사용량 flush · 임대를 가졌으면 해제.
 *
 * 결정 · 규칙:
 *   D-10 · SC-4 평일 하루 5,400바퀴 × 감시 대상 2 = 10,800회(공식 20,000 의 54% · 예산 15,000 이하).
 *     호출 수는 실패 호출까지 센다 — `dart.list` 를 감싸 호출이 끝날 때마다 `usage.add`(10초 묶음 flush).
 *   D-11 창 밖 · 주말은 auto 가 아무것도 하지 않는다(휴장일 달력 없음).
 *   D-12 「(늦은 알림)」 — 처음 본 시각이 그 감시 대상의 커버 기준점(오늘 마지막 성공 조회 · 없으면 07:02)에서
 *     60초 넘게 뒤면 늦은 건. 정상 바퀴(5 · 10초)는 절대 늦지 않고 수집기가 비어 있던 시간(아침 장애 · 인계)만 늦음.
 *     조회는 오늘(KST) 날짜로만 해서 지난 날짜 건은 오지 않는다.
 *   SC-2 한 실행만 — 임대 TTL 90초 · 30초 연장. 연장 거절 → 조용히 종료 0 `lease_lost` · 연장 DB 오류가 60초
 *     이어지면(남이 넘겨받을 수 있는 시점 전) 종료 0 `lease_unconfirmed` · 넣기 · 차례 · 기록 RPC 의 55000
 *     (43-02 어댑터가 `LeaseLostError` 로 바꿈) → 종료 0 `lease_lost`.
 *     긴 바퀴(체커 I-2): 연장 점검을 기다리는 동안만이 아니라 바퀴 시작 · 송신 직전에도 한다(30초 시간 문이라 RPC 수는
 *     늘지 않는다) → 직전 연장 뒤 최대 경과 ≈ 30초 + 송신 한 번(최악 약 55초) < TTL 90초. 그보다 긴 경우는 기록
 *     RPC 55000 → 종료 0 → 다음 깨움이 인계해 이어 보낸다(손실 없이 스스로 낫는 위험 · 상수는 바꾸지 않는다).
 *   공식 API 운영 기준 ④ 한도 · 차단 신호에 재시도로 두드리지 않는다: `020` → 한도 의심 표시 + 종료 1 `quota`
 *     (다음 실행은 ④ 탐침 1건) · 키 오류(010 · 011 · 012 · 901) → 종료 1 `dart_key` · 코드 버그(100 · 101) →
 *     종료 1 `dart_bug` · 모르는 코드가 감시 대상 상관없이 연속 5번 → 한도 의심 표시 + 종료 1 `unknown_streak`.
 *     치명 신호를 받은 바퀴는 남은 감시 대상 조회를 건너뛰고(호출 0) 이미 넣은 건만 보낸 뒤 멈춘다.
 *     `800` · `900` · 5xx · 네트워크 · 깨진 본문은 그 감시 대상만 실패하고 다음 바퀴 계속(warn).
 *   SC-4 예산의 80% 에서 warn 1번 · 다다르면 error 와 함께 종료 1 `budget_exhausted`.
 *   실패 로그는 `safeErrorFields`(상태 · 코드 · 짧은 문구 · 종류)만 — 키 · 토큰 · 방 id · URL 을 싣지 않는다.
 *
 * 43-06 이 얹을 자리: 치명 종료 직전(`stopOnHalt`) 장애 열기 · 단체방 글 · 바퀴 끝 장애 판정(`afterLap`) ·
 * `deliverPending` 송신 상태(SendPacer)와 migrated → `deps.telegram.switchChat`.
 *
 * 시계 · sleep · DB · DART · 텔레그램은 모두 주입받는다 — 13시간 실행을 가짜 시계 테스트로 돌린다(tests/helpers/fakes.ts).
 */

/** 임대 TTL — 연장 30초 × 3 */
export const LEASE_TTL_S = 90;
export const LEASE_RENEW_MS = 30_000;
/** 사용량 묶음 flush 주기 */
export const USAGE_FLUSH_MS = 10_000;
/** 모르는 오류 코드가 감시 대상 상관없이 연속 이 횟수면 한도 의심 */
export const UNKNOWN_STREAK = 5;
/** 한 바퀴 송신 차례 상한(43-02 송신 기한 90초의 근거 — 5건 × (10초 + 1초)) */
export const DELIVER_LIMIT = 5;
/** 임대 연장 오류가 이만큼 이어지면(남이 넘겨받을 수 있는 시점 전) 끝낸다 */
const LEASE_UNCONFIRMED_MS = LEASE_TTL_S * 1000 - LEASE_RENEW_MS;
const LEASE_RETRY_MS = 5_000;
/** 기다리는 동안 SIGTERM · 임대 · flush 를 확인하는 걸음 */
const WAIT_STEP_MS = 1_000;

export interface CollectorLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface CollectorDeps {
  /** 비밀 필드는 받지 않는다 */
  cfg: Pick<DartAlertConfig, "dailyBudget" | "mode">;
  log: CollectorLog;
  /** epoch ms */
  clock: { now(): number };
  /** `collectOnce` · `deliverPending` 의 `LapDeps.sleep` 으로도 그대로 간다(43-01 계약) */
  sleep(ms: number): Promise<void>;
  /** SIGTERM → abort — 다음 걸음에서 끝내고 임대를 푼다 */
  signal?: AbortSignal;
  /** 임대 보유자 이름(실행 id + 임의 8자) */
  holder: string;
  watches: readonly Watch[];
  judge: JudgeOptions;
  /** 43-02 `DartAlertDb`(어댑터 `createDartAlertDb`) + 사용량 · 한도 의심 표시 */
  db: DartAlertDb & {
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
  dart: {
    /** 오늘 · 감시 대상 하나의 행(쪽 넘김 포함) — 실패는 `DartApiError`(calls 실림) */
    list(watch: Watch, day: string): Promise<{ rows: DartRow[]; calls: number }>;
    /** 한도 의심 탐침 — 공개매수 1쪽 1회 */
    probe(day: string): Promise<{ total: number; calls: number }>;
  };
  telegram: {
    send(text: string, opts?: { plain?: boolean }): Promise<SendResult>;
    /** 방이 슈퍼그룹으로 바뀌었을 때 이 실행 동안만 새 방 id 로(43-06) */
    switchChat(chatId: string): void;
  };
}

export interface CollectorExit {
  code: 0 | 1;
  reason: string;
}

/** 실행을 끝내는 신호 — 루프 어디서든 던지면 run() 이 종료 코드로 바꾼다 */
export class StopRun extends Error {
  constructor(
    readonly code: 0 | 1,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "StopRun";
  }
}

type HaltReason = "quota" | "dart_key" | "dart_bug" | "unknown_streak";

const HALT_BY_KIND: Partial<Record<string, HaltReason>> = { quota: "quota", key: "dart_key", bug: "dart_bug" };

export async function runCollector(deps: CollectorDeps): Promise<CollectorExit> {
  return new Collector(deps).run();
}

class Collector {
  private haveLease = false;
  private lastLeaseOkAt = 0;
  private nextLeaseAt = Number.POSITIVE_INFINITY;
  private nextFlushAt = Number.POSITIVE_INFINITY;
  private usedKnown = 0;
  private sinceFlush = 0;
  private warned80 = false;
  private unknownStreak = 0;
  /** 치명 DART 신호 — 이 바퀴 남은 조회를 건너뛰고 바퀴 끝에 멈춘다 */
  private halt: { reason: HaltReason; err: SafeErrorFields } | null = null;
  /** 감시 대상별 마지막 성공 조회 시각(ms) — 늦은 알림 기준점 · 연장 때 DB last_ok 로 */
  private readonly lastOk = new Map<WatchId, number>();
  private readonly lapState: LapState = newLapState();
  private readonly lapDeps: LapDeps;
  private readonly stats = { laps: 0, calls: 0, inserted: 0, sent: 0, failed: 0 };

  constructor(private readonly d: CollectorDeps) {
    this.lapDeps = {
      watches: d.watches,
      judge: d.judge,
      log: d.log,
      clock: d.clock,
      sleep: d.sleep,
      dart: { list: (w, day) => this.countedList(w, day) },
      db: d.db,
      telegram: d.telegram,
    };
  }

  private now(): number {
    return this.d.clock.now();
  }

  private dateKst(): string {
    return kstDateString(new Date(this.now()));
  }

  async run(): Promise<CollectorExit> {
    const t0 = this.now();
    const mode = this.d.cfg.mode;
    let exit: CollectorExit;
    try {
      exit = await this.main(t0);
    } catch (err) {
      if (err instanceof StopRun) {
        exit = { code: err.code, reason: err.reason };
      } else if (err instanceof LeaseLostError) {
        this.haveLease = false;
        this.d.log.warn({ err: safeErrorFields(err) }, "lease lost — another run took over; stopping quietly");
        exit = { code: 0, reason: "lease_lost" };
      } else {
        this.d.log.error({ err: safeErrorFields(err), mode }, "collector failed");
        exit = { code: 1, reason: "error" };
      }
    }
    await this.shutdown();
    this.d.log.info(
      { mode, ...exit, ...this.stats, usedToday: this.usedKnown + this.sinceFlush, durationMs: this.now() - t0 },
      "collector stop",
    );
    return exit;
  }

  // ── ① ~ ⑤ ──────────────────────────────────────────────────────────
  private async main(t0: number): Promise<CollectorExit> {
    const { log, db, holder, cfg } = this.d;
    const mode = cfg.mode;

    // test-send — OpenDART · 임대 · DB 없이 시험 글 1건(D-15 개인 대화 시험)
    if (mode === "test-send") return this.testSend(t0);

    // ① 창 — auto 만. probe 는 언제든 1건, seed 는 창 밖이어도 seed 바퀴를 먼저 돈다(43-08 배포 직후 점검)
    if (mode === "auto" && !isInWindow(t0)) {
      log.info({ mode }, "outside collection window — nothing to do");
      return { code: 0, reason: "outside_window" };
    }

    // ② 임대 — probe 는 잡지 않는다(남이 돌고 있어도 탐침 1건 · 넣기 · 송신 0)
    if (mode !== "probe") {
      const lease = await db.leaseAcquire(holder, LEASE_TTL_S);
      if (!lease.held) {
        log.info({ mode }, "lease held by another run — exiting");
        return { code: 0, reason: "lease_held" };
      }
      this.haveLease = true;
      this.lastLeaseOkAt = t0;
      this.nextLeaseAt = t0 + LEASE_RENEW_MS;
      if (lease.fresh && lease.reclaimed > 0) log.warn({ reclaimed: lease.reclaimed }, "possible duplicate after takeover");
      if (lease.expired > 0) log.info({ expired: lease.expired }, "past-day alerts expired on takeover");
    }

    // ③ 예산
    if (!(await this.budgetAtStart(t0))) return { code: 0, reason: "budget_at_start" };

    if (mode === "probe") return this.probeMode();

    // ④ 한도 의심 탐침
    const strikes = await db.strikes.read(this.dateKst());
    if (strikes > 0) await this.quotaProbe(strikes);

    // ⑤ 기준점
    await this.loadLastOk();

    // seed — 그날 이미 올라온 건을 알림 없이 「보냄(seeded)」 으로 채운 뒤 같은 실행이 auto 루프로 이어 간다.
    // 43-06 의 시작 점검(장애 판정)은 seed 경로에서 이 seed 바퀴 **뒤**에 들어간다.
    const firstLapAt = mode === "seed" ? await this.seedLap() : this.now();

    log.info({ mode, holder, watches: this.d.watches.length, budget: cfg.dailyBudget }, "collector start");
    return this.loop(firstLapAt);
  }

  // ── 모드 ──────────────────────────────────────────────────────────
  /** probe — 공개매수 1쪽 1회 · 임대 · 넣기 · 송신 없음(43-07 스모크가 로그 `probe ok` 를 찾는다) */
  private async probeMode(): Promise<CollectorExit> {
    const { log, dart } = this.d;
    try {
      const r = await dart.probe(kstYmd(this.now()));
      this.addCalls(r.calls);
      log.info({ total: r.total, calls: r.calls, lease: false }, "probe ok");
      return { code: 0, reason: "probe" };
    } catch (err) {
      this.addCalls(callsOf(err));
      if (err instanceof DartApiError && err.kind === "quota") await this.recordStrike("quota");
      log.error({ err: safeErrorFields(err) }, "probe failed");
      return { code: 1, reason: "probe_failed" };
    }
  }

  /**
   * seed 바퀴 — 감시 대상마다 1회 조회 → 맞는 건을 모아 **모두 성공했을 때만** `insert(…, seed=true)` · 송신 0.
   * 하나라도 실패면 아무것도 넣지 않고 종료 1 `seed_failed`(auto 로 넘어가지 않는다 — 다시 seed 를 돌린다).
   * 성공하면 감시 대상별 성공 시각을 곧바로 메모리 기준점과 DB `last_ok`(임대 연장 RPC)에 넣고 첫 auto 바퀴 시각
   * (= seed 바퀴 시작 + 간격 · 창 밖이면 지금 → 루프가 곧바로 `window_end`)을 돌려준다.
   * 같은 실행이 이어 가므로 seed 와 자동 수집 사이 빈틈이 한 바퀴뿐이다 — seed 뒤 처음 보는 새 건은 늦은 알림이 아니고
   * 43-06 장애 판정도 열리지 않는다(체커 W1).
   */
  private async seedLap(): Promise<number> {
    const { log, db } = this.d;
    const startedAt = this.now();
    let matched: InsertItem[] = [];
    const seedDeps: LapDeps = {
      ...this.lapDeps,
      db: {
        insert: async (items) => {
          matched = items;
          return [];
        },
        claim: (limit) => db.claim(limit),
        mark: (rceptNo, r) => db.mark(rceptNo, r),
      },
    };
    const r = await collectOnce(seedDeps, this.lapState, kstYmd(startedAt), { isLate: () => false, seed: true });
    this.stats.laps += 1;

    const failed = r.results.filter((x) => !x.ok);
    if (failed.length > 0) {
      if (this.halt?.reason === "quota" || this.halt?.reason === "unknown_streak") await this.recordStrike(this.halt.reason);
      log.error(
        { failed: failed.map((f) => ({ watch: f.watch, err: f.error })), matched: matched.length },
        "seed failed — nothing inserted, not continuing to auto",
      );
      throw new StopRun(1, "seed_failed");
    }

    let inserted: InsertedRow[] = [];
    if (matched.length > 0) {
      try {
        inserted = await db.insert(matched, true);
      } catch (err) {
        if (err instanceof LeaseLostError) throw err;
        log.error({ err: safeErrorFields(err), matched: matched.length }, "seed failed — insert error, not continuing to auto");
        throw new StopRun(1, "seed_failed");
      }
    }
    this.takeResult({ ...r, inserted });
    await this.renewLease(this.now());
    log.info({ inserted: inserted.length, matched: matched.length, calls: r.calls, lastOk: this.lastOkIso() }, "seed done");

    const interval = lapIntervalMs(startedAt);
    return interval === null ? this.now() : startedAt + interval;
  }

  /** test-send — 시험 글 1건. 실패면 사유(kind · code · description)와 함께 종료 1 */
  private async testSend(t0: number): Promise<CollectorExit> {
    const r = await this.d.telegram.send(testSendText(t0));
    if (r.kind === "ok") {
      this.d.log.info({ messageId: r.messageId }, "test-send ok");
      return { code: 0, reason: "test_send" };
    }
    this.d.log.error({ ...telegramSafeFields(r) }, "test-send failed");
    return { code: 1, reason: "test_send_failed" };
  }

  private async budgetAtStart(t0: number): Promise<boolean> {
    const { log, db, cfg } = this.d;
    this.usedKnown = await db.usage.read(this.dateKst());
    this.nextFlushAt = t0 + USAGE_FLUSH_MS;
    const state = budgetStateOf(this.usedKnown, cfg.dailyBudget);
    if (state === "exhausted") {
      log.warn({ used: this.usedKnown, budget: cfg.dailyBudget }, "daily budget already reached — not calling OpenDART");
      return false;
    }
    if (state === "warn") this.warnBudget80();
    return true;
  }

  /** 오늘 한도 의심 표시가 있으면 공개매수 1쪽 1건 — 실패면 재시도 없이 종료 1(다음 실행이 다시 1건) */
  private async quotaProbe(strikes: number): Promise<void> {
    const { log, dart } = this.d;
    try {
      const r = await dart.probe(kstYmd(this.now()));
      this.addCalls(r.calls);
      log.info({ strikesToday: strikes, total: r.total }, "quota probe ok — resuming collection");
    } catch (err) {
      this.addCalls(callsOf(err));
      log.error(
        { err: safeErrorFields(err), strikesToday: strikes },
        "quota probe failed — stopping without retries (next run probes once again)",
      );
      throw new StopRun(1, "probe_failed");
    }
  }

  private async loadLastOk(): Promise<void> {
    const st = await this.d.db.readState();
    for (const w of this.d.watches) {
      const ms = Date.parse(st.lastOk[w.id] ?? "");
      if (Number.isFinite(ms)) this.lastOk.set(w.id, ms);
    }
  }

  // ── ⑥ 루프 ────────────────────────────────────────────────────────
  private async loop(firstLapAt: number): Promise<CollectorExit> {
    await this.waitUntil(firstLapAt);
    for (;;) {
      this.checkAbort();
      const now = this.now();
      const interval = lapIntervalMs(now);
      if (interval === null) {
        this.d.log.info({ laps: this.stats.laps }, "collection window end — stopping");
        return { code: 0, reason: "window_end" };
      }
      await this.maintain(now, true);
      await this.lap(now);
      // 다음 바퀴 = 이번 바퀴 시작 + 간격. 이미 지났으면 곧바로(몰아서 부르지 않는다)
      await this.waitUntil(now + interval);
    }
  }

  /** 한 바퀴 — 조회 · 넣기 → (송신 직전 연장 점검) → 송신 차례 → 치명 신호면 멈춤 */
  private async lap(startedAt: number): Promise<void> {
    this.stats.laps += 1;
    let r: CollectResult | null = null;
    try {
      r = await collectOnce(this.lapDeps, this.lapState, kstYmd(startedAt), {
        isLate: (w) => this.isLate(w),
        seed: false,
      });
    } catch (err) {
      // 넣기 실패 — collectOnce 가 warn(안전 필드) 뒤 던졌다. 임대 잃음만 위로 · 나머지는 다음 바퀴에 다시 넣는다
      if (err instanceof LeaseLostError) throw err;
    }
    if (r) this.takeResult(r);

    await this.maintain(this.now(), false);
    await this.deliver();

    if (this.halt) await this.stopOnHalt();
  }

  /** 처음 본 순간 늦은 건인가 — 그 감시 대상 조회 직전에 판정(조회가 오래 걸려도 기준점은 그대로) */
  private isLate(w: WatchId): boolean {
    const now = this.now();
    return isLateAt(now, coverPointMs(now, this.lastOk.get(w) ?? null));
  }

  private takeResult(r: CollectResult): void {
    for (const x of r.results) if (x.ok && x.okAt !== undefined) this.lastOk.set(x.watch, x.okAt);
    this.stats.inserted += r.inserted.length;
  }

  private async deliver(): Promise<void> {
    try {
      const d = await deliverPending(this.lapDeps, DELIVER_LIMIT);
      this.stats.sent += d.sent;
      this.stats.failed += d.failed;
    } catch (err) {
      if (err instanceof LeaseLostError) throw err;
      // 차례 · 기록 DB 오류 — 그 건은 DB 송신 기한(90초) 뒤 다시 차례에 나온다(43-06 이 세분화)
      this.d.log.warn({ err: safeErrorFields(err) }, "deliver failed — retrying next lap");
    }
  }

  /** 치명 DART 신호로 멈춘다 — 43-06: 이 자리에서 장애를 열고 단체방 글을 보낸 뒤 멈춘다 */
  private async stopOnHalt(): Promise<never> {
    const h = this.halt!;
    if (h.reason === "quota" || h.reason === "unknown_streak") await this.recordStrike(h.reason);
    this.d.log.error({ reason: h.reason, err: h.err }, "fatal DART status — stopping this run");
    throw new StopRun(1, h.reason);
  }

  private async recordStrike(why: HaltReason): Promise<void> {
    try {
      const n = await this.d.db.strikes.record(this.dateKst());
      this.d.log.warn({ strikesToday: n, why }, "quota strike recorded — next run probes once before collecting");
    } catch (err) {
      this.d.log.error({ err: safeErrorFields(err), why }, "quota strike record failed");
    }
  }

  // ── DART 호출 집계 · 치명 신호 ────────────────────────────────────
  /** `dart.list` 감쌈 — 호출 수를 끝날 때마다 사용량에 더하고(실패 포함) 치명 · 모르는 코드 연속을 센다 */
  private async countedList(watch: Watch, day: string): Promise<{ rows: DartRow[]; calls: number }> {
    if (this.halt) {
      // 치명 신호 뒤 같은 바퀴의 남은 감시 대상 — 부르지 않는다(호출 0)
      const skipped = new DartApiError(0, null, "transient", "skipped: run is stopping after a fatal DART status");
      skipped.calls = 0;
      throw skipped;
    }
    try {
      const r = await this.d.dart.list(watch, day);
      this.addCalls(r.calls);
      this.unknownStreak = 0;
      return r;
    } catch (err) {
      this.addCalls(callsOf(err));
      this.noteListError(err);
      throw err;
    }
  }

  private noteListError(err: unknown): void {
    const kind = err instanceof DartApiError ? err.kind : "transient";
    if (kind === "unknown") {
      this.unknownStreak += 1;
      if (this.unknownStreak >= UNKNOWN_STREAK) this.halt ??= { reason: "unknown_streak", err: safeErrorFields(err) };
      return;
    }
    this.unknownStreak = 0;
    const reason = HALT_BY_KIND[kind];
    if (reason) this.halt ??= { reason, err: safeErrorFields(err) };
  }

  private addCalls(n: number): void {
    if (n <= 0) return;
    this.d.db.usage.add(n);
    this.sinceFlush += n;
    this.stats.calls += n;
    if (budgetStateOf(this.usedKnown + this.sinceFlush, this.d.cfg.dailyBudget) !== "ok") this.warnBudget80();
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

  /**
   * 임대 연장(30초 시간 문) · 사용량 flush(10초) · 예산 문. 바퀴 시작 · 송신 직전 · 기다리는 걸음마다 부른다.
   * 송신 직전(`gate` false)에는 예산 문을 닫지 않는다 — 이미 넣은 건은 OpenDART 호출 없이 보낼 수 있다.
   */
  private async maintain(now: number, gate: boolean): Promise<void> {
    if (this.haveLease && now >= this.nextLeaseAt) await this.renewLease(now);
    if (now >= this.nextFlushAt) {
      this.nextFlushAt = now + USAGE_FLUSH_MS;
      await this.flushUsage();
    }
    if (gate) this.budgetGate();
  }

  /** 거절 → 조용히 종료 0 · DB 오류 → 5초 뒤 다시, 남이 넘겨받을 수 있는 시점 전까지 확인 못 하면 종료 0 */
  private async renewLease(now: number): Promise<void> {
    const { log, db, holder } = this.d;
    let held: boolean;
    try {
      held = (await db.leaseAcquire(holder, LEASE_TTL_S, this.lastOkIso())).held;
    } catch (err) {
      this.nextLeaseAt = now + LEASE_RETRY_MS;
      log.warn({ err: safeErrorFields(err) }, "lease renewal failed — retrying in 5s");
      if (now - this.lastLeaseOkAt >= LEASE_UNCONFIRMED_MS) {
        log.warn({ sinceOkMs: now - this.lastLeaseOkAt }, "lease unconfirmed too long — stopping before another run takes over");
        throw new StopRun(0, "lease_unconfirmed");
      }
      return;
    }
    if (!held) {
      this.haveLease = false;
      log.warn({ holder }, "lease renewal rejected — another run owns the lease; stopping quietly");
      throw new StopRun(0, "lease_lost");
    }
    this.lastLeaseOkAt = now;
    this.nextLeaseAt = now + LEASE_RENEW_MS;
  }

  /** 메모리 기준점 → DB `last_ok`(ISO) — 비었으면 undefined(RPC 인자를 보내지 않음) */
  private lastOkIso(): Record<string, string> | undefined {
    if (this.lastOk.size === 0) return undefined;
    const out: Record<string, string> = {};
    for (const [w, ms] of this.lastOk) out[w] = new Date(ms).toISOString();
    return out;
  }

  private async flushUsage(): Promise<void> {
    try {
      const total = await this.d.db.usage.flush(this.dateKst());
      if (total !== null) {
        this.usedKnown = total;
        this.sinceFlush = 0;
      }
    } catch (err) {
      this.d.log.warn({ err: safeErrorFields(err) }, "usage flush failed — will retry");
    }
  }

  /** t 까지 — 기다리는 동안에도 SIGTERM · 임대 연장 · flush · 예산 확인 */
  private async waitUntil(t: number): Promise<void> {
    for (let now = this.now(); now < t; now = this.now()) {
      this.checkAbort();
      await this.maintain(now, true);
      await this.d.sleep(Math.min(t - now, WAIT_STEP_MS));
    }
  }

  private checkAbort(): void {
    if (this.d.signal?.aborted) {
      this.d.log.info({}, "SIGTERM — stopping after current step");
      throw new StopRun(0, "aborted");
    }
  }

  /** ⑦ 끝 — 사용량 flush · 임대 해제(정상 · 오류 · SIGTERM 모두) */
  private async shutdown(): Promise<void> {
    await this.flushUsage();
    if (this.haveLease) {
      try {
        await this.d.db.leaseRelease(this.d.holder);
      } catch (err) {
        this.d.log.warn({ err: safeErrorFields(err) }, "lease release failed — it expires in 90s");
      }
    }
  }
}

/** 실패한 DART 호출이 쓴 호출 수 — DartApiError 의 calls(쪽 넘김 중 실패) · 없으면 1 */
function callsOf(err: unknown): number {
  return err instanceof DartApiError ? (err.calls ?? 1) : 1;
}
