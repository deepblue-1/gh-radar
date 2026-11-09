/**
 * 체결 알림 탭 → 주문로그 착지 경로 (Phase 40 · D-21 · D-24 · SC-1 「탭하면 주문로그」).
 *
 * - **payload 에는 계좌가 없다(D-21 · SC-4 · T-19-14 동형).** relay 가 싣는 `data.path` 는
 *   `/trading/order-log?stock=<ISIN>&date=<YYYY-MM-DD>`(shared `pushTapPathOf`) 뿐이다 — 알림 본문 · payload 로 계좌번호가
 *   새어 나갈 길을 두지 않는다.
 * - **계좌는 웹이 찾아 붙인다(D-24).** 주문로그는 `account` 쿼리가 없으면 시세 이벤트만 보인다(결정 1-A · Pitfall 9).
 *   그래서 그 날짜 주문(`GET /api/orders?date=` — 오늘이든 지난 날이든 같은 라우트)에서 그 종목의 가장 최근(updatedAt)
 *   주문 계좌를 붙인다. 19:59 에 받은 알림을 자정 뒤에 탭해도 그 주문이 보인다(리뷰 IN-03 — 예전에는 오늘만 찾았다).
 *   못 찾으면 계좌 없이 연다. 주문로그 「전체 계좌」 모드는 만들지 않는다(주문로그 창은 그대로).
 * - **검증:** `isSafeInternalPath`(로그인 · 네이티브 navigate 와 같은 판정) + 경로가 정확히 `/trading/order-log` 일 것.
 *   실패면 null — 호출자는 아무것도 하지 않는다. 쿼리는 주문로그 창과 같은 `parseOrderLogQuery` 화이트리스트로 교정하고,
 *   결과는 같은 정본 문자열(`orderLogQueryString` — 오늘 날짜 · 「전체」 는 생략)로 만든다.
 */

import { PUSH_ORDER_LOG_PATH, type JournalOrderRow } from '@gh-radar/shared';

import { isSafeInternalPath } from '@/lib/safe-path';
import { orderLogQueryString, parseOrderLogQuery, type OrderLogQuery } from '@/lib/order-log-feed';

/**
 * 탭 payload → 주문로그 쿼리(계좌 없음). 검증 실패면 null. `needsOrders` = 계좌를 찾으려면 그 날짜(`query.date`) 주문이
 * 필요한가(종목이 정해졌을 때만 — 「전체 종목」 이면 주문을 부르지 않는다).
 */
export function parsePushTapPath(
  data: Record<string, unknown>,
  today: string,
): { query: OrderLogQuery; needsOrders: boolean } | null {
  const path = data.path;
  if (!isSafeInternalPath(path)) return null;
  const hashAt = path.indexOf('#');
  const noHash = hashAt < 0 ? path : path.slice(0, hashAt);
  const queryAt = noHash.indexOf('?');
  const bare = queryAt < 0 ? noHash : noHash.slice(0, queryAt);
  if (bare !== PUSH_ORDER_LOG_PATH) return null;
  const search = queryAt < 0 ? '' : noHash.slice(queryAt + 1);
  const parsed = parseOrderLogQuery(new URLSearchParams(search), today);
  // payload 의 계좌는 쓰지 않는다 — 계좌는 늘 웹이 그 날짜 주문에서 정한다(D-24).
  const query: OrderLogQuery = { account: null, date: parsed.date, filters: parsed.filters };
  return { query, needsOrders: query.filters.stock !== 'all' };
}

function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** 그 날짜 주문에서 그 종목의 가장 최근(updatedAt) 주문 계좌 — 없으면 null. */
function latestAccountOf(orders: readonly JournalOrderRow[], isin: string, date: string): string | null {
  let best: JournalOrderRow | null = null;
  for (const o of orders) {
    if (o.isin !== isin || o.tradeDate !== date || !o.accountNo) continue;
    if (best === null || timeOf(o.updatedAt) > timeOf(best.updatedAt)) best = o;
  }
  return best?.accountNo ?? null;
}

/**
 * 탭 payload · 그 날짜 주문 · 오늘(KST `YYYY-MM-DD` — 날짜 교정 · 정본 문자열용) → 열 경로. 검증 실패면 null.
 * 예: `stock=KR7282720005&date=<오늘>` + 그 종목 주문(계좌 B 가 최근) → `/trading/order-log?account=B&stock=KR7282720005`.
 */
export function resolvePushTapPath(
  data: Record<string, unknown>,
  orders: readonly JournalOrderRow[],
  today: string,
): string | null {
  const parsed = parsePushTapPath(data, today);
  if (parsed === null) return null;
  const { query, needsOrders } = parsed;
  const account = needsOrders ? latestAccountOf(orders, query.filters.stock, query.date) : null;
  const qs = orderLogQueryString({ ...query, account }, today);
  return qs ? `${PUSH_ORDER_LOG_PATH}?${qs}` : PUSH_ORDER_LOG_PATH;
}
