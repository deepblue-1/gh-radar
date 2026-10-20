import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccumDetailResponse, AccumReportResponse } from "@gh-radar/shared";

import { ApiError, DmaUnmapped } from "../errors.js";

/**
 * Phase 34 — 매집감지 보고서 **조회 전용** 서비스 (D-06 · D-07).
 *
 * 서비스롤 `SupabaseClient` 를 인자로 받는 순수 함수 모듈(`teamflow-report.ts` 규약 — 헬퍼는 공용화하지 않고 복제).
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   D-06     게이트는 RPC 안의 `dma_visible_accounts(p_user_id)` 존재 검사가 정본이다(상한가 · 팀 매집 보고서와 같은
 *            「DMA 매핑 사용자」 판정). RPC 가 `{access:false}` 를 주면 403 `DMA_UNMAPPED` — 웹은 `DmaGate` 로 바꾼다.
 *            그 밖의 모양 위반(access 가 boolean 이 아님 · dates/rows 배열 아님 · row 가 null/객체 아님)은 500 `DB_ERROR`.
 *   T-19-17  인증된 `userId` 하나만 RPC 에 넘긴다(라우트가 requireAuth 로 확정한 값).
 *   T-19-01  RPC EXECUTE 는 service_role 전용(anon · authenticated 명시 REVOKE — 20261020200100).
 *   T-15-07  DB 오류 원문은 응답에 싣지 않는다(고정 문구 DB_ERROR). 원문은 `cause` 로 실어 errorHandler 가 warn 로그에만 남긴다.
 *   D-22     표 `limitup_accum_flow` 를 from() 으로 읽지 않는다 — RPC 만. kind 16(dma_strategy_events)과 join 하지 않는다.
 *
 * ★ Cloud Run → Supabase 왕복이 지연을 지배하므로 요청 하나 = RPC **1회**(jsonb 스칼라 — max_rows 무관).
 *   목록은 평평한 열만, 상세는 한 종목 payload(≤ ~224KB json) — 목록에 payload 를 싣지 않는다(D-06).
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

const FAIL = "매집감지 보고서 조회에 실패했습니다.";

/**
 * 하루 목록 한 장. `d` 생략 = 최신 보고서 날짜. 행 없는 날짜는 200 `rows: []`(빈 상태) 그대로 돌려준다(D-07).
 * 행은 RPC 가 실은 export 열 이름 그대로(snake_case · 평평한 37열)라 매퍼가 없다.
 */
export async function getAccumReport(
  supabase: SupabaseClient,
  userId: string,
  d?: string,
): Promise<AccumReportResponse> {
  const { data, error } = await supabase.rpc("accum_report_for_user", {
    p_user_id: userId,
    p_date: d ?? null,
  });
  if (error) throw DbError(FAIL, causeOf(error));
  if (!isObject(data)) throw DbError(FAIL, shapeCause("accum_report_for_user", data));
  // 403 은 RPC 가 명시적으로 `access:false` 를 줄 때만 — 모양 위반을 게이트로 숨기지 않는다.
  if (data.access === false) throw DmaUnmapped();
  if (data.access !== true) throw DbError(FAIL, shapeCause("accum_report_for_user.access", data.access));
  // 웹이 `dates.length` · `rows` 를 바로 읽는다 — 배열이 아니면 렌더 예외 대신 500.
  if (!Array.isArray(data.dates)) throw DbError(FAIL, shapeCause("accum_report_for_user.dates", data.dates));
  if (!Array.isArray(data.rows)) throw DbError(FAIL, shapeCause("accum_report_for_user.rows", data.rows));
  return data as unknown as AccumReportResponse;
}

/**
 * 한 종목 상세(평평한 열 + payload). 그 (date, isin) 행이 없으면 200 `row: null` 그대로(404 아님 — 33 D-07 결).
 */
export async function getAccumDetail(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  isin: string,
): Promise<AccumDetailResponse> {
  const { data, error } = await supabase.rpc("accum_detail_for_user", {
    p_user_id: userId,
    p_date: date,
    p_isin: isin,
  });
  if (error) throw DbError(FAIL, causeOf(error));
  if (!isObject(data)) throw DbError(FAIL, shapeCause("accum_detail_for_user", data));
  if (data.access === false) throw DmaUnmapped();
  if (data.access !== true) throw DbError(FAIL, shapeCause("accum_detail_for_user.access", data.access));
  // row 는 null(행 없음) 또는 객체 — 키 누락(undefined) · 수 · 배열은 모양 위반.
  if (data.row !== null && !isObject(data.row)) throw DbError(FAIL, shapeCause("accum_detail_for_user.row", data.row));
  return data as unknown as AccumDetailResponse;
}
