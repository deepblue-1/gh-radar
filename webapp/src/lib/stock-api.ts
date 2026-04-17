/**
 * Stock API wrapper (Phase 6 SRCH-01/02, Phase 7 NEWS-01).
 *
 * - apiFetch 재사용: envelope 파싱 + X-Request-Id + 8s 타임아웃 + ApiClientError.
 * - searchStocks: GET /api/stocks/search?q=... (서버 정렬 name asc, limit 20 — 수정 금지)
 * - fetchStockDetail: GET /api/stocks/:code (404 시 ApiClientError.status === 404)
 * - fetchStockNews: GET /api/stocks/:code/news (days/limit 쿼리 포함)
 * - refreshStockNews: POST /api/stocks/:code/news/refresh (429 시 ApiClientError.details.retry_after_seconds)
 */
import type { Stock, NewsArticle } from '@gh-radar/shared';
import { apiFetch } from './api';

export function searchStocks(q: string, signal: AbortSignal): Promise<Stock[]> {
  const params = new URLSearchParams({ q });
  return apiFetch<Stock[]>(`/api/stocks/search?${params.toString()}`, { signal });
}

export function fetchStockDetail(code: string, signal: AbortSignal): Promise<Stock> {
  return apiFetch<Stock>(`/api/stocks/${encodeURIComponent(code)}`, { signal });
}

export interface FetchNewsOpts {
  /** 조회 기간 (일). 기본 7. */
  days?: number;
  /** 최대 반환 건수. 기본 100. */
  limit?: number;
}

/**
 * 특정 종목의 최근 뉴스 목록을 조회한다.
 * - 응답: camelCase `NewsArticle[]`
 * - 서버 계약: `/api/stocks/:code/news?days=N&limit=M`
 */
export function fetchStockNews(
  code: string,
  opts: FetchNewsOpts,
  signal: AbortSignal,
): Promise<NewsArticle[]> {
  const params = new URLSearchParams({
    days: String(opts.days ?? 7),
    limit: String(opts.limit ?? 100),
  });
  return apiFetch<NewsArticle[]>(
    `/api/stocks/${encodeURIComponent(code)}/news?${params.toString()}`,
    { signal },
  );
}

/**
 * 특정 종목의 뉴스 갱신을 트리거한다 (섹션 전용 새로고침).
 * - 성공: camelCase `NewsArticle[]` (최신본)
 * - 429: `ApiClientError` with `details = { retry_after_seconds }` — UI 가 카운트다운에 사용.
 * - 503: `ApiClientError` (code `NAVER_UNAVAILABLE` | `NAVER_BUDGET_EXHAUSTED`)
 */
export function refreshStockNews(
  code: string,
  signal: AbortSignal,
): Promise<NewsArticle[]> {
  return apiFetch<NewsArticle[]>(
    `/api/stocks/${encodeURIComponent(code)}/news/refresh`,
    { method: 'POST', signal },
  );
}
