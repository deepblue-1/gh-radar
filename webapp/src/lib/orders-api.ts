/**
 * Phase 16 Plan 16 — DMA 주문 **조회** REST 클라이언트 + 결과 판정 유틸 (D-02 / D-03).
 *
 * ① 무엇을 하는가
 *   `GET /api/orders`(오늘 주문 목록)를 감싸고, 주문 결과 3분류의 경계를 판정한다.
 *
 * ② ★ **주문 접수는 여기에 없다** (D-02)
 *   신규·취소는 relay wss 하나로 나간다 — `useRelayContext().sendOrder({kind})`
 *   (16-09 대기 맵 · 16-10 프레임 번역). `createOrder(POST /api/orders)` 와 그 전용
 *   타임아웃 상수는 이 plan 에서 제거했다. 접수 경로가 둘이면 같은 `dma_orders` 행을
 *   REST 와 wss 가 서로 다른 셀렉터로 다투게 되고 화면의 주문 상태가 갈린다 (T-16-11).
 *
 *   상관 대기 상한도 wss 로 옮겨졌다 — `use-relay-socket.ts` 의
 *   `ORDER_RESULT_BACKSTOP_MS`(10초 백스톱)이 정본이고, relay 는 그 앞에서 5초에
 *   `status:"timeout"` 을 반드시 돌려준다(16-08). 여기에 두 번째 숫자를 두지 않는다.
 *
 * ③ 왜 `chat-api.ts` 의 `authFetch` 를 복제하는가
 *   조회 라우트는 `requireAuth()` 뒤에 있고(16-16), 세션 토큰 부착 방식은 챗과 동일하다.
 *
 * ④ ★ 실패와 "결과 모름"을 절대 합치지 않는다 (15-RESEARCH Pitfall 9)
 *   주문 결과는 세 가지다 — **접수(안다) / 결과 모름 / 거부(안 나갔다)**.
 *   `isUnknownOutcome()` 이 그 경계를 판정하는 **단 하나의 지점**이며, UI 는 이 값이 true 면
 *   "실패"라는 단어를 쓰지 않고 재주문 버튼도 열지 않는다. 결과를 모르는 주문을 실패로
 *   렌더하면 사용자가 같은 주문을 한 번 더 내고, 그것이 이 Phase 전체에서 가장 비싼 사고다.
 *   접수 경로가 wss 로 옮겨져도 이 규율과 코드 목록은 **그대로 남는다** — 판정 대상이
 *   `ApiClientError` 든 `order.result` 프레임이든 경계의 정의는 같기 때문이다.
 */

import type { DmaOrderRow } from "@gh-radar/shared";

import { apiFetch, ApiClientError, type ApiFetchInit } from "./api";
import { createClient } from "./supabase/client";

/**
 * 주문 경로가 돌려주는 에러 코드 8종 (15-17 인계 ①).
 * UI 는 이 코드로만 분기하고 HTTP status 로 분기하지 않는다 —
 * `RELAY_UNAVAILABLE` 처럼 코드 하나에 상태가 둘(502·503)인 경우가 있다.
 */
export const ORDER_ERROR_CODES = [
  "UNAUTHENTICATED",
  "DMA_NOT_ALLOWED",
  "ACCOUNT_NOT_ALLOWED",
  "SESSION_NOT_READY",
  "ISIN_UNAVAILABLE",
  "ORDER_TIMEOUT",
  "RELAY_UNAVAILABLE",
  "VALIDATION_FAILED",
] as const;

export type OrderErrorCode = (typeof ORDER_ERROR_CODES)[number];

/**
 * **결과를 모르는** 실패 코드. 이 코드들은 "주문이 이미 나갔을 수 있다"를 뜻한다.
 *
 * - `ORDER_TIMEOUT` — relay 가 첫 통보를 5초 안에 못 받았다. 게이트웨이까지 갔을 수 있다.
 * - `TIMEOUT` — 브라우저가 백스톱 안에 응답을 못 받았다. 요청은 이미 나갔다.
 * - `NETWORK_ERROR` — 전송 자체가 깨졌다. **연결 전에 깨졌는지 후에 깨졌는지 구별할 수
 *   없다.** 구별할 수 없으면 안전한 쪽(모름)으로 떨어뜨린다 — 15-17 이 세운
 *   "애매하면 실패가 아니라 결과 모름" 규율을 브라우저에서도 그대로 적용한다.
 */
const UNKNOWN_OUTCOME_CODES: ReadonlySet<string> = new Set([
  "ORDER_TIMEOUT",
  "TIMEOUT",
  "NETWORK_ERROR",
]);

/**
 * Supabase access_token 을 Authorization 헤더로 주입한 `apiFetch` 래퍼.
 * 세션이 없으면 서버 왕복 없이 `UNAUTHENTICATED` 를 throw 한다(로그인 게이트).
 * `chat-api.ts` 의 동명 함수와 동일한 구조다.
 */
async function authFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const {
    data: { session },
  } = await createClient().auth.getSession();

  if (!session) {
    throw new ApiClientError({
      code: "UNAUTHENTICATED",
      message: "로그인이 필요합니다.",
      status: 401,
    });
  }

  return apiFetch<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(init.headers ?? {}),
    },
  });
}

/**
 * 오늘(또는 지정일) 주문 목록. 응답은 **bare array** 이고 원소는 `DmaOrderRow` 다(15-17).
 * 새로고침 후 미체결·체결 목록을 복원하는 경로다 (D-03/D-24).
 * @param date `YYYY-MM-DD` (KST 기준). 생략하면 서버가 오늘로 해석한다.
 */
export function listOrders(date?: string): Promise<DmaOrderRow[]> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return authFetch<DmaOrderRow[]>(`/api/orders${qs}`);
}

/** `ApiClientError` 에서 분기용 코드를 뽑는다. 알 수 없는 예외는 `"UNKNOWN"`. */
export function orderErrorCode(err: unknown): string {
  return err instanceof ApiClientError ? err.code : "UNKNOWN";
}

/** 서버가 준 사람이 읽을 메시지. 없으면 빈 문자열(호출부가 대체 문구를 고른다). */
export function orderErrorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : "";
}

/**
 * ★ "결과를 모르는" 실패인가?
 *
 * true 면 **주문이 이미 나갔을 수 있다**. 호출부는
 *   ① "실패"라는 단어를 쓰지 않고,
 *   ② 재주문(재제출) 경로를 열지 않으며,
 *   ③ 미체결 목록에서 접수 여부를 확인하도록 안내한다.
 * false 면 주문은 접수되기 전에 끝났으므로 다시 시도해도 안전하다.
 */
export function isUnknownOutcome(err: unknown): boolean {
  return UNKNOWN_OUTCOME_CODES.has(orderErrorCode(err));
}

export type { DmaOrderRow };
