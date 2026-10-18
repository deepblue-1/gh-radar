/**
 * accum-signals-api — 작업대 「매집」 패널 복원 조회 (quick-261018-rfy · D-03).
 *
 * ① 원천: server `GET /api/accum-signals?date=YYYY-MM-DD` → `dma_accum_signals_for_user_json` RPC 1회.
 *   그날 kind 16 매집감지를 isin 별 1행(다른 분 = 최신 분 · 같은 분 = quote-primary 게이트웨이 우선 · 폴백)으로 준다.
 *   가시성(시세 kind 게이트웨이 공개)은 서버가 판정한다.
 *
 * ② 오늘은 `date` 를 싣지 않는다 — 서버가 공유 `kstDateIso()` 로 KST 오늘을 정하고 그것이 정본이다
 *   (`strategy-events-api.ts` ② 와 같은 규약).
 *
 * ③ 응답은 bare array 다 — envelope 을 언랩하지 않는다. 행은 shared `toStrategyEventRow` 를 지난 공개 camelCase
 *   45키(`StrategyEventRow`)이고 isin 오름차순이다. 이름 풀기는 shared `accumSignalOf`.
 */

import type { StrategyEventRow } from '@gh-radar/shared';

import { authFetch } from './auth-fetch';

/** 그날 kind 16 isin 별 최신 행. `date` 생략 = 서버 KST 오늘. 세션이 없으면 서버 왕복 없이 `ApiClientError`. */
export function fetchAccumSignals(date?: string): Promise<StrategyEventRow[]> {
  const params = new URLSearchParams();
  if (date !== undefined) params.set('date', date);
  const query = params.toString();
  return authFetch<StrategyEventRow[]>(`/api/accum-signals${query === '' ? '' : `?${query}`}`);
}
