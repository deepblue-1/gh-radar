import { afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { STOCK_FEED_MIN_DISCLOSURES, stockFeedPerSource, type NewsByStockResponse } from "@gh-radar/shared";
import { createApp } from "../../src/app";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NEWS_BY_STOCK_CACHE_TTL_MS, getNewsByStock, newsByStockCacheSize } from "../../src/routes/news-by-stock";
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

  it("limit=1 → p_per_source = stockFeedPerSource(1) · 앞 1줄 + 밀린 공시 · count 는 자르기 전", async () => {
    const { app, rpc } = setup();
    const res = await request(app).get("/api/news/by-stock?codes=012340&limit=1");
    expect(rpcArgs(rpc).p_per_source).toBe(stockFeedPerSource(1));
    expect(rpcArgs(rpc).p_min_disclosures).toBe(STOCK_FEED_MIN_DISCLOSURES);
    const entry = (res.body as NewsByStockResponse).stocks[0]!;
    // 최신 1줄은 네이버 기사(09:20) — 그보다 오래된 공시(09:14)는 밀렸지만 따로 보장돼 끝에 붙는다(gh-trade 인박스 261113).
    expect(entry.items.map((i) => i.kind)).toEqual(["news", "disclosure"]);
    expect(entry.count).toBe(2);
  });

  it("뉴스만 있으면 limit 줄 그대로 — 공시를 덧붙이지 않는다", async () => {
    const news2 = { ...naverRow, id: "00000000-0000-4000-8000-000000000099", title: "다른 기사", url: "https://example.invalid/z" };
    const { app } = setup(rpcData({ stocks: [{ code: "012340", collected_at: null, kis: [], naver: [naverRow, news2] }] }));
    const res = await request(app).get("/api/news/by-stock?codes=012340&limit=1");
    expect((res.body as NewsByStockResponse).stocks[0]!.items).toHaveLength(1);
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

  it("days= (빈 값) → 기본 3일", async () => {
    const { app, rpc } = setup();
    const before = Date.now();
    const res = await request(app).get("/api/news/by-stock?codes=012340&days=");
    expect(res.status).toBe(200);
    expect(Math.abs(Date.parse(rpcArgs(rpc).p_since as string) - (before - 3 * DAY_MS))).toBeLessThan(5_000);
  });

  it.each(["days=abc", "days=2.5", "limit=Infinity", "limit=1e400"])(
    "정수가 아닌 %s → 400 INVALID_QUERY_PARAM · RPC 안 부름(잘라 맞추지 않는다 — IN-30)",
    async (q) => {
      const { app, rpc } = setup();
      const res = await request(app).get(`/api/news/by-stock?codes=012340&${q}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_QUERY_PARAM");
      expect(rpc.mock.calls).toHaveLength(0);
    },
  );

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
    expect(await p2).toEqual(await p1);
  });
});

// ------------------------------------------------------------------
// IN-62 — 코드별 5초 캐시. 웹 작업대는 공용 돌파 코드 + 사용자별 카드 코드를 한 묶음으로 부른다 —
// 묶음이 사용자마다 달라도 겹치는 코드는 RPC 를 나눠 쓰고, 빠진 코드만 RPC 1회로 모아 부른다.
// 이 목은 요청한 코드를 그대로 돌려준다(호출마다 feed_at 을 바꿀 수 있다).
// ------------------------------------------------------------------
describe("GET /api/news/by-stock — 코드별 캐시(IN-62)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function echoSupabase(feedAts: (string | null)[] = ["2026-11-12T00:15:00.512+00:00"]) {
    let call = 0;
    const rpc = vi.fn(async (_fn: string, args: { p_codes: string[] }) => {
      const feed_at = feedAts[Math.min(call, feedAts.length - 1)] ?? null;
      call += 1;
      return {
        data: { feed_at, stocks: args.p_codes.map((code) => ({ code, collected_at: null, kis: [], naver: [] })) },
        error: null,
      };
    });
    return { supabase: { rpc } as unknown as SupabaseClient, rpc };
  }
  const codesOf = (rpc: ReturnType<typeof vi.fn>, i: number) => (rpc.mock.calls[i]![1] as { p_codes: string[] }).p_codes;

  it("공용 코드 + 사용자별 코드(사용자 A: X,Y · 사용자 B: X,Z) → 둘째 RPC 는 Z 만 · X 는 나눠 쓴다", async () => {
    const { supabase, rpc } = echoSupabase();
    const a = await getNewsByStock(supabase, ["900001", "900002"], 3, 20);
    const b = await getNewsByStock(supabase, ["900001", "900003"], 3, 20);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(codesOf(rpc, 0)).toEqual(["900001", "900002"]);
    expect(codesOf(rpc, 1)).toEqual(["900003"]);
    expect([...b.byCode.keys()]).toEqual(["900001", "900003"]);
    expect(b.byCode.get("900001")).toBe(a.byCode.get("900001"));
  });

  it("요청 코드가 모두 캐시에 있으면(다른 집합 · 다른 순서여도) RPC 0회", async () => {
    const { supabase, rpc } = echoSupabase();
    await getNewsByStock(supabase, ["900001", "900002"], 3, 20);
    await getNewsByStock(supabase, ["900003"], 3, 20);
    const mixed = await getNewsByStock(supabase, ["900003", "900001"], 3, 20);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect([...mixed.byCode.keys()]).toEqual(["900003", "900001"]);
  });

  it("빠진 코드는 입력 순서로 RPC 1회에 모은다(캐시 적중 코드는 빠진다)", async () => {
    const { supabase, rpc } = echoSupabase();
    await getNewsByStock(supabase, ["900002"], 3, 20);
    await getNewsByStock(supabase, ["900005", "900002", "900004", "900001"], 3, 20);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(codesOf(rpc, 1)).toEqual(["900005", "900004", "900001"]);
  });

  it("만료는 코드마다 — 5초 지난 코드만 다시 부른다(다시 부르면 그 RPC 가 등록도 한다)", async () => {
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(t0);
    const { supabase, rpc } = echoSupabase();
    await getNewsByStock(supabase, ["900001", "900002"], 3, 20);
    now.mockReturnValue(t0 + 3_000);
    await getNewsByStock(supabase, ["900002", "900003"], 3, 20); // 900003 만 새로(3초 시점)
    expect(codesOf(rpc, 1)).toEqual(["900003"]);
    now.mockReturnValue(t0 + NEWS_BY_STOCK_CACHE_TTL_MS + 1);
    await getNewsByStock(supabase, ["900001", "900002", "900003"], 3, 20);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(codesOf(rpc, 2)).toEqual(["900001", "900002"]);
    expect((rpc.mock.calls[2]![1] as { p_register: boolean }).p_register).toBe(true);
  });

  it("만료 칸은 다음 RPC 때 정리된다 — 코드가 매번 달라도 맵이 TTL 안에 부른 코드 수를 넘지 않는다", async () => {
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(t0);
    const { supabase } = echoSupabase();
    await getNewsByStock(supabase, ["900001", "900002", "900003"], 3, 20);
    await getNewsByStock(supabase, ["900004"], 3, 20);
    expect(newsByStockCacheSize(supabase)).toBe(4);
    now.mockReturnValue(t0 + NEWS_BY_STOCK_CACHE_TTL_MS);
    await getNewsByStock(supabase, ["900009"], 3, 20);
    expect(newsByStockCacheSize(supabase)).toBe(1);
  });

  it("days · limit 이 다르면 같은 코드도 다른 칸", async () => {
    const { supabase, rpc } = echoSupabase();
    await getNewsByStock(supabase, ["900001"], 3, 20);
    await getNewsByStock(supabase, ["900001"], 3, 5);
    await getNewsByStock(supabase, ["900001"], 1, 20);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("여러 RPC 결과를 섞으면 asOf 는 가장 오래된 계산 시각 · feedAt 은 가장 최근 값", async () => {
    const t0 = Date.parse("2026-11-12T00:30:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] }); // Date.now · new Date() 둘 다 — asOf 는 new Date() 로 만든다
    try {
      vi.setSystemTime(t0);
      const { supabase } = echoSupabase(["2026-11-12T00:29:58.000+00:00", "2026-11-12T00:30:01.000+00:00"]);
      await getNewsByStock(supabase, ["900001"], 3, 20);
      vi.setSystemTime(t0 + 2_000);
      const snap = await getNewsByStock(supabase, ["900002", "900001"], 3, 20);
      expect(snap.asOf).toBe("2026-11-12T09:30:00.000+09:00");
      expect(snap.feedAt).toBe("2026-11-12T09:30:01.000+09:00");
    } finally {
      vi.useRealTimers();
    }
  });

  it("빠진 코드의 RPC 가 실패하면 그 코드 칸만 지우고 적중 코드 칸은 남는다", async () => {
    const { supabase, rpc } = echoSupabase();
    await getNewsByStock(supabase, ["900001"], 3, 20);
    rpc.mockImplementationOnce(async () => ({ data: null, error: { message: "boom" } }) as never);
    await expect(getNewsByStock(supabase, ["900001", "900002"], 3, 20)).rejects.toEqual({ message: "boom" });
    expect(newsByStockCacheSize(supabase)).toBe(1);
    await getNewsByStock(supabase, ["900001", "900002"], 3, 20);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(codesOf(rpc, 2)).toEqual(["900002"]);
  });

  it("라우트 — 두 사용자 묶음이 다른 순서 · 다른 카드여도 응답은 각자 입력 순서 · 모양 그대로", async () => {
    const { supabase, rpc } = echoSupabase();
    const app = createApp({ supabase });
    const a = await request(app).get("/api/news/by-stock?codes=900002,900001");
    const b = await request(app).get("/api/news/by-stock?codes=900001,900003,900002");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(codesOf(rpc, 1)).toEqual(["900003"]);
    expect((a.body as NewsByStockResponse).stocks.map((s) => s.code)).toEqual(["900002", "900001"]);
    const body = b.body as NewsByStockResponse;
    expect(body.stocks.map((s) => s.code)).toEqual(["900001", "900003", "900002"]);
    expect(body.stocks[1]).toEqual({ code: "900003", collectedAt: null, count: 0, truncated: false, items: [] });
    expect(body.feedAt).toBe("2026-11-12T09:15:00.512+09:00");
  });
});
