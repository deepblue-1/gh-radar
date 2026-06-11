/**
 * Phase 11 — 동조 후보 API wrapper (COMV-01).
 *
 * GET /api/stocks/:code/co-movement?k=K — apiFetch<CoMovementResponse> 객체 계약.
 * server(Plan 03) 가 앵커 테마 멤버 ∪ co-surge 이웃을 computeComovement 결합점수로
 * TOP-K 랭킹해 `{ candidates }` 객체로 반환한다 (배열 아님 — 계약 드리프트 회피).
 *
 * - apiFetch 재사용: Phase 2 envelope 파싱 + X-Request-Id + 8s 타임아웃 + ApiClientError.
 * - 기본 k=8 (UI-SPEC 더보기 = 반환 집합 한도, 추가 fetch 없음).
 */
import type { CoMovementResponse } from '@gh-radar/shared';
import { apiFetch } from './api';

export function fetchStockComovement(
  code: string,
  k = 8,
  signal?: AbortSignal,
): Promise<CoMovementResponse> {
  return apiFetch<CoMovementResponse>(
    `/api/stocks/${encodeURIComponent(code)}/co-movement?k=${k}`,
    { signal },
  );
}
