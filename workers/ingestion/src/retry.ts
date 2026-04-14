import { logger } from "./logger";
import { KisRateLimitError } from "./errors";

const BASE_DELAY_MS = 1000; // 일반 에러 초기 backoff
const RATE_LIMIT_BASE_MS = 2000; // rate limit 전용 초기 backoff (더 김)
const MAX_RETRIES = 5;

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isRateLimit =
        err?.response?.data?.msg_cd === "EGW00201" ||
        err instanceof KisRateLimitError;

      if (attempt === MAX_RETRIES) {
        // 최종 실패: rate limit 은 전용 에러로 식별 가능하게 throw
        if (isRateLimit) throw new KisRateLimitError();
        throw err;
      }

      // Rate limit 은 일반 에러보다 초기값 + 성장률 모두 더 길게
      // 일반: 1s → 2s → 4s → 8s → 16s
      // rate limit: 2s → 3s → 4.5s → 6.75s → 10.1s
      const delay = isRateLimit
        ? Math.round(RATE_LIMIT_BASE_MS * Math.pow(1.5, attempt - 1))
        : BASE_DELAY_MS * Math.pow(2, attempt - 1);

      logger.warn(
        { attempt, delay, label, isRateLimit, error: err.message },
        isRateLimit ? "rate limited — backoff & retry" : "retrying after error"
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("unreachable");
}
