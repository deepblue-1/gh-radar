import { afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { stockFeedPerSource, type NewsByStockResponse } from "@gh-radar/shared";
import { createApp } from "../../src/app";
import { NEWS_BY_STOCK_CACHE_TTL_MS, getNewsByStock } from "../../src/routes/news-by-stock";
import { mockSupabase } from "../fixtures/supabase-mock";

// ------------------------------------------------------------------
// GET /api/news/by-stock — Phase 41 D-03 · D-04 · D-05 · D-08 (gh-trade 돌파감지 창 · 상따창 · 웹 작업대)
// RPC stock_feed_by_codes 의 SQL 의미(입력 순서 · 숨김 제외 · 등록 60초)는 pgTAP(supabase/tests/kis_news.test.sql)이 본다.
// 여기 목 데이터는 pgTAP B8 · B9 가 단언한 키 집합과 같은 키로 쓴다.
// ------------------------------------------------------------------

const DAY_MS = 86_400_000;
const KST_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+09:00$/;

const kisRow = {
  srno: "2026111209143512345",
  kind: "disclosure",
  source: "코스닥 공시",
  title: "(주)가람전자 단일판매ㆍ공급계약체결",
  title_key: "주가람전자단일판매ㆍ공급계약체결",
  written_at: "2026-11-12T00:14:35+00:00",
  received_at: "2026-11-12T00:14:41.23+00:00",
  codes: ["012340"],
};
const naverRow = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "가람전자, 대형 공급계약 수주에 강세",
  description: "가람전자가 장 초반 강세다.",
  source: "한국경제",
  url: "https://example.invalid/n1",
  published_at: "2026-11-12T00:20:00+00:00",
  created_at: "2026-11-12T00:25:00+00:00",
};

const rpcData = (over: Partial<Record<string, unknown>> = {}) => ({
  feed_at: "2026-11-12T00:15:00.512+00:00",
  stocks: [
    { code: "012340", collected_at: "2026-11-12T00:14:10+00:00", kis: [kisRow], naver: [naverRow] },
    { code: "005930", collected_at: null, kis: [], naver: [] },
  ],
  ...over,
});

function setup(data: unknown = rpcData(), error: unknown = null) {
  const supabase = mockSupabase({ rpc: { stock_feed_by_codes: { data, error } } });
  const app = createApp({ supabase });
  const rpc = (supabase as unknown as { rpc: { mock: { calls: unknown[][] } } }).rpc;
  return { app, rpc };
}

const rpcArgs = (rpc: { mock: { calls: unknown[][] } }, i = 0) => rpc.mock.calls[i]![1] as Record<string, unknown>;

describe("GET /api/news/by-stock", () => {
  it("200 · 입력 순서 · 글 없는 코드 items [] · 수집 전 collectedAt null · Cache-Control max-age=5", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/news/by-stock?codes=012340,005930");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=5");
    const body = res.body as NewsByStockResponse;
    expect(body.stocks.map((s) => s.code)).toEqual(["012340", "005930"]);
    expect(body.stocks[1]).toEqual({ code: "005930", collectedAt: null, count: 0, truncated: false, items: [] });
  });

  it("한투 줄 — id kis:<srno> · url null · publishedAt +09:00 · 자료원 그대로 · stockCodes", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/news/by-stock?codes=012340,005930");
    const items = (res.body as NewsByStockResponse).stocks[0]!.items;
    const kis = items.find((i) => i.id.startsWith("kis:"))!;
    expect(kis).toEqual({
      id: "kis:2026111209143512345",
      kind: "disclosure",
      publishedAt: "2026-11-12T09:14:35.000+09:00",
      title: "(주)가람전자 단일판매ㆍ공급계약체결",
      source: "코스닥 공시",
      stockCodes: ["012340"],
      url: null,
      description: null,
      receivedAt: "2026-11-12T09:14:41.230+09:00",
    });
  });

  it("네이버 줄 — url · description 그대로 · 최신순(네이버 09:20 이 공시 09:14 보다 먼저)", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/news/by-stock?codes=012340");
    const entry = (res.body as NewsByStockResponse).stocks[0]!;
    expect(entry.items.map((i) => i.id)).toEqual([`naver:${naverRow.id}`, `kis:${kisRow.srno}`]);
    expect(entry.items[0]).toMatchObject({ kind: "news", url: naverRow.url, description: naverRow.description, source: "한국경제" });
    expect(entry.count).toBe(2);
    expect(entry.truncated).toBe(false);
  });

  it("asOf · feedAt · collectedAt 은 +09:00 오프셋", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/news/by-stock?codes=012340");
    const body = res.body as NewsByStockResponse;
    expect(body.asOf).toMatch(KST_ISO);
    expect(body.feedAt).toBe("2026-11-12T09:15:00.512+09:00");
    expect(body.stocks[0]!.collectedAt).toBe("2026-11-12T09:14:10.000+09:00");
  });

  it("feed_at 이 null 이면 feedAt null(수집기가 한 번도 안 돌았다)", async () => {
    const { app } = setup(rpcData({ feed_at: null }));
    const res = await request(app).get("/api/news/by-stock?codes=012340");
    expect(res.status).toBe(200);
    expect((res.body as NewsByStockResponse).feedAt).toBeNull();
  });

  it("RPC 1회 · p_register true · p_before null · 기본 limit 20 → p_per_source = stockFeedPerSource(20) · 기본 days 3", async () => {
    const { app, rpc } = setup();
    const before = Date.now();
    await request(app).get("/api/news/by-stock?codes=012340,005930");
    expect(rpc.mock.calls).toHaveLength(1);
    expect(rpc.mock.calls[0]![0]).toBe("stock_feed_by_codes");
    const args = rpcArgs(rpc);
    expect(args.p_codes).toEqual(["012340", "005930"]);
    expect(args.p_register).toBe(true);
    expect(args.p_before).toBeNull();
    expect(args.p_per_source).toBe(stockFeedPerSource(20));
    const since = Date.parse(args.p_since as string);
    expect(Math.abs(since - (before - 3 * DAY_MS))).toBeLessThan(5_000);
  });

  it("limit=1 → p_per_source = stockFeedPerSource(1) · items 1줄로 자름 · count 는 자르기 전", async () => {
    const { app, rpc } = setup();
    const res = await request(app).get("/api/news/by-stock?codes=012340&limit=1");
    expect(rpcArgs(rpc).p_per_source).toBe(stockFeedPerSource(1));
    const entry = (res.body as NewsByStockResponse).stocks[0]!;
    expect(entry.items).toHaveLength(1);
    expect(entry.count).toBe(2);
  });

  it("출처별 행 수가 p_per_source 에 닿으면 truncated true", async () => {
    const many = Array.from({ length: stockFeedPerSource(1) }, (_, i) => ({ ...kisRow, srno: `S${String(i).padStart(4, "0")}` }));
    const { app } = setup(rpcData({ stocks: [{ code: "012340", collected_at: null, kis: many, naver: [] }] }));
    const res = await request(app).get("/api/news/by-stock?codes=012340&limit=1");
    expect((res.body as NewsByStockResponse).stocks[0]!.truncated).toBe(true);
  });

  it("days=10 → 7일로 잘라 맞춤 · limit=500 → 100 으로 잘라 맞춤", async () => {
    const { app, rpc } = setup();
    const before = Date.now();
    const res = await request(app).get("/api/news/by-stock?codes=012340&days=10&limit=500");
    expect(res.status).toBe(200);
    const args = rpcArgs(rpc);
    expect(Math.abs(Date.parse(args.p_since as string) - (before - 7 * DAY_MS))).toBeLessThan(5_000);
    expect(args.p_per_source).toBe(stockFeedPerSource(100));
  });

  it("days=0 · limit=0 → 기본값(3일 · 20)", async () => {
    const { app, rpc } = setup();
    const before = Date.now();
    const res = await request(app).get("/api/news/by-stock?codes=012340&days=0&limit=0");
    expect(res.status).toBe(200);
    const args = rpcArgs(rpc);
    expect(Math.abs(Date.parse(args.p_since as string) - (before - 3 * DAY_MS))).toBeLessThan(5_000);
    expect(args.p_per_source).toBe(stockFeedPerSource(20));
  });

  it("codes 101개 → 400 INVALID_QUERY_PARAM · RPC 안 부름", async () => {
    const { app, rpc } = setup();
    const codes = Array.from({ length: 101 }, (_, i) => String(100000 + i)).join(",");
    const res = await request(app).get(`/api/news/by-stock?codes=${codes}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_QUERY_PARAM");
    expect(rpc.mock.calls).toHaveLength(0);
  });

  it("codes 100개 → 200", async () => {
    const { app } = setup(rpcData({ stocks: [] }));
    const codes = Array.from({ length: 100 }, (_, i) => String(100000 + i)).join(",");
    const res = await request(app).get(`/api/news/by-stock?codes=${codes}`);
    expect(res.status).toBe(200);
  });

  it.each([
    ["12345", "5자리"],
    ["0011t0", "소문자 영문"],
    ["005930,,000660", "빈 조각"],
    ["", "빈 값"],
  ])("codes=%s (%s) → 400", async (codes) => {
    const { app } = setup();
    const res = await request(app).get(`/api/news/by-stock?codes=${codes}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_QUERY_PARAM");
  });

  it("codes 없음 → 400", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/news/by-stock");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_QUERY_PARAM");
  });

  it("codes=0011T0(영문 포함 신규 코드) → 200", async () => {
    const { app, rpc } = setup(rpcData({ stocks: [{ code: "0011T0", collected_at: null, kis: [], naver: [] }] }));
    const res = await request(app).get("/api/news/by-stock?codes=0011T0");
    expect(res.status).toBe(200);
    expect(rpcArgs(rpc).p_codes).toEqual(["0011T0"]);
  });

  it("같은 코드 두 번 → RPC 에 한 번(입력 순서 유지)", async () => {
    const { app, rpc } = setup();
    await request(app).get("/api/news/by-stock?codes=012340,005930,012340");
    expect(rpcArgs(rpc).p_codes).toEqual(["012340", "005930"]);
  });

  it("RPC 가 배열을 주면 500(모양 위반을 빈 응답으로 숨기지 않는다)", async () => {
    const { app } = setup([]);
    const res = await request(app).get("/api/news/by-stock?codes=012340");
    expect(res.status).toBe(500);
  });

  it("RPC 오류 → 500", async () => {
    const { app } = setup(null, { message: "boom" });
    const res = await request(app).get("/api/news/by-stock?codes=012340");
    expect(res.status).toBe(500);
  });
});

// ------------------------------------------------------------------
// 41-03 — 5초 캐시(D-03 · D-04 · SC-3). 캐시는 모듈 범위 WeakMap<SupabaseClient, …> 라
// 테스트마다 setup() 이 새 mockSupabase 를 만들면 서로 섞이지 않는다.
// ------------------------------------------------------------------
describe("GET /api/news/by-stock — 5초 캐시", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("같은 코드 집합 · days · limit 두 번(5초 안) → rpc 1회 · 두 응답 같은 내용", async () => {
    const { app, rpc } = setup();
    const a = await request(app).get("/api/news/by-stock?codes=012340,005930&days=3&limit=3");
    const b = await request(app).get("/api/news/by-stock?codes=012340,005930&days=3&limit=3");
    expect(rpc.mock.calls).toHaveLength(1);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
  });

  it("Date.now 를 5,001ms 뒤로 → rpc 2회(TTL 지남)", async () => {
    expect(NEWS_BY_STOCK_CACHE_TTL_MS).toBe(5_000);
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(t0);
    const { app, rpc } = setup();
    await request(app).get("/api/news/by-stock?codes=012340,005930");
    now.mockReturnValue(t0 + 5_001);
    await request(app).get("/api/news/by-stock?codes=012340,005930");
    expect(rpc.mock.calls).toHaveLength(2);
  });

  it("같은 코드 집합 다른 순서(A,B · B,A) → rpc 1회 · 각 응답 stocks 는 각자 입력 순서", async () => {
    const { app, rpc } = setup();
    const ab = await request(app).get("/api/news/by-stock?codes=012340,005930");
    const ba = await request(app).get("/api/news/by-stock?codes=005930,012340");
    expect(rpc.mock.calls).toHaveLength(1);
    expect((ab.body as NewsByStockResponse).stocks.map((s) => s.code)).toEqual(["012340", "005930"]);
    expect((ba.body as NewsByStockResponse).stocks.map((s) => s.code)).toEqual(["005930", "012340"]);
  });

  it("days 나 limit 이 다르면 다른 캐시 키 → 매번 rpc", async () => {
    const { app, rpc } = setup();
    await request(app).get("/api/news/by-stock?codes=012340&days=3&limit=3");
    await request(app).get("/api/news/by-stock?codes=012340&days=1&limit=3");
    expect(rpc.mock.calls).toHaveLength(2);
    await request(app).get("/api/news/by-stock?codes=012340&days=3&limit=5");
    expect(rpc.mock.calls).toHaveLength(3);
  });

  it("rpc 오류 → 500 · 다음 요청은 rpc 를 다시 부른다(실패 미캐시)", async () => {
    const { app, rpc } = setup(null, { message: "boom" });
    const first = await request(app).get("/api/news/by-stock?codes=012340");
    const second = await request(app).get("/api/news/by-stock?codes=012340");
    expect(first.status).toBe(500);
    expect(second.status).toBe(500);
    expect(rpc.mock.calls).toHaveLength(2);
  });

  it("동시 두 요청 → rpc 1회(진행 중 계산을 함께 기다린다)", async () => {
    const supabase = mockSupabase({ rpc: { stock_feed_by_codes: { data: rpcData(), error: null } } });
    const rpc = (supabase as unknown as { rpc: { mock: { calls: unknown[][] } } }).rpc;
    const p1 = getNewsByStock(supabase, ["012340", "005930"], 3, 20);
    const p2 = getNewsByStock(supabase, ["005930", "012340"], 3, 20);
    await Promise.all([p1, p2]);
    expect(rpc.mock.calls).toHaveLength(1);
    expect(await p2).toBe(await p1);
  });
});
