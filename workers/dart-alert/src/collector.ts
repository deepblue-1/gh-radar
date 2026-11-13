import { BUDGET_WARN_RATIO, budgetStateOf, kstDateString } from "./apiUsage";
import { coverPointMs, isInWindow, isLateAt, kstYmd, lapIntervalMs, lateGapMs, pollSlot } from "./cadence";
import type { DartAlertConfig } from "./config";
import { DartApiError, type DartRow } from "./dart/client";
import { LeaseLostError, type DartAlertDb } from "./db";
import {
  collectOnce,
  deliverPending,
  newLapState,
  RETRY_BASE_S,
  RETRY_MAX_S,
  UNSENT_ERROR_MS,
  newSendPacer,
  sendPaced,
  type CollectResult,
  type InsertedRow,
  type InsertItem,
  type LapDeps,
  type LapState,
  type SendPacer,
} from "./lap";
import { kstLabel, outageText, recoveredText, testSendText } from "./message";
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
 *      감시 대상별 조회 칸(261113-iez): I001 30초 · D005 60초는 바퀴 시작 시각의 칸(07:00 기준)이 지난 조회 칸과 다를 때만
 *      부른다(`takeSlot` — 성공 · 실패와 무관하게 칸을 기록 · 밀린 칸을 몰아서 부르지 않는다 · 실행이 바뀌면 첫 바퀴에 전부).
 *      다음 바퀴 = 이번 바퀴 시작 + 간격(장전 5초 · 그 밖 10초 — cadence.ts). 이미 지났으면 곧바로 —
 *      밀린 바퀴를 몰아서 부르지 않는다. KST 20:00(창 끝)이면 종료 0 `window_end`.
 *      기다리는 동안 · 바퀴 시작 · 송신 직전: 30초마다 임대 연장(+ `last_ok` 저장) · 10초마다 사용량 flush.
 *   ⑦ 끝 — 정상 · 오류 · SIGTERM 모두 사용량 flush · 임대를 가졌으면 해제. 그 전에 임대를 쥔 auto 실행은(SIGTERM · 임대 잃음 밖)
 *      이미 넣은 건을 OpenDART 호출 없이 한 번 더 보내 보고, 오늘 못 나간 건이 남으면 error `alerts left unsent at stop`(리뷰 WR-05).
 *
 * 결정 · 규칙:
 *   D-10 · SC-4 평일 하루 5,400바퀴 × 바퀴마다 감시 대상 2(D004 · B001) + I001 30초 칸 1,560 + D005 60초 칸 780 = 13,140회
 *     (공식 20,000 의 66% · 예산 15,000 이하 · I001 추가 쪽 최악까지 14,700 — cadence.ts).
 *     호출 수는 실패 호출까지 센다 — `dart.list` 를 감싸 호출이 끝날 때마다 `usage.add`(10초 묶음 flush).
 *   D-11 창 밖 · 주말은 auto 가 아무것도 하지 않는다(휴장일 달력 없음).
 *   D-12 「(늦은 알림)」 — 처음 본 시각이 그 감시 대상의 커버 기준점(오늘 마지막 성공 조회 · 없으면 07:02)에서
 *     60초 + 그 감시 대상 조회 간격(D004 · B001 60초 · I001 90초 · D005 120초 — `lateGapMs`) 넘게 뒤면 늦은 건.
 *     정상 바퀴(5 · 10초) · 정상 30초 · 60초 조회는 절대 늦지 않고 수집기가 비어 있던 시간(아침 장애 · 인계)만 늦음.
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
 * 43-06 장애 짝 글(D-16 · D-17): 확인 시간대 안에서 감시 대상 하나라도 기준점(마지막 성공 조회 · 없으면 07:02)에서
 *   5분(`OUTAGE_AFTER_MS`) 넘게 성공이 없으면 `dart_alert_outage open` → opened true 인 실행만 「⚠ 공시 알림이 멈췄습니다」
 *   1건 → notice sent/failed → error `dart outage opened`(→ 43-07 로그 일치 이메일). 같은 장애 동안 다시 올리지 않는다.
 *   띄엄 조회 대상(I001 · D005)은 그 대상을 부르지 않는 바퀴가 장애를 닫지 않게 「마지막 조회가 실패한 감시 대상」(`failing`)을
 *   기억해, 그 대상이 다시 성공해야 닫는다(261113-iez — 30초마다 짝 글이 되풀이되지 않게).
 *   모든 감시 대상이 성공한 첫 바퀴에 「멈췄습니다」 가 실제로 나갔을 때만 「✅ 다시 동작」 1건 → 나간 뒤에 close · info
 *   `dart outage closed`. 「다시 동작」 이 실패하면 DB 를 열어 둔 채 다음 성공 바퀴에 다시(짝 보장 · 리뷰 WR-02).
 *   시작 점검(`startupCheck` — auto 는 첫 바퀴 전 · seed 는 seed 바퀴 뒤)이 죽은 수집기 · 글 전에 죽은 실행을 덮고,
 *   치명 종료(`outageOnFatal`) 직전에도 같은 장애 글을 쓴다(실패해도 종료 1 그대로). 창 끝에 열린 장애는 다음 날 첫 성공에 닫는다.
 *
 * 시계 · sleep · DB · DART · 텔레그램은 모두 주입받는다 — 13시간 실행을 가짜 시계 테스트로 돌린다(tests/helpers/fakes.ts).
 */

// 송신 속도 · 재시도 상수(43-06) — 순환 import 를 피해 lap.ts 에 두고 여기서 다시 내보낸다
export { RETRY_BASE_S, RETRY_MAX_S, SEND_GAP_MS, SEND_WINDOW_MAX, SEND_WINDOW_MS, UNSENT_ERROR_MS } from "./lap";

/** D-17 — 확인 시간대 안에서 감시 대상 하나라도 기준점에서 이만큼 넘게 성공이 없으면 장애를 연다(장전 · 장중 구분 없음) */
export const OUTAGE_AFTER_MS = 300_000;
/** 임대 TTL — 연장 30초 × 3 */
export const LEASE_TTL_S = 90;
export const LEASE_RENEW_MS = 30_000;
/** 사용량 묶음 flush 주기 */
export const USAGE_FLUSH_MS = 10_000;
/** 모르는 오류 코드가 감시 대상 상관없이 연속 이 횟수면 한도 의심 */
export const UNKNOWN_STREAK = 5;
/** 한 바퀴 송신 차례 상한(43-02 송신 기한 90초의 근거 — 5건 × (10초 + 1초)) */
export const DELIVER_LIMIT = 5;
/** 멈추기 직전 송신 차례 최대 횟수(× DELIVER_LIMIT 건 — 리뷰 WR-05) */
const DRAIN_ROUNDS = 4;
/** 멈추기 직전 송신을 하지 않는 종료 — SIGTERM(남은 시간 없음) · 임대 잃음 · 확인 못 함(남의 차례) */
const DRAIN_SKIP: ReadonlySet<string> = new Set(["aborted", "lease_lost", "lease_unconfirmed"]);
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
    /** 치명 종료의 DART 상태 코드(장애 글 사유 — 43-06) */
    readonly detail: string | null = null,
  ) {
    super(reason);
    this.name = "StopRun";
  }
}

type HaltReason = "quota" | "dart_key" | "dart_bug" | "unknown_streak";

/**
 * 이 실행이 아는 열린 장애(리뷰 WR-02 — 「멈췄습니다」 · 「다시 동작」 짝을 메모리에서도 지킨다).
 * - `noticeSent` — 「멈췄습니다」 가 실제로 나갔나. null = 모름(DB 가 이미 열려 있다고만 답함 → 닫을 때 DB 상태로 확인).
 * - `noticeUnrecorded` — notice 기록 RPC 가 실패해 아직 DB 에 못 적은 값(다음 바퀴마다 다시 적는다).
 * - `nextRecoveredAt` · `recoveredTries` · `recoveredFirstTryAt` · `recoveredErrorLogged` — 「다시 동작」 송신이 실패하면 DB 를
 *   닫지 않고 두었다가 다음 성공 바퀴에 다시 보낸다(재시도 간격 · 120초 넘으면 error 1번).
 */
interface OpenOutage {
  sinceMs: number;
  noticeSent: boolean | null;
  noticeUnrecorded: "sent" | "failed" | null;
  nextRecoveredAt: number;
  recoveredTries: number;
  recoveredFirstTryAt: number | null;
  recoveredErrorLogged: boolean;
}

function openOutageState(sinceMs: number, noticeSent: boolean | null): OpenOutage {
  return {
    sinceMs,
    noticeSent,
    noticeUnrecorded: null,
    nextRecoveredAt: 0,
    recoveredTries: 0,
    recoveredFirstTryAt: null,
    recoveredErrorLogged: false,
  };
}

const HALT_BY_KIND: Partial<Record<string, HaltReason>> = { quota: "quota", key: "dart_key", bug: "dart_bug" };

/** 치명 종료 이유 → 장애 글 사유(D-17 · 공식 API 운영 기준 ④). 여기 없는 종료(seed_failed · error 등)는 장애 글을 쓰지 않는다 */
const FATAL_OUTAGE_REASON: Partial<Record<string, (code: string | null) => string>> = {
  // HTTP 429 · 401 · 403(앞단 차단 신호 — code `HTTP 4xx` · 리뷰 WR-03)은 본문 코드와 구분해 적는다
  quota: (c) => (c?.startsWith("HTTP") ? `요청 제한(${c})` : `하루 조회 한도 초과(${c ?? "020"})`),
  budget_exhausted: () => "자체 하루 예산 소진",
  dart_key: (c) => (c?.startsWith("HTTP") ? `접근 거부(${c})` : `인증키 오류(${c ?? "?"})`),
  dart_bug: (c) => `요청 오류(${c ?? "?"})`,
  unknown_streak: (c) => `모르는 응답 코드 연속(${c ?? "?"})`,
  probe_failed: (c) => `한도 의심 재확인 실패(${c ?? "?"})`,
};

/** 장애 글 사유에 쓰는 감시 대상 이름 */
const WATCH_LABEL: Record<string, string> = {
  tender_offer: "공개매수",
  rights_merger: "주요사항보고서",
  exchange_disclosure: "거래소 수시공시",
  insider_trade_plan: "임원ㆍ주요주주 거래계획",
};
const REASON_MAX = 300;

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
  /** 넣기 연속 실패 — 첫 실패 바퀴 시작 시각 · error 를 이미 남겼나(리뷰 WR-01). 넣기가 되면 null */
  private insertFail: { since: number; logged: boolean } | null = null;
  /** 감시 대상별 마지막 성공 조회 시각(ms) — 늦은 알림 기준점 · 연장 때 DB last_ok 로 */
  private readonly lastOk = new Map<WatchId, number>();
  /** 마지막 조회가 실패한 감시 대상 — 비어야 장애를 닫는다(띄엄 조회 대상이 안 불린 바퀴가 닫지 않게 · 261113-iez) */
  private readonly failing = new Set<WatchId>();
  /** 띄엄 조회 감시 대상(everyMs 있음)별 마지막으로 부른 조회 칸(261113-iez · 실행 메모리) */
  private readonly polledSlot = new Map<WatchId, number>();
  /** 이 실행이 아는 열린 장애(43-06) — 글 · 「다시 동작」 문구의 시작 시각(ms). 같은 장애 동안 다시 열지 않는다 */
  private outage: OpenOutage | null = null;
  /** 시작 때 DB 장애 상태(readState) */
  private dbOutage: { since: string | null; reason: string | null; notice: string | null } = { since: null, reason: null, notice: null };
  private readonly lapState: LapState = newLapState();
  /** 실행 동안 하나인 송신 상태 — 공시 알림 · 장애 글 · 시험 글이 같은 1초 간격 · 60초 18건 · 429 대기를 지난다 */
  private readonly pacer: SendPacer = newSendPacer();
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
        if (err.code === 1) await this.outageOnFatal(err);
      } else if (err instanceof LeaseLostError) {
        this.haveLease = false;
        this.d.log.warn({ err: safeErrorFields(err) }, "lease lost — another run took over; stopping quietly");
        exit = { code: 0, reason: "lease_lost" };
      } else {
        this.d.log.error({ err: safeErrorFields(err), mode }, "collector failed");
        exit = { code: 1, reason: "error" };
      }
    }
    await this.drainBeforeStop(exit);
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
      // 지난 날 못 나간 알림을 닫았다 — 이미 찾아낸 공시가 단체방에 끝내 안 갔다는 뜻이라 error(→ 이메일 · 리뷰 WR-05)
      if (lease.expired > 0) log.error({ expired: lease.expired }, "unsent alerts expired on takeover");
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
    // 시작 점검(장애 판정)은 seed 경로에서 이 seed 바퀴 **뒤**(그 바퀴가 lastOk 를 채운 뒤)에 한다 — 첫 배포 날
    // 기준점 07:02 와 지금의 차이로 가짜 「멈췄습니다」 · 「다시 동작」 짝이 나가지 않게(체커 W1).
    const firstLapAt = mode === "seed" ? await this.seedLap() : this.now();
    await this.startupCheck();

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
    // 첫 바퀴라 조회 칸 기억이 비어 네 감시 대상 전부 조회한다 — 그날 건을 빠짐없이 seeded 로 채운다
    const r = await collectOnce(seedDeps, this.lapState, kstYmd(startedAt), {
      isLate: () => false,
      seed: true,
      isDue: (w) => this.takeSlot(w, startedAt),
    });
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
    const r = await sendPaced(this.lapDeps, this.pacer, testSendText(t0));
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
      throw new StopRun(1, "probe_failed", safeErrorFields(err).code);
    }
  }

  private async loadLastOk(): Promise<void> {
    const st = await this.d.db.readState();
    for (const w of this.d.watches) {
      const ms = Date.parse(st.lastOk[w.id] ?? "");
      if (Number.isFinite(ms)) this.lastOk.set(w.id, ms);
    }
    this.dbOutage = { since: st.outage.since, reason: st.outage.reason, notice: st.outage.notice };
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
    let insertErr: unknown = null;
    try {
      r = await collectOnce(this.lapDeps, this.lapState, kstYmd(startedAt), {
        isLate: (w) => this.isLate(w),
        seed: false,
        isDue: (w) => this.takeSlot(w, startedAt),
      });
    } catch (err) {
      // 넣기 실패 — collectOnce 가 warn(안전 필드) 뒤 던졌다. 임대 잃음만 위로 · 나머지는 다음 바퀴에 다시 넣는다
      if (err instanceof LeaseLostError) throw err;
      insertErr = err;
    }
    if (r) {
      this.insertFail = null;
      this.takeResult(r);
    }

    await this.maintain(this.now(), false);
    await this.deliver();
    await this.retryNoticeRecord();
    if (r) await this.judgeOutage(r);
    else await this.judgeInsertFailure(startedAt, insertErr);

    if (this.halt) await this.stopOnHalt();
  }

  /**
   * 넣기가 연속으로 실패한다(DB · 스키마 문제) — 조회는 성공해도 새 건이 DB 에 못 들어가 알림이 전부 멈춘다. 첫 실패에서
   * 5분(`OUTAGE_AFTER_MS`)을 넘기면 error `dart alert insert failing` 1번(→ 이메일) + 장애 열기(「멈췄습니다」 — D-16 의
   * 「알림이 안 온다」 를 방에도 알린다). 넣기가 다시 되는 바퀴(모든 감시 대상 성공)에 judgeOutage 가 닫는다(리뷰 WR-01).
   */
  private async judgeInsertFailure(startedAt: number, err: unknown): Promise<void> {
    const f = (this.insertFail ??= { since: startedAt, logged: false });
    const now = this.now();
    if (now - f.since <= OUTAGE_AFTER_MS) return;
    const fields = safeErrorFields(err);
    if (!f.logged) {
      f.logged = true;
      this.d.log.error({ err: fields, sinceMs: now - f.since }, "dart alert insert failing");
    }
    if (!isInWindow(now) || this.outage || this.halt) return;
    await this.openOutage(`공시 저장 실패 ${fields.code ?? fields.kind}`, f.since);
  }

  /**
   * 이 바퀴에 그 감시 대상을 부를 차례인가(261113-iez) — 바퀴마다(everyMs null)면 늘 true. 띄엄 조회 대상은 바퀴 시작
   * 시각의 조회 칸이 기억한 칸과 다를 때만 true 이고 그 칸을 기억한다(실패해도 같은 칸 안에서 다시 두드리지 않는다).
   */
  private takeSlot(w: Watch, lapStartMs: number): boolean {
    const slot = pollSlot(lapStartMs, w.everyMs);
    if (slot === null) return true;
    if (this.polledSlot.get(w.id) === slot) return false;
    this.polledSlot.set(w.id, slot);
    return true;
  }

  /** 처음 본 순간 늦은 건인가 — 그 감시 대상 조회 직전에 판정(조회가 오래 걸려도 기준점은 그대로) */
  private isLate(w: WatchId): boolean {
    const now = this.now();
    const everyMs = this.d.watches.find((x) => x.id === w)?.everyMs ?? null;
    return isLateAt(now, coverPointMs(now, this.lastOk.get(w) ?? null), lateGapMs(everyMs));
  }

  private takeResult(r: CollectResult): void {
    for (const x of r.results) {
      if (x.ok && x.okAt !== undefined) this.lastOk.set(x.watch, x.okAt);
      if (x.ok) this.failing.delete(x.watch);
      else this.failing.add(x.watch);
    }
    for (const row of r.inserted) this.pacer.insertedHere.add(row.rcept_no);
    this.stats.inserted += r.inserted.length;
  }

  /** 송신 차례 한 번 — 잡은 수(실패면 0) */
  private async deliver(): Promise<number> {
    try {
      const d = await deliverPending(this.lapDeps, DELIVER_LIMIT, this.pacer);
      this.stats.sent += d.sent;
      this.stats.failed += d.failed;
      return d.claimed;
    } catch (err) {
      if (err instanceof LeaseLostError) throw err;
      // 차례 · 기록 DB 오류는 deliverPending 이 `alert claim failed` · `alert mark failed` 로 남기고 삼킨다 — 여기 오는 건 그 밖 예외
      this.d.log.warn({ err: safeErrorFields(err) }, "deliver failed — retrying next lap");
      return 0;
    }
  }

  /**
   * 멈추기 직전(리뷰 WR-05) — 임대를 쥔 auto 실행은 어떤 이유로 멈추든(예산 · 한도 탐침 실패 · 치명 · 창 끝 · 오류)
   * 이미 넣은 건을 OpenDART 호출 없이 한 번 더 보내 본다(차례가 가득 차면 최대 `DRAIN_ROUNDS` 번). 그 뒤 오늘 못 나간 건
   * (pending · sending)이 남았으면 error `alerts left unsent at stop` — 다음 실행이 곧 이어 보내지 못하면(예산 · 창 끝)
   * 다음 날 expired 로 닫히는 건이라 이메일로 알린다. SIGTERM · 임대 잃음은 하지 않는다(남은 시간이 없거나 남의 차례).
   */
  private async drainBeforeStop(exit: CollectorExit): Promise<void> {
    // seed 는 「송신 0」 이 약속이다(첫 배포 날 · 실패면 사람이 다시 seed) — auto 만
    if (!this.haveLease || this.d.cfg.mode !== "auto") return;
    if (DRAIN_SKIP.has(exit.reason)) return;
    try {
      for (let round = 0; round < DRAIN_ROUNDS; round++) {
        await this.maintain(this.now(), false);
        if ((await this.deliver()) < DELIVER_LIMIT) break;
      }
    } catch (err) {
      if (err instanceof LeaseLostError || (err instanceof StopRun && err.code === 0)) {
        this.haveLease = !(err instanceof LeaseLostError || err.reason === "lease_lost");
        this.d.log.warn({ err: safeErrorFields(err), reason: exit.reason }, "drain before stop interrupted — lease not confirmed");
        return;
      }
      this.d.log.warn({ err: safeErrorFields(err), reason: exit.reason }, "drain before stop failed");
    }
    try {
      const unsent = await this.d.db.countUnsent(this.dateKst());
      if (unsent > 0) this.d.log.error({ unsent, reason: exit.reason }, "alerts left unsent at stop");
    } catch (err) {
      this.d.log.error({ err: safeErrorFields(err), reason: exit.reason }, "unsent count at stop failed");
    }
  }

  /** 치명 DART 신호로 멈춘다 — 장애 열기 · 단체방 글은 run() 의 치명 종료 길(`outageOnFatal`)이 한다 */
  private async stopOnHalt(): Promise<never> {
    const h = this.halt!;
    if (h.reason === "quota" || h.reason === "unknown_streak") await this.recordStrike(h.reason);
    this.d.log.error({ reason: h.reason, err: h.err }, "fatal DART status — stopping this run");
    throw new StopRun(1, h.reason, h.err.code);
  }

  // ── 장애 짝 글(43-06 · D-16 · D-17) ──────────────────────────────
  /**
   * 시작 점검 — auto 는 임대 · 예산 · 탐침 · 기준점 뒤 첫 바퀴 전, seed 는 seed 바퀴 뒤 첫 auto 바퀴 전.
   * - DB 에 열린 장애가 있으면 이 실행이 이어받는다(첫 성공 바퀴에 닫음). notice 가 pending(연 실행이 글 전에 죽음)이면
   *   open 을 다시 불러 opened true 를 받은 이 실행이 「멈췄습니다」 를 보낸다.
   * - 열린 장애가 없고 어떤 감시 대상이든 기준점에서 5분 넘게 지났으면(수집기가 죽어 있었음) 「수집기 중단」 으로 연다 —
   *   첫 바퀴 성공에 곧바로 「다시 동작」 이 나가 두 글이 몇 초 간격으로 붙어도 합치지 않는다(D-16 문자 그대로 · 가정 4).
   * 창 밖(창 밖 seed)이면 하지 않는다.
   */
  private async startupCheck(): Promise<void> {
    const now = this.now();
    if (!isInWindow(now)) return;
    const dbSinceMs = Date.parse(this.dbOutage.since ?? "");
    if (Number.isFinite(dbSinceMs)) {
      this.outage = openOutageState(dbSinceMs, this.dbOutage.notice === "sent");
      // 다시 열 때 글 사유는 처음 연 실행의 것(DB outage_reason) — 없으면 「수집기 중단」(리뷰 IN-01)
      if (this.dbOutage.notice === "pending") await this.openOutage(this.dbOutage.reason ?? this.stalledReason(now), dbSinceMs, true);
      return;
    }
    const stale = this.d.watches.filter((w) => now - this.coverOf(now, w.id) > OUTAGE_AFTER_MS);
    if (stale.length === 0) return;
    const since = Math.min(...stale.map((w) => this.coverOf(now, w.id)));
    await this.openOutage(this.stalledReason(now), since);
  }

  /** 「수집기 중단(마지막 조회 HH:MM)」 — 오늘 성공 조회가 하나도 없으면 「오늘 조회 기록 없음」 */
  private stalledReason(now: number): string {
    const today = [...this.lastOk.values()].filter((ms) => kstYmd(ms) === kstYmd(now));
    return today.length === 0 ? "수집기 중단(오늘 조회 기록 없음)" : `수집기 중단(마지막 조회 ${kstLabel(Math.min(...today), false)})`;
  }

  private coverOf(now: number, w: WatchId): number {
    return coverPointMs(now, this.lastOk.get(w) ?? null);
  }

  /**
   * 바퀴 끝 판정 — 이 바퀴 실패가 없고 모든 감시 대상의 마지막 조회가 성공(`failing` 빔)이면 열린 장애를 닫고,
   * 실패한 감시 대상 중 기준점에서 5분 넘게 성공이 없는 것이 있으면 연다(한 번만 · 이미 열려 있으면 아무것도 안 함).
   * 치명 신호 바퀴는 치명 종료 길이 연다.
   */
  private async judgeOutage(r: CollectResult): Promise<void> {
    const now = this.now();
    if (!isInWindow(now)) return;
    const failed = r.results.filter((x) => !x.ok);
    if (failed.length === 0) {
      // 이 바퀴에 안 불린 띄엄 조회 대상(I001 · D005)이 아직 실패 중이면 닫지 않는다 — 그 대상이 다시 성공한 바퀴에 닫는다
      if (this.outage && this.failing.size === 0) await this.closeOutage();
      return;
    }
    if (this.outage || this.halt) return;
    const stale = failed.filter((x) => now - this.coverOf(now, x.watch) > OUTAGE_AFTER_MS);
    if (stale.length === 0) return;
    const since = Math.min(...stale.map((x) => this.coverOf(now, x.watch)));
    const reason = stale.map((x) => `${WATCH_LABEL[x.watch] ?? x.watch} ${errBrief(x.error)}`).join(" · ");
    await this.openOutage(reason, since);
  }

  /**
   * 장애 열기 — `open` 이 opened true 를 준 실행만 「⚠ 멈췄습니다」 1건 → notice sent/failed 기록 → error `dart outage opened`
   * (→ 43-07 로그 일치 이메일). opened false 면 이미 열린 장애(글을 이미 남김)라 메모리에만 적는다.
   * `LeaseLostError` 는 위로, 그 밖 DB 오류는 error 로그 뒤 다음 기회(다음 바퀴 · 다음 실행)에 다시.
   */
  private async openOutage(reasonIn: string, sinceMs: number, reopen = false): Promise<void> {
    const { db, log } = this.d;
    const reason = reasonIn.replace(/\s+/g, " ").trim().slice(0, REASON_MAX);
    let res: Record<string, unknown>;
    try {
      // 시작 시각 = 워커 기준점(p_since) — DB outage_since 와 글의 「HH:MM 부터」 · 「HH:MM ~」 가 같은 값이 된다(리뷰 IN-01)
      res = await db.outage("open", reason, new Date(sinceMs).toISOString());
    } catch (err) {
      if (err instanceof LeaseLostError) throw err;
      log.error({ err: safeErrorFields(err), reason }, "dart outage open failed");
      return;
    }
    // DB 가 적은 시작 시각(다시 연 장애면 처음 시각 · 새 장애면 잘라 맞춘 기준점)을 글 · 「다시 동작」 에 그대로 쓴다
    const dbSince = Date.parse(String(res.since ?? ""));
    if (Number.isFinite(dbSince)) sinceMs = dbSince;
    if (res.opened !== true) {
      // DB 에 이미 열린 장애(글을 이미 남김) — sent 인지 failed 인지는 닫을 때 DB 로 확인한다
      this.outage = openOutageState(sinceMs, null);
      log.info({ reason }, "dart outage already open — not posting again");
      return;
    }
    const o = (this.outage = openOutageState(sinceMs, false));
    const sent = await this.sendNotice(outageText(sinceMs, reason));
    const notice = sent?.kind === "ok" ? "sent" : "failed";
    o.noticeSent = sent?.kind === "ok";
    if (sent !== null) {
      try {
        await db.outage("notice", notice);
      } catch (err) {
        if (err instanceof LeaseLostError) throw err;
        // DB 는 pending 으로 남는다 — 다음 바퀴마다 다시 적는다(못 적은 채 실행이 바뀌면 다음 실행이 같은 글을 한 번 더 올린다)
        o.noticeUnrecorded = notice;
        log.error({ err: safeErrorFields(err), notice }, "dart outage notice record failed");
      }
    }
    log.error(
      {
        reason,
        since: new Date(sinceMs).toISOString(),
        notice: sent === null ? "not_sent" : notice,
        reopen,
        ...(sent && sent.kind !== "ok" ? { telegram: telegramSafeFields(sent) } : {}),
      },
      "dart outage opened",
    );
  }

  /**
   * 장애 닫기 — 「멈췄습니다」 가 실제로 나갔을 때만(notify) 「✅ 다시 동작」 1건 **보낸 뒤** DB close · info `dart outage closed`.
   * 「다시 동작」 송신이 실패하면 DB 를 열어 둔 채 warn 뒤 다음 성공 바퀴에 다시 보낸다(짝이 깨지지 않게 · 실행이 바뀌어도
   * 다음 실행이 DB 의 열린 장애를 이어받아 보낸다). 120초 넘게 못 보내면 error 1번(리뷰 WR-02).
   * notify 는 메모리(이 실행이 보냈나 · 이어받을 때 DB notice)로 판정한다 — notice 기록 RPC 가 실패해 DB 가 pending 이어도 짝을 지킨다.
   */
  private async closeOutage(): Promise<void> {
    const { db, log } = this.d;
    const o = this.outage;
    if (!o) return;
    if (o.noticeSent === null) o.noticeSent = await this.dbNoticeSent();
    const now = this.now();
    let sent: SendResult | null = null;
    if (o.noticeSent) {
      if (now < o.nextRecoveredAt) return;
      sent = await this.sendNotice(recoveredText(o.sinceMs, now));
      if (sent?.kind !== "ok") {
        this.recoveredFailed(o, sent);
        return;
      }
    }
    let res: Record<string, unknown>;
    try {
      res = await db.outage("close");
    } catch (err) {
      if (err instanceof LeaseLostError) throw err;
      // 「다시 동작」 은 이미 나갔다 — 다시 보내지 않고 close 만 다음 바퀴에 다시
      if (sent?.kind === "ok") o.noticeSent = false;
      log.warn({ err: safeErrorFields(err) }, "dart outage close failed — retrying next lap");
      return;
    }
    this.outage = null;
    log.info(
      { closed: res.closed === true, notify: sent !== null, sent: sent === null ? null : sent.kind, recoveredTries: o.recoveredTries + (sent ? 1 : 0) },
      "dart outage closed",
    );
  }

  /** 「다시 동작」 송신 실패 — DB 는 열어 둔 채 재시도 간격을 늘리고 warn, 처음 시도에서 120초가 넘으면 error 1번 */
  private recoveredFailed(o: OpenOutage, sent: SendResult | null): void {
    const now = this.now();
    o.recoveredTries += 1;
    o.recoveredFirstTryAt ??= now;
    o.nextRecoveredAt = now + Math.min(RETRY_MAX_S, RETRY_BASE_S * 2 ** (o.recoveredTries - 1)) * 1000;
    const fields = {
      tries: o.recoveredTries,
      sinceFirstTryS: Math.round((now - o.recoveredFirstTryAt) / 1000),
      ...(sent ? { telegram: telegramSafeFields(sent) } : { telegram: null }),
    };
    this.d.log.warn(fields, "dart outage recovered notice failed — keeping outage open, retrying");
    if (!o.recoveredErrorLogged && now - o.recoveredFirstTryAt > UNSENT_ERROR_MS) {
      o.recoveredErrorLogged = true;
      this.d.log.error(fields, "dart outage recovered notice unsent over 120s");
    }
  }

  /** 이어받았지만 notice 를 모르는 열린 장애 — DB 상태 표의 notice 가 sent 인가(읽기 실패면 false · warn) */
  private async dbNoticeSent(): Promise<boolean> {
    try {
      return (await this.d.db.readState()).outage.notice === "sent";
    } catch (err) {
      this.d.log.warn({ err: safeErrorFields(err) }, "dart outage notice read failed — not posting recovered notice");
      return false;
    }
  }

  /** notice 기록 RPC 가 실패했던 값을 다시 적는다(리뷰 WR-02) — 실패면 warn 뒤 다음 바퀴 */
  private async retryNoticeRecord(): Promise<void> {
    const o = this.outage;
    if (!o?.noticeUnrecorded) return;
    try {
      await this.d.db.outage("notice", o.noticeUnrecorded);
      this.d.log.info({ notice: o.noticeUnrecorded }, "dart outage notice recorded on retry");
      o.noticeUnrecorded = null;
    } catch (err) {
      if (err instanceof LeaseLostError) throw err;
      this.d.log.warn({ err: safeErrorFields(err), notice: o.noticeUnrecorded }, "dart outage notice record retry failed");
    }
  }

  /**
   * 장애 짝 글 송신 — 공시 알림과 같은 pacer(429 대기 · 1초 간격 · 60초 18건). 기다리는 동안 임대 연장 · flush 는 하되
   * 예산 문은 닫지 않는다(치명 종료 길에서도 부른다). null = SIGTERM 으로 보내지 못함(DB notice 는 pending 으로 남아
   * 다음 실행이 시작 점검에서 다시 연다).
   */
  private async sendNotice(text: string): Promise<SendResult | null> {
    for (let now = this.now(), ready = this.pacer.readyAt(now); now < ready; now = this.now(), ready = this.pacer.readyAt(now)) {
      if (this.d.signal?.aborted) return null;
      await this.maintain(now, false);
      await this.d.sleep(Math.min(ready - now, WAIT_STEP_MS));
    }
    if (this.d.signal?.aborted) return null;
    return sendPaced(this.lapDeps, this.pacer, text);
  }

  /**
   * 치명 종료(020 · 예산 소진 · 키 · 버그 · 모르는 코드 연속 · 탐침 실패) 직전 장애 글. 임대가 있고 창 안이고 아직 열린 장애가
   * 없을 때만. 장애 글 · DB 기록이 실패해도 종료 코드는 그대로 1 — 실패 사유는 로그에 남긴다.
   */
  private async outageOnFatal(stop: StopRun): Promise<void> {
    const reasonOf = FATAL_OUTAGE_REASON[stop.reason];
    if (!reasonOf || !this.haveLease || this.outage || !isInWindow(this.now())) return;
    try {
      await this.openOutage(reasonOf(stop.detail), this.now());
    } catch (err) {
      // 글을 쓰는 사이 임대를 잃음(연장 거절 · 55000) — 다른 실행이 정상으로 넘겨받았다. 이메일 대상 아님 → warn(리뷰 IN-04)
      if (err instanceof LeaseLostError || (err instanceof StopRun && err.code === 0)) {
        if (err instanceof LeaseLostError || err.reason === "lease_lost") this.haveLease = false;
        this.d.log.warn({ err: safeErrorFields(err), reason: stop.reason }, "dart outage open skipped — lease lost while posting");
        return;
      }
      this.d.log.error({ err: safeErrorFields(err), reason: stop.reason }, "dart outage open failed");
    }
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

/** 장애 사유 한 줄용 오류 요약 — 종류 · 코드만(비밀 없음) */
function errBrief(e: SafeErrorFields | undefined): string {
  if (!e) return "조회 실패";
  return e.code ? `${e.kind} ${e.code}` : e.kind;
}

/** 실패한 DART 호출이 쓴 호출 수 — DartApiError 의 calls(쪽 넘김 중 실패) · 없으면 1 */
function callsOf(err: unknown): number {
  return err instanceof DartApiError ? (err.calls ?? 1) : 1;
}
