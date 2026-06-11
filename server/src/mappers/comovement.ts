/**
 * Phase 11 — 동조 사전계산 DB row 타입 + 정규화 헬퍼 (COMV-01).
 *
 * theme_comovement / cosurge_edges (snake_case, supabase/migrations/20260611120000)
 * 의 row 형태를 정의한다. CoMovementCandidate 최종 조립은 computeComovement 순수함수가
 * 수행하므로 mapper 는 row 타입 + numeric(text) → number 정규화만 담당한다
 * (theme.ts 톤 — PostgREST numeric 컬럼은 문자열로 직렬화돼 Number() 가 필요).
 */

/** theme_comovement 테이블 row (snake_case). conf_d0/conf_d1/lift/avg_ret 는 numeric → text. */
export type ThemeComovementRow = {
  theme_id: string;
  stock_code: string;
  ignite_days: number;
  member_count: number;
  conf_d0: string | number;
  conf_d1: string | number;
  lift: string | number | null;
  avg_ret: string | number | null;
};

/** cosurge_edges 테이블 row (snake_case, 무향 정규화 code_a < code_b). */
export type CosurgeEdgeRow = {
  code_a: string;
  code_b: string;
  co_count: number;
  lift: string | number | null;
  avg_pair_ret: string | number | null;
};

/**
 * PostgREST numeric(text) → 유한 number, 없거나 비유한값이면 fallback.
 * (단일 NaN 이 점수/정렬을 오염시키는 회귀 방지 — computeTop3 NaN 가드 선례.)
 */
export function toNum(v: string | number | null | undefined, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
