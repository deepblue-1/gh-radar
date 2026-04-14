/**
 * Scanner API 래퍼 (Phase 5 SCAN-01/02/04/05, Phase 05.2 SCAN-08).
 *
 * ---------------------------------------------------------------------------
 * changeRate 스케일 실측 (2026-04-14, `/api/scanner?sort=rate_desc&limit=3`):
 *   - 응답 예: `changeRate: 30`, `29.98` → **정수 % 스케일** (29.98 = 29.98%)
 *   - 클라 → 서버: `minRate=${min}` (정수 그대로 전송)
 * ---------------------------------------------------------------------------
 *
 * Phase 05.2 (D-17): apiFetch<T> 대신 raw fetch 로 교체.
 *   - 이유: Response.headers 접근 필요 (X-Last-Updated-At)
 *   - 반환 시그니처: { stocks, lastUpdatedAt: string | null }
 *   - 헤더 부재 시 lastUpdatedAt === null
 *   - 4xx/5xx → ApiClientError (apiFetch 와 동일 계약)
 *   - 8s 타임아웃 + 외부 signal 합성
 */

import type { Stock, ApiErrorBody } from '@gh-radar/shared';
import { ApiClientError, resolveBaseUrl } from './api';
import type { ScannerState } from './scanner-query';

export const SCANNER_LIMIT = 100;
const DEFAULT_TIMEOUT_MS = 8_000;

/** 서버 mapper 가 덧붙이는 상한가 근접도 (@gh-radar/shared 에 미포함 — 로컬 alias). */
export type StockWithProximity = Stock & { upperLimitProximity: number };

export interface ScannerFetchResult {
  stocks: StockWithProximity[];
  lastUpdatedAt: string | null;
}

/**
 * `/api/scanner` 호출. `signal` 은 `usePolling` 의 AbortController 에서 전달된다.
 */
export async function fetchScannerStocks(
  state: ScannerState,
  signal: AbortSignal,
): Promise<ScannerFetchResult> {
  const params = new URLSearchParams({
    sort: 'rate_desc',
    minRate: String(state.min),
    market: state.market,
    limit: String(SCANNER_LIMIT),
  });
  const base = resolveBaseUrl();
  let url: string;
  try {
    url = new URL(`/api/scanner?${params.toString()}`, base).toString();
  } catch (cause) {
    throw new ApiClientError({
      code: 'INVALID_BASE_URL',
      message: `API base URL 이 올바르지 않습니다 (값: "${base}")`,
      status: 0,
      cause,
    });
  }

  // 외부 signal + 8s 타임아웃 합성 (apiFetch 와 동일 패턴)
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(signal.reason);
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener('abort', onExternalAbort, { once: true });
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
    DEFAULT_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (cause) {
    if (controller.signal.aborted && (cause as Error)?.name !== 'AbortError') {
      throw cause;
    }
    const isTimeout =
      (cause as Error)?.name === 'TimeoutError' ||
      (cause as Error)?.name === 'AbortError';
    throw new ApiClientError({
      code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isTimeout
        ? '요청이 시간 초과되었습니다'
        : '네트워크 요청에 실패했습니다',
      status: 0,
      cause,
    });
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener('abort', onExternalAbort);
  }

  const requestId = response.headers.get('x-request-id') ?? undefined;
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    let message = response.statusText || '요청이 실패했습니다';
    try {
      const body = (await response.json()) as Partial<ApiErrorBody> | undefined;
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* envelope 파싱 실패 — 기본 코드/메시지 유지 */
    }
    throw new ApiClientError({
      code,
      message,
      status: response.status,
      requestId,
    });
  }

  let stocks: StockWithProximity[];
  try {
    stocks = (await response.json()) as StockWithProximity[];
  } catch (cause) {
    throw new ApiClientError({
      code: 'NETWORK_ERROR',
      message: '응답 JSON 파싱에 실패했습니다',
      status: response.status,
      requestId,
      cause,
    });
  }
  const lastUpdatedAt = response.headers.get('X-Last-Updated-At');
  return { stocks, lastUpdatedAt };
}
