import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { SAME_ARTICLE_WINDOW_MS, stockFeedPerSource, type StockFeedItem } from "@gh-radar/shared";
import { createApp } from "../../src/app";

// Phase 41 D-12 · D-14 · SC-5 — 종목 뉴스 조회 · 새로고침 응답 = RPC stock_feed_by_codes(등록 안 함) + shared mergeStockFeed.
// 목 RPC 행은 pgTAP B8 · B9 키 집합(news-by-stock.test.ts 와 같은 모양)으로 쓴다.

const DAY_MS = 86_400_000;

type RpcResult = { data: unknown; error: unknown };

function makeSupabase(
  overrides: Record<string, unknown> = {},
  feed: RpcResult | ((args: Record<string, unknown>) => RpcResult) = {
    data: { feed_at: null, stocks: [] },
    error: null,
  },
) {
  // 간단한 chainable mock — 마스터 조회 · 쿨다운 · upsert 체인을 재현.
  return {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.lt = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.maybeSingle = vi.fn(() => {
        // '<table>.single' override — 마스터 조회 · POST /refresh 쿨다운 쿼리용.
        const data = (overrides[`${table}.single`] as unknown) ?? null;
        return Promise.resolve({ data, error: null });
      });
      chain.upsert = vi.fn().mockResolvedValue({ data: [], error: null });
      return chain;
    }),
    // incr_api_usage → 사용량 1 · stock_feed_by_codes → feed(목 결과)
    // feed 가 함수면 RPC 인자마다 다른 결과(커서 쪽의 두 RPC — WR-31).
    rpc: vi.fn((name: string, args: Record<string, unknown>) =>
      Promise.resolve(
        name === "stock_feed_by_codes"
          ? typeof feed === "function"
            ? feed(args)
            : feed
          : { data: 1, error: null },
      ),
    ),
  };
}

function makeNaver(items: unknown[] = []) {
  return {
    get: vi.fn().mockResolvedValue({ data: { items } }),
  };
}

const kisDisclosure = {
  srno: "2026111209143512345",
  kind: "disclosure",
  source: "코스닥 공시",
  title: "(주)가람전자 단일판매ㆍ공급계약체결",
  title_key: "주가람전자단일판매ㆍ공급계약체결",
  written_at: "2026-11-12T00:14:35+00:00",
  received_at: "2026-11-12T00:14:41.23+00:00",
  codes: ["005930"],
};

function naverRow(i: number, publishedAt = "2026-11-12T00:20:00+00:00") {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    title: `네이버 기사 ${i}`,
    description: `desc ${i}`,
    source: "한국경제",
    url: `https://example.invalid/n${i}`,
    published_at: publishedAt,
    created_at: publishedAt,
  };
}

function feedOf(kis: unknown[], naver: unknown[]): RpcResult {
  return {
    data: {
      feed_at: "2026-11-12T00:15:00+00:00",
      stocks: [{ code: "005930", collected_at: "2026-11-12T00:14:10+00:00", kis, naver }],
    },
    error: null,
  };
}

type Rpc = { mock: { calls: unknown[][] } };
const feedCalls = (supabase: { rpc: unknown }) =>
  (supabase.rpc as Rpc).mock.calls.filter((c) => c[0] === "stock_feed_by_codes");
const feedArgs = (supabase: { rpc: unknown }, i = 0) =>
  feedCalls(supabase)[i]![1] as Record<string, unknown>;

function appWith(supabase: unknown, naverClient?: unknown) {
  return createApp({
    supabase: supabase as Parameters<typeof createApp>[0]["supabase"],
    ...(naverClient
      ? { naverClient: naverClient as Parameters<typeof createApp>[0]["naverClient"] }
      : {}),
  });
}

describe("GET /api/stocks/:code/news — 합친 목록(D-12 · D-14)", () => {
  it("rpc stock_feed_by_codes 1회 · p_codes [code] · p_register false(D-05 등록 안 함) · p_per_source = stockFeedPerSource(limit) × 2(WR-31)", async () => {
    const supabase = makeSupabase({ "stocks.single": { code: "005930" } }, feedOf([], []));
    const res = await request(appWith(supabase)).get("/api/stocks/005930/news?limit=30");
    expect(res.status).toBe(200);
    expect(feedCalls(supabase)).toHaveLength(1);
    const args = feedArgs(supabase);
    expect(args.p_codes).toEqual(["005930"]);
    expect(args.p_register).toBe(false);
    expect(args.p_per_source).toBe(stockFeedPerSource(30) * 2);
    expect(args.p_before).toBeNull();
    // 종목 상세 목록은 news_articles 를 직접 읽지 않는다(목록은 RPC 하나)
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(tables).not.toContain("news_articles");
  });

  it("days=30 · limit=500 → 7일 · 100줄로 잘라 맞춤(p_since 7일 전 · 응답 ≤ 100 · StockFeedItem 모양)", async () => {
    const naver = Array.from({ length: 150 }, (_, i) =>
      naverRow(i, new Date(Date.parse("2026-11-12T00:00:00Z") - i * 60_000).toISOString()),
    );
    const supabase = makeSupabase({ "stocks.single": { code: "005930" } }, feedOf([], naver));
    const t0 = Date.now();
    const res = await request(appWith(supabase)).get("/api/stocks/005930/news?days=30&limit=500");
    expect(res.status).toBe(200);
    const body = res.body as StockFeedItem[];
    expect(body).toHaveLength(100);
    const args = feedArgs(supabase);
    expect(args.p_per_source).toBe(stockFeedPerSource(100) * 2);
    const since = Date.parse(String(args.p_since));
    expect(Math.abs(since - (t0 - 7 * DAY_MS))).toBeLessThan(5_000);
    expect(body[0]).toEqual({
      id: `naver:${naver[0]!.id}`,
      kind: "news",
      publishedAt: "2026-11-12T09:00:00.000+09:00",
      title: "네이버 기사 0",
      source: "한국경제",
      stockCodes: [],
      url: "https://example.invalid/n0",
      description: "desc 0",
      receivedAt: "2026-11-12T09:00:00.000+09:00",
    });
    expect(body[0]).not.toHaveProperty("stockCode");
  });

  it("공시 줄은 url null 로 한 목록에 시간순으로 들어온다(한투 공시 + 네이버 뉴스)", async () => {
    const supabase = makeSupabase(
      { "stocks.single": { code: "005930" } },
      feedOf(
        [kisDisclosure],
        [naverRow(1, "2026-11-12T00:20:00+00:00"), naverRow(2, "2026-11-12T00:10:00+00:00")],
      ),
    );
    const res = await request(appWith(supabase)).get("/api/stocks/005930/news");
    expect(res.status).toBe(200);
    const body = res.body as StockFeedItem[];
    expect(body.map((i) => i.id)).toEqual([
      `naver:${naverRow(1).id}`,
      "kis:2026111209143512345",
      `naver:${naverRow(2).id}`,
    ]);
    const disc = body[1]!;
    expect(disc.kind).toBe("disclosure");
    expect(disc.url).toBeNull();
    expect(disc.source).toBe("코스닥 공시");
  });

  it("returns 400 for invalid code XYZ$", async () => {
    const supabase = makeSupabase();
    const res = await request(appWith(supabase)).get("/api/stocks/XYZ$/news");
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe("INVALID_QUERY_PARAM");
  });

  it("returns 404 when master code not found — RPC 를 부르지 않는다", async () => {
    const supabase = makeSupabase({ "stocks.single": null });
    const res = await request(appWith(supabase)).get("/api/stocks/000001/news");
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe("STOCK_NOT_FOUND");
    expect(feedCalls(supabase)).toHaveLength(0);
  });

  it("V-news-cursor-a `before=<ISO>` → p_before 로 넘기고 응답의 모든 publishedAt 이 before 보다 이르다", async () => {
    const before = "2026-11-12T00:15:00.000Z";
    const supabase = makeSupabase(
      { "stocks.single": { code: "005930" } },
      // 목 RPC 가 경계 · 이후 글을 섞어 줘도 응답에는 before 보다 이른 글만 남는다
      feedOf(
        [],
        [
          naverRow(1, "2026-11-12T00:20:00+00:00"),
          naverRow(2, "2026-11-12T00:15:00+00:00"),
          naverRow(3, "2026-11-12T00:10:00+00:00"),
        ],
      ),
    );
    const res = await request(appWith(supabase)).get(
      `/api/stocks/005930/news?days=7&limit=100&before=${encodeURIComponent(before)}`,
    );
    expect(res.status).toBe(200);
    // 쪽 RPC(< before) + 짝 RPC([before, before + 짝 창)) — 같은 행이 두 RPC 에서 와도 한 줄(WR-31)
    expect(feedCalls(supabase)).toHaveLength(2);
    expect(feedArgs(supabase, 0).p_before).toBe(before);
    const mates = feedArgs(supabase, 1);
    expect(mates.p_since).toBe(before);
    expect(mates.p_before).toBe(new Date(Date.parse(before) + SAME_ARTICLE_WINDOW_MS).toISOString());
    expect(mates.p_register).toBe(false);
    const body = res.body as StockFeedItem[];
    expect(body.map((i) => i.id)).toEqual([`naver:${naverRow(3).id}`]);
    for (const it of body) expect(Date.parse(it.publishedAt)).toBeLessThan(Date.parse(before));
  });

  describe("WR-31 커서 경계에서 한투 ↔ 네이버 짝이 끊기지 않는다", () => {
    const before = "2026-11-12T01:00:00.000Z"; // 10:00 KST
    const title = "가람전자, 300억 규모 단일판매 공급계약 체결 공시";
    const kisRow = (writtenAt: string, receivedAt: string) => ({
      ...kisDisclosure,
      srno: "2026111210050012345",
      title,
      title_key: "가람전자300억규모단일판매공급계약체결공시",
      written_at: writtenAt,
      received_at: receivedAt,
    });
    const naverOf = (publishedAt: string) => ({ ...naverRow(7, publishedAt), title });
    /** p_before 가 커서면 쪽 RPC(< before), 아니면 짝 RPC([before, before + 짝 창)). */
    const byWindow = (page: { kis: unknown[]; naver: unknown[] }, mates: { kis: unknown[]; naver: unknown[] }) =>
      (args: Record<string, unknown>) =>
        args.p_before === before ? feedOf(page.kis, page.naver) : feedOf(mates.kis, mates.naver);

    it("한투 반쪽(10:05)이 커서 뒤 · 네이버 반쪽(09:58)이 커서 앞 → 다음 쪽에 합친 한 줄(공시 배지 · 자료원 · 링크 유지)", async () => {
      const k = kisRow("2026-11-12T01:05:00+00:00", "2026-11-12T01:05:03+00:00");
      const n = naverOf("2026-11-12T00:58:00+00:00");
      const supabase = makeSupabase(
        { "stocks.single": { code: "005930" } },
        byWindow({ kis: [], naver: [n] }, { kis: [k], naver: [] }),
      );
      const res = await request(appWith(supabase)).get(
        `/api/stocks/005930/news?days=7&limit=100&before=${encodeURIComponent(before)}`,
      );
      expect(res.status).toBe(200);
      const body = res.body as StockFeedItem[];
      expect(body).toHaveLength(1);
      expect(body[0]!.kind).toBe("disclosure");
      expect(body[0]!.source).toBe("코스닥 공시");
      expect(body[0]!.url).toBe(n.url);
      expect(body[0]!.publishedAt).toBe("2026-11-12T09:58:00.000+09:00");
    });

    it("네이버 반쪽(10:05)이 커서 뒤 · 한투 반쪽(09:58)이 커서 앞 → 링크 없는 한투 홀로 줄이 아니라 합친 한 줄", async () => {
      const k = kisRow("2026-11-12T00:58:00+00:00", "2026-11-12T00:58:04+00:00");
      const n = naverOf("2026-11-12T01:05:00+00:00");
      const supabase = makeSupabase(
        { "stocks.single": { code: "005930" } },
        byWindow({ kis: [k], naver: [] }, { kis: [], naver: [n] }),
      );
      const res = await request(appWith(supabase)).get(
        `/api/stocks/005930/news?days=7&limit=100&before=${encodeURIComponent(before)}`,
      );
      expect(res.status).toBe(200);
      const body = res.body as StockFeedItem[];
      expect(body).toHaveLength(1);
      expect(body[0]!.id).toBe(`kis:${k.srno}`);
      expect(body[0]!.url).toBe(n.url);
      expect(body[0]!.publishedAt).toBe("2026-11-12T09:58:00.000+09:00");
    });

    it("커서 뒤 구간의 홀로 행은 다음 쪽에 다시 나오지 않는다(앞 쪽에 이미 보인 줄)", async () => {
      const lone = naverRow(8, "2026-11-12T01:30:00+00:00");
      const older = naverRow(9, "2026-11-12T00:30:00+00:00");
      const supabase = makeSupabase(
        { "stocks.single": { code: "005930" } },
        byWindow({ kis: [], naver: [older] }, { kis: [], naver: [lone] }),
      );
      const res = await request(appWith(supabase)).get(
        `/api/stocks/005930/news?days=7&limit=100&before=${encodeURIComponent(before)}`,
      );
      expect(res.status).toBe(200);
      expect((res.body as StockFeedItem[]).map((i) => i.id)).toEqual([`naver:${older.id}`]);
    });
  });

  it("V-news-cursor-b before 미지정 → p_before null — 첫 페이지 동작 회귀 없음", async () => {
    const supabase = makeSupabase({ "stocks.single": { code: "005930" } }, feedOf([], [naverRow(1)]));
    const res = await request(appWith(supabase)).get("/api/stocks/005930/news?days=7&limit=100");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(feedArgs(supabase).p_before).toBeNull();
  });

  it("V-news-cursor-c invalid before (non-ISO) → 400 INVALID_QUERY_PARAM", async () => {
    const supabase = makeSupabase({ "stocks.single": { code: "005930" } });
    const res = await request(appWith(supabase)).get(
      "/api/stocks/005930/news?days=7&before=not-iso",
    );
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe("INVALID_QUERY_PARAM");
  });

  it("RPC 가 배열을 주면 500(모양 위반을 빈 목록으로 숨기지 않는다)", async () => {
    const supabase = makeSupabase(
      { "stocks.single": { code: "005930" } },
      { data: [], error: null },
    );
    const res = await request(appWith(supabase)).get("/api/stocks/005930/news");
    expect(res.status).toBe(500);
  });

  it("RPC 결과에 stocks 가 없으면 500", async () => {
    const supabase = makeSupabase(
      { "stocks.single": { code: "005930" } },
      { data: { feed_at: null }, error: null },
    );
    const res = await request(appWith(supabase)).get("/api/stocks/005930/news");
    expect(res.status).toBe(500);
  });

  it("RPC 오류 → 500", async () => {
    const supabase = makeSupabase(
      { "stocks.single": { code: "005930" } },
      { data: null, error: { message: "boom" } },
    );
    const res = await request(appWith(supabase)).get("/api/stocks/005930/news");
    expect(res.status).toBe(500);
  });
});

describe("POST /api/stocks/:code/news/refresh (V-14 · SC-5 새로고침은 네이버만)", () => {
  it("returns 503 NAVER_UNAVAILABLE when naverClient not injected", async () => {
    const supabase = makeSupabase({ "stocks.single": { code: "005930", name: "삼성전자" } });
    const res = await request(appWith(supabase)).post("/api/stocks/005930/news/refresh");
    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe("NAVER_UNAVAILABLE");
  });

  it("returns 429 + Retry-After + retry_after_seconds when recent news within 30s", async () => {
    const recent = new Date(Date.now() - 10_000).toISOString(); // 10s ago
    const supabase = makeSupabase({
      "stocks.single": { code: "005930", name: "삼성전자" },
      "news_articles.single": { created_at: recent },
    });
    const res = await request(appWith(supabase, makeNaver([]))).post(
      "/api/stocks/005930/news/refresh",
    );
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(res.body?.retry_after_seconds).toBeGreaterThan(0);
    expect(res.body?.retry_after_seconds).toBeLessThanOrEqual(30);
    expect(res.body?.error?.code).toBe("NEWS_REFRESH_COOLDOWN");
    expect(feedCalls(supabase)).toHaveLength(0);
  });

  it("새로고침 뒤에도 공시가 남는다 — 네이버 upsert 뒤 합친 목록(7일 · 100건 · 등록 안 함)을 돌려준다", async () => {
    const supabase = makeSupabase(
      { "stocks.single": { code: "005930", name: "삼성전자" } },
      feedOf([kisDisclosure], [naverRow(1)]),
    );
    const naver = makeNaver([
      {
        title: "<b>삼성전자</b> 새 기사",
        originallink: "https://example.invalid/fresh",
        link: "https://n.news.naver.com/fresh",
        description: "요약",
        pubDate: "Thu, 12 Nov 2026 09:30:00 +0900",
      },
    ]);
    const t0 = Date.now();
    const res = await request(appWith(supabase, naver)).post("/api/stocks/005930/news/refresh");
    expect(res.status).toBe(200);
    // 네이버만 부른다(한투 클라이언트는 server 에 없다) · 네이버 결과는 upsert 1회
    expect(naver.get).toHaveBeenCalledTimes(1);
    const upserted = (supabase.from as ReturnType<typeof vi.fn>).mock.results
      .map((r) => r.value as { upsert: ReturnType<typeof vi.fn> })
      .filter((c) => c.upsert.mock.calls.length > 0);
    expect(upserted).toHaveLength(1);
    // 갱신 목록 = 합친 목록
    expect(feedCalls(supabase)).toHaveLength(1);
    const args = feedArgs(supabase);
    expect(args.p_codes).toEqual(["005930"]);
    expect(args.p_register).toBe(false);
    expect(args.p_before).toBeNull();
    expect(args.p_per_source).toBe(stockFeedPerSource(100) * 2);
    expect(Math.abs(Date.parse(String(args.p_since)) - (t0 - 7 * DAY_MS))).toBeLessThan(5_000);
    const body = res.body as StockFeedItem[];
    const disc = body.find((i) => i.kind === "disclosure");
    expect(disc).toBeDefined();
    expect(disc!.id).toBe("kis:2026111209143512345");
    expect(disc!.url).toBeNull();
    expect(body.map((i) => i.id)).toContain(`naver:${naverRow(1).id}`);
  });

  it("새로고침 갱신 목록의 RPC 모양 위반 → 500", async () => {
    const supabase = makeSupabase(
      { "stocks.single": { code: "005930", name: "삼성전자" } },
      { data: [], error: null },
    );
    const res = await request(appWith(supabase, makeNaver([]))).post(
      "/api/stocks/005930/news/refresh",
    );
    expect(res.status).toBe(500);
  });
});

describe("CORS exposedHeaders (V-16)", () => {
  it("GET /api/stocks/:code/news response exposes Retry-After header", async () => {
    // cors 미들웨어는 모든 응답에 Access-Control-Expose-Headers 를 포함.
    // 사전 조건: services/cors-config.ts 의 exposedHeaders 에 Retry-After 가 포함되어 있어야 함(Task 1).
    const supabase = makeSupabase({ "stocks.single": { code: "005930" } }, feedOf([], []));
    // cors 미들웨어는 ENV CORS_ALLOWED_ORIGINS 에 매치되는 origin 에 대해서만
    // Access-Control-Expose-Headers 를 내보낸다. tests/setup.ts 가 localhost:3000 을
    // 허용 리스트에 포함하므로 해당 origin 으로 검증.
    const res = await request(appWith(supabase))
      .get("/api/stocks/005930/news")
      .set("Origin", "http://localhost:3000");
    expect(res.headers["access-control-expose-headers"]).toMatch(/Retry-After/i);
  });
});
