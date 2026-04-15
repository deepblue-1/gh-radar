/**
 * Stock API wrapper (Phase 6 SRCH-01/02).
 *
 * - apiFetch 재사용: envelope 파싱 + X-Request-Id + 8s 타임아웃 + ApiClientError.
 * - searchStocks: GET /api/stocks/search?q=... (서버 정렬 name asc, limit 20 — 수정 금지)
 * - fetchStockDetail: GET /api/stocks/:code (404 시 ApiClientError.status === 404)
 */
import type { Stock } from '@gh-radar/shared';
import { apiFetch } from './api';

export function searchStocks(q: string, signal: AbortSignal): Promise<Stock[]> {
  const params = new URLSearchParams({ q });
  return apiFetch<Stock[]>(`/api/stocks/search?${params.toString()}`, { signal });
}

export function fetchStockDetail(code: string, signal: AbortSignal): Promise<Stock> {
  return apiFetch<Stock>(`/api/stocks/${encodeURIComponent(code)}`, { signal });
}
