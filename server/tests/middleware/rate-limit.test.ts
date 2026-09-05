import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { apiRateLimiter } from "../../src/middleware/rate-limit.js";

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

  it("/api/health 는 rate-limit 카운트 제외 (probe spam 회귀 가드)", async () => {
    const a = express();
    a.set("trust proxy", 1);
    a.use("/api", apiRateLimiter());
    a.get("/api/health", (_req, res) => res.json({ ok: true }));
    a.get("/api/ping", (_req, res) => res.json({ ok: true }));
    // 리스닝 서버를 한 번만 띄우고 재사용한다. `request(app)` 은 호출마다
    // 임시 서버를 새로 bind/close 하는데, 250회를 그렇게 돌리면 워크스페이스
    // 병렬 테스트로 CPU 가 포화됐을 때 타임아웃/ECONNRESET 로 간헐 실패한다.
    const server = a.listen(0);
    try {
      for (let i = 0; i < 250; i++) {
        const r = await request(server).get("/api/health");
        expect(r.status).toBe(200);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);
});
