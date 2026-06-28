/**
 * Phase 12 — 상한가 다음날 이력 API wrapper (LIMIT-01).
 *
 * GET 상한가 이력 라우트 객체 계약 wrapper.
 * server(Plan 03) 가 사전계산 limit_up_* 테이블을 `{ hero, events, themes }` 객체로
 * 반환한다 (배열 아님 — comovement 계약 드리프트 회피, 정적 이력 읽기전용).
 *
 * - apiFetch 재사용: Phase 2 envelope 파싱 + X-Request-Id + 8s 타임아웃 + ApiClientError.
 * - k 파라미터 없음 — 단일 종목 전체 이력 반환(페이지네이션은 클라 더보기, 추가 fetch 없음).
 */
import type { LimitUpResponse } from '@gh-radar/shared';
import { apiFetch } from './api';

export function fetchStockLimitUp(
  code: string,
  signal?: AbortSignal,
): Promise<LimitUpResponse> {
  return apiFetch<LimitUpResponse>(
    `/api/stocks/${encodeURIComponent(code)}/limit-up`,
    { signal },
  );
}
