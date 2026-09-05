/**
 * Phase 15 Plan 18 — DMA 주문 REST 클라이언트 (RELAY-02, D-08).
 *
 * ① 무엇을 하는가
 *   `POST /api/orders`(신규·취소)와 `GET /api/orders`(오늘 주문 목록)를 감싼다.
 *   주문은 **REST 전용**이다 — wss 소켓은 구독 제어만 하고 주문을 싣지 않는다(D-08).
 *
 * ② 왜 `chat-api.ts` 의 `authFetch` 를 복제하는가
 *   서버 주문 라우트는 `requireAuth()` 뒤에 있고(15-17), 세션 토큰 부착 방식은 챗과 동일하다.
 *   공용 헬퍼로 추출하지 않는 이유는 두 모듈의 타임아웃 정책이 다르기 때문이다(아래 ③).
 *
 * ③ ★ 타임아웃 경계 (이 파일에서 가장 중요한 숫자)
 *   server 는 relay 왕복을 **5초**(`ORDER_TIMEOUT_MS`) 기다리고, relay 클라이언트는 거기에
 *   여유 0.5초를 더해 **5.5초**까지 기다린다(15-17). 즉 서버가 답을 주기까지 최대 5.5초 +
 *   자체 처리 시간이 걸린다. `lib/api.ts` 의 기본 타임아웃은 **8초**라 경계가 아슬아슬하다 —
 *   브라우저가 8초에 먼저 끊으면 서버는 정상 응답을 만들고 있는데 화면만 "결과 모름"이 된다.
 *   그래서 주문 호출만 **9초**를 명시한다(5.5초 + 서버 처리·네트워크 여유 3.5초).
 *   ⚠️ 서버의 5초를 늘리면 이 값도 함께 늘려야 한다. 두 숫자는 한 쌍이다.
 *
 * ④ ★ 실패와 "결과 모름"을 절대 합치지 않는다 (15-RESEARCH Pitfall 9)
 *   주문 결과는 세 가지다 — **접수(안다) / 결과 모름 / 거부(안 나갔다)**.
 *   `isUnknownOutcome()` 이 그 경계를 판정하는 **단 하나의 지점**이며, UI 는 이 값이 true 면
 *   "실패"라는 단어를 쓰지 않고 재주문 버튼도 열지 않는다. 결과를 모르는 주문을 실패로
 *   렌더하면 사용자가 같은 주문을 한 번 더 내고, 그것이 이 Phase 전체에서 가장 비싼 사고다.
 */

import type {
  CreateOrderRequest,
  CreateOrderResponse,
  DmaOrderRow,
} from "@gh-radar/shared";

import { apiFetch, ApiClientError, type ApiFetchInit } from "./api";
import { createClient } from "./supabase/client";

/**
 * 주문 REST 호출의 클라이언트 타임아웃(ms).
 * server 5초 대기 + relay 클라이언트 0.5초 여유 = 5.5초보다 **길어야 한다**(15-17 인계 ③).
 * `lib/api.ts` 기본값(8,000ms)을 덮어쓴다.
 */
export const ORDER_REQUEST_TIMEOUT_MS = 9_000;

/**
 * server 가 주문 경로에서 돌려주는 에러 코드 7종 (15-17 인계 ①).
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
 * - `ORDER_TIMEOUT` — server 가 relay 응답을 못 받았다. 게이트웨이까지 갔을 수 있다(15-17).
 * - `TIMEOUT` — 브라우저가 9초 안에 응답을 못 받았다. 요청은 이미 나갔다.
 * - `NETWORK_ERROR` — fetch 자체가 깨졌다. **연결 전에 깨졌는지 후에 깨졌는지 구별할 수
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
 * 주문을 낸다. `orderType:"N"` 은 신규, `"C"` 는 취소(원주문번호 + 미체결 잔량 전부).
 *
 * ⚠️ 종목 키(12자 ISIN)는 **보내지 않는다**. 브라우저가 주문 대상을 정하면 화면에 보이는
 *    종목과 실제로 나가는 주문이 어긋날 수 있으므로, server 가 6자 단축코드로 `stocks` 를
 *    조회해 채운다(D-28 · T-15-50). 이 함수의 시그니처가 그 계약이다.
 */
export function createOrder(req: CreateOrderRequest): Promise<CreateOrderResponse> {
  return authFetch<CreateOrderResponse>("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    timeoutMs: ORDER_REQUEST_TIMEOUT_MS,
  });
}

/**
 * 오늘(또는 지정일) 주문 목록. 응답은 **bare array** 이고 원소는 `DmaOrderRow` 다(15-17).
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

export type { CreateOrderRequest, CreateOrderResponse, DmaOrderRow };
