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

/**
 * cosurge_edges 테이블 row (snake_case, 무향 정규화 code_a < code_b).
 *
 * v2 (20260611150000): 방향별 강도-최근성 누적 4컬럼 추가 — co_count 횟수 정규화를
 * 폐기하고 pairScore = ws_sum/w_sum × min(1, w_sum/W0) 로 환산(computeComovement).
 *   - w_sum_a / ws_sum_a: code_a 발화일 기준 Σw_t / Σw_t·s_t (앵커가 code_a 면 사용)
 *   - w_sum_b / ws_sum_b: code_b 발화일 기준 (앵커가 code_b 면 사용)
 * 모두 numeric → PostgREST text. NULL 가능(≥15% 발화일 0 인 게이트 통과 페어).
 */
export type CosurgeEdgeRow = {
  code_a: string;
  code_b: string;
  co_count: number;
  lift: string | number | null;
  avg_pair_ret: string | number | null;
  w_sum_a: string | number | null;
  ws_sum_a: string | number | null;
  w_sum_b: string | number | null;
  ws_sum_b: string | number | null;
  /**
   * 최근 동반급등 5건 (jsonb, 날짜 desc). d=날짜, ra=code_a%, rb=code_b%.
   * PostgREST 가 jsonb 를 파싱해 배열로 반환. 미재계산 행은 null.
   */
  recent_pairs: { d: string; ra: string | number; rb: string | number }[] | null;
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
