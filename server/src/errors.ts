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
