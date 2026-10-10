/**
 * strategy-events-api — 주문로그 하루치 복원 조회 (Phase 25 · D-07).
 *
 * ① 원천: server `GET /api/strategy-events?date=YYYY-MM-DD` (25-03) → `dma_strategy_events_for_user` RPC 1회.
 *   주문 이벤트는 접근 계좌 조인, 시세 이벤트(kind 1·2)는 게이트웨이 매핑 보유자 공개 — 가시성은 서버가 판정한다
 *   (웹의 계좌 거름은 보기 선택일 뿐 권한이 아니다 · T-25-30).
 *
 * ② 오늘은 `date` 를 싣지 않는다 — 서버가 공유 `kstDateIso()` 로 KST 오늘을 정하고 그것이 정본이다
 *   (`orders-api.ts` ② 와 같은 규약). 과거일(창 분리 날짜 이동)만 `?date=` 를 붙인다.
 *
 * ③ 응답은 bare array 다 (`orders-api.ts` ④ 규약) — envelope 을 언랩하지 않는다. 행은 shared
 *   `toStrategyEventRow` 를 지난 공개 camelCase 45키(`StrategyEventRow`)이고 `gw_time_ms, gateway, seq` 오름차순이다.
 *
 * ④ D-18 — `lf=1` 일 때만 kind 15(상한가 특징 · 키당 분당 최대 1행 — 값이 바뀐 분만)가 실린다. 기본 조회는 서버가 kind 15 를 뺀다(28-02).
 *   주문로그 「상한가 특징」 체크가 켜질 때만 `{ limitFeature: true }` 로 한 번 더 부른다(`use-order-log-feed.ts` ⑥).
 *   쿼리 순서는 `date` → `lf` 다.
 */

import type { StrategyEventRow } from '@gh-radar/shared';

import { authFetch } from './auth-fetch';

/**
 * 하루치 전략 이벤트. `date` 생략 = 서버 KST 오늘 · `opts.limitFeature` = kind 15 포함(`?lf=1` · ④).
 * 세션이 없으면 서버 왕복 없이 `ApiClientError`.
 */
export function fetchStrategyEvents(
  date?: string,
  opts?: { limitFeature?: boolean },
): Promise<StrategyEventRow[]> {
  const params = new URLSearchParams();
  if (date !== undefined) params.set('date', date);
  if (opts?.limitFeature === true) params.set('lf', '1');
  const query = params.toString();
  return authFetch<StrategyEventRow[]>(`/api/strategy-events${query === '' ? '' : `?${query}`}`);
}
