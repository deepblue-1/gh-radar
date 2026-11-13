import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimedRow, InsertedRow, InsertItem, LapDeps, MarkInput } from "./lap";

/**
 * Phase 43-02 — 워커 쪽 DB 어댑터.
 *
 * 워커가 DB 를 부르는 곳은 이 파일 한 곳이다 — rpc 이름 · `p_*` 인자 키 · 읽는 반환 키 · 상태 표 칸을 바꾸면
 * tests/dbContract.test.ts 가 마이그레이션(supabase/migrations/*_dart_alert*.sql — 나중 정의가 이김)과 대조해 실패한다(체커 W5).
 * PostgREST 는 이름 붙은 인자로 함수를 찾으므로 하나라도 어긋나면 운영에서 「함수를 못 찾음」 이 난다.
 *
 * - 넣기 · 차례 반환 jsonb 배열은 변환 없이 그대로 돌려준다(43-01 계약 — 키 = 컬럼 이름 = lap.ts 타입 키).
 * - 임대 보유자 확인 실패(ERRCODE 55000)는 `LeaseLostError` 로 바꾼다 — 수집기(43-05 · 43-06)가 「임대 잃음」 으로 읽는다.
 * - 그 밖의 DB 오류는 함수 이름 · code · message 만 담는다. 인자 값 · holder · 접수번호 · PostgREST details/hint
 *   (행 값이 실릴 수 있음) · 요청 정보는 싣지 않는다.
 */

/** 넣기 · 차례 · 기록 · 장애 RPC 가 55000(임대 보유자 아님 · 만료 포함)으로 거절했다 */
export class LeaseLostError extends Error {
  override readonly name = "LeaseLostError";
  constructor(fn: string) {
    super(`${fn}: 임대를 잃었다(55000)`);
  }
}

/**
 * 그 밖의 DB 오류 — 함수 이름 · SQLSTATE(`code`) · message 만. `code` 로 「행 값 때문의 거절」(22 · 23 계열)과
 * 「DB · 네트워크 문제」 를 가른다(넣기 묶음에서 한 행이 나머지를 막지 않게 — 리뷰 WR-01).
 */
export class DbError extends Error {
  override readonly name = "DbError";
  constructor(
    message: string,
    /** PostgREST 가 준 SQLSTATE(예 `23502`) — 없으면 null */
    readonly code: string | null,
  ) {
    super(message);
  }
}

export interface LeaseResult {
  held: boolean;
  fresh: boolean;
  /** 새로 잡을 때 오늘 sending → pending 으로 되돌린 수(> 0 이면 수집기가 warn `possible duplicate after takeover`) */
  reclaimed: number;
  /** 새로 잡을 때 지난 날 pending · sending → expired 로 닫은 수 */
  expired: number;
}

export interface DartAlertState {
  /** 감시 대상별 마지막 성공 조회 시각(ISO) */
  lastOk: Record<string, string>;
  /** reason = 처음 연 실행의 사유(다시 열 때 그대로 쓴다 — 리뷰 IN-01) */
  outage: { since: string | null; reason: string | null; notice: string | null };
}

export type OutageAction = "open" | "notice" | "close";

/**
 * 43-05 `CollectorDeps.db` 가 이 타입에 usage · strikes 를 더해 쓰고, 43-05 가짜 DB 가 이 타입을 구현한다.
 * insert · claim · mark 는 43-01 `LapDeps["db"]` 모양 그대로.
 */
export type DartAlertDb = LapDeps["db"] & {
  leaseAcquire(holder: string, ttlS: number, lastOk?: Record<string, string>): Promise<LeaseResult>;
  leaseRelease(holder: string): Promise<boolean>;
  readState(): Promise<DartAlertState>;
  /**
   * 반환 jsonb 그대로 — open `{opened, since?}` · notice `{noticed}` · close `{closed, notify?, since?}`.
   * `sinceIso` = open 의 장애 시작 시각(워커 기준점 · `p_since` — 리뷰 IN-01). 없으면 DB 가 now() 로 적는다.
   */
  outage(action: OutageAction, reason?: string, sinceIso?: string): Promise<Record<string, unknown>>;
  /** 그날(KST `YYYY-MM-DD`) 아직 못 나간 알림 수(pending · sending) — 멈추기 직전 error 판정(리뷰 WR-05) */
  countUnsent(dateKst: string): Promise<number>;
};

// ── 워커가 읽는 반환 키(계약 테스트가 마이그레이션 함수 본문과 대조) ──────────
// 타입에 있는 키가 목록에 빠지면 typecheck 가 실패한다(아래 AssertNever) — 43-06 이 ClaimedRow 에 stale 을 더해도 함께 맞는다.
export const LEASE_RESULT_KEYS = ["held", "fresh", "reclaimed", "expired"] as const;
export const INSERTED_ROW_KEYS = ["rcept_no", "late"] as const;
export const CLAIMED_ROW_KEYS = [
  "rcept_no",
  "watch",
  "corp_cls",
  "corp_name",
  "stock_code",
  "report_nm",
  "flr_nm",
  "late",
  "attempts",
  "first_seen_at",
  "stale",
] as const;
export const OUTAGE_RESULT_KEYS = ["opened", "closed", "notify", "since"] as const;

type AssertNever<T extends never> = T;
type MissingKeys<T, L extends readonly string[]> = Exclude<keyof T, L[number]>;
export type LeaseResultKeysComplete = AssertNever<MissingKeys<LeaseResult, typeof LEASE_RESULT_KEYS>>;
export type InsertedRowKeysComplete = AssertNever<MissingKeys<InsertedRow, typeof INSERTED_ROW_KEYS>>;
export type ClaimedRowKeysComplete = AssertNever<MissingKeys<ClaimedRow, typeof CLAIMED_ROW_KEYS>>;

// ── 오류 · 호출 도우미 ─────────────────────────────────────────────
function dbError(fn: string, e: unknown): Error {
  const o = (e ?? {}) as { code?: unknown; message?: unknown };
  if (o.code === "55000") return new LeaseLostError(fn);
  const sqlstate = typeof o.code === "string" && o.code !== "" ? o.code.slice(0, 16) : null;
  const msg = typeof o.message === "string" ? o.message.slice(0, 200) : "unknown";
  return new DbError(`${fn} 실패${sqlstate ? ` (${sqlstate})` : ""}: ${msg}`, sqlstate);
}

/**
 * 행 값 때문에 DB 가 거절했다 — SQLSTATE 22(데이터 예외 · 22023 제외) · 23(무결성 위반). 같은 행을 다시 넣어도 같은 실패라
 * 재시도할 일이 아니다. 22023 은 RPC 가 인자 모양(배열 아님 등) 검사에 쓰는 값이라 행 탓이 아니다.
 */
export function isRowRejection(err: unknown): boolean {
  return err instanceof DbError && err.code !== null && /^2[23]/.test(err.code) && err.code !== "22023";
}

async function rpc(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  let res: { data: unknown; error: unknown };
  try {
    res = await supabase.rpc(fn, args);
  } catch (e) {
    // 던진 오류(네트워크 등)도 안전한 필드만 — 원래 객체에는 요청 정보가 실릴 수 있다
    throw dbError(fn, e);
  }
  if (res.error) throw dbError(fn, res.error);
  return res.data;
}

async function rpcBool(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<boolean> {
  const data = await rpc(supabase, fn, args);
  if (typeof data !== "boolean") throw new Error(`${fn} 실패: boolean 이 아닌 반환(${typeof data})`);
  return data;
}

async function rpcArray<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const data = await rpc(supabase, fn, args);
  if (!Array.isArray(data)) throw new Error(`${fn} 실패: 배열이 아닌 반환(${typeof data})`);
  return data as T[];
}

async function rpcObject(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const data = await rpc(supabase, fn, args);
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${fn} 실패: 객체가 아닌 반환(${Array.isArray(data) ? "array" : typeof data})`);
  }
  return data as Record<string, unknown>;
}

function toLease(fn: string, o: Record<string, unknown>): LeaseResult {
  const { held, fresh, reclaimed, expired } = o;
  if (
    typeof held !== "boolean" ||
    typeof fresh !== "boolean" ||
    typeof reclaimed !== "number" ||
    typeof expired !== "number"
  ) {
    throw new Error(`${fn} 실패: 반환 키(${LEASE_RESULT_KEYS.join(" · ")}) 모양이 다르다`);
  }
  return { held, fresh, reclaimed, expired };
}

function toLastOk(v: unknown): Record<string, string> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, t] of Object.entries(v as Record<string, unknown>)) if (typeof t === "string") out[k] = t;
  return out;
}

const STATE_TABLE = "dart_alert_state";
const ALERTS_TABLE = "dart_alerts";
/** 아직 못 나간 상태 — sent · seeded · expired 는 끝난 행 */
export const UNSENT_STATUSES = ["pending", "sending"] as const;
const STATE_COLUMNS = "last_ok, outage_since, outage_reason, outage_notice";

/**
 * Supabase 서비스롤 클라이언트에 RPC 여섯과 상태 표 읽기를 결선한다.
 * `holder` 는 이 실행의 임대 보유자 이름 — 넣기 · 차례 · 기록 · 장애의 `p_holder` 로 간다.
 */
export function createDartAlertDb(supabase: SupabaseClient, holder: string): DartAlertDb {
  return {
    async leaseAcquire(h, ttlS, lastOk) {
      const args: Record<string, unknown> = { p_holder: h, p_ttl_seconds: ttlS };
      if (lastOk !== undefined) args.p_last_ok = lastOk;
      return toLease("dart_alert_lease_acquire", await rpcObject(supabase, "dart_alert_lease_acquire", args));
    },

    leaseRelease: (h) => rpcBool(supabase, "dart_alert_lease_release", { p_holder: h }),

    async readState() {
      const { data, error } = await supabase.from(STATE_TABLE).select(STATE_COLUMNS).eq("id", 1).maybeSingle();
      if (error) throw dbError(`${STATE_TABLE} 읽기`, error);
      const row = data as {
        last_ok?: unknown;
        outage_since?: string | null;
        outage_reason?: string | null;
        outage_notice?: string | null;
      } | null;
      return {
        lastOk: toLastOk(row?.last_ok),
        outage: { since: row?.outage_since ?? null, reason: row?.outage_reason ?? null, notice: row?.outage_notice ?? null },
      };
    },

    insert: (items: InsertItem[], seed: boolean) =>
      rpcArray<InsertedRow>(supabase, "dart_alert_insert", { p_holder: holder, p_items: items, p_seed: seed }),

    claim: (limit: number) => rpcArray<ClaimedRow>(supabase, "dart_alert_claim", { p_holder: holder, p_limit: limit }),

    mark: (rceptNo: string, r: MarkInput) =>
      rpcBool(supabase, "dart_alert_mark", {
        p_holder: holder,
        p_rcept_no: rceptNo,
        p_ok: r.ok,
        p_message_id: r.messageId,
        p_error: r.error,
        p_retry_in_s: r.retryInS,
      }),

    async countUnsent(dateKst) {
      // 행 값은 읽지 않는다 — 수만(head + count)
      const { count, error } = await supabase
        .from(ALERTS_TABLE)
        .select("rcept_no", { count: "exact", head: true })
        .eq("rcept_dt", dateKst)
        .in("status", [...UNSENT_STATUSES]);
      if (error) throw dbError(`${ALERTS_TABLE} 미송신 수`, error);
      if (typeof count !== "number") throw new DbError(`${ALERTS_TABLE} 미송신 수 실패: count 없음`, null);
      return count;
    },

    outage(action, reason, sinceIso) {
      const args: Record<string, unknown> = { p_holder: holder, p_action: action };
      if (reason !== undefined) args.p_reason = reason;
      if (sinceIso !== undefined) args.p_since = sinceIso;
      return rpcObject(supabase, "dart_alert_outage", args);
    },
  };
}
