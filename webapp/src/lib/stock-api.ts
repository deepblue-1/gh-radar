/**
 * Stock API wrapper (Phase 6 SRCH-01/02, Phase 7 NEWS-01, Phase 8 DISC-01).
 *
 * - apiFetch 재사용: envelope 파싱 + X-Request-Id + 8s 타임아웃 + ApiClientError.
 * - searchStocks: GET /api/stocks/search?q=... (서버 정렬 name asc, limit 20 — 수정 금지)
 * - fetchStockDetail: GET /api/stocks/:code (404 시 ApiClientError.status === 404)
 * - fetchStockNews: GET /api/stocks/:code/news (days/limit 쿼리 포함)
 * - refreshStockNews: POST /api/stocks/:code/news/refresh (429 시 ApiClientError.details.retry_after_seconds)
 * - fetchStockDiscussions: GET /api/stocks/:code/discussions (hours/days/limit 쿼리 — 서버 `DiscussionListQuery` 계약)
 * - refreshStockDiscussions: POST /api/stocks/:code/discussions/refresh (429 시 `retry_after_seconds`, 503 시 `PROXY_UNAVAILABLE`/`PROXY_BUDGET_EXHAUSTED`)
 */
import type { Stock, NewsArticle, Discussion } from '@gh-radar/shared';
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

/**
 * Phase 08 — 토론방 조회 옵션.
 *
 * 서버 `DiscussionListQuery` 계약:
 *  - `hours` 가 있으면 hours 우선 (1..720, 주로 상세 Card 24h)
 *  - 아니면 `days` (1..7, 주로 /stocks/[code]/discussions 풀페이지 7d)
 *  - 둘 다 없으면 서버 default `days=7`
 *  - `limit` 미지정/초과 → 서버에서 50 으로 clamp (hard cap)
 */
export interface FetchDiscussionsOpts {
  hours?: number;
  days?: number;
  limit?: number;
  /**
   * 무한 스크롤 cursor — ISO 8601 timestamp.
   * 서버는 `posted_at < before` 인 글만 반환 → 마지막 페이지의 마지막 글 postedAt 을
   * 다음 호출에 전달하면 자연스러운 키셋 페이지네이션이 됨.
   */
  before?: string;
}

/**
 * 특정 종목의 토론방 게시글 목록을 조회한다 (camelCase `Discussion[]`).
 *
 * - 서버 계약: `/api/stocks/:code/discussions?hours=N&limit=M` 또는 `?days=N&limit=M`
 * - 쿼리 파라미터 중 `undefined` 는 전송에서 제외 (hours 만 또는 days 만 전달)
 * - 성공: DB 에서 최신 posted_at DESC 로 반환 (스크래핑 트리거 없음 — refresh 호출이 책임)
 */
export function fetchStockDiscussions(
  code: string,
  opts: FetchDiscussionsOpts,
  signal: AbortSignal,
): Promise<Discussion[]> {
  const params = new URLSearchParams();
  if (opts.hours != null) params.set('hours', String(opts.hours));
  else if (opts.days != null) params.set('days', String(opts.days));
  // 둘 다 undefined → 서버 default (days=7)
  params.set('limit', String(opts.limit ?? 50));
  if (opts.before) params.set('before', opts.before);
  return apiFetch<Discussion[]>(
    `/api/stocks/${encodeURIComponent(code)}/discussions?${params.toString()}`,
    { signal },
  );
}

/**
 * 특정 종목의 토론방 갱신을 트리거한다 (섹션 전용 새로고침, Bright Data on-demand).
 *
 * - 성공 (200): 최신 24h top 5 `Discussion[]`
 * - 429: `ApiClientError` + `details = { retry_after_seconds }` — UI 가 카운트다운에 사용.
 * - 503: `ApiClientError` (code `PROXY_UNAVAILABLE` | `PROXY_BUDGET_EXHAUSTED`)
 */
export function refreshStockDiscussions(
  code: string,
  signal: AbortSignal,
): Promise<Discussion[]> {
  return apiFetch<Discussion[]>(
    `/api/stocks/${encodeURIComponent(code)}/discussions/refresh`,
    { method: 'POST', signal },
  );
}
