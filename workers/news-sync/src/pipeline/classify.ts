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
 *  - NaverBudgetExhaustedError → stopAll (일일 quota exhausted — 429 소진 본문)
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

/**
 * quick-260915-h3p — 연속 429 종목 수가 이 값에 이르면 "일일 한도 소진 의심" 으로 run 을 중단한다.
 * 5 > 동시성 3 이므로, 동시에 떠 있던 종목들이 한 번의 초당 버스트로 함께 실패해도
 * 그것만으로는 발동하지 않는다(버스트 이후 시작된 종목까지 재시도 끝에 429 여야 한다).
 */
export const CONSECUTIVE_429_STOCKS_FOR_EXHAUSTION = 5;

/**
 * 재시도 후에도 429 로 끝난 종목의 연속 수를 센다. 성공 종목이 끼면 0 으로 리셋.
 * 429 가 아닌 실패(other)는 이 카운터를 건드리지 않는다(호출부 규약).
 */
export class Consecutive429Tracker {
  private readonly threshold: number;
  private count = 0;

  constructor(threshold: number = CONSECUTIVE_429_STOCKS_FOR_EXHAUSTION) {
    this.threshold = threshold;
  }

  /** 429 종목 1건 기록. 연속 수가 임계값 이상이면 true. */
  recordRateLimitFailure(): boolean {
    this.count += 1;
    return this.count >= this.threshold;
  }

  recordSuccess(): void {
    this.count = 0;
  }
}
