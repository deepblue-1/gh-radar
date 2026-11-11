import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, RequestHandler } from "express";

const keyGenerator = (req: Request) => ipKeyGenerator(req.ip ?? "", 64);

const rateLimitedHandler: RequestHandler = (_req, res) => {
  res.status(429).json({
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests, retry later.",
    },
  });
};

/**
 * 전역 `/api` 제한기에서 빼는 경로 — `/api` 에 마운트되므로 `req.path` 에 `/api` 접두가 없다.
 * - `/health…`: probe spam 이 카운트를 먹지 않게.
 * - `/news/by-stock`: 전용 제한기(`newsByStockRateLimiter`)를 쓴다(Phase 41 SC-4).
 */
export function apiRateLimitSkip(req: Request): boolean {
  return req.path.startsWith("/health") || req.path.startsWith("/news/by-stock");
}

export function apiRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: 200,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator,
    skip: apiRateLimitSkip,
    handler: rateLimitedHandler,
  });
}

/**
 * `GET /api/news/by-stock` 전용 제한기 — 기본 IP 당 분 600회 · 같은 429 JSON.
 *
 * RESEARCH Pitfall 5: gh-trade 클라(돌파감지 창 · 상따창)는 사무실 여러 대가 같은 공인 IP 로 5 ~ 10초마다 부른다.
 * 전역 분 200회에 섞이면 테마 · 시세 조회까지 429 가 난다 — 그래서 전역에서 빼고 따로 센다.
 * 응답이 5초 캐시(`NEWS_BY_STOCK_CACHE_TTL_MS`)라 한도를 넉넉히 둬도 DB 부담은 작다.
 */
export function newsByStockRateLimiter(opts: { limit?: number; windowMs?: number } = {}): RequestHandler {
  return rateLimit({
    windowMs: opts.windowMs ?? 60_000,
    limit: opts.limit ?? 600,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitedHandler,
  });
}
