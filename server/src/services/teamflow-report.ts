import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamflowReportResponse } from "@gh-radar/shared";

import { ApiError, DmaUnmapped } from "../errors.js";

/**
 * Phase 33 — 팀 매집 보고서 **조회 전용** 서비스 (D-05 · D-07).
 *
 * 서비스롤 `SupabaseClient` 를 인자로 받는 순수 함수 모듈(`limitup-report.ts` 규약 — 헬퍼는 공용화하지 않고 복제).
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   D-05     게이트는 RPC 안의 `dma_visible_accounts(p_user_id)` 존재 검사가 정본이다(상한가 보고서와 같은 「DMA 매핑
 *            사용자」 판정). RPC 가 `{access:false}` 를 주면 403 `DMA_UNMAPPED` — 웹은 `DmaGate` 로 바꾼다.
 *            그 밖의 모양 위반(access 가 boolean 이 아님 · dates/rows 가 배열 아님)은 500 `DB_ERROR`(IN-01).
 *   T-19-17  인증된 `userId` 하나만 RPC 에 넘긴다(라우트가 requireAuth 로 확정한 값).
 *   T-19-01  RPC EXECUTE 는 service_role 전용(anon · authenticated 명시 REVOKE — 20261016200100).
 *   T-15-07  DB 오류 원문은 응답에 싣지 않는다(고정 문구 DB_ERROR). 원문은 `cause` 로 실어 errorHandler 가 warn 로그에만 남긴다.
 *
 * ★ Cloud Run → Supabase 왕복이 지연을 지배하므로 보고서 = RPC **1회**(jsonb 스칼라 — max_rows 무관).
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

/**
 * 하루 번들 한 장. `d` 생략 = 최신 보고서 날짜. 행 없는 날짜는 200 `rows: []`(빈 상태) 그대로 돌려준다(D-07).
 * 행은 RPC 가 `to_jsonb(row)` 로 실은 export 열 이름 그대로(snake_case · payload 중첩 포함)라 매퍼가 없다.
 */
export async function getTeamflowReport(
  supabase: SupabaseClient,
  userId: string,
  d?: string,
): Promise<TeamflowReportResponse> {
  const { data, error } = await supabase.rpc("teamflow_report_for_user", {
    p_user_id: userId,
    p_date: d ?? null,
  });
  const FAIL = "팀 매집 보고서 조회에 실패했습니다.";
  if (error) throw DbError(FAIL, causeOf(error));
  if (!isObject(data)) throw DbError(FAIL, shapeCause("teamflow_report_for_user", data));
  // 403 은 RPC 가 명시적으로 `access:false` 를 줄 때만 — `{}` · `{access:"true"}` 같은 모양 위반을 게이트로 숨기지 않는다(IN-01).
  if (data.access === false) throw DmaUnmapped();
  if (data.access !== true) throw DbError(FAIL, shapeCause("teamflow_report_for_user.access", data.access));
  // 웹이 `dates.length` · `rows` 를 바로 읽는다 — 배열이 아니면 렌더 예외 대신 500.
  if (!Array.isArray(data.dates)) throw DbError(FAIL, shapeCause("teamflow_report_for_user.dates", data.dates));
  if (!Array.isArray(data.rows)) throw DbError(FAIL, shapeCause("teamflow_report_for_user.rows", data.rows));
  return data as unknown as TeamflowReportResponse;
}
