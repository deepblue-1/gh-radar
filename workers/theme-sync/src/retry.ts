import { logger } from "./logger";

export interface WithRetryOptions {
  attempts?: number;
  /**
   * 재시도 여부 판정 (true 면 재시도, false 면 즉시 rethrow).
   * 미지정 시 모든 에러를 재시도 — 기존 동작 보존.
   *
   * 차단 신호(403/429 등 isBlockSignal)는 자동 지수 재시도 금지(한국 크롤링 5원칙 #4)
   * — 호출자가 `shouldRetry: (e) => !isBlockSignal(e)` 로 즉시 rethrow 시켜야 한다.
   */
  shouldRetry?: (err: unknown) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: WithRetryOptions | number = {},
): Promise<T> {
  // number 인자는 하위호환(attempts) — 기존 호출자 시그니처 보존.
  const opts: WithRetryOptions =
    typeof options === "number" ? { attempts: options } : options;
  const attempts = opts.attempts ?? 3;
  const shouldRetry = opts.shouldRetry;

  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // 차단 신호 등 재시도 불가 에러는 즉시 rethrow (지수 backoff 금지, 5원칙 #4).
      if (shouldRetry && !shouldRetry(err)) throw err;
      if (i === attempts) break;
      const waitMs = 200 * Math.pow(2, i - 1);
      logger.warn({ label, attempt: i, waitMs, err: (err as Error).message }, "retry");
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}
