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

function theme(id: string, name: string, isSystem: boolean): ThemeRow {
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

describe("GET /api/themes (시스템 테마 목록 + 상위3평균 desc 정렬)", () => {
  it("200 + 시스템 테마만 + 상위3평균 desc 정렬", async () => {
    const r = await request(app()).get("/api/themes");
    expect(r.status).toBe(200);
    // 유저 테마 제외 → 시스템 2개만
    expect(r.body.length).toBe(2);
    // 상위3평균 desc: SYS_A(20) 먼저, SYS_B(3) 나중
    expect(r.body[0].id).toBe(SYS_A);
    expect(r.body[1].id).toBe(SYS_B);
    expect(r.body[0].top3AvgChangeRate).toBeCloseTo(20);
    expect(r.body[1].top3AvgChangeRate).toBeCloseTo(3);
  });

  it("유저 테마는 목록에 새지 않는다 (is_system=true 만)", async () => {
    const r = await request(app()).get("/api/themes");
    expect(r.body.some((t: any) => t.id === USER_T)).toBe(false);
    expect(r.body.every((t: any) => t.isSystem === true)).toBe(true);
  });

  it("effective_to 설정된(제외) 멤버는 상위3평균/종목수에서 빠진다", async () => {
    const r = await request(app()).get("/api/themes");
    const a = r.body.find((t: any) => t.id === SYS_A);
    // A4(rate=99) 가 들어왔으면 평균이 99 쪽으로 튐 → 20 이어야 정상
    expect(a.top3AvgChangeRate).toBeCloseTo(20);
    expect(a.stockCount).toBe(3); // active 3개 (A4 제외)
  });

  it("Cache-Control: no-store", async () => {
    const r = await request(app()).get("/api/themes");
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  it("시스템 테마 없으면 200 + 빈 배열", async () => {
    const r = await request(
      app({ themes: [], themeStocks: [], masters: [], quotes: [] }),
    ).get("/api/themes");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it("stock_quotes 를 200개 청크로 IN fetch — 201개 code 면 2회 이상 분할 (37afcde 회귀)", async () => {
    // 단일 시스템 테마에 201개 종목 → stock_quotes IN 이 청크(200) 분할되어야 함
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
    const r = await request(createApp({ supabase })).get("/api/themes");
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(1);
    expect(r.body[0].stockCount).toBe(201);
    // stock_quotes 호출 횟수 ≥ 2 (201 > 200 → 청크 분할 증거)
    const quoteCalls = fromSpy.mock.calls.filter(
      (c) => c[0] === "stock_quotes",
    );
    expect(quoteCalls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("GET /api/themes/:id (테마 상세 — 소속 종목 리스트)", () => {
  it("200 + 소속 active 종목 ThemeStockMember[] (현재가/등락률/거래대금)", async () => {
    const r = await request(app()).get(`/api/themes/${SYS_A}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    // active 3개 (A4 제외)
    expect(r.body.length).toBe(3);
    const a1 = r.body.find((s: any) => s.code === "A1");
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
    expect(r.body.some((s: any) => s.code === "A4")).toBe(false);
  });

  it("시세 부재 종목도 멤버로 포함 (price/changeRate 0)", async () => {
    const state = baseState();
    state.quotes = state.quotes.filter((q) => q.code !== "A2"); // A2 시세 제거
    const r = await request(app(state)).get(`/api/themes/${SYS_A}`);
    const a2 = r.body.find((s: any) => s.code === "A2");
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
    expect(r.body.length).toBe(201);
    const quoteCalls = fromSpy.mock.calls.filter(
      (c) => c[0] === "stock_quotes",
    );
    expect(quoteCalls.length).toBeGreaterThanOrEqual(2);
  });
});
