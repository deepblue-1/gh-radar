import { logger } from "./logger";

/**
 * 키움 429 (rate limit) 는 짧은 backoff 로는 회복 안 되는 패턴이라 별도 처리.
 * 2026-05-26 운영 로그: 기존 200/400/800ms (총 1.4s) backoff 3회 모두 429 → cycle exit(1) 다발.
 * 429 는 시도 5회로 승격, 대기 1s/2s/4s/8s (총 최대 15s) 로 회복 여유 확보.
 * 2026-07-07 운영 로그: 7/3부터 429 급증 (일 1~6건 → 127~150건), 3회/총 3s 대기로 회복 불가 → Job 3회 실패.
 */
const RATE_LIMIT_ATTEMPTS = 5;

function isRateLimitError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  return msg.includes("429") || msg.includes("rate limit");
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  let maxAttempts = attempts;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const rateLimited = isRateLimitError(err);
      if (rateLimited) {
        maxAttempts = Math.max(maxAttempts, RATE_LIMIT_ATTEMPTS);
      }
      if (i === maxAttempts) break;
      const baseMs = rateLimited ? 1000 : 200;
      const waitMs = baseMs * Math.pow(2, i - 1);
      logger.warn(
        { label, attempt: i, waitMs, rateLimited, err: (err as Error).message },
        "retry",
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}
