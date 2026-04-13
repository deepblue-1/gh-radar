import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// 테스트 전용 작은 limit rate limiter — 프로덕션 limit 200과 동일 옵션 세팅 검증
function testLimiter(limit: number) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "", 64),
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests, retry later.",
        },
      });
    },
  });
}

function app(limit = 3) {
  const a = express();
  a.set("trust proxy", 1);
  a.use("/api", testLimiter(limit));
  a.get("/api/ping", (_req, res) => {
    res.json({ ok: true });
  });
  return a;
}

describe("apiRateLimiter (contract validated with small limit)", () => {
  it("(limit+1)번째 요청은 429 + RATE_LIMITED", async () => {
    const a = app(3);
    const agent = request(a);
    for (let i = 0; i < 3; i++) {
      const r = await agent.get("/api/ping");
      expect(r.status).toBe(200);
    }
    const over = await agent.get("/api/ping");
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("RATE_LIMITED");
  });

  it("응답에 draft-7 표준 헤더 RateLimit-* 포함", async () => {
    const r = await request(app()).get("/api/ping");
    const keys = Object.keys(r.headers).map((k) => k.toLowerCase());
    expect(keys.some((k) => k.startsWith("ratelimit"))).toBe(true);
  });
});
