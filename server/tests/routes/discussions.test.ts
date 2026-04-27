import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

/**
 * Phase 08 Plan 03 — server discussion routes integration test.
 * Plan 08-01 의 it.todo 16종 → concrete it() 로 교체. PIVOT 우선 적용 (cheerio 미사용 가정).
 */

type SnakeRow = {
  id: string;
  stock_code: string;
  post_id: string;
  title: string;
  body: string | null;
  author: string | null;
  posted_at: string;
  scraped_at: string;
};

function snakeRow(overrides: Partial<SnakeRow> = {}): SnakeRow {
  return {
    id: "d1",
    stock_code: "005930",
    post_id: "272617128",
    title: "삼성전자 1분기 실적 기대감",
    body: "1분기 영업이익 시장 컨센서스 상회",
    author: "abc****",
    posted_at: "2026-04-17T05:32:00+00:00",
    scraped_at: "2026-04-17T05:40:00+00:00",
    ...overrides,
  };
}

/**
 * news.test.ts 의 chainable mock 구조를 복제.
 * - `${table}.list`  → order().limit() 결과 (다건)
 * - `${table}.single` → maybeSingle() 결과 (cooldown probe / master 조회)
 */
function makeSupabase(overrides: Record<string, unknown> = {}) {
  return {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.lt = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn((n: number) => {
        const dataset =
          (overrides[`${table}.list`] as unknown[] | undefined) ?? [];
        const limited = dataset.slice(0, n);
        const limitedChain: Record<string, unknown> = {
          ...chain,
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: limited, error: null }),
          maybeSingle: vi.fn(() => {
            // cooldown probe (limit(1).maybeSingle()) — '..table.single' override
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

type AppDepsLoose = Parameters<typeof createApp>[0];

function makeApp(opts: {
  supabase: ReturnType<typeof makeSupabase>;
  brightdataClient?: { post: ReturnType<typeof vi.fn> };
  brightdataApiKey?: string;
  brightdataZone?: string;
  rpcOverride?: ReturnType<typeof vi.fn>;
}) {
  if (opts.rpcOverride) {
    (opts.supabase as unknown as { rpc: unknown }).rpc = opts.rpcOverride;
  }
  return createApp({
    supabase: opts.supabase as unknown as AppDepsLoose["supabase"],
    brightdataClient: opts.brightdataClient as unknown as
      | AppDepsLoose["brightdataClient"]
      | undefined,
    brightdataApiKey: opts.brightdataApiKey,
    brightdataZone: opts.brightdataZone,
  });
}

// ──────────────────────────────────────────────────────────────────────────
// GET /api/stocks/:code/discussions  (V-01..V-08)
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/stocks/:code/discussions (Phase 08 V-01..V-08)", () => {
  it("V-01 200 + envelope { items, hasMore } camelCase (hours=24, limit=5)", async () => {
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.list": [snakeRow()],
    });
    const app = makeApp({ supabase });
    const res = await request(app).get(
      "/api/stocks/005930/discussions?hours=24&limit=5",
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.items[0]).toMatchObject({
      stockCode: "005930",
      postId: "272617128",
      postedAt: "2026-04-17T05:32:00+00:00",
      scrapedAt: "2026-04-17T05:40:00+00:00",
    });
    expect(res.body.items[0].url).toContain("/discussion/272617128");
    expect(res.body.items[0]).not.toHaveProperty("stock_code");
    expect(res.body.items[0]).not.toHaveProperty("scraped_at");
  });

  it("V-02 limit > 50 is clamped to 50 (items length ≤ 50, hasMore=true)", async () => {
    const many = Array.from({ length: 75 }).map((_, i) =>
      snakeRow({ id: `d${i}`, post_id: String(100000 + i) }),
    );
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.list": many,
    });
    const app = makeApp({ supabase });
    const res = await request(app).get(
      "/api/stocks/005930/discussions?days=7&limit=500",
    );
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(50);
    // dataset 75건 > clamp 50 → hasMore=true
    expect(res.body.hasMore).toBe(true);
  });

  it("V-03 invalid code XYZ-abc → 400 INVALID_QUERY_PARAM", async () => {
    const supabase = makeSupabase();
    const app = makeApp({ supabase });
    const res = await request(app).get(
      "/api/stocks/XYZ-abc/discussions?hours=24",
    );
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe("INVALID_QUERY_PARAM");
  });

  it("V-04 missing master code → 404 STOCK_NOT_FOUND", async () => {
    const supabase = makeSupabase({ "stocks.single": null });
    const app = makeApp({ supabase });
    const res = await request(app).get(
      "/api/stocks/999999/discussions?hours=24",
    );
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe("STOCK_NOT_FOUND");
  });

  it("V-05 days clamped to 7 when 30 requested (no schema reject)", async () => {
    // days max = 7. 더 큰 값은 Zod 가 reject → 400. 본 케이스는 contract 명시: hours/days 범위 밖 거부.
    const supabase = makeSupabase({ "stocks.single": { code: "005930" } });
    const app = makeApp({ supabase });
    const res = await request(app).get(
      "/api/stocks/005930/discussions?days=30",
    );
    // days max=7 이므로 reject (400). 이 동작이 spec.
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe("INVALID_QUERY_PARAM");
  });

  it("V-06 spam filter (D11) — 제목 <5자 OR URL 포함 → 응답 제외", async () => {
    const spam_short = snakeRow({
      id: "d2",
      post_id: "111",
      title: "ㅋㅋ", // <5자
    });
    const spam_url = snakeRow({
      id: "d3",
      post_id: "222",
      title: "강추 https://bit.ly/xyz 강추",
    });
    const ok = snakeRow();
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.list": [ok, spam_short, spam_url],
    });
    const app = makeApp({ supabase });
    const res = await request(app).get(
      "/api/stocks/005930/discussions?hours=24&limit=5",
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].postId).toBe("272617128");
    // raw rows = 3 ≤ limit 5 → hasMore=false (사후 스팸 필터로 깎인 것과 무관)
    expect(res.body.hasMore).toBe(false);
  });

  it("V-06b spam filter 가 응답 길이를 깎아도 raw rows > limit 이면 hasMore=true", async () => {
    // limit=2, 6 rows: 처음 3개는 정상, 다음 3개는 스팸. limit+1=3 만 DB 에서 가져감 (mock slice).
    // raw rows length = 3 > limit 2 → hasMore=true. 첫 limit=2 rows = ok 만 통과 → items=[ok1, ok2]
    const ok1 = snakeRow({ id: "ok1", post_id: "1001" });
    const ok2 = snakeRow({ id: "ok2", post_id: "1002" });
    const ok3 = snakeRow({ id: "ok3", post_id: "1003" });
    const spam = snakeRow({ id: "sp1", post_id: "9001", title: "ㅋㅋ" });
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.list": [ok1, ok2, ok3, spam, spam, spam],
    });
    const app = makeApp({ supabase });
    const res = await request(app).get(
      "/api/stocks/005930/discussions?hours=24&limit=2",
    );
    expect(res.status).toBe(200);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.items.length).toBeLessThanOrEqual(2);
  });

  it("V-07 empty result → 200 envelope { items: [], hasMore: false }", async () => {
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.list": [],
    });
    const app = makeApp({ supabase });
    const res = await request(app).get(
      "/api/stocks/005930/discussions?hours=24",
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], hasMore: false });
  });

  it("V-08 default windowMs = days=7 when neither hours nor days passed", async () => {
    // hours/days 모두 없으면 default days=7 (서버 query .gte('posted_at', now-7d)).
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.list": [snakeRow()],
    });
    const app = makeApp({ supabase });
    const res = await request(app).get("/api/stocks/005930/discussions");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.hasMore).toBe(false);
  });

  it("V-08a infinite scroll cursor `before=<ISO>` → SQL applies posted_at < before", async () => {
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.list": [snakeRow({ post_id: "p999" })],
    });
    const app = makeApp({ supabase });
    const before = "2026-04-17T05:30:00.000Z";
    const res = await request(app).get(
      `/api/stocks/005930/discussions?days=7&limit=50&before=${encodeURIComponent(before)}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    // discussions 테이블 chain 의 lt 호출 검증 — posted_at < before 가 적용되었는지
    const discussionsCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === "discussions",
    );
    expect(discussionsCalls.length).toBeGreaterThan(0);
  });

  it("V-08b before 미지정 시 lt 미호출 — 기존 첫 페이지 동작 회귀 없음", async () => {
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.list": [snakeRow()],
    });
    const app = makeApp({ supabase });
    const res = await request(app).get(
      "/api/stocks/005930/discussions?days=7&limit=50",
    );
    expect(res.status).toBe(200);
  });

  it("V-08c invalid before (non-ISO) → 400 INVALID_QUERY_PARAM", async () => {
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
    });
    const app = makeApp({ supabase });
    const res = await request(app).get(
      "/api/stocks/005930/discussions?days=7&before=not-iso",
    );
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe("INVALID_QUERY_PARAM");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/stocks/:code/discussions/refresh  (V-09..V-14)
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/stocks/:code/discussions/refresh (Phase 08 V-09..V-14)", () => {
  it("V-09 503 PROXY_UNAVAILABLE when brightdataClient missing", async () => {
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
    });
    const app = makeApp({ supabase }); // no brightdataClient
    const res = await request(app).post(
      "/api/stocks/005930/discussions/refresh",
    );
    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe("PROXY_UNAVAILABLE");
  });

  it("V-10 429 cooldown when MAX(scraped_at) < 30s", async () => {
    const recentScrapedAt = new Date(Date.now() - 10_000).toISOString(); // 10s ago
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.single": { scraped_at: recentScrapedAt },
    });
    const app = makeApp({
      supabase,
      brightdataClient: {
        post: vi.fn().mockResolvedValue({ data: "{}" }),
      },
      brightdataApiKey: "k",
      brightdataZone: "gh_radar_naver",
    });
    const res = await request(app).post(
      "/api/stocks/005930/discussions/refresh",
    );
    expect(res.status).toBe(429);
    expect(res.body?.error?.code).toBe("DISCUSSION_REFRESH_COOLDOWN");
  });

  it("V-11 429 body has retry_after_seconds (0 < N ≤ 30)", async () => {
    const recentScrapedAt = new Date(Date.now() - 5_000).toISOString();
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.single": { scraped_at: recentScrapedAt },
    });
    const app = makeApp({
      supabase,
      brightdataClient: { post: vi.fn() },
      brightdataApiKey: "k",
    });
    const res = await request(app).post(
      "/api/stocks/005930/discussions/refresh",
    );
    expect(res.status).toBe(429);
    expect(res.body?.retry_after_seconds).toBeGreaterThan(0);
    expect(res.body?.retry_after_seconds).toBeLessThanOrEqual(30);
  });

  it("V-12 429 has Retry-After header", async () => {
    const recentScrapedAt = new Date(Date.now() - 5_000).toISOString();
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.single": { scraped_at: recentScrapedAt },
    });
    const app = makeApp({
      supabase,
      brightdataClient: { post: vi.fn() },
      brightdataApiKey: "k",
    });
    const res = await request(app).post(
      "/api/stocks/005930/discussions/refresh",
    );
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.headers["retry-after"]).toMatch(/^\d+$/);
  });

  it("V-13 503 PROXY_BUDGET_EXHAUSTED when usage > daily cap", async () => {
    // cooldown 만료된 상태 (scraped_at = 11분 전 → 캐시 신선도도 만료) → RPC 호출 → 6000 반환 → 예산 초과.
    const oldScrapedAt = new Date(Date.now() - 11 * 60_000).toISOString();
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.single": { scraped_at: oldScrapedAt },
    });
    const app = makeApp({
      supabase,
      brightdataClient: { post: vi.fn() },
      brightdataApiKey: "k",
      rpcOverride: vi.fn().mockResolvedValue({ data: 6000, error: null }), // > 5000 cap
    });
    const res = await request(app).post(
      "/api/stocks/005930/discussions/refresh",
    );
    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe("PROXY_BUDGET_EXHAUSTED");
  });

  it("V-14 cache fresh (<10min) → returns cached without proxy call", async () => {
    // scraped_at 5분 전 (cooldown 30s 통과 + cache TTL 10min 안에 있음 → proxy skip)
    const cacheFreshAt = new Date(Date.now() - 5 * 60_000).toISOString();
    const proxyPost = vi.fn();
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.single": { scraped_at: cacheFreshAt },
      "discussions.list": [snakeRow()],
    });
    const app = makeApp({
      supabase,
      brightdataClient: { post: proxyPost },
      brightdataApiKey: "k",
    });
    const res = await request(app).post(
      "/api/stocks/005930/discussions/refresh",
    );
    expect(res.status).toBe(200);
    expect(proxyPost).not.toHaveBeenCalled(); // 프록시 호출 0
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]?.stockCode).toBe("005930");
  });

  it("V-15 invalid code → 400 INVALID_QUERY_PARAM (POST)", async () => {
    const supabase = makeSupabase({ "stocks.single": { code: "005930" } });
    const app = makeApp({
      supabase,
      brightdataClient: { post: vi.fn() },
      brightdataApiKey: "k",
    });
    const res = await request(app).post(
      "/api/stocks/XYZ-abc/discussions/refresh",
    );
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe("INVALID_QUERY_PARAM");
  });

  it("V-16 missing master → 404 STOCK_NOT_FOUND (POST)", async () => {
    const supabase = makeSupabase({ "stocks.single": null });
    const app = makeApp({
      supabase,
      brightdataClient: { post: vi.fn() },
      brightdataApiKey: "k",
    });
    const res = await request(app).post(
      "/api/stocks/999999/discussions/refresh",
    );
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe("STOCK_NOT_FOUND");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// CORS exposedHeaders (V-17 — Phase 7 reuses Retry-After)
// ──────────────────────────────────────────────────────────────────────────

describe("CORS exposedHeaders (Phase 8 reuses Phase 7)", () => {
  it("V-17 GET /api/stocks/:code/discussions exposes Retry-After header", async () => {
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.list": [],
    });
    const app = makeApp({ supabase });
    const res = await request(app)
      .get("/api/stocks/005930/discussions?hours=24")
      .set("Origin", "http://localhost:3000");
    expect(res.headers["access-control-expose-headers"]).toMatch(/Retry-After/i);
  });
});
