export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const StockNotFound = (code: string) =>
  new ApiError(404, "STOCK_NOT_FOUND", `Stock ${code} not found`);
export const InvalidQueryParam = (param: string, reason: string) =>
  new ApiError(400, "INVALID_QUERY_PARAM", `${param}: ${reason}`);
export const ValidationFailed = (msg: string) =>
  new ApiError(400, "VALIDATION_FAILED", msg);
export const RateLimited = () =>
  new ApiError(429, "RATE_LIMITED", "Too many requests, retry later.");
export const NotFound = () =>
  new ApiError(404, "NOT_FOUND", "Route not found");
export const InternalError = (msg = "Internal server error") =>
  new ApiError(500, "INTERNAL_ERROR", msg);
export const NewsRefreshCooldown = (seconds: number) =>
  new ApiError(
    429,
    "NEWS_REFRESH_COOLDOWN",
    `잠시 후 다시 시도해주세요 (${seconds}s)`,
  );
export const NaverBudgetExhausted = () =>
  new ApiError(
    503,
    "NAVER_BUDGET_EXHAUSTED",
    "오늘 뉴스 새로고침 한도가 모두 소진되었습니다",
  );
export const NaverUnavailable = () =>
  new ApiError(503, "NAVER_UNAVAILABLE", "naver client not configured");

// Phase 08 — discussion 새로고침 cooldown / 프록시 예산 / 프록시 미주입 helpers.
export const DiscussionRefreshCooldown = (seconds: number) =>
  new ApiError(
    429,
    "DISCUSSION_REFRESH_COOLDOWN",
    `잠시 후 다시 시도해주세요 (${seconds}s)`,
  );
export const ProxyBudgetExhausted = () =>
  new ApiError(
    503,
    "PROXY_BUDGET_EXHAUSTED",
    "오늘 토론방 새로고침 한도가 모두 소진되었습니다",
  );
export const ProxyUnavailable = () =>
  new ApiError(503, "PROXY_UNAVAILABLE", "토론방 프록시 설정이 없습니다");

// ============================================================
// Phase 15 — DMA 주문 릴레이 (RELAY-02). RESEARCH Pattern 10 매핑표.
// ============================================================

/**
 * `dma_credentials` 매핑이 없는 사용자 (D-12 allowlist).
 * "권한이 없다"까지만 말한다 — 어떻게 얻는지는 서버가 모른다(수동 등록, D-18).
 */
export const DmaNotAllowed = () =>
  new ApiError(403, "DMA_NOT_ALLOWED", "실시간 호가·주문 권한이 없어요");

/**
 * relay 에 활성 Ready 세션이 없다 (relay 409 그대로 전달).
 * 세션은 호가창 wss 접속으로 생기므로 사용자가 할 일이 명확하다.
 */
export const SessionNotReady = () =>
  new ApiError(409, "SESSION_NOT_READY", "호가창을 먼저 열어 주세요");

/**
 * 5초 안에 첫 접수 통보를 받지 못했다 (relay 202 + `ORDER_TIMEOUT`).
 *
 * ⚠️ **"실패했어요"라고 쓰지 않는다** (RESEARCH Pitfall 9 / UI-SPEC C9). 주문은 이미
 * 나갔을 수 있고 여기서 실패로 단정하면 사용자가 재주문해 **중복 체결**이 난다.
 * 상태코드는 5xx 로 두되(성공이 아니므로) 구분은 `code` 로 한다 — 502 를 고른 이유는
 * 504 가 인프라·클라이언트에게 "재시도해도 되는 게이트웨이 장애"로 읽히기 때문이다.
 */
export const OrderTimeout = () =>
  new ApiError(502, "ORDER_TIMEOUT", "접수 응답이 늦어지고 있어요. 미체결 목록을 확인해 주세요");

/** relay 에 닿지 못했다(연결 실패·5xx). 주문은 나가지 않았다. */
export const RelayUnavailable = () =>
  new ApiError(502, "RELAY_UNAVAILABLE", "주문 서버에 연결할 수 없어요");

/**
 * `RELAY_INTERNAL_URL`/`RELAY_ORDER_SECRET` 미설정 — 주문 기능 자체가 꺼져 있다.
 * 코드는 `RELAY_UNAVAILABLE` 로 같게 두고(웹앱 분기 1개면 충분) 상태만 503 으로 구분한다
 * (`ProxyUnavailable()` 선례 — 설정 부재는 503, 런타임 도달 실패는 502).
 */
export const RelayNotConfigured = () =>
  new ApiError(503, "RELAY_UNAVAILABLE", "주문 기능이 아직 준비되지 않았어요");

/** 요청 계좌가 그 사용자 세션의 계좌 목록 밖이다 (relay 403 그대로 전달, T-15-01). */
export const AccountNotAllowed = () =>
  new ApiError(403, "ACCOUNT_NOT_ALLOWED", "선택한 계좌로는 주문할 수 없어요");

// `ISIN_UNAVAILABLE`(422) 은 조회를 수행하는 `services/dma-orders.ts` 가 지역 헬퍼로
// 둔다 — `chat-history.ts` 의 `ConversationNotFound` 선례와 같다(그 조회를 하는 모듈
// 밖에서는 던질 일이 없는 에러는 그 모듈에 둔다).
