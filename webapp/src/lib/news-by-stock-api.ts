/**
 * Phase 41 D-04 — 종목 뉴스·공시 묶음 조회 `GET /api/news/by-stock`.
 *
 * - 응답 타입은 server 라우트와 같은 shared `NewsByStockResponse` 하나다(계약 드리프트 방지).
 * - 서버가 코드 등록 · 5초 캐시 · 합치기를 맡는다 — 웹 폴링은 한투를 직접 부르지 않는다(D-05 · SC-4).
 * - 코드는 `SHORT_CODE_RE` 를 통과한 6자리라 인코딩할 글자가 없다 — 쉼표를 `%2C` 로 바꾸지 않고 그대로 잇는다.
 */
import type { NewsByStockResponse } from '@gh-radar/shared';

import { apiFetch } from './api';

export interface FetchNewsByStockOpts {
  /** 기간(일) — 서버 기본 3(D-08). */
  days?: number;
  /** 종목당 줄 수 — 서버 기본 20. */
  limit?: number;
}

export function fetchNewsByStock(
  codes: readonly string[],
  opts: FetchNewsByStockOpts = {},
  signal?: AbortSignal,
): Promise<NewsByStockResponse> {
  const parts = [`codes=${codes.map(encodeURIComponent).join(',')}`];
  if (opts.days !== undefined) parts.push(`days=${opts.days}`);
  if (opts.limit !== undefined) parts.push(`limit=${opts.limit}`);
  return apiFetch<NewsByStockResponse>(`/api/news/by-stock?${parts.join('&')}`, { signal });
}
