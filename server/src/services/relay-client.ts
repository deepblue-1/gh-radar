import axios, { type AxiosInstance } from "axios";
import { z } from "zod";
import type {
  CreateOrderResponse,
  DmaOrderStatus,
  OrderMarket,
  OrderSide,
  OrderType,
  RelayExchange,
} from "@gh-radar/shared";

import { logger } from "../logger.js";
import {
  AccountNotAllowed,
  InternalError,
  OrderTimeout,
  RelayUnavailable,
  SessionNotReady,
  ValidationFailed,
} from "../errors.js";

/**
 * Phase 15 Plan 17 — relay 내부 HTTP 클라이언트 (RELAY-02, D-08 / D-22 / T-15-06).
 *
 * 브라우저 → Cloud Run `/api/orders` → **Direct VPC Egress** → VM 내부 IP:8091 →
 * relay `POST /internal/orders`. 공인망에 relay 내부 포트를 열지 않기 위한 유일한 통로다.
 *
 * `kiwoom/client.ts`(axios 팩토리) + `server.ts` L42-63(미설정 graceful degradation +
 * 프로토콜 가드)의 relay 판이다. Bright Data 는 https 를 강제했지만 여기는 **평문 http 를
 * 허용**한다 — VPC 내부 구간이고 TLS 종단은 Caddy 가 8090 에서만 한다(D-08). 대신
 * https 가드 자리에 **사설 대역 가드**를 둔다: 공유 비밀(`X-Relay-Secret`)이 오타 하나로
 * 인터넷의 임의 호스트에 전송되는 것을 부팅 시점에 막는다.
 *
 * ── 응답 3분류가 이 파일의 핵심이다 (15-16 인계 ③) ─────────────────────────
 *   200            결과를 **안다** (접수/거부) → 그대로 반환
 *   202 + ORDER_TIMEOUT  결과를 **모른다** → `OrderTimeout()`. **실패로 매핑 금지**
 *   4xx            보내기 전에 **거절** → 코드별 매핑
 * 202 를 실패(또는 재시도 가능)로 읽으면 사용자가 재주문해 **중복 체결**이 난다.
 * relay 가 504 대신 202 를 고른 이유가 정확히 그것이다(15-16 결정).
 */

// ============================================================
// 계약
// ============================================================

/** relay `POST /internal/orders` 바디 (15-16 `OrderRequestSchema` 와 1:1). */
export type RelayOrderPayload = {
  userId: string;
  /** server 가 insert 한 `dma_orders.id`. relay 상관의 1순위 키다. */
  orderRowId: string;
  /** 12자 KRX 표준코드. 서버가 `stocks` 에서 채운다 (D-28). */
  isin: string;
  exchange: RelayExchange;
  market: OrderMarket;
  side: OrderSide;
  orderType: OrderType;
  orgOrderNo?: string;
  qty: number;
  price: number;
  accountNo: string;
};

export type RelayClient = {
  postOrder(payload: RelayOrderPayload): Promise<CreateOrderResponse>;
};

/** relay 200 응답 형태. 신뢰 경계 밖이므로 형태를 확인하고 쓴다. */
const RelayOrderResultSchema = z.object({
  orderNo: z.string(),
  resultCode: z.number(),
  message: z.string(),
  status: z.string(),
});

/** relay 에러 envelope (S-1 — server 와 동일 형식). */
const RelayErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string().optional() }),
});

/** `dma_orders.status` 도메인 (CHECK 제약과 같은 7값). */
const ORDER_STATUSES: readonly string[] = [
  "requested",
  "accepted",
  "rejected",
  "filled",
  "partially_filled",
  "cancelled",
  "timeout",
];

// ============================================================
// 사설 대역 가드 (T-15-06)
// ============================================================

/**
 * Direct VPC Egress 가 나가는 서브넷 `10.10.0.0/26` = 10.10.0.0 ~ 10.10.0.63 (D-08).
 * relay VM 은 이 안에 있다. 대역 밖 주소는 **부팅 시 throw** — 배포 실수로 공유 비밀이
 * 인터넷으로 나가는 것보다 서버가 안 뜨는 편이 낫다.
 */
const SUBNET_PREFIX = "10.10.0.";
const SUBNET_HOST_MAX = 63;

function isRelaySubnetHost(host: string): boolean {
  if (!host.startsWith(SUBNET_PREFIX)) return false;
  const last = host.slice(SUBNET_PREFIX.length);
  if (!/^\d{1,3}$/.test(last)) return false;
  return Number(last) <= SUBNET_HOST_MAX;
}

/** 로컬 가짜 relay. **비프로덕션 전용** — 비밀이 이 머신 밖으로 나가지 않는다. */
function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

/**
 * `RELAY_INTERNAL_URL` 검증. 부적합하면 throw 한다(호출부는 `server.ts` 부팅 경로).
 *
 * 검사 순서가 중요하다 — URL 파싱 실패를 먼저 걸러야 `new URL` 이 던지는 원문이
 * 로그에 그대로 남지 않는다(값에 비밀이 섞여 들어오는 오설정도 있을 수 있다).
 */
export function assertRelayUrl(rawUrl: string, nodeEnv: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("RELAY_INTERNAL_URL must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`RELAY_INTERNAL_URL must be http/https (got: ${url.protocol})`);
  }
  const host = url.hostname;
  if (isRelaySubnetHost(host)) return url;
  if (nodeEnv !== "production" && isLoopbackHost(host)) return url;
  throw new Error(
    `RELAY_INTERNAL_URL host must be inside ${SUBNET_PREFIX}0/26 (got: ${host})`,
  );
}

// ============================================================
// 팩토리
// ============================================================

/**
 * relay 클라이언트 생성. 두 env 가 모두 있을 때만 호출한다(`server.ts`).
 *
 * HTTP 타임아웃은 relay 의 첫 통보 대기(5초, D-22)보다 **조금 길게** 잡는다 — relay 가
 * 스스로 `ORDER_TIMEOUT` 을 판정해 202 를 돌려줄 여지를 남기기 위해서다. 여기서 먼저
 * 끊으면 "relay 는 결과를 알고 있는데 server 만 모르는" 상태가 만들어진다.
 */
export function createRelayClient(opts: {
  baseUrl: string;
  secret: string;
  timeoutMs: number;
  nodeEnv: string;
}): RelayClient {
  const url = assertRelayUrl(opts.baseUrl, opts.nodeEnv);
  const http: AxiosInstance = axios.create({
    baseURL: url.origin,
    timeout: opts.timeoutMs + 500,
    headers: {
      "content-type": "application/json",
      // T-15-06 — relay 관문의 공유 비밀. 상수시간 비교는 relay 쪽 소관.
      "X-Relay-Secret": opts.secret,
    },
  });

  return { postOrder: (payload) => postOrder(http, payload) };
}

async function postOrder(
  http: AxiosInstance,
  payload: RelayOrderPayload,
): Promise<CreateOrderResponse> {
  // 로그에 계좌번호·비밀을 남기지 않는다. 상관에 필요한 키만.
  const logCtx = { orderRowId: payload.orderRowId, orderType: payload.orderType };

  let res;
  try {
    res = await http.post("/internal/orders", payload, {
      // 상태코드 분기를 직접 한다 — 202 를 axios 의 "성공"으로 흘려보내면
      // 결과를 모르는 주문이 접수 성공으로 둔갑한다.
      validateStatus: () => true,
    });
  } catch (err) {
    throw mapTransportError(err, logCtx);
  }

  // ── 202: 결과를 모른다. **실패가 아니다** ────────────────────────────
  if (res.status === 202) {
    logger.error({ ...logCtx }, "[relay-client] relay 202 ORDER_TIMEOUT — 결과 확인 필요");
    throw OrderTimeout();
  }

  if (res.status === 200) {
    const parsed = RelayOrderResultSchema.safeParse(res.data);
    if (!parsed.success) {
      // relay 가 200 을 줬다 = 주문은 처리됐다. 본문만 못 읽었을 뿐이므로
      // "연결 실패"로 말하면 안 된다 — 결과를 모르는 것이 진실이다.
      logger.error({ ...logCtx }, "[relay-client] relay 200 응답 형식 해석 실패");
      throw OrderTimeout();
    }
    const status = parsed.data.status;
    if (!ORDER_STATUSES.includes(status)) {
      logger.error({ ...logCtx, status }, "[relay-client] 알 수 없는 주문 상태");
      throw OrderTimeout();
    }
    return { ...parsed.data, status: status as DmaOrderStatus };
  }

  throw mapRelayError(res.status, res.data, logCtx);
}

/** 연결 자체가 실패했거나 응답을 못 받았다. */
function mapTransportError(err: unknown, logCtx: Record<string, unknown>): Error {
  const code = (err as { code?: string })?.code;

  // 요청은 나갔는데 응답을 못 받았다 = **주문이 나갔을 수 있다**. relay 자신의 5초
  // 판정보다 늦게 끊긴 경우라 "실패"로 단정할 근거가 없다 → 결과 모름으로 처리한다.
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") {
    logger.error({ ...logCtx, code }, "[relay-client] relay 응답 타임아웃 — 결과 확인 필요");
    return OrderTimeout();
  }

  // 연결이 서지 않았다 = 주문은 나가지 않았다. 재시도해도 안전한 유일한 경우다.
  logger.error({ ...logCtx, code }, "[relay-client] relay 연결 실패");
  return RelayUnavailable();
}

/** relay 가 명시적으로 거절했다 (RESEARCH Pattern 10 매핑표). */
function mapRelayError(
  status: number,
  data: unknown,
  logCtx: Record<string, unknown>,
): Error {
  const parsed = RelayErrorSchema.safeParse(data);
  const code = parsed.success ? parsed.data.error.code : undefined;

  // 코드 우선 — relay 가 상태코드를 바꿔도 의미는 코드가 지킨다.
  if (code === "ORDER_TIMEOUT") {
    logger.error({ ...logCtx, status }, "[relay-client] ORDER_TIMEOUT — 결과 확인 필요");
    return OrderTimeout();
  }
  if (code === "SESSION_NOT_READY" || status === 409) return SessionNotReady();
  if (code === "ACCOUNT_NOT_ALLOWED" || status === 403) {
    logger.error({ ...logCtx }, "[relay-client] 세션 계좌 목록 밖의 주문 — 403");
    return AccountNotAllowed();
  }
  if (status === 401) {
    // 공유 비밀 불일치 = **내부 설정 오류**. 사용자에게 원인을 알려 주는 것이 곧
    // 오라클이 되므로 relay 원문·기대값을 응답에 싣지 않고 generic 500 만 낸다.
    logger.error({ ...logCtx }, "[relay-client] RELAY_ORDER_SECRET 불일치 — 설정 점검 필요");
    return InternalError();
  }
  if (status === 400) {
    // server 가 만든 페이로드를 relay 가 거절했다 = 대부분 서버 버그이거나
    // int32 표현 범위 초과다. 원문 메시지는 로그에만 남긴다.
    logger.error(
      { ...logCtx, relayMessage: parsed.success ? parsed.data.error.message : undefined },
      "[relay-client] relay 형식 거절 — 400",
    );
    return ValidationFailed("주문 요청 형식이 올바르지 않습니다.");
  }

  // 404(주문 라우트 미개방)·5xx·그 외 — relay 가 주문을 받을 상태가 아니다.
  logger.error({ ...logCtx, status, code }, "[relay-client] relay 오류 응답");
  return RelayUnavailable();
}
