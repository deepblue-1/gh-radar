import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";

describe("createApp — middleware stack integration", () => {
  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS =
      "http://localhost:3000,/^https:\\/\\/gh-radar-.*\\.vercel\\.app$/";
  });

  it("trust proxy === 1", () => {
    const app = createApp({ supabase: mockSupabase({ stocks: [] }) });
    expect(app.get("trust proxy")).toBe(1);
  });

  it("모든 응답에 X-Request-Id 헤더 존재", async () => {
    const app = createApp({ supabase: mockSupabase({ stocks: [] }) });
    const r = await request(app).get("/some-route-that-does-not-exist");
    expect(r.headers["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
  });

  it("404 fallback이 동작 — /nope → NOT_FOUND", async () => {
    const app = createApp({ supabase: mockSupabase({ stocks: [] }) });
    const r = await request(app).get("/nope");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("NOT_FOUND");
  });

  it("CORS preflight 허용 origin → 2xx + ACAO 헤더 echo", async () => {
    const app = createApp({ supabase: mockSupabase({ stocks: [] }) });
    const r = await request(app)
      .options("/nope")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET");
    expect([200, 204]).toContain(r.status);
    expect(r.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
  });

  it("CORS preflight Vercel preview(regex) → 허용", async () => {
    const app = createApp({ supabase: mockSupabase({ stocks: [] }) });
    const r = await request(app)
      .options("/nope")
      .set("Origin", "https://gh-radar-pr42.vercel.app")
      .set("Access-Control-Request-Method", "GET");
    expect([200, 204]).toContain(r.status);
    expect(r.headers["access-control-allow-origin"]).toBe(
      "https://gh-radar-pr42.vercel.app",
    );
  });

  it("CORS 비허용 origin → ACAO 헤더 부재", async () => {
    const app = createApp({ supabase: mockSupabase({ stocks: [] }) });
    const r = await request(app)
      .options("/nope")
      .set("Origin", "https://evil.example.com")
      .set("Access-Control-Request-Method", "GET");
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("16kb 초과 JSON body → 에러 (POST 없이도 express.json limit 적용 검증)", async () => {
    const app = createApp({ supabase: mockSupabase({ stocks: [] }) });
    app.post("/echo", (req, res) => {
      res.json(req.body);
    });
    const huge = "x".repeat(17 * 1024);
    const r = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .send({ a: huge });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("app.locals.supabase === deps.supabase (DI)", () => {
    const supa = mockSupabase({ stocks: [] });
    const app = createApp({ supabase: supa });
    expect(app.locals.supabase).toBe(supa);
  });

  it("helmet 기본 보안 헤더 존재 (X-DNS-Prefetch-Control)", async () => {
    const app = createApp({ supabase: mockSupabase({ stocks: [] }) });
    const r = await request(app).get("/nope");
    expect(r.headers["x-dns-prefetch-control"]).toBeDefined();
  });
});
