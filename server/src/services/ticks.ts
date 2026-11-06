import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TickCancelResponse,
  TickConvertRequest,
  TickConvertResponse,
  TickDayResponse,
  TickOpenGrid,
  TickOpenResponse,
  TickOwnResponse,
  TickTodayResponse,
} from "@gh-radar/shared";

import { ApiError, DmaUnmapped } from "../errors.js";
import { logger } from "../logger.js";
import type { TickConvertBodyT, TickOpenQueryT } from "../schemas/ticks.js";
import { isAmbiguousTriggerFailure, type TickConvertTrigger } from "./tick-convert-trigger.js";

/**
 * Phase 37 — 틱 전문 뷰어 과거 경로 서비스 (D-03 · D-08 · D-09 · D-15).
 *
 * 서비스롤 `SupabaseClient` 를 인자로 받는 순수 함수 모듈(`accum-report.ts` 규약 — 헬퍼는 공용화하지 않고 복제).
 * 브라우저는 격자 바이트를 서명 URL 로 Storage 에서 직접 받는다(Cloud Run 무경유 · limitup-grid 선례).
 * server 는 게이트 · 서명 · 요청 변환 트리거만 맡는다.
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   D-08     게이트는 RPC 안의 `dma_visible_accounts(p_user_id)` 존재 검사가 정본이다. RPC 가 `{access:false}` 를 주면
 *            403 `DMA_UNMAPPED`. 그 밖의 모양 위반(access 가 boolean 아님 · 배열 아님 · grid 가 null/객체 아님)은 500 `DB_ERROR`.
 *   T-19-17  인증된 `userId` 하나만 RPC 에 넘긴다(라우트가 requireAuth 로 확정한 값).
 *   T-19-01  RPC EXECUTE 는 service_role 전용(anon · authenticated 명시 REVOKE — 37-04).
 *   T-15-07  DB · Storage 오류 원문은 응답에 싣지 않는다(고정 문구 DB_ERROR). 원문은 `cause` 로 실어 errorHandler 가 warn 로그에만.
 *   비노출   격자 Storage 경로(`object_path`)는 응답에 싣지 않는다 — 서명 URL 만.
 *   38 D-01  「우리 체결」 가시성(가시 계좌 · 어드민 전 계좌)은 RPC `tick_own_for_user` 안의 판정이다 — 어드민 여부는 RPC 가
 *            `app_users.role` 로 매 요청 직접 본다(분기 인자 없음). 클라이언트 입력(쿼리 문자열)은 계좌 · 어드민을 켤 수 없다.
 *   38 D-03  우리 체결 · 이벤트 · 보조 주문은 `dma_servers.enabled` 게이트웨이 행만 — RPC 안 조인(server 에 게이트웨이 키 하드코딩 0).
 *
 *   D-03     요청 변환은 RPC 가 `should_trigger: true` 를 준 호출에서만 Admin API `jobs:run` 을 부른다 — 같은 (날짜, 거래소)를
 *            N 명이 요청해도 Job 실행 1회(판정은 RPC 안 advisory 잠금). 상한 · 업로드 전 날짜 판정도 RPC 안이다.
 *
 * ★ Cloud Run → Supabase 왕복이 지연을 지배하므로 요청 하나 = RPC **1회**(+ 격자가 있을 때만 `createSignedUrl` 1회).
 *   요청 변환은 RPC 1회 + (should_trigger 일 때만) Admin API 1회 + (그게 실패했을 때만) 되돌림 RPC 1회.
 */

const DbError = (msg: string, cause: unknown) => new ApiError(500, "DB_ERROR", msg, cause);

/** PostgREST 오류에서 로그에 남길 필드만 — 객체 통째로 싣지 않는다. */
const causeOf = (e: { message?: string; code?: string; details?: string | null; hint?: string | null }) => ({
  code: e.code,
  message: e.message,
  details: e.details ?? undefined,
  hint: e.hint ?? undefined,
});
/** 응답 모양 위반 — 무엇이 왔는지(타입)만. */
const shapeCause = (what: string, v: unknown) => ({
  reason: `${what} 모양 위반`,
  type: Array.isArray(v) ? "array" : v === null ? "null" : typeof v,
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const FAIL = "틱 전문 뷰어 조회에 실패했습니다.";

/** 비공개 버킷(37-04 마이그레이션이 만든다) · 객체 경로 `grid/<D>/<EX>/<isin>.<mode>.ticks.zst`(변환 Job 이 올린다). */
export const TICK_GRID_BUCKET = "tick-grid";
/** 서명 URL 수명(초) — 상한가 격자와 같은 600. 웹은 만료 전까지 쓰고 실패 시 open 을 다시 부른다. */
export const TICK_GRID_URL_TTL_S = 600;

/** RPC 가 준 jsonb 를 게이트 · 모양 검사한다 — access false → 403 · 그 밖의 위반 → 500. */
function gate(fn: string, data: unknown): Record<string, unknown> {
  if (!isObject(data)) throw DbError(FAIL, shapeCause(fn, data));
  // 403 은 RPC 가 명시적으로 `access:false` 를 줄 때만 — 모양 위반을 게이트로 숨기지 않는다.
  if (data.access === false) throw DmaUnmapped();
  if (data.access !== true) throw DbError(FAIL, shapeCause(`${fn}.access`, data.access));
  return data;
}

const GRID_MODES: readonly string[] = ["nightly", "request", "promoted"];
const EXCHANGES: readonly string[] = ["KRX", "NXT"];
const isNat = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isMsOrNull = (v: unknown): boolean => v === null || v === undefined || (typeof v === "number" && Number.isFinite(v));

/**
 * `tick_open_for_user` 응답 모양 검사(IN-34) — 웹이 그대로 쓰는 필드를 `as` 캐스트로 흘리지 않는다. 위반 = 500 DB_ERROR.
 * grid 가 있으면 서명 **전에** 본다(모양이 틀린 행에 서명 URL 을 발급하지 않는다).
 */
function checkOpenShape(out: Record<string, unknown>, raw: Record<string, unknown> | null): void {
  const bad = (k: string, v: unknown): never => {
    throw DbError(FAIL, shapeCause(`tick_open_for_user.${k}`, v));
  };
  if (typeof out.date !== "string") bad("date", out.date);
  if (typeof out.exchange !== "string" || !EXCHANGES.includes(out.exchange)) bad("exchange", out.exchange);
  if (typeof out.isin !== "string") bad("isin", out.isin);
  if (typeof out.eta_s !== "number" || !Number.isFinite(out.eta_s)) bad("eta_s", out.eta_s);
  if (raw === null) return;
  for (const k of ["bytes", "records", "a3_count"] as const) if (!isNat(raw[k])) bad(`grid.${k}`, raw[k]);
  if (typeof raw.mode !== "string" || !GRID_MODES.includes(raw.mode)) bad("grid.mode", raw.mode);
  if (!Array.isArray(raw.sources) || !raw.sources.every((x) => typeof x === "string")) bad("grid.sources", raw.sources);
  if (typeof raw.fmt !== "string") bad("grid.fmt", raw.fmt);
  if (typeof raw.created_at !== "string") bad("grid.created_at", raw.created_at);
  for (const k of ["first_recv_ms", "last_recv_ms"] as const) if (!isMsOrNull(raw[k])) bad(`grid.${k}`, raw[k]);
}

/** 하루 목록 한 장. `d` 생략 = 최신 격자 날짜. 이력 0 이면 200 `date: null · rows: []`. */
export async function getTickDay(supabase: SupabaseClient, userId: string, d?: string): Promise<TickDayResponse> {
  const { data, error } = await supabase.rpc("tick_day_for_user", { p_user_id: userId, p_date: d ?? null });
  if (error) throw DbError(FAIL, causeOf(error));
  const out = gate("tick_day_for_user", data);
  for (const k of ["dates", "rows", "requests"] as const) {
    if (!Array.isArray(out[k])) throw DbError(FAIL, shapeCause(`tick_day_for_user.${k}`, out[k]));
  }
  return out as unknown as TickDayResponse;
}

/**
 * 오늘 목록(매집감지 등록 ∪ 고가 +15%). `live` = 당일 바이트 경로가 결선됐는지 — RPC 가 아니라 server 가 덧붙인다
 * (tickgw 결선 전엔 false → 웹 「당일 자료 준비 중」).
 */
export async function getTickToday(
  supabase: SupabaseClient,
  userId: string,
  live: boolean,
): Promise<TickTodayResponse> {
  const { data, error } = await supabase.rpc("tick_today_for_user", { p_user_id: userId });
  if (error) throw DbError(FAIL, causeOf(error));
  const out = gate("tick_today_for_user", data);
  if (!Array.isArray(out.rows)) throw DbError(FAIL, shapeCause("tick_today_for_user.rows", out.rows));
  return { ...(out as unknown as Omit<TickTodayResponse, "live">), live };
}

/** `tick_open_for_user` RPC 1회 — 인자는 정확히 4개(인증된 userId 하나 · T-19-17). 오류 원문은 cause 로만. */
async function callOpen(supabase: SupabaseClient, userId: string, q: TickOpenQueryT): Promise<unknown> {
  const { data, error } = await supabase.rpc("tick_open_for_user", {
    p_user_id: userId,
    p_date: q.d,
    p_isin: q.isin,
    p_ex: q.ex,
  });
  if (error) throw DbError(FAIL, causeOf(error));
  return data;
}

/** 게이트(access false → 403) · 봉투 · grid 모양 검사. grid 는 null 또는 객체. */
function checkedOpen(data: unknown): { out: Record<string, unknown>; raw: Record<string, unknown> | null } {
  const out = gate("tick_open_for_user", data);
  const raw = out.grid;
  if (raw !== null && !isObject(raw)) throw DbError(FAIL, shapeCause("tick_open_for_user.grid", raw));
  checkOpenShape(out, raw);
  return { out, raw };
}

function objectPathOf(raw: Record<string, unknown>): string {
  const path = raw.object_path;
  if (typeof path !== "string" || path === "") {
    throw DbError(FAIL, shapeCause("tick_open_for_user.grid.object_path", path));
  }
  return path;
}

/** 서버 전용 열기 결과 — 격자 Storage 경로를 지우지 않는다(응답으로 내보내지 않는 서버 안 소비 전용). */
export type TickGridForServer =
  | { access: false }
  | {
      access: true;
      grid: { objectPath: string; fmt: string; bytes: number } | null;
      etaS: number;
      request: TickConvertRequest | null;
    };

/**
 * Phase 39 (D-12) — 진단 전문가의 시세 도구가 격자를 **서버가 직접** Storage 에서 받도록 여는 함수.
 * `openTick` 과 같은 RPC · 게이트 · 모양 검사를 쓰되 서명 URL 을 만들지 않고 `object_path` 를 돌려준다
 * (브라우저 경유 없음 · 서명 1회 절약). `access:false` 는 throw 대신 `{access:false}` — 도구가 「자료 없음」 으로 바꾼다.
 * 이 결과는 HTTP 응답으로 내보내지 않는다(`object_path` 비노출 규칙은 `openTick` 이 그대로 지킨다).
 */
export async function openTickGridForServer(
  supabase: SupabaseClient,
  userId: string,
  q: TickOpenQueryT,
): Promise<TickGridForServer> {
  const data = await callOpen(supabase, userId, q);
  if (isObject(data) && data.access === false) return { access: false };
  const { out, raw } = checkedOpen(data);
  return {
    access: true,
    grid: raw ? { objectPath: objectPathOf(raw), fmt: raw.fmt as string, bytes: raw.bytes as number } : null,
    etaS: out.eta_s as number,
    request: req(out.request),
  };
}

/**
 * 한 종목 열기. 격자가 있으면 그 객체 하나에 서명 URL 을 붙인다(`object_path` 는 응답에서 뺀다).
 * 격자가 없으면 서명 0회 · `grid: null` — 웹은 `request`(stale 포함)를 보고 요청 변환을 부른다.
 */
export async function openTick(
  supabase: SupabaseClient,
  userId: string,
  q: TickOpenQueryT,
): Promise<TickOpenResponse> {
  const { out, raw } = checkedOpen(await callOpen(supabase, userId, q));

  let grid: TickOpenGrid | null = null;
  if (raw) {
    const path = objectPathOf(raw);
    const signed = await supabase.storage.from(TICK_GRID_BUCKET).createSignedUrl(path, TICK_GRID_URL_TTL_S);
    if (signed.error || !signed.data?.signedUrl) {
      throw DbError(
        "틱 격자 주소 발급에 실패했습니다.",
        signed.error ? { storage: signed.error.message } : shapeCause("createSignedUrl", signed.data),
      );
    }
    grid = {
      url: signed.data.signedUrl,
      expiresIn: TICK_GRID_URL_TTL_S,
      bytes: raw.bytes as number,
      records: raw.records as number,
      a3_count: raw.a3_count as number,
      mode: raw.mode as TickOpenGrid["mode"],
      sources: raw.sources as TickOpenGrid["sources"],
      fmt: raw.fmt as string,
      first_recv_ms: (raw.first_recv_ms ?? null) as number | null,
      last_recv_ms: (raw.last_recv_ms ?? null) as number | null,
      created_at: raw.created_at as string,
    };
  }

  return {
    access: true,
    date: out.date as string,
    exchange: out.exchange as TickOpenResponse["exchange"],
    isin: out.isin as string,
    stock: (out.stock ?? null) as TickOpenResponse["stock"],
    grid,
    request: (out.request ?? null) as TickOpenResponse["request"],
    accum: (out.accum ?? null) as TickOpenResponse["accum"],
    eta_s: out.eta_s as number,
  };
}

// ── 우리 주문 · 체결 (Phase 38 · D-01 · D-03 · D-14) ─────────────────────

/**
 * 한 종목 · 하루의 우리 체결 · 전략 주문 이벤트 · 보조 주문 — RPC `tick_own_for_user` 1회.
 * 가시성(가시 계좌 · 어드민 전 계좌)과 켜진 서버 거름은 RPC 안이다 — 여기서 행을 거르지도 짝짓지도 않는다
 * (짝짓기는 틱 바이트가 있는 브라우저의 shared `matchOwnFills`). RPC 인자는 정확히 4개 — 어드민 · 계좌를 고르는
 * 클라이언트 입력은 RPC 에 실리지 않는다. 캐시 없음(과거는 열 때 1회 · 당일은 사용자 클릭 때 1회).
 */
export async function getTickOwn(
  supabase: SupabaseClient,
  userId: string,
  q: TickOpenQueryT,
): Promise<TickOwnResponse> {
  const { data, error } = await supabase.rpc("tick_own_for_user", {
    p_user_id: userId,
    p_date: q.d,
    p_isin: q.isin,
    p_ex: q.ex,
  });
  if (error) throw DbError(FAIL, causeOf(error));
  const out = gate("tick_own_for_user", data);
  for (const k of ["servers", "fills", "events", "orders"] as const) {
    if (!Array.isArray(out[k])) throw DbError(FAIL, shapeCause(`tick_own_for_user.${k}`, out[k]));
  }
  return out as unknown as TickOwnResponse;
}

// ── 요청 변환 (D-03) ────────────────────────────────────────────────

/** 하루 상한 기본값 — config `TICK_REQUEST_DAILY_CAP`(전역 · 사용자별 아님 · 비용 가드). */
export const TICK_REQUEST_DAILY_CAP_DEFAULT = 20;

/** 429 — 오늘(KST) 깨운 요청 수가 전역 상한 이상(RPC capped). */
export const TickConvertCapped = () =>
  new ApiError(429, "TICK_CONVERT_CAPPED", "오늘 요청 변환 한도에 도달했어요. 내일 다시 시도해 주세요.");
/** 502 — Admin API jobs:run 실패(권한 · 네트워크 · 타임아웃). 원문은 cause 로 로그에만. */
export const TickConvertTriggerFailed = (cause: unknown) =>
  new ApiError(502, "TICK_CONVERT_TRIGGER_FAILED", "변환 작업을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.", cause);
/** 503 — `TICK_CONVERT_JOB` 미설정(트리거 미결선). */
export const TickConvertUnavailable = (cause?: unknown) =>
  new ApiError(503, "TICK_CONVERT_UNAVAILABLE", "요청 변환을 지금 쓸 수 없어요.", cause);

const req = (v: unknown) => (v ?? null) as TickConvertRequest | null;

/**
 * 깨우기 실패 — 찍어 둔 triggered_at 을 되돌려 다음 요청(또는 open 의 stale)이 다시 깨울 수 있게 한다.
 * 되돌림 자체가 실패해도 사용자 응답은 원래 오류 그대로(되돌림 원문은 cause 로 로그에만 · stale 2분이 결국 다시 깨운다).
 */
async function rollbackTrigger(
  supabase: SupabaseClient,
  body: TickConvertBodyT,
  code: string,
): Promise<Record<string, unknown> | undefined> {
  const { error } = await supabase.rpc("tick_request_trigger_failed", {
    p_date: body.d,
    p_ex: body.ex,
    p_error: code,
  });
  return error ? causeOf(error) : undefined;
}

/**
 * 요청 변환 — RPC `tick_request_convert_for_user` 1회로 큐에 넣고 should_trigger 를 받는다.
 * - capped → 429 · not_uploaded / grid_ready → 200(Job 0회)
 * - should_trigger → trigger.run(날짜, 거래소) 1회. 트리거 미결선 → 되돌림(TRIGGER_DISABLED) + 503 · 실패 → 되돌림 + 502.
 * - 타임아웃(status 0 · TIMEOUT)은 되돌리지 않는다(IN-31) — Admin API 가 실행을 이미 만들었을 수 있어, 되돌리면 다음 요청이
 *   Job 을 또 깨워 빈 실행과 상한 소모가 생긴다. triggered_at 을 그대로 두고 stale 2분 규칙(Job 이 claim 하지 않은 pending 을
 *   다음 요청이 다시 깨운다)에 맡긴다 → 200 triggered true(웹은 「변환 중」 으로 폴링).
 */
export async function requestTickConvert(
  supabase: SupabaseClient,
  userId: string,
  body: TickConvertBodyT,
  deps: { trigger?: TickConvertTrigger; dailyCap: number },
): Promise<TickConvertResponse> {
  const { data, error } = await supabase.rpc("tick_request_convert_for_user", {
    p_user_id: userId,
    p_date: body.d,
    p_isin: body.isin,
    p_ex: body.ex,
    p_daily_cap: deps.dailyCap,
  });
  if (error) throw DbError(FAIL, causeOf(error));
  const out = gate("tick_request_convert_for_user", data);
  for (const k of ["should_trigger", "capped", "grid_ready", "not_uploaded"] as const) {
    if (typeof out[k] !== "boolean") throw DbError(FAIL, shapeCause(`tick_request_convert_for_user.${k}`, out[k]));
  }
  if (out.capped === true) throw TickConvertCapped();

  let triggered = false;
  if (out.should_trigger === true) {
    if (!deps.trigger) {
      const rollback = await rollbackTrigger(supabase, body, "TRIGGER_DISABLED");
      throw TickConvertUnavailable({ reason: "TICK_CONVERT_JOB 미설정", ...(rollback ? { rollback } : {}) });
    }
    const r = await deps.trigger.run(body.d, body.ex);
    if (isAmbiguousTriggerFailure(r)) {
      logger.warn({ date: body.d, ex: body.ex }, "tick convert trigger: 타임아웃 — 실행이 시작됐을 수 있어 되돌리지 않는다(stale 2분 규칙)");
    } else if (!r.ok) {
      const rollback = await rollbackTrigger(supabase, body, `TRIGGER_FAILED:${r.status}`);
      throw TickConvertTriggerFailed({ status: r.status, error: r.error, ...(rollback ? { rollback } : {}) });
    }
    triggered = true;
  }

  return {
    access: true,
    grid_ready: out.grid_ready as boolean,
    capped: false,
    triggered,
    not_uploaded: out.not_uploaded as boolean,
    retry_after: (out.retry_after ?? null) as string | null,
    request: req(out.request),
    ...(typeof out.eta_s === "number" ? { eta_s: out.eta_s } : {}),
  };
}

/** 요청 취소 — pending 요청에서 내 몫만 뺀다 · 마지막 요청자면 요청이 cancelled(판정은 RPC 안 · WR-02). 내 몫이 없으면 200 `cancelled: false`. */
export async function cancelTickConvert(
  supabase: SupabaseClient,
  userId: string,
  body: TickConvertBodyT,
): Promise<TickCancelResponse> {
  const { data, error } = await supabase.rpc("tick_cancel_convert_for_user", {
    p_user_id: userId,
    p_date: body.d,
    p_isin: body.isin,
    p_ex: body.ex,
  });
  if (error) throw DbError(FAIL, causeOf(error));
  const out = gate("tick_cancel_convert_for_user", data);
  if (typeof out.cancelled !== "boolean") {
    throw DbError(FAIL, shapeCause("tick_cancel_convert_for_user.cancelled", out.cancelled));
  }
  return { access: true, cancelled: out.cancelled, request: req(out.request) };
}
