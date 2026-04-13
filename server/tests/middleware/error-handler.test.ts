import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { errorHandler } from "../../src/middleware/error-handler";
import { notFoundHandler } from "../../src/middleware/not-found";
import { StockNotFound } from "../../src/errors";

function app(env: string) {
  process.env.NODE_ENV = env;
  const a = express();
  a.get("/api-error", (_req, _res, next) => {
    next(StockNotFound("000000"));
  });
  a.get("/cors-error", (_req, _res, next) => {
    next(new Error("CORS_NOT_ALLOWED"));
  });
  a.get("/boom", (_req, _res, next) => {
    next(new Error("sensitive internal detail"));
  });
  a.use(notFoundHandler);
  a.use(errorHandler);
  return a;
}

describe("errorHandler", () => {
  afterEach(() => {
    process.env.NODE_ENV = "test";
  });

  it("ApiError → status + {error:{code,message}}", async () => {
    const r = await request(app("test")).get("/api-error");
    expect(r.status).toBe(404);
    expect(r.body).toEqual({
      error: { code: "STOCK_NOT_FOUND", message: "Stock 000000 not found" },
    });
    expect(r.body.stack).toBeUndefined();
  });

  it("CORS_NOT_ALLOWED → 403", async () => {
    const r = await request(app("test")).get("/cors-error");
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("CORS_NOT_ALLOWED");
  });

  it("production에서 일반 Error → 500 + 'Internal server error' (실 메시지 은닉)", async () => {
    const r = await request(app("production")).get("/boom");
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("INTERNAL_ERROR");
    expect(r.body.error.message).toBe("Internal server error");
    expect(JSON.stringify(r.body)).not.toContain("sensitive internal detail");
    expect(r.body.error.stack).toBeUndefined();
  });

  it("development에서는 실 메시지 노출", async () => {
    const r = await request(app("development")).get("/boom");
    expect(r.body.error.message).toBe("sensitive internal detail");
  });
});

describe("notFoundHandler", () => {
  it("등록되지 않은 라우트 → 404 NOT_FOUND", async () => {
    const r = await request(app("test")).get("/nope");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("NOT_FOUND");
  });
});
