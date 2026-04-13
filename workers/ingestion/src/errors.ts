export class KisRateLimitError extends Error {
  constructor() {
    super("KIS rate limit exceeded (EGW00201)");
    this.name = "KisRateLimitError";
  }
}

export class KisAuthError extends Error {
  constructor(message: string) {
    super(`KIS auth error: ${message}`);
    this.name = "KisAuthError";
  }
}

export class HolidayError extends Error {
  constructor(date: string) {
    super(`Non-trading day detected: ${date}`);
    this.name = "HolidayError";
  }
}
