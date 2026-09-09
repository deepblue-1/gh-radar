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
// Phase 16 Plan 16 — DMA 주문 에러는 여기에 없다 (D-02).
//
// 15-17 이 두었던 7종(`DMA_NOT_ALLOWED` · `SESSION_NOT_READY` · `ORDER_TIMEOUT` ·
// `RELAY_UNAVAILABLE` · `ACCOUNT_NOT_ALLOWED` · `ISIN_UNAVAILABLE` 등)은 REST 주문
// 라우트 · `services/relay-client.ts` 와 함께 제거했다. 주문 접수는 relay wss 전용이고,
// 거부 사유는 relay 가 `{t:"order.result", status:"rejected"}` 로 직접 브라우저에 답한다
// (16-08). 여기에 사본을 남기면 "어느 쪽 문구가 진짜인가"를 두 곳에서 관리하게 된다.
//
// 브라우저의 결과 판정("결과 모름 vs 거부", Pitfall 9)도 **에러 코드 테이블이 아니다.**
// 정본은 `RelayOrderResultMsg.status` 하나이며, `webapp/src/components/orderbook/order-panel.tsx`
// 와 `webapp/src/components/orderbook/account-panel.tsx` 가 `res.status === 'timeout'` 을
// **인라인**으로 본다 — 판정 지점이 그 둘뿐이라 상수 테이블을 따로 둘 이유가 없다.
// (16-20 에서 그 테이블을 들고 있던 `webapp/src/lib/orders-api.ts` 를 삭제했다 — 임포터 0건의
//  죽은 모듈이었다. 여기에 그 모듈을 가리키는 문장을 다시 만들지 말 것.)
//
// `GET /api/orders`(조회)는 살아 있다(D-03). 다만 **브라우저 호출자는 아직 없다** — 그 조회가
// 메우는 구멍은 「오늘 주문 이력 표」뿐이고 그 표는 D-20 이 v1 범위 밖(deferred)에 두었다.
// 표를 만들 때 클라이언트를 함께 만든다. 그때까지 조회 라우트에 클라이언트 사본을 미리 두지 않는다.
// ============================================================
