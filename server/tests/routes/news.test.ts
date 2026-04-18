import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

function makeSupabase(overrides: Record<string, unknown> = {}) {
  // 간단한 chainable mock — 쿼리 체인을 재현.
  return {
    from: vi.fn((table: string) => {
      const ctx: { table: string; _lastLimit: number | undefined } = {
        table,
        _lastLimit: undefined,
      };
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn((n: number) => {
        ctx._lastLimit = n;
        const dataset =
          (overrides[`${table}.list`] as unknown[] | undefined) ?? [];
        // maybeSingle 가 limit 이후 체이닝될 수 있으므로 chain 자체를 반환하되,
        // chain 은 thenable 이어서 await 시 limited 결과를 내도록 한다.
        const limited = dataset.slice(0, n);
        const limitedChain: Record<string, unknown> = {
          ...chain,
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: limited, error: null }),
          maybeSingle: vi.fn(() => {
            // POST /refresh 쿨다운 쿼리용 — '..table.single' override 우선.
            const key = `${table}.single`;
            const data = (overrides[key] as unknown) ?? null;
            return Promise.resolve({ data, error: null });
          }),
        };
        return limitedChain;
      });
      chain.maybeSingle = vi.fn(() => {
        const key = `${table}.single`;
        const data = (overrides[key] as unknown) ?? null;
        return Promise.resolve({ data, error: null });
      });
      chain.upsert = vi.fn().mockResolvedValue({ data: [], error: null });
      // thenable — await chain (GET 핸들러는 .limit() 마지막이라 여기 쓰이지 않지만 안전망)
      chain.then = (resolve: (v: unknown) => unknown) => {
        const dataset =
          (overrides[`${table}.list`] as unknown[] | undefined) ?? [];
        return resolve({ data: dataset, error: null });
      };
      return chain;
    }),
    rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
  };
}

function makeNaver(items: unknown[] = []) {
  return {
    get: vi.fn().mockResolvedValue({ data: { items } }),
  };
}

function snakeNewsRow(i: number) {
  return {
    id: String(i),
    stock_code: "005930",
    title: "t",
    description: `desc ${i}`,
    source: "hankyung",
    url: "https://x/" + i,
    published_at: "2026-04-17T00:00:00Z",
    content_hash: null,
    summary_id: null,
    created_at: "2026-04-17T00:00:00Z",
  };
}

describe("GET /api/stocks/:code/news (V-13/V-15/mapper camelCase)", () => {
  it("clamps days > 7 and limit > 100 (200 + body length <= 100 + camelCase keys)", async () => {
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "news_articles.list": Array.from({ length: 150 }).map((_, i) =>
        snakeNewsRow(i),
      ),
    });
    const app = createApp({
      supabase: supabase as unknown as Parameters<
        typeof createApp
      >[0]["supabase"],
    });
    const res = await request(app).get(
      "/api/stocks/005930/news?days=30&limit=500",
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(100);
    // mapper 적용 검증 — 응답은 camelCase 여야 한다
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty("stockCode");
      expect(res.body[0]).toHaveProperty("publishedAt");
      expect(res.body[0]).toHaveProperty("createdAt");
      expect(res.body[0]).toHaveProperty("description");
      expect(res.body[0].description).toBe("desc 0");
      expect(res.body[0]).not.toHaveProperty("stock_code");
      expect(res.body[0]).not.toHaveProperty("published_at");
    }
  });

  it("returns 400 for invalid code XYZ$", async () => {
    const supabase = makeSupabase();
    const app = createApp({
      supabase: supabase as unknown as Parameters<
        typeof createApp
      >[0]["supabase"],
    });
    const res = await request(app).get("/api/stocks/XYZ$/news");
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe("INVALID_QUERY_PARAM");
  });

  it("returns 404 when master code not found", async () => {
    const supabase = makeSupabase({ "stocks.single": null });
    const app = createApp({
      supabase: supabase as unknown as Parameters<
        typeof createApp
      >[0]["supabase"],
    });
    const res = await request(app).get("/api/stocks/000001/news");
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe("STOCK_NOT_FOUND");
  });
});

describe("POST /api/stocks/:code/news/refresh (V-14)", () => {
  it("returns 503 NAVER_UNAVAILABLE when naverClient not injected", async () => {
    const supabase = makeSupabase({
      "stocks.single": { code: "005930", name: "삼성전자" },
    });
    const app = createApp({
      supabase: supabase as unknown as Parameters<
        typeof createApp
      >[0]["supabase"],
    });
    const res = await request(app).post("/api/stocks/005930/news/refresh");
    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe("NAVER_UNAVAILABLE");
  });

  it("returns 429 + Retry-After + retry_after_seconds when recent news within 30s", async () => {
    const recent = new Date(Date.now() - 10_000).toISOString(); // 10s ago
    const supabase = makeSupabase({
      "stocks.single": { code: "005930", name: "삼성전자" },
      "news_articles.single": { created_at: recent },
    });
    const app = createApp({
      supabase: supabase as unknown as Parameters<
        typeof createApp
      >[0]["supabase"],
      naverClient: makeNaver(
        [],
      ) as unknown as Parameters<typeof createApp>[0]["naverClient"],
    });
    const res = await request(app).post("/api/stocks/005930/news/refresh");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(res.body?.retry_after_seconds).toBeGreaterThan(0);
    expect(res.body?.retry_after_seconds).toBeLessThanOrEqual(30);
    expect(res.body?.error?.code).toBe("NEWS_REFRESH_COOLDOWN");
  });
});

describe("CORS exposedHeaders (V-16)", () => {
  it("GET /api/stocks/:code/news response exposes Retry-After header", async () => {
    // cors 미들웨어는 모든 응답에 Access-Control-Expose-Headers 를 포함.
    // 사전 조건: services/cors-config.ts 의 exposedHeaders 에 Retry-After 가 포함되어 있어야 함(Task 1).
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "news_articles.list": [],
    });
    const app = createApp({
      supabase: supabase as unknown as Parameters<
        typeof createApp
      >[0]["supabase"],
    });
    // cors 미들웨어는 ENV CORS_ALLOWED_ORIGINS 에 매치되는 origin 에 대해서만
    // Access-Control-Expose-Headers 를 내보낸다. tests/setup.ts 가 localhost:3000 을
    // 허용 리스트에 포함하므로 해당 origin 으로 검증.
    const res = await request(app)
      .get("/api/stocks/005930/news")
      .set("Origin", "http://localhost:3000");
    expect(res.headers["access-control-expose-headers"]).toMatch(/Retry-After/i);
  });
});
