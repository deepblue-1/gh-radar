import { LATE_GAP_MS } from "./cadence";
import { DartApiError, type DartErrorKind, type DartRow } from "./dart/client";
import { isRowRejection, LeaseLostError } from "./db";
import { alertText, plainAlertText } from "./message";
import { safeErrorFields, telegramSafeFields, type SafeErrorFields } from "./safeError";
import type { SendResult } from "./telegram/client";
import { judgeRow, type JudgeOptions, type Watch, type WatchId } from "./watches";

/**
 * Phase 43-01 — 한 바퀴: 수집(`collectOnce` — 조회 · 거르기 · 넣기)과 송신(`deliverPending` — 차례 · 송신 · 기록).
 *
 * - SC-2 「한 번만」 의 정본은 DB 다: 표 `dart_alerts` 의 기본키가 `rcept_no` 이고 넣기 RPC 는 새로 들어간 행만
 *   돌려준다. `LapState.seen` 은 같은 실행 안에서 넣기 왕복을 줄이는 메모리 캐시일 뿐 — 재시작하면 비지만
 *   DB 가 같은 접수번호를 다시 받지 않는다.
 * - D-02: 묶지 않고 같은 바퀴 안에서 바로 보낸다(collector 가 collectOnce → deliverPending 을 잇는다).
 * - `LapDeps.db` 의 인자 · 반환 키는 마이그레이션 20261113200000_dart_alert.sql 의 RPC
 *   `dart_alert_insert` · `dart_alert_claim` · `dart_alert_mark` 와 글자 그대로 같다(43-02 `src/db.ts` 가
 *   변환 없이 결선하고 `tests/dbContract.test.ts` 가 자동 대조한다).
 * - 넣기 DB 오류(임대 잃음 55000 포함)는 삼키지 않고 위로 보낸다 — 수집기(43-05)가 종료 이유 · 연속 실패 장애를 정한다.
 *   예외: 행 값 때문의 거절(SQLSTATE 22 · 23)은 행마다 다시 넣어 그 행만 error 로 건너뛴다(리뷰 WR-01).
 * - 43-06 송신 견고함(SC-5 · D-02 · 리서치 확인 7) — `deliverPending` + 실행 동안 하나인 `SendPacer`:
 *   · 같은 방 1초 간격(`SEND_GAP_MS`) · 60초 안 최대 18건(`SEND_WINDOW_MAX` — 단체방 분당 20건 아래) · 429 는
 *     `retry_after` 초 동안 그 방 송신 전체를 멈춘다(장애 글 · 시험 글도 같은 pacer 를 지난다 — `sendPaced`).
 *   · 실패 행은 pending 으로 되돌려 재시도: 일시 장애 `min(60, 5 × 2^(시도−1))` 초 · 429 `retry_after` · 토큰/방 60초.
 *     실패마다 warn(종류 · 코드 · 설명 앞 200자) · 토큰 무효 · 방 문제는 실행당 종류별 error 1번 · 처음 본 뒤 120초 넘게
 *     못 나간 건은 접수번호마다 error 1번(→ 43-07 이메일 — 텔레그램이 죽어 단체방 장애 글도 못 가는 경우를 덮는다).
 *   · migrated → 새 방 id 로 같은 글을 즉시 한 번 더 · `switchChat`(실행 메모리만 — 비밀 · DB 를 덮어쓰지 않는다) ·
 *     error `telegram chat migrated`(새 id 는 끝 4자리 `newChatIdTail` 만). parse → 평문으로 1회 다시.
 *   · 기록(`mark`) RPC 가 던지면 error `alert mark failed` 뒤 다음 행 계속 — 그 행은 DB 에 sending 으로 남았다가 송신
 *     기한(90초 · 43-02) 뒤 같은 보유자 차례에 `stale` 로 다시 나와 송신(warn `possible duplicate after stale claim` —
 *     최소 1회 · 드문 중복은 받아들임). 차례(`claim`) RPC 가 던지면 warn `alert claim failed` 뒤 그 바퀴 송신을 건너뛴다.
 *     `LeaseLostError` 는 어디서 나와도 위로(수집기 종료 0 `lease_lost`).
 *   · 문구 late = 행의 late 또는 처음 본 뒤 60초(`LATE_GAP_MS`) 넘게 지나 나가는 건 — 단 **이 실행이 넣고 송신 실패 없이 우리
 *     송신 속도 제한(5건 · 60초 18건)으로만 기다린 건**은 늦음으로 치지 않는다(D-12 = 수집기가 멈췄다 다시 켜진 경우 ·
 *     리뷰 IN-03). 앞 실패(시도 2번째 이상) · 앞 실행이 넣고 못 보낸 건(재시작 · 인계)은 그대로 늦음. 「(늦은 알림)」 은 한 번만.
 *   · 송신 순서는 DB 차례 순서(공개매수 먼저 → 처음 본 순) 그대로.
 * - 상수는 순환 import 를 피하려고 여기에 두고 collector.ts 가 다시 내보낸다.
 * - 261113-iez · rn7: `collectOnce` 의 `isDue` 가 false 인 감시 대상(조회 칸이 아직 안 바뀐 감시 대상 · 멈춘 키의 감시 대상)은
 *   조회 · 결과 · 호출 수 · 늦음 판정 모두 없이 건너뛴다. 없으면 전부 조회.
 * - 261113-rn7 아침 전날 확인(U-3): `prevDay(w)` 가 날짜(YYYYMMDD)를 주면 그 감시 대상의 오늘 조회가 **성공한 직후** 그 날짜를
 *   전 쪽(`fullRead` — 100건 넘는 날도 끝까지)으로 1번 더 조회하고 같은 판정으로 통과 건을 모은다. 전날 건은 늘
 *   「(늦은 알림)」(`late: true` — 그날 수집기가 돌았다면 이미 보냈을 건이라 여기서 처음 보면 수집기가 비어 있던 시간에 놓친 건 ·
 *   D-12 와 같은 뜻)이고, 넣기 원소 `rcept_dt` 는 **오늘 조회 날짜**다 — 송신 차례 RPC(`dart_alert_claim`)가
 *   `rcept_dt = 오늘(KST)` 행만 고르고 임대 인계 때 `rcept_dt < 오늘` 인 미송신 행을 expired 로 닫아, 진짜 접수일을 넣으면
 *   보내지지 않는다(원래 접수일은 접수번호 앞 8자리에 그대로 · 마이그레이션 없이 가는 가장 단순한 길). 전날 조회 실패는
 *   warn `dart prev-day list failed` 만 — 그 감시 대상의 오늘 결과는 성공 그대로이고 `prevOk` false 로 알린다.
 *   이미 DB 에 있는 건(같은 접수번호)은 넣기가 무시하므로 다시 가지 않는다.
 */

/** 같은 방 송신 사이 최소 간격 */
export const SEND_GAP_MS = 1_000;
/** 60초 창 안 최대 송신 수(텔레그램 단체방 분당 20건 아래) */
export const SEND_WINDOW_MAX = 18;
export const SEND_WINDOW_MS = 60_000;
/** 일시 장애 재시도 간격 = min(RETRY_MAX_S, RETRY_BASE_S × 2^(시도−1)) 초 */
export const RETRY_BASE_S = 5;
export const RETRY_MAX_S = 60;
/** 처음 본 뒤 이만큼 넘게 못 나가면 error 1번 */
export const UNSENT_ERROR_MS = 120_000;

export interface LapLog {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** `dart_alert_insert` 의 `p_items` 원소 — 키 = 컬럼 이름 */
export interface InsertItem {
  rcept_no: string;
  watch: WatchId;
  priority: number;
  /** YYYY-MM-DD */
  rcept_dt: string;
  corp_cls: string;
  corp_name: string;
  stock_code: string;
  report_nm: string;
  flr_nm: string;
  late: boolean;
}

/** `dart_alert_insert` 반환 원소 — 새로 들어간 행만 */
export interface InsertedRow {
  rcept_no: string;
  late: boolean;
}

/** `dart_alert_claim` 반환 원소 — `stale` = 송신 기한(90초)이 지난 내 sending 을 다시 준 행(43-02) */
export interface ClaimedRow {
  rcept_no: string;
  watch: string;
  corp_cls: string;
  corp_name: string;
  stock_code: string;
  report_nm: string;
  flr_nm: string;
  late: boolean;
  attempts: number;
  first_seen_at: string;
  stale?: boolean;
}

export interface MarkInput {
  ok: boolean;
  messageId: number | null;
  error: string | null;
  retryInS: number;
}

export interface LapDeps {
  watches: readonly Watch[];
  judge: JudgeOptions;
  log: LapLog;
  clock: { now(): number };
  /** 송신 간격(43-06) — collector 가 `CollectorDeps.sleep` 을 넘긴다 */
  sleep(ms: number): Promise<void>;
  /** `fullRead` = 쪽 넘김 기억 없이 전 쪽(아침 전날 확인 · 261113-rn7) */
  dart: { list(watch: Watch, day: string, opts?: { fullRead?: boolean }): Promise<{ rows: DartRow[]; calls: number }> };
  db: {
    insert(items: InsertItem[], seed: boolean): Promise<InsertedRow[]>;
    claim(limit: number): Promise<ClaimedRow[]>;
    mark(rceptNo: string, r: MarkInput): Promise<boolean>;
  };
  telegram: {
    send(text: string, opts?: { plain?: boolean }): Promise<SendResult>;
    /** 방이 슈퍼그룹으로 바뀌었을 때 이 실행 동안만 새 방 id 로(43-06 — 없으면 바꾸지 않음) */
    switchChat?(chatId: string): void;
  };
}

export interface LapState {
  /** 이번 실행에서 이미 판정해 DB 에 넘긴 접수번호(보낸 것 · 거른 것) */
  seen: Set<string>;
  /** 근접 불일치 종류명 — 실행당 1번만 warn(`b001 near-miss kind` · 43-09) */
  nearMissLogged: Set<string>;
}

export function newLapState(): LapState {
  return { seen: new Set(), nearMissLogged: new Set() };
}

export interface WatchResult {
  watch: WatchId;
  ok: boolean;
  /** 성공한 조회의 시작 시각(ms) — 늦은 알림 기준점(43-05) */
  okAt?: number;
  error?: SafeErrorFields;
  kind?: DartErrorKind;
  /** 아침 전날 확인 결과 — 했으면 성공 여부 · 안 했으면 없음(261113-rn7) */
  prevOk?: boolean;
}

export interface CollectResult {
  results: WatchResult[];
  /** 이 바퀴의 OpenDART 호출 수 — 실패 호출 포함 */
  calls: number;
  inserted: InsertedRow[];
}

const YMD_RE = /^[0-9]{8}$/;

/** YYYYMMDD → YYYY-MM-DD (DB date) — 부르는 쪽이 8자리를 보장한다 */
function toIsoDate(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/**
 * 넣기 — 묶음 한 번. 묶음이 **행 값 때문에**(SQLSTATE 22 · 23 — `isRowRejection`) 거절되면 행마다 다시 넣어
 * 거절된 행만 error 로 남기고 건너뛴다(한 행이 같은 바퀴의 다른 행 — 공개매수 포함 — 을 막지 않게 · 리뷰 WR-01).
 * 그 밖 실패(DB · 네트워크 · 임대 잃음)는 warn 뒤 위로 던진다 — 연속 실패 판정은 수집기 몫.
 */
async function insertItems(
  deps: LapDeps,
  items: InsertItem[],
  seed: boolean,
  calls: number,
): Promise<{ inserted: InsertedRow[]; rejected: string[] }> {
  const fail = (err: unknown): never => {
    deps.log.warn({ items: items.length, calls, err: safeErrorFields(err) }, "dart alert insert failed");
    throw err;
  };
  try {
    return { inserted: await deps.db.insert(items, seed), rejected: [] };
  } catch (err) {
    if (!isRowRejection(err)) return fail(err);
    const inserted: InsertedRow[] = [];
    const rejected: string[] = [];
    const reject = (it: InsertItem, e: unknown) => {
      rejected.push(it.rcept_no);
      deps.log.error({ rceptNo: it.rcept_no, watch: it.watch, err: safeErrorFields(e) }, "dart alert row rejected by db — skipped");
    };
    if (items.length === 1) {
      reject(items[0], err);
      return { inserted, rejected };
    }
    for (const it of items) {
      try {
        inserted.push(...(await deps.db.insert([it], seed)));
      } catch (e) {
        if (!isRowRejection(e)) return fail(e);
        reject(it, e);
      }
    }
    return { inserted, rejected };
  }
}

/**
 * 감시 대상 순서대로 조회 → 판정 → 처음 보는 보낼 행만 모아 한 번에 넣는다.
 * 감시 대상 하나의 실패는 나머지를 막지 않는다(사유는 warn). 넣기가 실패하면 `seen` 에 넣지 않아 다음 바퀴에 다시.
 */
export async function collectOnce(
  deps: LapDeps,
  state: LapState,
  day: string,
  opts: { isLate(w: WatchId): boolean; seed: boolean; isDue?(w: Watch): boolean; prevDay?(w: Watch): string | null },
): Promise<CollectResult> {
  const results: WatchResult[] = [];
  const items: InsertItem[] = [];
  const judged = new Set<string>();
  let calls = 0;

  /**
   * 행 판정 → 넣기 원소. `fixedRceptDt` 가 있으면(전날 확인) 접수일 칸을 그 값으로 넣는다(머리 주석 — 송신 차례가 오늘 행만 고름).
   */
  const takeRows = (watch: Watch, rows: DartRow[], late: boolean, fixedRceptDt?: string): void => {
    for (const row of rows) {
      const rceptNo = row.rcept_no;
      if (typeof rceptNo !== "string" || state.seen.has(rceptNo) || judged.has(rceptNo)) continue;
      judged.add(rceptNo);
      const v = judgeRow(watch, row, deps.judge);
      if (!v.send) {
        // 가정 1 — 허용 목록 밖인데 「증자」 · 「합병」 이 든 종류명은 사람이 보도록 종류명마다 실행당 1번만 warn
        if (v.reason === "near_miss" && !state.nearMissLogged.has(v.kind)) {
          state.nearMissLogged.add(v.kind);
          deps.log.warn({ rceptNo, kind: v.kind, watch: watch.id }, "b001 near-miss kind");
        }
        continue;
      }
      let rceptDt = fixedRceptDt;
      if (rceptDt === undefined) {
        // 접수일 — 조회가 그날 하루(bgn_de = end_de = day)라 행의 rcept_dt 는 조회 날짜다. 8자리가 아니면(빠짐 · 깨짐)
        // 조회 날짜로 넣고 warn — DB 의 NOT NULL date 칸에 걸려 그 바퀴 넣기 전체가 실패하지 않게(리뷰 WR-01)
        const rceptDtOk = typeof row.rcept_dt === "string" && YMD_RE.test(row.rcept_dt);
        if (!rceptDtOk) deps.log.warn({ rceptNo, watch: watch.id, rceptDtType: typeof row.rcept_dt }, "dart row rcept_dt invalid — using query day");
        rceptDt = toIsoDate(rceptDtOk ? row.rcept_dt : day);
      }
      items.push({
        rcept_no: rceptNo,
        watch: watch.id,
        priority: watch.priority,
        rcept_dt: rceptDt,
        corp_cls: row.corp_cls,
        corp_name: row.corp_name,
        stock_code: row.stock_code,
        report_nm: row.report_nm,
        flr_nm: row.flr_nm ?? "",
        late,
      });
    }
  };

  for (const watch of deps.watches) {
    // 이 바퀴에 부를 차례가 아닌 감시 대상(조회 칸이 그대로 · 멈춘 키)은 결과 항목도 남기지 않는다 — 장애 · 기준점 판정에 안 섞인다
    if (opts.isDue && !opts.isDue(watch)) continue;
    // 늦은 알림 판정은 조회 **전에** — 조회가 오래 걸려도 그 바퀴 기준점은 바뀌지 않는다
    const late = opts.isLate(watch.id);
    const startedAt = deps.clock.now();
    let rows: DartRow[];
    try {
      const r = await deps.dart.list(watch, day);
      calls += r.calls;
      rows = r.rows;
    } catch (err) {
      calls += err instanceof DartApiError ? (err.calls ?? 1) : 1;
      const fields = safeErrorFields(err);
      const kind = err instanceof DartApiError ? err.kind : undefined;
      results.push({ watch: watch.id, ok: false, error: fields, ...(kind ? { kind } : {}) });
      deps.log.warn({ watch: watch.id, err: fields }, "dart list failed");
      continue;
    }
    takeRows(watch, rows, late);

    // 아침 전날 확인 — 오늘 조회가 성공한 직후 · 전 쪽 · 늘 늦은 알림 · 접수일 칸 = 오늘 조회 날짜(머리 주석)
    const prevDay = opts.prevDay?.(watch) ?? null;
    let prevOk: boolean | undefined;
    if (prevDay !== null) {
      try {
        const p = await deps.dart.list(watch, prevDay, { fullRead: true });
        calls += p.calls;
        takeRows(watch, p.rows, true, toIsoDate(day));
        prevOk = true;
      } catch (err) {
        calls += err instanceof DartApiError ? (err.calls ?? 1) : 1;
        prevOk = false;
        deps.log.warn({ watch: watch.id, day: prevDay, err: safeErrorFields(err) }, "dart prev-day list failed");
      }
    }
    results.push({ watch: watch.id, ok: true, okAt: startedAt, ...(prevOk !== undefined ? { prevOk } : {}) });
  }

  // 넣기가 던지면 seen 에 넣지 않는다 → 다음 바퀴에 같은 행을 다시 넣는다(임대 잃음 · 연속 실패 판정은 수집기 몫).
  // DB 가 행 값 때문에 거절한 행은 error 로 남기고 seen 에 넣어 이 실행에서는 다시 두드리지 않는다.
  const inserted = items.length > 0 ? (await insertItems(deps, items, opts.seed, calls)).inserted : [];
  for (const rceptNo of judged) state.seen.add(rceptNo);

  return { results, calls, inserted };
}

export interface DeliverResult {
  claimed: number;
  sent: number;
  failed: number;
}

/**
 * 실행 동안 하나인 송신 상태(43-06). 수집기가 들고 바퀴마다 `deliverPending` 에 넘기고, 장애 글 · 시험 글도 같은
 * 인스턴스로 `sendPaced` 를 지난다 — 같은 방 1초 간격 · 60초 18건 · 429 대기가 모든 글에 같이 걸린다.
 */
export class SendPacer {
  /** 마지막 송신 시작 시각 */
  lastSendAt: number | null = null;
  /** 최근 송신 시작 시각(60초 창) */
  recentSends: number[] = [];
  /** 429 — 이 시각까지 그 방 송신 전체를 멈춘다 */
  holdUntil = 0;
  /** 실행당 종류별 1번 error 를 이미 남긴 종류(token · chat) */
  readonly loggedKinds = new Set<string>();
  /** 실패해 남아 있는 건 — 처음 본 시각 · 시도 수(120초 미송신 판정) */
  readonly unsent = new Map<string, { firstSeenMs: number; attempts: number }>();
  /** 미송신 error 를 이미 남긴 접수번호 */
  readonly unsentLogged = new Set<string>();
  /** 이 실행이 넣은 접수번호(수집기가 넣기 결과로 채운다) — 우리 속도 제한으로만 밀린 건을 늦음에서 뺀다(리뷰 IN-03) */
  readonly insertedHere = new Set<string>();

  /** 60초 창 안 송신 수(창 시작 = now − 60초 · 그 시각은 빠짐) */
  inWindow(now: number): number {
    this.recentSends = this.recentSends.filter((t) => t > now - SEND_WINDOW_MS);
    return this.recentSends.length;
  }

  /** 다음 글을 보낼 수 있는 가장 이른 시각 — 429 대기 · 1초 간격 · 60초 창 */
  readyAt(now: number): number {
    let t = Math.max(now, this.holdUntil);
    if (this.lastSendAt !== null) t = Math.max(t, this.lastSendAt + SEND_GAP_MS);
    if (this.inWindow(now) >= SEND_WINDOW_MAX) {
      const sorted = [...this.recentSends].sort((a, b) => a - b);
      t = Math.max(t, sorted[sorted.length - SEND_WINDOW_MAX] + SEND_WINDOW_MS);
    }
    return t;
  }

  record(at: number): void {
    this.lastSendAt = at;
    this.recentSends.push(at);
  }
}

export function newSendPacer(): SendPacer {
  return new SendPacer();
}

type SendDeps = Pick<LapDeps, "clock" | "sleep" | "log" | "telegram">;

/**
 * 글 하나를 pacer 규칙으로 보낸다 — 1초 간격은 `deps.sleep` 으로 기다리고(429 · 60초 창은 부르는 쪽이 미리 확인),
 * migrated 면 새 방 id 로 같은 글을 즉시 한 번 더(다른 방이라 간격 없음) · 429 면 그 방 송신을 `retry_after` 초 멈춘다.
 */
export async function sendPaced(deps: SendDeps, pacer: SendPacer, text: string, opts?: { plain?: boolean }): Promise<SendResult> {
  const gap = pacer.lastSendAt === null ? 0 : pacer.lastSendAt + SEND_GAP_MS - deps.clock.now();
  if (gap > 0) await deps.sleep(gap);
  pacer.record(deps.clock.now());
  let r = await deps.telegram.send(text, opts);
  if (r.kind === "migrated") {
    deps.telegram.switchChat?.(r.to);
    deps.log.error(
      { kind: "migrated", newChatIdTail: r.to.slice(-4), switched: deps.telegram.switchChat !== undefined },
      "telegram chat migrated",
    );
    pacer.record(deps.clock.now());
    r = await deps.telegram.send(text, opts);
  }
  if (r.kind === "rate") pacer.holdUntil = Math.max(pacer.holdUntil, deps.clock.now() + r.retryAfterS * 1000);
  return r;
}

/** 실패 사유 한 줄(DB `last_error` · 300자 상한 안) — 토큰 · 방 id · URL 없음 */
function failReason(r: Exclude<SendResult, { kind: "ok" }>): string {
  if (r.kind === "migrated") return "migrated";
  if (r.kind === "rate") return `rate:${r.retryAfterS}`;
  return `${r.kind}:${r.code}`;
}

/** 다음 시도까지 초 — 429 retry_after · 토큰/방 60 · 그 밖 min(60, 5 × 2^(시도−1)) */
function retryInS(r: Exclude<SendResult, { kind: "ok" }>, attempts: number): number {
  if (r.kind === "rate") return r.retryAfterS;
  if (r.kind === "token" || r.kind === "chat") return RETRY_MAX_S;
  return Math.min(RETRY_MAX_S, RETRY_BASE_S * 2 ** (Math.max(1, attempts) - 1));
}

const KIND_ERROR: Partial<Record<SendResult["kind"], string>> = {
  token: "telegram token invalid",
  chat: "telegram chat unavailable",
};

/** 결과 기록 — `LeaseLostError` 는 위로, 그 밖 실패는 error `alert mark failed` 뒤 계속(그 행은 송신 기한 뒤 stale 로 다시) */
async function markSafe(deps: LapDeps, rceptNo: string, input: MarkInput, result: SendResult["kind"] | "held"): Promise<void> {
  try {
    const applied = await deps.db.mark(rceptNo, input);
    if (!applied) deps.log.warn({ rceptNo, result }, "alert mark not applied");
  } catch (err) {
    if (err instanceof LeaseLostError) throw err;
    deps.log.error(
      { rceptNo, result, hasMessageId: input.messageId !== null, err: safeErrorFields(err) },
      "alert mark failed",
    );
  }
}

/** 처음 본 뒤 120초 넘게 못 나간 건 — 접수번호마다 error 1번 */
function logUnsent(deps: LapDeps, pacer: SendPacer): void {
  const now = deps.clock.now();
  for (const [rceptNo, u] of pacer.unsent) {
    if (pacer.unsentLogged.has(rceptNo) || now - u.firstSeenMs <= UNSENT_ERROR_MS) continue;
    pacer.unsentLogged.add(rceptNo);
    deps.log.error(
      { rceptNo, attempts: u.attempts, sinceFirstSeenS: Math.round((now - u.firstSeenMs) / 1000) },
      "alert unsent over 120s",
    );
  }
}

/**
 * 송신 차례를 받아 행마다 두 줄 문구 → sendMessage → 결과 기록(43-01) + 43-06 재시도 · 대기 · 방 이동 · 평문 · 속도 ·
 * 120초 error · 기록/차례 실패 길. `pacer` 를 주지 않으면 이 호출만의 새 상태(트레이서 테스트 꼴).
 */
export async function deliverPending(deps: LapDeps, limit: number, pacer: SendPacer = newSendPacer()): Promise<DeliverResult> {
  const out: DeliverResult = { claimed: 0, sent: 0, failed: 0 };
  logUnsent(deps, pacer);
  const now = deps.clock.now();
  // 429 대기 중이거나 60초 창이 차면 차례를 받지 않는다(받은 행이 송신 기한 90초 안에 끝나게)
  const n = Math.min(limit, SEND_WINDOW_MAX - pacer.inWindow(now));
  if (now < pacer.holdUntil || n <= 0) return out;

  let rows: ClaimedRow[];
  try {
    rows = await deps.db.claim(n);
  } catch (err) {
    if (err instanceof LeaseLostError) throw err;
    // 응답 유실이어도 DB 에 반영됐다면 그 행은 송신 기한(90초) 뒤 stale 로 다시 나온다
    deps.log.warn({ limit: n, err: safeErrorFields(err) }, "alert claim failed");
    return out;
  }
  out.claimed = rows.length;

  for (const row of rows) {
    if (row.stale) deps.log.warn({ rceptNo: row.rcept_no, attempts: row.attempts }, "possible duplicate after stale claim");
    const parsed = Date.parse(row.first_seen_at);
    const firstSeenMs = Number.isFinite(parsed) ? parsed : deps.clock.now();
    const t = deps.clock.now();

    // 같은 차례 앞 행이 429 를 받았다 — 보내지 않고 같은 대기로 돌려놓는다
    if (t < pacer.holdUntil) {
      const s = Math.max(1, Math.ceil((pacer.holdUntil - t) / 1000));
      await markSafe(deps, row.rcept_no, { ok: false, messageId: null, error: `rate:${s}`, retryInS: s }, "held");
      pacer.unsent.set(row.rcept_no, { firstSeenMs, attempts: row.attempts });
      out.failed += 1;
      continue;
    }

    const watch = deps.watches.find((w) => w.id === row.watch);
    const fmt = { alwaysShowFiler: watch?.alwaysShowFiler ?? true, hideFiler: watch?.hideFiler === true };
    // 이 실행이 넣고 첫 시도인 건은 우리 송신 속도 제한으로만 기다렸다 — 60초가 지나도 늦음이 아니다(리뷰 IN-03)
    const queuedOnlyHere = pacer.insertedHere.has(row.rcept_no) && row.attempts <= 1;
    const fields = { ...row, late: row.late || (!queuedOnlyHere && t - firstSeenMs > LATE_GAP_MS) };
    let r = await sendPaced(deps, pacer, alertText(fields, fmt));
    if (r.kind === "parse") {
      deps.log.error({ rceptNo: row.rcept_no, ...telegramSafeFields(r) }, "telegram parse error — resending as plain text");
      r = await sendPaced(deps, pacer, plainAlertText(fields, fmt), { plain: true });
    }

    if (r.kind === "ok") {
      await markSafe(deps, row.rcept_no, { ok: true, messageId: r.messageId, error: null, retryInS: 0 }, "ok");
      pacer.unsent.delete(row.rcept_no);
      out.sent += 1;
      continue;
    }

    const reason = failReason(r);
    const retry = retryInS(r, row.attempts);
    const kindError = KIND_ERROR[r.kind];
    if (kindError && !pacer.loggedKinds.has(r.kind)) {
      pacer.loggedKinds.add(r.kind);
      deps.log.error({ rceptNo: row.rcept_no, ...telegramSafeFields(r) }, kindError);
    }
    deps.log.warn({ rceptNo: row.rcept_no, attempts: row.attempts, reason, retryInS: retry, ...telegramSafeFields(r) }, "telegram send failed");
    await markSafe(deps, row.rcept_no, { ok: false, messageId: null, error: reason, retryInS: retry }, r.kind);
    pacer.unsent.set(row.rcept_no, { firstSeenMs, attempts: row.attempts });
    out.failed += 1;
  }

  logUnsent(deps, pacer);
  return out;
}
