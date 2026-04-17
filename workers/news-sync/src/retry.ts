import { createLogger } from "./logger.js";

const log = createLogger(process.env.LOG_LEVEL ?? "info");

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts) break;
      const waitMs = 200 * Math.pow(2, i - 1);
      log.warn(
        { label, attempt: i, waitMs, err: (err as Error).message },
        "retry",
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}
