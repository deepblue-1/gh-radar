/**
 * Phase 10 — Bright Data Web Unlocker proxy 에러 클래스 (discussion-sync 선례 복제).
 *
 * theme-sync 의 fetchWithFallback 은 직접 fetch 403/429 시 fetchViaProxy 로 폴백하고,
 * 프록시마저 차단(401/402/400/403/429/503) 이면 아래 예외로 분류한다. index.ts(cycle)는
 * ProxyAuthError/ProxyBudgetExhaustedError/ProxyBlockedError/NaverRateLimitError 를
 * "차단 신호" 로 보고 24h backoff (markBackoff) 를 기록한다 (5원칙 #4).
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
  constructor(msg = "source blocked") {
    super(msg);
    this.name = "ProxyBlockedError";
  }
}

export class NaverRateLimitError extends Error {
  constructor(msg = "source/upstream rate limited") {
    super(msg);
    this.name = "NaverRateLimitError";
  }
}

export class ThemeScrapeValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ThemeScrapeValidationError";
  }
}

/**
 * fetchWithFallback 이 직접+프록시 모두 차단당했을 때 던지는 신호.
 * cycle 은 이 예외(또는 위 Proxy* / NaverRateLimit)를 잡아 markBackoff(24h) 한다.
 */
export class SourceBlockedError extends Error {
  /** 차단된 source 라벨 ('naver' | 'alphasquare'). */
  readonly source: string;
  constructor(source: string, msg?: string) {
    super(msg ?? `source blocked after proxy fallback: ${source}`);
    this.name = "SourceBlockedError";
    this.source = source;
  }
}
