import { DartApiError, type DartErrorKind, type DartRow } from "./dart/client";
import { alertText } from "./message";
import { safeErrorFields, type SafeErrorFields } from "./safeError";
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
 * - DB 오류(임대 잃음 55000 포함)는 삼키지 않고 위로 보낸다 — 수집기(43-05)가 종료 이유를 정한다.
 *   재시도 · 대기 · 방 이동 · mark 실패 처리는 43-06 이 deliverPending 을 넓힌다.
 */

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

/** `dart_alert_claim` 반환 원소(43-02 가 `stale` 을 더한다) */
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
  dart: { list(watch: Watch, day: string): Promise<{ rows: DartRow[]; calls: number }> };
  db: {
    insert(items: InsertItem[], seed: boolean): Promise<InsertedRow[]>;
    claim(limit: number): Promise<ClaimedRow[]>;
    mark(rceptNo: string, r: MarkInput): Promise<boolean>;
  };
  telegram: { send(text: string, opts?: { plain?: boolean }): Promise<SendResult> };
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
}

export interface CollectResult {
  results: WatchResult[];
  /** 이 바퀴의 OpenDART 호출 수 — 실패 호출 포함 */
  calls: number;
  inserted: InsertedRow[];
}

/** YYYYMMDD → YYYY-MM-DD (DB date) */
function toIsoDate(ymd: string): string {
  return /^[0-9]{8}$/.test(ymd) ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : ymd;
}

/**
 * 감시 대상 순서대로 조회 → 판정 → 처음 보는 보낼 행만 모아 한 번에 넣는다.
 * 감시 대상 하나의 실패는 나머지를 막지 않는다(사유는 warn). 넣기가 실패하면 `seen` 에 넣지 않아 다음 바퀴에 다시.
 */
export async function collectOnce(
  deps: LapDeps,
  state: LapState,
  day: string,
  opts: { isLate(w: WatchId): boolean; seed: boolean },
): Promise<CollectResult> {
  const results: WatchResult[] = [];
  const items: InsertItem[] = [];
  const judged = new Set<string>();
  let calls = 0;

  for (const watch of deps.watches) {
    // 늦은 알림 판정은 조회 **전에** — 조회가 오래 걸려도 그 바퀴 기준점은 바뀌지 않는다
    const late = opts.isLate(watch.id);
    const startedAt = deps.clock.now();
    try {
      const { rows, calls: c } = await deps.dart.list(watch, day);
      calls += c;
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
        items.push({
          rcept_no: rceptNo,
          watch: watch.id,
          priority: watch.priority,
          rcept_dt: toIsoDate(row.rcept_dt),
          corp_cls: row.corp_cls,
          corp_name: row.corp_name,
          stock_code: row.stock_code,
          report_nm: row.report_nm,
          flr_nm: row.flr_nm ?? "",
          late,
        });
      }
      results.push({ watch: watch.id, ok: true, okAt: startedAt });
    } catch (err) {
      calls += err instanceof DartApiError ? (err.calls ?? 1) : 1;
      const fields = safeErrorFields(err);
      const kind = err instanceof DartApiError ? err.kind : undefined;
      results.push({ watch: watch.id, ok: false, error: fields, ...(kind ? { kind } : {}) });
      deps.log.warn({ watch: watch.id, err: fields }, "dart list failed");
    }
  }

  let inserted: InsertedRow[] = [];
  if (items.length > 0) {
    try {
      inserted = await deps.db.insert(items, opts.seed);
    } catch (err) {
      // seen 에 넣지 않는다 → 다음 바퀴에 같은 행을 다시 넣는다. 임대 잃음 판정은 수집기 몫이라 위로 보낸다
      deps.log.warn({ items: items.length, calls, err: safeErrorFields(err) }, "dart alert insert failed");
      throw err;
    }
  }
  for (const rceptNo of judged) state.seen.add(rceptNo);

  return { results, calls, inserted };
}

export interface DeliverResult {
  claimed: number;
  sent: number;
  failed: number;
}

/** 실패 사유 한 줄(DB `last_error` · 300자 상한 안) — 토큰 · 방 id · URL 없음 */
function failReason(r: Exclude<SendResult, { kind: "ok" }>): string {
  if (r.kind === "migrated") return "migrated";
  if (r.kind === "rate") return `rate:${r.retryAfterS}`;
  return `${r.kind}:${r.code}`;
}

/** 송신 차례를 받아 행마다 두 줄 문구 → sendMessage → 결과 기록 */
export async function deliverPending(deps: LapDeps, limit: number): Promise<DeliverResult> {
  const rows = await deps.db.claim(limit);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const watch = deps.watches.find((w) => w.id === row.watch);
    const text = alertText(row, { alwaysShowFiler: watch?.alwaysShowFiler ?? true });
    const r = await deps.telegram.send(text);
    if (r.kind === "ok") {
      await deps.db.mark(row.rcept_no, { ok: true, messageId: r.messageId, error: null, retryInS: 0 });
      sent += 1;
    } else {
      const reason = failReason(r);
      await deps.db.mark(row.rcept_no, { ok: false, messageId: null, error: reason, retryInS: 5 });
      deps.log.warn({ rceptNo: row.rcept_no, attempts: row.attempts, reason }, "telegram send failed");
      failed += 1;
    }
  }
  return { claimed: rows.length, sent, failed };
}
