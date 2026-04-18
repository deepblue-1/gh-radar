/**
 * Phase 08 — Bright Data Web Unlocker proxy 에러 클래스.
 *
 * 의미론은 news-sync NaverAuthError/BudgetExhaustedError 와 평행.
 * index.ts 는 Auth/Budget 예외를 stopAll 시그널로 처리.
 */

export class ProxyAuthError extends Error {
  constructor(msg = "bright data auth failed (401)") {
    super(msg);
    this.name = "ProxyAuthError";
  }
}

export class ProxyBudgetExhaustedError extends Error {
  constructor(msg = "bright data quota exhausted (402)") {
    super(msg);
    this.name = "ProxyBudgetExhaustedError";
  }
}

export class ProxyBadRequestError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ProxyBadRequestError";
  }
}

export class ProxyBlockedError extends Error {
  constructor(msg = "naver blocked") {
    super(msg);
    this.name = "ProxyBlockedError";
  }
}

export class NaverRateLimitError extends Error {
  constructor(msg = "naver/upstream rate limited") {
    super(msg);
    this.name = "NaverRateLimitError";
  }
}

export class NaverApiValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "NaverApiValidationError";
  }
}
