import {
  NaverAuthError,
  NaverBudgetExhaustedError,
  NaverRateLimitError,
} from "../naver/searchNews.js";

/**
 * Phase 07.2 — per-stock 에러 분류기.
 *
 * index.ts 의 runNewsSyncCycle catch 블록이 이 함수를 호출해
 * stopAll / skip 판정과 로그 레벨을 결정한다. 순수 함수이므로
 * index.ts 의 runtime 의존성(cfg/supabase/naver) 없이 단독 테스트 가능.
 *
 * 분류:
 *  - NaverAuthError            → stopAll (401, secret 만료/오타)
 *  - NaverBudgetExhaustedError → stopAll (일일/월 quota exhausted)
 *  - NaverRateLimitError       → skip    (429, per-stock backoff retry 후 포기)
 *  - 그 외                     → skip    (generic error)
 */
export type PerStockErrorKind =
  | "auth"
  | "budget-exhausted"
  | "rate-limit"
  | "other";

export interface PerStockErrorDisposition {
  disposition: "stopAll" | "skip";
  level: "error" | "warn";
  kind: PerStockErrorKind;
}

export function classifyPerStockError(err: unknown): PerStockErrorDisposition {
  if (err instanceof NaverAuthError) {
    return { disposition: "stopAll", level: "error", kind: "auth" };
  }
  if (err instanceof NaverBudgetExhaustedError) {
    return { disposition: "stopAll", level: "error", kind: "budget-exhausted" };
  }
  if (err instanceof NaverRateLimitError) {
    return { disposition: "skip", level: "warn", kind: "rate-limit" };
  }
  return { disposition: "skip", level: "warn", kind: "other" };
}
