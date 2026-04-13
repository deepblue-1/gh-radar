import { logger } from "./logger";
import { KisRateLimitError } from "./errors";

const BASE_DELAY_MS = 1000;
const MAX_RETRIES = 3;

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

      if (isRateLimit) {
        throw new KisRateLimitError();
      }

      if (attempt === MAX_RETRIES) {
        throw err;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, delay, label, error: err.message },
        "retrying after error"
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("unreachable");
}
