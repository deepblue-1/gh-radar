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
