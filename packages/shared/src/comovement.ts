/**
 * Phase 11 — Co-movement Candidates 공유 타입 계약 (COMV-01).
 *
 * webapp · server 가 공유하는 동조 후보 도메인 타입 (apiFetch<CoMovementResponse> 계약).
 * 두 경로(테마-풀링 theme_comovement + 글로벌 co-surge cosurge_edges) 를 병합·점수화한
 * 결과를 종목 상세 "동조 후보" 섹션에 TOP-K 로 노출한다.
 *
 * DB 는 snake_case (supabase/migrations/20260611120000_comovement_tables.sql) —
 * server 의 computeComovement 순수함수가 row → 아래 camelCase 타입으로 변환한다.
 */

import type { Market } from "./stock.js";

/** 동조 후보 1개 — server·webapp 공유 (apiFetch<CoMovementResponse> 계약). */
export interface CoMovementCandidate {
  code: string;
  name: string;
  market: Market;
  /** stock_quotes 실시간 등락률 (없으면 null → webapp em-dash) */
  liveChangeRate: number | null;
  /** 동반율 (표시 메트릭, 0~1) */
  confD0: number;
  /** 결합 점수 (강도바 width) */
  strength: number;
  /** 후행형 배지 (conf_d1 > conf_d0 AND conf_d1 >= 0.3) */
  isTrailing: boolean;
  /** 공유 테마 칩 (테마 경로 evidence) */
  sharedThemes: { id: string; name: string }[];
  /** "직접동반 N회" (co-surge 경로 evidence, 없으면 null) */
  coSurgeCount: number | null;
  /** 표본수 배지 (ignite_days >= 8 → high) */
  sampleConfidence: "high" | "low";
}

/** GET /api/stocks/:code/co-movement 응답 — **객체**(배열 아님, 계약 드리프트 회피). */
export interface CoMovementResponse {
  candidates: CoMovementCandidate[];
}
