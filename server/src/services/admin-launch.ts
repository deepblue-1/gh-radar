import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchOrdersResponse } from "@gh-radar/shared";

import { ApiError } from "../errors.js";

/**
 * Phase 35 D-20 — 발사 경계 지도 어드민 **조회 전용** 서비스.
 *
 * 서비스롤 `SupabaseClient` 를 인자로 받는 순수 함수 모듈. 헬퍼(DbError · causeOf · shapeCause · isObject)는
 * `accum-report.ts` 에서 복제한다 — 공용화하지 않는다(서비스 모듈마다 독립 · teamflow-report 규약).
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   인가     어드민 판정은 라우트 관문(requireAuth → requireAdmin · DB role 매 요청)이 한다. 여기에는 DMA 게이트가 없다 —
 *            RPC 가 사용자 id 를 받지 않는다(어드민 전용 · 계좌 · 사용자 열 그대로 · D-02).
 *   T-19-01  RPC EXECUTE 는 service_role 전용(anon · authenticated 명시 REVOKE — 35-02 마이그레이션).
 *   T-15-07  DB 오류 원문은 응답에 싣지 않는다(고정 문구 DB_ERROR). 원문은 `cause` 로 실어 errorHandler 가 warn 로그에만 남긴다.
 *   모양     웹이 `dates` · `heads` · `pieces` 를 바로 순회한다 — 배열이 아니면 렌더 예외 대신 500 `DB_ERROR`.
 *   D-20     행은 RPC 가 실은 열 이름 그대로(snake_case) 통과한다 — 매퍼도 경계 계산도 없다(계산은 웹 shared 한 벌).
 *
 * ★ Cloud Run → Supabase 왕복이 지연을 지배하므로 요청 하나 = RPC **1회**(jsonb 스칼라 — max_rows 무관).
 */

const DbError = (msg: string, cause: unknown) => new ApiError(500, "DB_ERROR", msg, cause);

/** PostgREST 오류에서 로그에 남길 필드만 — 객체 통째로 싣지 않는다. */
const causeOf = (e: { message?: string; code?: string; details?: string | null; hint?: string | null }) => ({
  code: e.code,
  message: e.message,
  details: e.details ?? undefined,
  hint: e.hint ?? undefined,
});
/** 응답 모양 위반 — 무엇이 왔는지(타입)만. 행 값(계좌 등)은 싣지 않는다. */
const shapeCause = (what: string, v: unknown) => ({
  reason: `${what} 모양 위반`,
  type: Array.isArray(v) ? "array" : v === null ? "null" : typeof v,
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 객체가 아니거나 `keys` 중 배열이 아닌 키가 있으면 500 — 첫 위반 키를 cause 에 남긴다. */
function assertArrays(fn: string, fail: string, data: unknown, keys: readonly string[]): asserts data is Record<string, unknown> {
  if (!isObject(data)) throw DbError(fail, shapeCause(fn, data));
  for (const k of keys) {
    if (!Array.isArray(data[k])) throw DbError(fail, shapeCause(`${fn}.${k}`, data[k]));
  }
}

const ORDERS_FAIL = "발사 주문 내역 조회에 실패했습니다.";

/**
 * 주문 내역 하루치. `d` 생략 = 조각이 있는 최신 거래일. 행 없는 날짜는 200 `heads: [] · pieces: []` 그대로(빈 상태).
 */
export async function getLaunchOrders(
  supabase: SupabaseClient,
  d: string | undefined,
): Promise<LaunchOrdersResponse> {
  const { data, error } = await supabase.rpc("launch_orders_for_admin", { p_date: d ?? null });
  if (error) throw DbError(ORDERS_FAIL, causeOf(error));
  assertArrays("launch_orders_for_admin", ORDERS_FAIL, data, ["dates", "heads", "pieces"]);
  return data as unknown as LaunchOrdersResponse;
}
