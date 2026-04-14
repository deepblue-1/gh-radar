/**
 * Scanner API 래퍼 (Phase 5 SCAN-01/02/04/05).
 *
 * ---------------------------------------------------------------------------
 * changeRate 스케일 실측 (2026-04-14, `/api/scanner?sort=rate_desc&limit=3`):
 *   - 응답 예: `changeRate: 30`, `29.98` → **정수 % 스케일** (29.98 = 29.98%)
 *   - 서버 `ScannerQuery.minRate` 도 DB `change_rate` 와 동일 스케일로 비교
 *   - ∴ 클라 → 서버: `minRate=${min}` (정수 그대로 전송)
 *   - 렌더 시: `<Number format="plain" precision={2} />` + 수동 `+`/`%` 접미사
 *     (`format="percent"` 는 내부에서 ×100 하므로 이 스케일엔 사용 금지)
 * ---------------------------------------------------------------------------
 */

import type { Stock } from '@gh-radar/shared';
import { apiFetch } from './api';
import type { ScannerState } from './scanner-query';

export const SCANNER_LIMIT = 100;

/** 서버 mapper 가 덧붙이는 상한가 근접도 (@gh-radar/shared 에 미포함 — 로컬 alias). */
export type StockWithProximity = Stock & { upperLimitProximity: number };

/**
 * `/api/scanner` 호출. `signal` 은 `usePolling` 의 AbortController 에서 전달된다.
 */
export function fetchScannerStocks(
  state: ScannerState,
  signal: AbortSignal,
): Promise<StockWithProximity[]> {
  const params = new URLSearchParams({
    sort: 'rate_desc',
    minRate: String(state.min),
    market: state.market,
    limit: String(SCANNER_LIMIT),
  });
  return apiFetch<StockWithProximity[]>(`/api/scanner?${params.toString()}`, {
    signal,
  });
}
