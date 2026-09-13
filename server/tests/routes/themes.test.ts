import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";
import type { ThemeRow, ThemeStockRow } from "../../src/mappers/theme";
import type { StockMasterRow, StockQuoteRow } from "../../src/mappers/stock";

// 실제 gen_random_uuid() 와 동일한 valid v4 uuid (version=4, variant=8~b) —
// Zod z.string().uuid() 가 version nibble 을 검증하므로 fixture 도 실 PK 형식 사용.
const SYS_A = "a1111111-1111-4111-8111-111111111111"; // top3 평균 높음 → 먼저
const SYS_B = "b2222222-2222-4222-8222-222222222222"; // top3 평균 낮음 → 나중
const USER_T = "c3333333-3333-4333-8333-333333333333"; // 유저 테마 — 응답 제외

function theme(
  id: string,
  name: string,
  isSystem: boolean,
  hidden = false,
): ThemeRow {
  return {
    id,
    name,
    description: null,
    is_system: isSystem,
    owner_id: isSystem ? null : "user-1",
    sources: isSystem ? ["naver"] : ["user"],
    top3_avg_change_rate: null,
    stats_updated_at: null,
    created_at: "2026-06-09T00:00:00Z",
    updated_at: "2026-06-09T00:00:00Z",
    hidden,
  };
}

function ts(
  themeId: string,
  code: string,
  effectiveTo: string | null = null,
): ThemeStockRow {
  return {
    theme_id: themeId,
    stock_code: code,
    source: "naver",
    confidence: null,
    reason: null,
    effective_from: "2026-06-09T00:00:00Z",
    effective_to: effectiveTo,
  };
}

function master(code: string, name: string, market = "KOSPI"): StockMasterRow {
  return {
    code,
    name,
    market,
    sector: null,
    security_type: "보통주",
    listing_date: null,
    is_delisted: false,
    updated_at: "2026-06-09T00:00:00Z",
  };
}

function quote(code: string, rate: string): StockQuoteRow {
  return {
    code,
    price: "10000",
    change_amount: "100",
    change_rate: rate,
    volume: 1000,
    trade_amount: 5_000_000,
    open: "9900",
    high: "10100",
    low: "9800",
    market_cap: 1_000_000_000,
    upper_limit: "13000",
    lower_limit: "7000",
    updated_at: "2026-06-09T01:00:00Z",
  };
}

// SYS_A: 상위3평균 = (30+20+10)/3 = 20
// SYS_B: 상위3평균 = (5+3+1)/3  = 3
// USER_T: 유저 테마 (응답 제외 대상)
const baseState = () => ({
  themes: [
    theme(SYS_A, "HBM", true),
    theme(SYS_B, "2차전지", true),
    theme(USER_T, "내 관심테마", false),
  ],
  themeStocks: [
    ts(SYS_A, "A1"),
    ts(SYS_A, "A2"),
    ts(SYS_A, "A3"),
    ts(SYS_A, "A4", "2026-06-09T00:30:00Z"), // 제외됨 (effective_to set) → 무시
    ts(SYS_B, "B1"),
    ts(SYS_B, "B2"),
    ts(SYS_B, "B3"),
    ts(USER_T, "A1"), // 유저 테마 멤버 — /api/themes 에 새지 않아야 함
  ],
  masters: [
    master("A1", "에이원"),
    master("A2", "에이투"),
    master("A3", "에이쓰리"),
    master("A4", "에이포"),
    master("B1", "비원", "KOSDAQ"),
    master("B2", "비투", "KOSDAQ"),
    master("B3", "비쓰리", "KOSDAQ"),
  ],
  quotes: [
    quote("A1", "30"),
    quote("A2", "20"),
    quote("A3", "10"),
    quote("A4", "99"), // 제외 멤버 — 계산에 들어오면 안 됨
    quote("B1", "5"),
    quote("B2", "3"),
    quote("B3", "1"),
  ],
});

const app = (state: any = baseState()) =>
  createApp({ supabase: mockSupabase(state) });

// ------------------------------------------------------------------
// 목록은 system_theme_list() RPC 한 번으로 만든다 (migration 20260913150000).
// 집계 의미(유저 테마·hidden 제외, effective_to 제외 멤버, 시세 없는 멤버, 상위3평균)는 SQL 이
// 소유한다 — 목에서 SQL 을 재현하면 테스트가 목을 검증하게 되므로 여기서는 라우트 책임
// (RPC 1회 호출·행 매핑·정렬·캐시·에러 전파)만 본다. SQL 의미는 마이그레이션 적용 직후 운영
// 데이터로 종전 JS 집계(themes·theme_stocks·stock_quotes 직접 조회)와 테마별로 대조한다.
// ------------------------------------------------------------------
const C_NONE = "d4444444-4444-4444-8444-444444444444"; // 시세 있는 멤버 없음 → live null

function listRow(
  id: string,
  name: string,
  liveTop3: string | number | null,
  stockCount: number,
) {
  return {
    ...theme(id, name, true),
    top3_avg_change_rate: "1.0000", // 캐시 컬럼 — 응답에 쓰이면 안 됨
    stock_count: stockCount,
    live_top3_avg: liveTop3,
  };
}

const listRows = () => [
  listRow(C_NONE, "시세없음", null, 2),
  listRow(SYS_B, "2차전지", 3, 3),
  listRow(SYS_A, "HBM", "20.0000", 3), // numeric 이 문자열로 와도 숫자로
];

function listSupabase(rpc: { data?: unknown; error?: unknown }) {
  return mockSupabase({ rpc: { system_theme_list: rpc } });
}

describe("GET /api/themes (시스템 테마 목록 + 상위3평균 desc 정렬)", () => {
  it("system_theme_list RPC 1회로 만든다 — 테이블 직접 조회 0회", async () => {
    const supabase = listSupabase({ data: listRows() });
    const r = await request(createApp({ supabase })).get("/api/themes");
    expect(r.status).toBe(200);
    const rpcSpy = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
    const fromSpy = supabase.from as unknown as ReturnType<typeof vi.fn>;
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy.mock.calls[0][0]).toBe("system_theme_list");
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("live_top3_avg 로 상위3평균(캐시 컬럼 아님) + stockCount 매핑 + desc 정렬, null 은 맨 뒤", async () => {
    const r = await request(
      createApp({ supabase: listSupabase({ data: listRows() }) }),
    ).get("/api/themes");
    expect(r.body.map((t: any) => t.id)).toEqual([SYS_A, SYS_B, C_NONE]);
    expect(r.body[0]).toMatchObject({
      id: SYS_A,
      name: "HBM",
      isSystem: true,
      sources: ["naver"],
      stockCount: 3,
    });
    expect(r.body[0].top3AvgChangeRate).toBeCloseTo(20);
    expect(r.body[1].top3AvgChangeRate).toBeCloseTo(3);
    expect(r.body[2].top3AvgChangeRate).toBeNull();
    expect(r.body[2].stockCount).toBe(2);
  });

  it("30초 목록 캐시 — 같은 앱에 연속 요청하면 두 번째는 RPC 0회, 응답 동일", async () => {
    const supabase = listSupabase({ data: listRows() });
    const a = createApp({ supabase });
    const rpcSpy = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

    const first = await request(a).get("/api/themes");
    const second = await request(a).get("/api/themes");
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  it("RPC 에러 → 500, 실패는 캐시하지 않아 다음 요청이 다시 부른다", async () => {
    const supabase = listSupabase({ error: { message: "boom" } });
    const a = createApp({ supabase });
    const rpcSpy = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

    const first = await request(a).get("/api/themes");
    expect(first.status).toBe(500);
    await request(a).get("/api/themes");
    expect(rpcSpy).toHaveBeenCalledTimes(2);
  });

  it("Cache-Control: no-store", async () => {
    const r = await request(
      createApp({ supabase: listSupabase({ data: listRows() }) }),
    ).get("/api/themes");
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  it("시스템 테마 없으면(RPC 가 빈 배열) 200 + 빈 배열", async () => {
    const r = await request(
      createApp({ supabase: listSupabase({ data: [] }) }),
    ).get("/api/themes");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });
});

describe("GET /api/themes/:id (테마 상세 — 메타 + 통계 + 소속 종목)", () => {
  it("200 + ThemeWithStats & { stocks } 객체 (배열 아님 — webapp 상세 헤더 계약)", async () => {
    const r = await request(app()).get(`/api/themes/${SYS_A}`);
    expect(r.status).toBe(200);
    // 상세는 bare 배열이 아니라 객체 — theme.sources/name/통계가 있어야 헤더가 렌더된다.
    // (bare 배열 반환 시 webapp ThemeSourceBadges 의 sources.filter() 가 throw → error.tsx.)
    expect(Array.isArray(r.body)).toBe(false);
    expect(r.body).toMatchObject({
      id: SYS_A,
      name: "HBM",
      isSystem: true,
      sources: ["naver"],
      stockCount: 3, // active 3개 (A4 제외)
    });
    expect(r.body.top3AvgChangeRate).toBeCloseTo(20); // (30+20+10)/3
    expect(Array.isArray(r.body.stocks)).toBe(true);
    expect(r.body.stocks.length).toBe(3);
    const a1 = r.body.stocks.find((s: any) => s.code === "A1");
    expect(a1).toMatchObject({
      code: "A1",
      name: "에이원",
      market: "KOSPI",
      price: 10000,
      changeRate: 30,
      tradeAmount: 5_000_000,
      source: "naver",
    });
    // 제외 멤버 A4 는 안 나와야 함
    expect(r.body.stocks.some((s: any) => s.code === "A4")).toBe(false);
  });

  it("멤버 0개 시스템 테마 → 200 + 객체(stocks:[], stockCount 0, top3 null)", async () => {
    const EMPTY = "e5555555-5555-4555-8555-555555555555";
    const r = await request(
      app({
        themes: [theme(EMPTY, "빈테마", true)],
        themeStocks: [],
        masters: [],
        quotes: [],
      }),
    ).get(`/api/themes/${EMPTY}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(false);
    expect(r.body.name).toBe("빈테마");
    expect(r.body.stocks).toEqual([]);
    expect(r.body.stockCount).toBe(0);
    expect(r.body.top3AvgChangeRate).toBeNull();
  });

  it("시세 부재 종목도 멤버로 포함 (price/changeRate 0)", async () => {
    const state = baseState();
    state.quotes = state.quotes.filter((q) => q.code !== "A2"); // A2 시세 제거
    const r = await request(app(state)).get(`/api/themes/${SYS_A}`);
    const a2 = r.body.stocks.find((s: any) => s.code === "A2");
    expect(a2).toBeDefined();
    expect(a2.price).toBe(0);
    expect(a2.changeRate).toBe(0);
  });

  it("잘못된 :id (uuid 아님) → 400", async () => {
    const r = await request(app()).get("/api/themes/not-a-uuid");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("INVALID_QUERY_PARAM");
  });

  it("없는 테마(uuid 형식 OK) → 404", async () => {
    const r = await request(app()).get(
      "/api/themes/d4444444-4444-4444-8444-444444444444",
    );
    expect(r.status).toBe(404);
  });

  it("유저 테마 id 로 조회 → 404 (시스템 전용 라우트)", async () => {
    const r = await request(app()).get(`/api/themes/${USER_T}`);
    expect(r.status).toBe(404);
  });

  it("hidden(운영자 삭제) 시스템 테마 상세 → 404 (tombstone)", async () => {
    const state = baseState();
    state.themes = [theme(SYS_A, "HBM", true, true)]; // hidden
    const r = await request(app(state)).get(`/api/themes/${SYS_A}`);
    expect(r.status).toBe(404);
  });

  it("상세도 stock_quotes 를 200 청크로 IN fetch (201개 멤버 → 2회 이상)", async () => {
    const codes = Array.from({ length: 201 }, (_, i) =>
      String(i).padStart(6, "0"),
    );
    const state = {
      themes: [theme(SYS_A, "대형테마", true)],
      themeStocks: codes.map((c) => ts(SYS_A, c)),
      masters: codes.map((c) => master(c, `종목${c}`)),
      quotes: codes.map((c, i) => quote(c, String((i % 30) + 1))),
    };
    const supabase = mockSupabase(state);
    const fromSpy = supabase.from as unknown as ReturnType<typeof vi.fn>;
    const r = await request(createApp({ supabase })).get(
      `/api/themes/${SYS_A}`,
    );
    expect(r.status).toBe(200);
    expect(r.body.stocks.length).toBe(201);
    expect(r.body.stockCount).toBe(201);
    const quoteCalls = fromSpy.mock.calls.filter(
      (c) => c[0] === "stock_quotes",
    );
    expect(quoteCalls.length).toBeGreaterThanOrEqual(2);
  });
});
