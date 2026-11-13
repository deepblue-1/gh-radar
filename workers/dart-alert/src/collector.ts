import { BUDGET_WARN_RATIO, budgetStateOf, kstDateString } from "./apiUsage";
import { coverPointMs, everyMsAt, isInWindow, isLateAt, kstYmd, lapIntervalMs, lateGapMs, pollSlot, prevWeekdayYmd } from "./cadence";
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
import type { DartKeyId, JudgeOptions, Watch, WatchId } from "./watches";

/**
 * Phase 43-05 — 공시 알림 수집기 루프(장기 실행 Cloud Run Job 한 실행). kis-news-sync collector 골격을
 * 「다음 바퀴 시각」 고정 간격 루프로 단순화했다(200ms 걸음 · 토큰 버킷 · 대상 순서 없음).
 *
 * 흐름(번호 = 실행 순서):
 *   ① 모드 — auto 이고 평일 `07:00` ~ `20:00` 창 밖이면 호출 0 · 종료 0 `outside_window`.
 *      test-send = OpenDART · 임대 없이 시험 글 1건(`test-send ok`) · probe = 임대 없이 키 2 로 거래소 수시공시 1쪽 1회(`probe ok`) ·
 *      seed = ② ~ ⑤ 뒤 seed 바퀴(그날 건 + 직전 평일 건을 `seeded` 로 · 송신 0 · `seed done`) → 같은 실행이 ⑥ 으로 이어 간다
 *      (창 밖 seed 는 seed 바퀴 1번 뒤 곧바로 `window_end`).
 *   ② 임대 — `dart_alert_lease_acquire(holder, 90초)`. 못 잡으면 다른 실행이 돈다 → OpenDART 0 · 텔레그램 0 · 종료 0
 *      (seed 만 error `seed skipped — lease held by another run …` · 종료 1 `seed_lease_held` — 리뷰 WR-04).
 *      새로 잡으며 DB 가 오늘 `sending` 을 `pending` 으로 되돌렸으면(reclaimed > 0) warn `possible duplicate after takeover`
 *      — 그 건들은 첫 바퀴 차례에서 이어 보낸다(SC-5 · 드문 중복은 받아들임).
 *   ③ 예산 — 쓰는 키마다 `api_usage`(키 1 `opendart_list` · 키 2 `opendart_list_k2` · KST 날짜)가 하루 예산 이상이면 그 키
 *      감시 대상을 부르지 않는다(그 키 레인 멈춤). 쓰는 키가 전부 찼으면 OpenDART 를 부르지 않고 종료 0.
 *   ④ 탐침 — 쓰는 키마다 오늘 그 키 한도 의심 표시가 있으면 그 키로 단독 탐침 1건 → 실패면 그 키 레인만 멈추고(5분 뒤
 *      재탐침) 다른 키는 수집 · 쓰는 키가 전부 멈추면 종료 1. 성공해야 그 키 수집 재개.
 *   ⑤ 기준점 — DB `last_ok`(감시 대상별 마지막 성공 조회 + 오늘 아침 전날 확인 표시 `prevday:<감시 대상 id>`)를 메모리로.
 *   ⑥ 루프 — 바퀴 = 감시 대상 순서대로 조회 → 새 건 넣기(늦은 알림 판정은 조회 **전**) → 송신 차례 5건.
 *      감시 대상별 조회 칸(261113-iez · rn7): 조회 간격이 있는 감시 대상(B001 09:00 뒤 10초 · I001 10초 · 30초 칸)은 바퀴 시작
 *      시각의 칸(07:00 기준)이 지난 조회 칸과 다를 때만 부른다(`takeSlot` — 성공 · 실패와 무관하게 칸을 기록 · 밀린 칸을
 *      몰아서 부르지 않는다 · 실행이 바뀌면 첫 바퀴에 전부 · 멈춘 키의 감시 대상은 칸을 쓰지 않는다).
 *      바퀴 시작에 멈춘 키 중 재탐침 시각이 된 키는 단독 탐침 1건(`retryPausedLanes`) · 바퀴 끝에 새로 멈춘 키를 정리
 *      (`settleHalts`).
 *      다음 바퀴 = 이번 바퀴 시작 + 간격(종일 5초 — cadence.ts). 이미 지났으면 곧바로 —
 *      밀린 바퀴를 몰아서 부르지 않는다. KST 20:00(창 끝)이면 종료 0 `window_end`.
 *      기다리는 동안 · 바퀴 시작 · 송신 직전: 30초마다 임대 연장(+ `last_ok` 저장) · 10초마다 사용량 flush.
 *   ⑦ 끝 — 정상 · 오류 · SIGTERM 모두 사용량 flush · 임대를 가졌으면 해제. 그 전에 임대를 쥔 auto 실행은(SIGTERM · 임대 잃음 밖)
 *      이미 넣은 건을 OpenDART 호출 없이 한 번 더 보내 보고, 오늘 못 나간 건이 남으면 error `alerts left unsent at stop`(리뷰 WR-05).
 *
 * 결정 · 규칙:
 *   D-10(사용자 결정 2026-11-13 이 대체) · SC-4 평일 하루 9,360바퀴(종일 5초). 키별 하루 호출(cadence.ts `plannedDailyCalls`):
 *     키 1 = D004 9,360 + B001 5,400 = 14,760 · 키 2 = I001 10초 4,680 + 30초 감시 대상마다 1,560 + I001 추가 쪽 —
 *     키마다 예산 15,000 이하. 호출 수는 실패 호출까지 센다 — `dart.list` 를 감싸 호출이 끝날 때마다 그 키 `usage.add`
 *     (10초 묶음 flush).
 *   D-11 창 밖 · 주말은 auto 가 아무것도 하지 않는다(휴장일 달력 없음).
 *   D-12 「(늦은 알림)」 — 처음 본 시각이 그 감시 대상의 커버 기준점(오늘 마지막 성공 조회 · 없으면 07:02)에서
 *     60초 + 그 시각 그 감시 대상 조회 간격(D004 60초 · B001 09:00 전 60초 · 뒤 70초 · I001 70초 · 30초 칸 감시 대상 90초 —
 *     `lateGapMs(everyMsAt(…))`) 넘게 뒤면 늦은 건. 정상 5초 바퀴 · 정상 10초 · 30초 조회는 절대 늦지 않고 수집기가 비어
 *     있던 시간(아침 장애 · 인계)만 늦음.
 *     조회는 오늘(KST) 날짜로만 해서 지난 날짜 건은 오지 않는다 — 예외는 아래 아침 전날 확인.
 *   U-3 아침 전날 확인(261113-rn7): 그날 감시 대상별 첫 성공 조회 직후 직전 평일(월 → 금 · 휴장일 달력 없음 · cadence.ts
 *     `prevWeekdayYmd`)을 전 쪽으로 1번 더 조회해 DB 에 없는 통과 건을 「(늦은 알림)」 으로 보낸다(lap.ts). 하루 한 번 —
 *     성공한 감시 대상만 KST 오늘 날짜로 표시하고(`prevDayDone`) 임대 연장 때 DB `last_ok` 의 `prevday:<id>` 로 싣는다
 *     (jsonb 병합 — 재기동 · 임대 교대에도 되풀이 안 함). 전날 조회가 실패하거나 넣기가 실패하면 표시하지 않아 다시 하되 —
 *     감시 대상마다 KST 하루 3번(`PREV_DAY_MAX_TRIES`) · 시도 사이 5분(`PREV_DAY_RETRY_MS`) 상한(전날 조회를 시작할 때 센다 ·
 *     메모리만 — 재기동이면 다시 3번). 3번 다 표시를 못 남기면 warn `prevday sweep gave up` 1번 뒤 그날은 하지 않는다(DB 표시는
 *     남기지 않음 — 보고 스크립트의 「전날 확인(오늘)」 이 거짓 완료를 세지 않게). 전날 조회 오류는 한도 신호(020 · HTTP 429)만
 *     그 키를 멈추고 그 밖은 warn 뿐이다(리뷰 WR-01 — 전날 날짜에만 오는 코드로 오늘 조회까지 멈추지 않게).
 *     seed 바퀴는 표시와 무관하게 모든 감시 대상의 직전 평일도 seeded 로 채우고 표시를 남긴다 — 종류를 넓힌 배포 날 저녁에
 *     seed 를 돌리면 다음 아침 전날 확인이 쏟아내지 않는다.
 *   SC-2 한 실행만 — 임대 TTL 90초 · 30초 연장. 연장 거절 → 조용히 종료 0 `lease_lost` · 연장 DB 오류가 60초
 *     이어지면(남이 넘겨받을 수 있는 시점 전) 종료 0 `lease_unconfirmed` · 넣기 · 차례 · 기록 RPC 의 55000
 *     (43-02 어댑터가 `LeaseLostError` 로 바꿈) → 종료 0 `lease_lost`.
 *     긴 바퀴(체커 I-2): 연장 점검을 기다리는 동안만이 아니라 바퀴 시작 · 송신 직전에도 한다(30초 시간 문이라 RPC 수는
 *     늘지 않는다) → 직전 연장 뒤 최대 경과 ≈ 30초 + 송신 한 번(최악 약 55초) < TTL 90초. 그보다 긴 경우는 기록
 *     RPC 55000 → 종료 0 → 다음 깨움이 인계해 이어 보낸다(손실 없이 스스로 낫는 위험 · 상수는 바꾸지 않는다).
 *   공식 API 운영 기준 ④ 한도 · 차단 신호에 재시도로 두드리지 않는다 — **키별 레인**(261113-rn7 U-2): `020` → 그 키 한도
 *     의심 표시 + 그 키 멈춤 `quota` · 키 오류(010 · 011 · 012 · 901) → `dart_key` · 코드 버그(100 · 101) → `dart_bug` ·
 *     모르는 코드가 그 키 감시 대상 상관없이 연속 5번 → 그 키 한도 의심 표시 + `unknown_streak`. 치명 신호를 받으면 그 키의
 *     남은 감시 대상 조회를 건너뛰고(호출 0) 바퀴 끝(`settleHalts`)에 error `dart key paused — other key keeps running` +
 *     장애 글. 다른 키 감시 대상은 계속 돈다. 막힌 키는 5분(`KEY_PROBE_RETRY_MS`)마다 단독 탐침 1건으로만 재확인해 통과하면
 *     자동 재개한다. **쓰는 키가 전부 막히면** 지금처럼 error `fatal DART status — stopping this run` 뒤 종료 1(그 이유).
 *     `800` · `900` · 5xx · 네트워크 · 깨진 본문은 그 감시 대상만 실패하고 다음 바퀴 계속(warn).
 *   SC-4 키마다 예산의 80% 에서 warn 1번 · 다다르면 그 키를 그날 멈춘다(탐침 없음) · 쓰는 키가 전부 다다르면 error 와 함께
 *     종료 1 `budget_exhausted`.
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
 *   키 하나가 멈추면(261113-rn7) 「⚠ … (막힌 키의 감시 대상 이름들 — 사유)」 로 연다. DB 장애 칸이 한 줄이라 장애 글은 한 쌍이다 —
 *   먼저 막힌 키의 사유로 열고, 열린 동안 다른 키까지 막히면 단체방 글은 더 없고 error 로그(→ 운영자 메일)만. 멈춘 키가
 *   하나라도 있으면 닫지 않는다(두 키 모두 회복해야 「다시 동작」). 열린 동안 그 장애를 연 키가 아닌 키의 감시 대상이 기준점에서
 *   5분 넘게 실패하면(일시 오류 — 멈춤 신호 아님) error `dart outage widened — other key failing` 을 장애 1건당 1번(리뷰 WR-02 —
 *   열린 글이 「키 2 쪽만」 이라 말하는 동안 공개매수 공백이 아무에게도 안 보이는 사각을 메일로 덮는다 · 단체방 글은 한 쌍 그대로).
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
/** 모르는 오류 코드가 그 키 감시 대상 상관없이 연속 이 횟수면 한도 의심 */
export const UNKNOWN_STREAK = 5;
/** 멈춘 키를 단독 탐침 1건으로 다시 확인하는 간격(옛 「다음 5분 깨움이 탐침 1건」 과 같은 빈도 · 261113-rn7) */
export const KEY_PROBE_RETRY_MS = 300_000;
/** 아침 전날 확인 — 감시 대상마다 KST 하루 시도 상한 · 시도 사이 최소 간격(리뷰 WR-01 — 넣기 · 전날 조회 실패 때 바퀴마다 되풀이 막음) */
export const PREV_DAY_MAX_TRIES = 3;
export const PREV_DAY_RETRY_MS = 300_000;
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
    /** 사용량 · 한도 의심 표시는 키마다 따로(261113-rn7 — 키 1 `opendart_list` · 키 2 `opendart_list_k2`) */
    usage: {
      read(dateKst: string, key: DartKeyId): Promise<number>;
      add(n: number, key: DartKeyId): void;
      /** 새 누적 — 모은 것이 없으면 null */
      flush(dateKst: string, key: DartKeyId): Promise<number | null>;
    };
    strikes: {
      read(dateKst: string, key: DartKeyId): Promise<number>;
      record(dateKst: string, key: DartKeyId): Promise<number>;
    };
  };
  dart: {
    /**
     * 그날 · 감시 대상 하나의 행(쪽 넘김 포함 · 키는 `watch.key`) — 실패는 `DartApiError`(calls 실림).
     * `fullRead` = 쪽 넘김 기억 없이 전 쪽(아침 전날 확인 — 오늘 조회의 기억은 건드리지 않는다) · `prevDay` 는 수집기 안에서만
     * 쓰는 표시(전날 조회 — 한도 신호 밖 오류로 키를 멈추지 않음 · 리뷰 WR-01)라 여기서는 무시해도 된다.
     */
    list(watch: Watch, day: string, opts?: { fullRead?: boolean; prevDay?: boolean }): Promise<{ rows: DartRow[]; calls: number }>;
    /** 단독 탐침 — 그 키로 1쪽 1회(키 1 공개매수 · 키 2 거래소 수시공시) */
    probe(day: string, key: DartKeyId): Promise<{ total: number; calls: number }>;
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
/** 키 레인이 멈춘 이유 — 치명 DART 신호 + 예산 소진 · 시작 탐침 실패 */
type PauseReason = HaltReason | "budget_exhausted" | "probe_failed";

/**
 * 키별 레인(261113-rn7 U-2) — 사용량 · 80% 경고 · 모르는 코드 연속 · 멈춤 · 재탐침을 키마다 따로 든다.
 * `paused.fresh` = 이번 바퀴(또는 시작)에 새로 멈춤 — 바퀴 끝 `settleHalts` 가 로그 · 장애 글 · 한도 의심 표시를 정리하고 끈다.
 * `retryAt` = 단독 탐침 시각(멈춘 시각 + 5분) · 예산 소진은 Infinity(그날 다시 부르지 않음).
 */
interface KeyLane {
  key: DartKeyId;
  watches: Watch[];
  usedKnown: number;
  sinceFlush: number;
  warned80: boolean;
  unknownStreak: number;
  paused: { reason: PauseReason; code: string | null; err: SafeErrorFields | null; retryAt: number; fresh: boolean } | null;
}

/**
 * 이 실행이 아는 열린 장애(리뷰 WR-02 — 「멈췄습니다」 · 「다시 동작」 짝을 메모리에서도 지킨다).
 * - `noticeSent` — 「멈췄습니다」 가 실제로 나갔나. null = 모름(DB 가 이미 열려 있다고만 답함 → 닫을 때 DB 상태로 확인).
 * - `noticeUnrecorded` — notice 기록 RPC 가 실패해 아직 DB 에 못 적은 값(다음 바퀴마다 다시 적는다).
 * - `nextRecoveredAt` · `recoveredTries` · `recoveredFirstTryAt` · `recoveredErrorLogged` — 「다시 동작」 송신이 실패하면 DB 를
 *   닫지 않고 두었다가 다음 성공 바퀴에 다시 보낸다(재시도 간격 · 120초 넘으면 error 1번).
 * - `keys` — 이 장애를 연 키(그 키 감시 대상의 실패는 열린 글이 덮는다) · null = 모름(DB 에서 이어받은 장애) ·
 *   `widenedLogged` — 다른 키 실패 error 를 이 장애에서 이미 남겼나(리뷰 WR-02 · 장애가 닫히면 상태째 사라진다).
 */
interface OpenOutage {
  sinceMs: number;
  noticeSent: boolean | null;
  noticeUnrecorded: "sent" | "failed" | null;
  nextRecoveredAt: number;
  recoveredTries: number;
  recoveredFirstTryAt: number | null;
  recoveredErrorLogged: boolean;
  keys: ReadonlySet<DartKeyId> | null;
  widenedLogged: boolean;
}

function openOutageState(sinceMs: number, noticeSent: boolean | null, keys: ReadonlySet<DartKeyId> | null = null): OpenOutage {
  return {
    sinceMs,
    noticeSent,
    keys,
    widenedLogged: false,
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

/** 장애 글 사유에 쓰는 감시 대상 이름(scripts/dart-alert-report.sh `watchLabel` 과 같은 글자) */
const WATCH_LABEL: Record<string, string> = {
  tender_offer: "공개매수",
  rights_merger: "주요사항보고서",
  market_action: "거래소 시장조치",
  exchange_disclosure: "거래소 수시공시",
  largest_holder_change: "최대주주 소유주식 변동",
  insider_trade_plan: "임원ㆍ주요주주 거래계획",
};
/** DB `last_ok` 안의 아침 전날 확인 표시 키 앞머리 — 값 = 확인한 KST 날짜(YYYY-MM-DD) · 보고 스크립트가 같은 글자를 쓴다 */
export const PREV_DAY_MARK_PREFIX = "prevday:";
const REASON_MAX = 300;

export async function runCollector(deps: CollectorDeps): Promise<CollectorExit> {
  return new Collector(deps).run();
}

class Collector {
  private haveLease = false;
  private lastLeaseOkAt = 0;
  private nextLeaseAt = Number.POSITIVE_INFINITY;
  private nextFlushAt = Number.POSITIVE_INFINITY;
  /** 키별 레인(키 1 · 2 고정) */
  private readonly lanes: Map<DartKeyId, KeyLane>;
  /** 이 실행이 쓰는 키 — 감시 대상이 하나 이상인 키(probe 모드는 키 2 하나) */
  private readonly usedKeys: DartKeyId[];
  /** 마지막으로 멈춘 레인 — 쓰는 키가 전부 멈췄을 때의 종료 이유 */
  private lastPaused: KeyLane | null = null;
  /** 넣기 연속 실패 — 첫 실패 바퀴 시작 시각 · error 를 이미 남겼나(리뷰 WR-01). 넣기가 되면 null */
  private insertFail: { since: number; logged: boolean } | null = null;
  /** 감시 대상별 마지막 성공 조회 시각(ms) — 늦은 알림 기준점 · 연장 때 DB last_ok 로 */
  private readonly lastOk = new Map<WatchId, number>();
  /** 마지막 조회가 실패한 감시 대상 — 비어야 장애를 닫는다(띄엄 조회 대상이 안 불린 바퀴가 닫지 않게 · 261113-iez) */
  private readonly failing = new Set<WatchId>();
  /** 감시 대상별 아침 전날 확인을 한 KST 날짜(YYYY-MM-DD · 261113-rn7 U-3) — DB 에서 불러온 오늘 표시 + 이 실행 표시 */
  private readonly prevDayDone = new Map<WatchId, string>();
  /** 이 실행이 새로 남긴 전날 확인 표시 — 임대 연장 때 DB last_ok 로 싣는다(불러온 표시는 이미 DB 에 있다) */
  private readonly prevDayMarksHere = new Set<WatchId>();
  /** 감시 대상별 오늘 전날 확인 시도(KST 날짜 · 횟수 · 마지막 시도 바퀴 시각) — 전날 조회를 시작할 때 센다(리뷰 WR-01 · 메모리만) */
  private readonly prevDayTries = new Map<WatchId, { day: string; count: number; lastAt: number }>();
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
    const lane = (key: DartKeyId): KeyLane => ({
      key,
      watches: d.watches.filter((w) => w.key === key),
      usedKnown: 0,
      sinceFlush: 0,
      warned80: false,
      unknownStreak: 0,
      paused: null,
    });
    this.lanes = new Map<DartKeyId, KeyLane>([
      [1, lane(1)],
      [2, lane(2)],
    ]);
    this.usedKeys = d.cfg.mode === "probe" ? [2] : ([1, 2] as const).filter((k) => this.lanes.get(k)!.watches.length > 0);
    this.lapDeps = {
      watches: d.watches,
      judge: d.judge,
      log: d.log,
      clock: d.clock,
      sleep: d.sleep,
      dart: { list: (w, day, opts) => this.countedList(w, day, opts) },
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

  private laneOf(key: DartKeyId): KeyLane {
    return this.lanes.get(key)!;
  }

  /** 이 실행이 쓰는 키의 레인 */
  private usedLanes(): KeyLane[] {
    return this.usedKeys.map((k) => this.laneOf(k));
  }

  /** 쓰는 키가 전부 멈췄나 */
  private allPaused(): boolean {
    const lanes = this.usedLanes();
    return lanes.length > 0 && lanes.every((l) => l.paused !== null);
  }

  private anyPaused(): boolean {
    return this.usedLanes().some((l) => l.paused !== null);
  }

  /** 아직 정리 안 된(이번 바퀴 · 시작에 새로) 멈춤이 있나 — 장애 열기는 `settleHalts` 몫 */
  private hasFreshPause(): boolean {
    return this.usedLanes().some((l) => l.paused?.fresh === true);
  }

  /** 레인을 멈춘다(이미 멈췄으면 그대로) — 예산 소진은 재탐침 없음 */
  private pauseLane(l: KeyLane, reason: PauseReason, err: SafeErrorFields | null, fresh = true): void {
    if (l.paused) return;
    l.paused = {
      reason,
      code: err?.code ?? null,
      err,
      retryAt: reason === "budget_exhausted" ? Number.POSITIVE_INFINITY : this.now() + KEY_PROBE_RETRY_MS,
      fresh,
    };
    this.lastPaused = l;
  }

  /** 그 키 감시 대상 이름들 — 장애 글 사유 앞머리 */
  private laneLabel(l: KeyLane): string {
    return l.watches.map((w) => WATCH_LABEL[w.id] ?? w.id).join(" · ");
  }

  /** 키별 오늘 사용량(stop 로그) */
  private usedToday(): { k1: number; k2: number } {
    const used = (k: DartKeyId) => this.laneOf(k).usedKnown + this.laneOf(k).sinceFlush;
    return { k1: used(1), k2: used(2) };
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
      { mode, ...exit, ...this.stats, usedToday: this.usedToday(), durationMs: this.now() - t0 },
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
        // seed 는 사람이 배포 직후 한 번 돌리는 실행 — 아무것도 채우지 못했는데 종료 0 이면 「성공」 으로 보여 빠뜨린 채 다음
        // 아침 전날 확인이 쏟아진다. error + 종료 1 로 실행 실패를 드러낸다(리뷰 WR-04 · auto 는 그대로 종료 0)
        if (mode === "seed") {
          log.error({ mode }, "seed skipped — lease held by another run, nothing inserted (run seed again)");
          return { code: 1, reason: "seed_lease_held" };
        }
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

    // ③ 예산 — 쓰는 키마다(다 찬 키는 멈춤 · 전부 찼으면 종료 0)
    if (!(await this.budgetAtStart(t0))) return { code: 0, reason: "budget_at_start" };

    if (mode === "probe") return this.probeMode();

    // ④ 한도 의심 탐침 — 쓰는 키마다(키 1 → 키 2) 그 키 표시가 있고 예산으로 멈추지 않았으면 그 키로 1건
    for (const l of this.usedLanes()) {
      if (l.paused) continue;
      const strikes = await db.strikes.read(this.dateKst(), l.key);
      if (strikes > 0) await this.quotaProbe(l, strikes);
    }
    if (this.allPaused()) {
      const p = this.lastPaused?.paused ?? null;
      log.error(
        { err: p?.err ?? null, key: this.lastPaused?.key ?? null },
        "quota probe failed — stopping without retries (next run probes once again)",
      );
      throw new StopRun(1, "probe_failed", p?.code ?? null);
    }

    // ⑤ 기준점
    await this.loadLastOk();

    // seed 는 쓰는 키가 하나라도 멈췄으면(시작 탐침 실패 · 예산) 그날 건을 빠짐없이 채울 수 없다 — 넣지 않고 끝낸다
    if (mode === "seed" && this.anyPaused()) {
      log.error(
        { paused: this.usedLanes().filter((l) => l.paused).map((l) => ({ key: l.key, reason: l.paused!.reason })) },
        "seed failed — a DART key is paused, nothing inserted",
      );
      throw new StopRun(1, "seed_failed");
    }

    // seed — 그날 이미 올라온 건을 알림 없이 「보냄(seeded)」 으로 채운 뒤 같은 실행이 auto 루프로 이어 간다.
    // 시작 점검(장애 판정)은 seed 경로에서 이 seed 바퀴 **뒤**(그 바퀴가 lastOk 를 채운 뒤)에 한다 — 첫 배포 날
    // 기준점 07:02 와 지금의 차이로 가짜 「멈췄습니다」 · 「다시 동작」 짝이 나가지 않게(체커 W1).
    const firstLapAt = mode === "seed" ? await this.seedLap() : this.now();
    await this.startupCheck();
    // 시작 탐침이 멈춘 키(다른 키는 계속)의 로그 · 장애 글
    await this.settleHalts();

    log.info({ mode, holder, watches: this.d.watches.length, budget: cfg.dailyBudget }, "collector start");
    return this.loop(firstLapAt);
  }

  // ── 모드 ──────────────────────────────────────────────────────────
  /** probe — 키 2 로 거래소 수시공시 1쪽 1회 · 키 2 카운터 · 임대 · 넣기 · 송신 없음(43-07 스모크가 로그 `probe ok` 를 찾는다) */
  private async probeMode(): Promise<CollectorExit> {
    const { log, dart } = this.d;
    const key: DartKeyId = 2;
    try {
      const r = await dart.probe(kstYmd(this.now()), key);
      this.addCalls(key, r.calls);
      log.info({ key, total: r.total, calls: r.calls, lease: false }, "probe ok");
      return { code: 0, reason: "probe" };
    } catch (err) {
      this.addCalls(key, callsOf(err));
      if (err instanceof DartApiError && err.kind === "quota") await this.recordStrike("quota", key);
      log.error({ err: safeErrorFields(err) }, "probe failed");
      return { code: 1, reason: "probe_failed" };
    }
  }

  /**
   * seed 바퀴 — 감시 대상마다 오늘 + 직전 평일(전날 확인 표시와 무관 · 함정 A) 조회 → 맞는 건을 모아 **모두 성공했을 때만**
   * `insert(…, seed=true)` · 송신 0. 오늘 · 전날 조회 하나라도 실패면 아무것도 넣지 않고 종료 1 `seed_failed`
   * (auto 로 넘어가지 않는다 — 다시 seed 를 돌린다). 성공하면 전날 확인 표시도 남긴다.
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
    // 첫 바퀴라 조회 칸 기억이 비어 감시 대상 전부 조회한다(+ 직전 평일) — 그날 · 전날 건을 빠짐없이 seeded 로 채운다
    const r = await collectOnce(seedDeps, this.lapState, kstYmd(startedAt), {
      isLate: () => false,
      seed: true,
      isDue: (w) => this.isDue(w, startedAt),
      prevDay: () => prevWeekdayYmd(startedAt),
    });
    this.stats.laps += 1;

    const failed = r.results.filter((x) => !x.ok || x.prevOk !== true);
    if (failed.length > 0 || this.anyPaused()) {
      // 한도 의심 표시는 이 seed 바퀴에 새로 멈춘 키마다(그 키 카운터)
      for (const l of this.usedLanes()) {
        const p = l.paused;
        if (p?.fresh && (p.reason === "quota" || p.reason === "unknown_streak")) await this.recordStrike(p.reason, l.key);
      }
      log.error(
        { failed: failed.map((f) => ({ watch: f.watch, err: f.error, prevOk: f.prevOk ?? null })), matched: matched.length },
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

  /**
   * 쓰는 키마다 오늘 사용량을 읽는다 — 다 찬 키는 멈춤(앞 실행이 이미 글을 냈다 → fresh 아님) · 전부 찼으면 false(종료 0).
   */
  private async budgetAtStart(t0: number): Promise<boolean> {
    const { log, db, cfg } = this.d;
    for (const l of this.usedLanes()) {
      l.usedKnown = await db.usage.read(this.dateKst(), l.key);
      const state = budgetStateOf(l.usedKnown, cfg.dailyBudget);
      if (state === "exhausted") {
        log.warn({ key: l.key, used: l.usedKnown, budget: cfg.dailyBudget }, "daily budget already reached — not calling OpenDART");
        this.pauseLane(l, "budget_exhausted", null, false);
      } else if (state === "warn") this.warnBudget80(l);
    }
    this.nextFlushAt = t0 + USAGE_FLUSH_MS;
    return !this.allPaused();
  }

  /**
   * 그 키 한도 의심 표시가 있으면 그 키로 단독 탐침 1건 — 실패면 재시도 없이 그 키 레인을 멈춘다(5분 뒤 바퀴 시작에 재탐침 ·
   * 쓰는 키가 전부 멈추면 main 이 종료 1 · 다음 실행이 다시 1건).
   */
  private async quotaProbe(l: KeyLane, strikes: number): Promise<void> {
    const { log, dart } = this.d;
    try {
      const r = await dart.probe(kstYmd(this.now()), l.key);
      this.addCalls(l.key, r.calls);
      log.info({ key: l.key, strikesToday: strikes, total: r.total }, "quota probe ok — resuming collection");
    } catch (err) {
      this.addCalls(l.key, callsOf(err));
      this.pauseLane(l, "probe_failed", safeErrorFields(err));
    }
  }

  private async loadLastOk(): Promise<void> {
    const st = await this.d.db.readState();
    const today = this.dateKst();
    for (const w of this.d.watches) {
      const ms = Date.parse(st.lastOk[w.id] ?? "");
      if (Number.isFinite(ms)) this.lastOk.set(w.id, ms);
      // 오늘 이미 한 전날 확인(앞 실행 · 임대 교대) — 되풀이하지 않는다
      if (st.lastOk[`${PREV_DAY_MARK_PREFIX}${w.id}`] === today) this.prevDayDone.set(w.id, today);
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
    await this.retryPausedLanes(startedAt);
    let r: CollectResult | null = null;
    let insertErr: unknown = null;
    try {
      r = await collectOnce(this.lapDeps, this.lapState, kstYmd(startedAt), {
        isLate: (w) => this.isLate(w),
        seed: false,
        isDue: (w) => this.isDue(w, startedAt),
        prevDay: (w) => this.prevDayDue(w, startedAt),
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

    await this.settleHalts();
  }

  /**
   * 바퀴 시작 — 멈춘 키 중 재탐침 시각이 된 키마다 그 키로 단독 탐침 1건(그 키 카운터). 성공이면 그 키 재개(같은 바퀴에서
   * 그 키 감시 대상을 부른다) · 실패면 5분 뒤 다시(warn — 장애 글 · error 는 멈출 때 이미 냈다 · 한도 의심 표시는 더하지 않음).
   */
  private async retryPausedLanes(now: number): Promise<void> {
    for (const l of this.usedLanes()) {
      const p = l.paused;
      if (!p || p.retryAt > now) continue;
      try {
        const r = await this.d.dart.probe(kstYmd(now), l.key);
        this.addCalls(l.key, r.calls);
        l.paused = null;
        l.unknownStreak = 0;
        this.d.log.info({ key: l.key, reason: p.reason, total: r.total }, "dart key probe ok — resuming");
      } catch (err) {
        this.addCalls(l.key, callsOf(err));
        p.retryAt = now + KEY_PROBE_RETRY_MS;
        this.d.log.warn({ key: l.key, reason: p.reason, err: safeErrorFields(err) }, "dart key probe failed — retrying in 5 min");
      }
    }
  }

  /**
   * 새로 멈춘 키 정리(바퀴 끝 · 시작 탐침 뒤) — 한도 의심 표시(quota · unknown_streak · 그 키) 뒤, 쓰는 키가 전부 멈췄으면
   * 지금처럼 error `fatal DART status — stopping this run` + 종료 1(그 이유 · 장애 글은 치명 종료 길 `outageOnFatal`).
   * 아니면 키마다 error `dart key paused — other key keeps running` 과 장애 글(임대 · 창 안 · 열린 장애 없을 때).
   */
  private async settleHalts(): Promise<void> {
    const fresh = this.usedLanes().filter((l) => l.paused?.fresh === true);
    if (fresh.length === 0) return;
    for (const l of fresh) {
      const p = l.paused!;
      p.fresh = false;
      if (p.reason === "quota" || p.reason === "unknown_streak") await this.recordStrike(p.reason, l.key);
    }
    if (this.allPaused()) {
      const p = (this.lastPaused ?? fresh[fresh.length - 1]).paused!;
      this.d.log.error({ reason: p.reason, err: p.err }, "fatal DART status — stopping this run");
      throw new StopRun(1, p.reason, p.code);
    }
    for (const l of fresh) {
      const p = l.paused!;
      const used = l.usedKnown + l.sinceFlush;
      this.d.log.error(
        {
          key: l.key,
          reason: p.reason,
          err: p.err,
          retryAt: Number.isFinite(p.retryAt) ? new Date(p.retryAt).toISOString() : null,
          ...(p.reason === "budget_exhausted" ? { used, budget: this.d.cfg.dailyBudget } : {}),
        },
        "dart key paused — other key keeps running",
      );
      const reasonOf = FATAL_OUTAGE_REASON[p.reason];
      const now = this.now();
      if (reasonOf && this.haveLease && isInWindow(now) && !this.outage) {
        await this.openOutage(`${this.laneLabel(l)} — ${reasonOf(p.code)}`, now, false, new Set([l.key]));
      }
    }
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
    if (!isInWindow(now) || this.outage || this.hasFreshPause()) return;
    // 넣기 실패는 모든 감시 대상의 알림을 막는다 — 쓰는 키 전부가 연 장애
    await this.openOutage(`공시 저장 실패 ${fields.code ?? fields.kind}`, f.since, false, new Set(this.usedKeys));
  }

  /** 이 바퀴에 부를까 — 그 키가 멈추지 않았고 그리고 조회 칸 차례(멈춘 키는 칸을 소비하지 않는다 · 261113-rn7) */
  private isDue(w: Watch, lapStartMs: number): boolean {
    return this.laneOf(w.key).paused === null && this.takeSlot(w, lapStartMs);
  }

  /**
   * 이 바퀴에 그 감시 대상을 부를 차례인가(261113-iez) — 그 시각 간격이 null(바퀴마다)이면 늘 true. 띄엄 조회 대상은 바퀴
   * 시작 시각의 조회 칸이 기억한 칸과 다를 때만 true 이고 그 칸을 기억한다(실패해도 같은 칸 안에서 다시 두드리지 않는다).
   * B001 은 `09:00` 앞에서 null 이라 칸 기억을 건드리지 않는다 — 09:00:00 바퀴가 첫 10초 칸으로 반드시 부른다.
   */
  private takeSlot(w: Watch, lapStartMs: number): boolean {
    const slot = pollSlot(lapStartMs, everyMsAt(w, lapStartMs));
    if (slot === null) return true;
    if (this.polledSlot.get(w.id) === slot) return false;
    this.polledSlot.set(w.id, slot);
    return true;
  }

  /**
   * 아침 전날 확인을 할 날짜 — 그 감시 대상이 오늘 이미 했으면 null, 아니면 직전 평일 YYYYMMDD(U-3). collectOnce 는 이 값을 받는
   * 즉시 전날 조회를 시작하므로 날짜를 줄 때 시도 1번으로 센다 — 넣기가 실패해 표시를 못 남긴 바퀴도 1번(리뷰 WR-01).
   * 하루 3번 · 시도 사이 5분. 3번 다 표시를 못 남겼으면 warn 1번 뒤 그날은 메모리 표시로 건너뛴다(DB 표시 없음).
   */
  private prevDayDue(w: Watch, startedAt: number): string | null {
    const today = kstDateString(new Date(startedAt));
    if (this.prevDayDone.get(w.id) === today) return null;
    const prev = prevWeekdayYmd(startedAt);
    const t = this.prevDayTries.get(w.id);
    const tries = t?.day === today ? t : null;
    if (tries && tries.count >= PREV_DAY_MAX_TRIES) {
      this.prevDayDone.set(w.id, today);
      this.d.log.warn({ watch: w.id, day: prev, tries: tries.count }, "prevday sweep gave up");
      return null;
    }
    if (tries && startedAt - tries.lastAt < PREV_DAY_RETRY_MS) return null;
    this.prevDayTries.set(w.id, { day: today, count: (tries?.count ?? 0) + 1, lastAt: startedAt });
    return prev;
  }

  /** 처음 본 순간 늦은 건인가 — 그 감시 대상 조회 직전에 판정(조회가 오래 걸려도 기준점은 그대로) */
  private isLate(w: WatchId): boolean {
    const now = this.now();
    const watch = this.d.watches.find((x) => x.id === w);
    const everyMs = watch ? everyMsAt(watch, now) : null;
    return isLateAt(now, coverPointMs(now, this.lastOk.get(w) ?? null), lateGapMs(everyMs));
  }

  private takeResult(r: CollectResult): void {
    const today = this.dateKst();
    for (const x of r.results) {
      if (x.ok && x.okAt !== undefined) this.lastOk.set(x.watch, x.okAt);
      // 전날 확인은 성공한 것만 표시 — 실패면 5분 뒤 그 감시 대상의 조회 때 다시(하루 3번 · U-3 · 리뷰 WR-01)
      if (x.prevOk === true) {
        this.prevDayDone.set(x.watch, today);
        this.prevDayMarksHere.add(x.watch);
      }
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
    // 멈춘 키(예산 · 시작 탐침 실패)의 감시 대상은 빼고 본다 — 그 키는 settleHalts · 앞 실행이 사유를 남긴다
    const stale = this.d.watches.filter((w) => this.laneOf(w.key).paused === null && now - this.coverOf(now, w.id) > OUTAGE_AFTER_MS);
    if (stale.length === 0) return;
    const since = Math.min(...stale.map((w) => this.coverOf(now, w.id)));
    await this.openOutage(this.stalledReason(now), since, false, new Set(stale.map((w) => w.key)));
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
   * 바퀴 끝 판정 — 이 바퀴 실패가 없고 모든 감시 대상의 마지막 조회가 성공(`failing` 빔)이고 멈춘 키가 없으면 열린 장애를
   * 닫고, 실패한 감시 대상 중 기준점에서 5분 넘게 성공이 없는 것이 있으면 연다(한 번만 · 이미 열려 있으면 아무것도 안 함).
   * 치명 신호 바퀴는 `settleHalts`(한 키) · 치명 종료 길(전부)이 연다.
   */
  private async judgeOutage(r: CollectResult): Promise<void> {
    const now = this.now();
    if (!isInWindow(now)) return;
    const failed = r.results.filter((x) => !x.ok);
    if (failed.length === 0) {
      // 이 바퀴에 안 불린 띄엄 조회 대상(I001 · D005)이 아직 실패 중이면 닫지 않는다 — 그 대상이 다시 성공한 바퀴에 닫는다
      // 멈춘 키가 있으면 닫지 않는다 — 두 키 모두 회복해야 「다시 동작」(261113-rn7)
      if (this.outage && this.failing.size === 0 && !this.anyPaused()) await this.closeOutage();
      return;
    }
    if (this.outage) {
      this.noteOutageWidened(failed, now);
      return;
    }
    if (this.hasFreshPause()) return;
    const stale = failed.filter((x) => now - this.coverOf(now, x.watch) > OUTAGE_AFTER_MS);
    if (stale.length === 0) return;
    const since = Math.min(...stale.map((x) => this.coverOf(now, x.watch)));
    const reason = stale.map((x) => `${WATCH_LABEL[x.watch] ?? x.watch} ${errBrief(x.error)}`).join(" · ");
    const keys = new Set(stale.flatMap((x) => this.d.watches.filter((w) => w.id === x.watch).map((w) => w.key)));
    await this.openOutage(reason, since, false, keys);
  }

  /**
   * 열린 장애가 덮지 않는 키의 실패(리뷰 WR-02) — 장애를 연 키가 아닌 키의 감시 대상이 기준점에서 5분 넘게 실패하면 error 1번
   * (→ 운영자 메일). 단체방 글은 한 쌍 그대로(보충 글 없음). 연 키를 모르면(DB 에서 이어받은 장애) 지금 멈춘 키를 연 키로 본다 —
   * 이어받은 장애가 남아 있는 흔한 까닭이 그 키 멈춤(예산 · 한도)이고, 멈춘 키 감시 대상은 부르지 않아 어차피 실패가 안 나온다.
   */
  private noteOutageWidened(failed: CollectResult["results"], now: number): void {
    const o = this.outage;
    if (!o || o.widenedLogged) return;
    const covered = o.keys ?? new Set(this.usedLanes().filter((l) => l.paused !== null).map((l) => l.key));
    const keyOf = (id: WatchId) => this.d.watches.find((w) => w.id === id)?.key;
    const others = failed.filter((x) => {
      const k = keyOf(x.watch);
      return k !== undefined && !covered.has(k) && now - this.coverOf(now, x.watch) > OUTAGE_AFTER_MS;
    });
    if (others.length === 0) return;
    o.widenedLogged = true;
    this.d.log.error(
      {
        watches: others.map((x) => x.watch),
        errs: others.map((x) => errBrief(x.error)),
        outageKeys: [...covered],
        outageSince: new Date(o.sinceMs).toISOString(),
      },
      "dart outage widened — other key failing",
    );
  }

  /**
   * 장애 열기 — `open` 이 opened true 를 준 실행만 「⚠ 멈췄습니다」 1건 → notice sent/failed 기록 → error `dart outage opened`
   * (→ 43-07 로그 일치 이메일). opened false 면 이미 열린 장애(글을 이미 남김)라 메모리에만 적는다.
   * `LeaseLostError` 는 위로, 그 밖 DB 오류는 error 로그 뒤 다음 기회(다음 바퀴 · 다음 실행)에 다시.
   */
  private async openOutage(reasonIn: string, sinceMs: number, reopen = false, keys: ReadonlySet<DartKeyId> | null = null): Promise<void> {
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
    const o = (this.outage = openOutageState(sinceMs, false, keys));
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

  private async recordStrike(why: HaltReason, key: DartKeyId): Promise<void> {
    try {
      const n = await this.d.db.strikes.record(this.dateKst(), key);
      this.d.log.warn({ key, strikesToday: n, why }, "quota strike recorded — next run probes once before collecting");
    } catch (err) {
      this.d.log.error({ err: safeErrorFields(err), why, key }, "quota strike record failed");
    }
  }

  // ── DART 호출 집계 · 치명 신호 ────────────────────────────────────
  /**
   * `dart.list` 감쌈 — 호출 수를 끝날 때마다 그 키(`watch.key`) 사용량에 더하고(실패 포함) 그 키의 치명 · 모르는 코드 연속을
   * 센다. 멈춘 키는 `isDue` 가 거르지만 그물로 한 번 더 막는다(호출 0).
   * 전날 조회(`prevDay`)의 오류는 한도 신호(020 · HTTP 429 = quota)만 치명 분류로 올린다 — 그 밖(100 · 101 · 키 · 모르는 코드 ·
   * 일시)은 lap.ts 가 warn + `prevOk` false 로 끝내고 그 키는 계속 돈다(리뷰 WR-01 — 전날 날짜에만 오는 코드가 레인을 멈췄다
   * 5분 탐침으로 풀리고 다시 멈추는 되풀이를 막음).
   */
  private async countedList(
    watch: Watch,
    day: string,
    opts?: { fullRead?: boolean; prevDay?: boolean },
  ): Promise<{ rows: DartRow[]; calls: number }> {
    const l = this.laneOf(watch.key);
    if (l.paused) {
      const skipped = new DartApiError(0, null, "transient", "skipped: this DART key is paused");
      skipped.calls = 0;
      throw skipped;
    }
    try {
      const r = await this.d.dart.list(watch, day, opts);
      this.addCalls(l.key, r.calls);
      l.unknownStreak = 0;
      return r;
    } catch (err) {
      this.addCalls(l.key, callsOf(err));
      if (!opts?.prevDay || (err instanceof DartApiError && err.kind === "quota")) this.noteListError(l, err);
      throw err;
    }
  }

  /** 치명 신호는 그 키 레인만 곧바로 멈춘다(fresh) — 같은 바퀴의 그 키 남은 감시 대상은 `isDue` 가 건너뛴다 */
  private noteListError(l: KeyLane, err: unknown): void {
    const kind = err instanceof DartApiError ? err.kind : "transient";
    if (kind === "unknown") {
      l.unknownStreak += 1;
      if (l.unknownStreak >= UNKNOWN_STREAK) this.pauseLane(l, "unknown_streak", safeErrorFields(err));
      return;
    }
    l.unknownStreak = 0;
    const reason = HALT_BY_KIND[kind];
    if (reason) this.pauseLane(l, reason, safeErrorFields(err));
  }

  private addCalls(key: DartKeyId, n: number): void {
    if (n <= 0) return;
    const l = this.laneOf(key);
    this.d.db.usage.add(n, key);
    l.sinceFlush += n;
    this.stats.calls += n;
    if (budgetStateOf(l.usedKnown + l.sinceFlush, this.d.cfg.dailyBudget) !== "ok") this.warnBudget80(l);
  }

  // ── 예산 · 임대 · 사용량 ──────────────────────────────────────────
  /**
   * 키마다 예산 문 — 다 쓴 키는 그날 멈춘다(fresh · 재탐침 없음 · 장애 글은 그 바퀴 끝 `settleHalts`). 쓰는 키가 전부 멈췄으면
   * 지금처럼 error `daily budget exhausted — stopping this run` + 종료 1 `budget_exhausted`.
   */
  private budgetGate(): void {
    for (const l of this.usedLanes()) {
      if (l.paused) continue;
      const used = l.usedKnown + l.sinceFlush;
      if (budgetStateOf(used, this.d.cfg.dailyBudget) !== "exhausted") continue;
      this.pauseLane(l, "budget_exhausted", null);
      if (this.allPaused()) {
        this.d.log.error({ key: l.key, used, budget: this.d.cfg.dailyBudget }, "daily budget exhausted — stopping this run");
        throw new StopRun(1, "budget_exhausted");
      }
    }
  }

  private warnBudget80(l: KeyLane): void {
    if (l.warned80) return;
    l.warned80 = true;
    this.d.log.warn(
      { key: l.key, used: l.usedKnown + l.sinceFlush, budget: this.d.cfg.dailyBudget, ratio: BUDGET_WARN_RATIO },
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

  /**
   * 메모리 기준점 → DB `last_ok`(ISO) + 이 실행이 남긴 전날 확인 표시(`prevday:<id>` = KST 날짜 · jsonb 병합이라 불러온
   * 표시는 다시 싣지 않는다) — 둘 다 비었으면 undefined(RPC 인자를 보내지 않음)
   */
  private lastOkIso(): Record<string, string> | undefined {
    if (this.lastOk.size === 0 && this.prevDayMarksHere.size === 0) return undefined;
    const out: Record<string, string> = {};
    for (const [w, ms] of this.lastOk) out[w] = new Date(ms).toISOString();
    for (const w of this.prevDayMarksHere) {
      const day = this.prevDayDone.get(w);
      if (day) out[`${PREV_DAY_MARK_PREFIX}${w}`] = day;
    }
    return out;
  }

  /** 쓰는 키마다 그 키 카운터로 flush */
  private async flushUsage(): Promise<void> {
    for (const l of this.usedLanes()) {
      try {
        const total = await this.d.db.usage.flush(this.dateKst(), l.key);
        if (total !== null) {
          l.usedKnown = total;
          l.sinceFlush = 0;
        }
      } catch (err) {
        this.d.log.warn({ err: safeErrorFields(err), key: l.key }, "usage flush failed — will retry");
      }
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
