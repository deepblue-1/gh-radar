import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";

// ============================================================
// RED — GET /api/stocks/:code/co-movement 은 Plan 03 이 구현.
//   현재 라우트 미존재 → 404 (Express 기본). 구현 후 200 + 객체 계약으로 GREEN 전환.
//
// 계약(packages/shared CoMovementResponse): 응답은 **객체** { candidates: [...] }
//   (배열 아님 — 계약 드리프트 lesson, themes 상세와 동형).
// ============================================================

const ANCHOR = "004090"; // 한국석유
const TID = "11111111-1111-4111-8111-111111111111";

function themeComovementRow(p: {
  theme_id: string;
  stock_code: string;
  conf_d0?: number;
  conf_d1?: number;
  ignite_days?: number;
  member_count?: number;
}) {
  return {
    theme_id: p.theme_id,
    stock_code: p.stock_code,
    ignite_days: p.ignite_days ?? 10,
    member_count: p.member_count ?? 10,
    conf_d0: p.conf_d0 ?? 0.5,
    conf_d1: p.conf_d1 ?? 0.2,
    lift: 2,
    avg_ret: 18,
    computed_at: "2026-06-11T00:00:00Z",
  };
}
function cosurgeRow(code_a: string, code_b: string, co_count: number) {
  const [a, b] = code_a < code_b ? [code_a, code_b] : [code_b, code_a];
  return { code_a: a, code_b: b, co_count, lift: 2, avg_pair_ret: 18, computed_at: "2026-06-11T00:00:00Z" };
}
function themeRow(id: string, name: string) {
  return {
    id,
    name,
    description: null,
    is_system: true,
    owner_id: null,
    sources: ["naver"],
    top3_avg_change_rate: null,
    stats_updated_at: null,
    created_at: "2026-06-11T00:00:00Z",
    updated_at: "2026-06-11T00:00:00Z",
    hidden: false,
  };
}
function master(code: string, name: string, market = "KOSPI") {
  return {
    code,
    name,
    market,
    sector: null,
    security_type: "보통주",
    listing_date: null,
    is_delisted: false,
    updated_at: "2026-06-11T00:00:00Z",
  };
}
function quote(code: string, rate: string) {
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
    updated_at: "2026-06-11T01:00:00Z",
  };
}

const baseState = () => ({
  themes: [themeRow(TID, "정유")],
  themeStocks: [
    { theme_id: TID, stock_code: ANCHOR, source: "naver", confidence: null, reason: null, effective_from: "2026-06-11T00:00:00Z", effective_to: null },
    { theme_id: TID, stock_code: "024060", source: "naver", confidence: null, reason: null, effective_from: "2026-06-11T00:00:00Z", effective_to: null },
  ],
  themeComovement: [
    themeComovementRow({ theme_id: TID, stock_code: ANCHOR, conf_d0: 0.6 }),
    themeComovementRow({ theme_id: TID, stock_code: "024060", conf_d0: 0.7 }),
  ],
  cosurgeEdges: [cosurgeRow(ANCHOR, "024060", 9)],
  masters: [master(ANCHOR, "한국석유"), master("024060", "흥구석유", "KOSDAQ")],
  quotes: [quote(ANCHOR, "16"), quote("024060", "12")],
});

const app = (state: any = baseState()) => createApp({ supabase: mockSupabase(state) });

describe("GET /api/stocks/:code/co-movement (동조 후보 — RED, Plan 03 구현)", () => {
  // Test 1 — 응답은 객체 { candidates: [...] } (배열 아님)
  it("1: 응답이 객체 { candidates: [...] } (Array.isArray(body)===false)", async () => {
    const r = await request(app()).get(`/api/stocks/${ANCHOR}/co-movement?k=8`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(false);
    expect(Array.isArray(r.body.candidates)).toBe(true);
  });

  // Test 2 — theme_comovement + cosurge_edges + stock_quotes 조인 → liveChangeRate 포함
  it("2: candidates 에 liveChangeRate 포함 (stock_quotes 조인)", async () => {
    const r = await request(app()).get(`/api/stocks/${ANCHOR}/co-movement?k=8`);
    const c = r.body.candidates.find((x: any) => x.code === "024060");
    expect(c).toBeDefined();
    expect(c.liveChangeRate).toBe(12);
    expect(c.coSurgeCount).toBe(9);
  });

  // Test 3 — 후보 0 (테마 없음 + co-surge 이웃 없음) → { candidates: [] }
  it("3: 앵커 테마/이웃 없음 → { candidates: [] }", async () => {
    const r = await request(
      app({ themes: [], themeStocks: [], themeComovement: [], cosurgeEdges: [], masters: [], quotes: [] }),
    ).get(`/api/stocks/${ANCHOR}/co-movement`);
    expect(r.status).toBe(200);
    expect(r.body.candidates).toEqual([]);
  });

  // Test 4 — k 클램프: ?k=999 → 최대 50 (Math.min(k,50))
  it("4: ?k=999 → 최대 50 후보 (k 클램프)", async () => {
    const codes = Array.from({ length: 80 }, (_, i) => String(100000 + i));
    const state = {
      themes: [themeRow(TID, "대형테마")],
      themeStocks: [
        { theme_id: TID, stock_code: ANCHOR, source: "naver", confidence: null, reason: null, effective_from: "2026-06-11T00:00:00Z", effective_to: null },
        ...codes.map((c) => ({ theme_id: TID, stock_code: c, source: "naver", confidence: null, reason: null, effective_from: "2026-06-11T00:00:00Z", effective_to: null })),
      ],
      themeComovement: [
        themeComovementRow({ theme_id: TID, stock_code: ANCHOR, conf_d0: 0.6 }),
        ...codes.map((c, i) => themeComovementRow({ theme_id: TID, stock_code: c, conf_d0: 0.9 - i * 0.001 })),
      ],
      cosurgeEdges: [],
      masters: [master(ANCHOR, "한국석유"), ...codes.map((c) => master(c, `종목${c}`))],
      quotes: [quote(ANCHOR, "16"), ...codes.map((c, i) => quote(c, String((i % 30) + 1)))],
    };
    const r = await request(app(state)).get(`/api/stocks/${ANCHOR}/co-movement?k=999`);
    expect(r.status).toBe(200);
    expect(r.body.candidates.length).toBeLessThanOrEqual(50);
  });

  // Test 5 — db-max-rows: theme_comovement 멤버 1000 초과 시 .range() 페이지네이션 전수 수집
  it("5: theme_comovement 1000 행 초과 → .range() 페이지네이션 (절단 회귀 가드)", async () => {
    const codes = Array.from({ length: 1200 }, (_, i) => String(200000 + i));
    const state = {
      themes: [themeRow(TID, "초대형테마")],
      themeStocks: [
        { theme_id: TID, stock_code: ANCHOR, source: "naver", confidence: null, reason: null, effective_from: "2026-06-11T00:00:00Z", effective_to: null },
        ...codes.map((c) => ({ theme_id: TID, stock_code: c, source: "naver", confidence: null, reason: null, effective_from: "2026-06-11T00:00:00Z", effective_to: null })),
      ],
      themeComovement: [
        themeComovementRow({ theme_id: TID, stock_code: ANCHOR, conf_d0: 0.6 }),
        ...codes.map((c, i) => themeComovementRow({ theme_id: TID, stock_code: c, conf_d0: 0.5, ignite_days: (i % 10) + 5 })),
      ],
      cosurgeEdges: [],
      masters: [master(ANCHOR, "한국석유"), ...codes.map((c) => master(c, `종목${c}`))],
      quotes: [quote(ANCHOR, "16"), ...codes.map((c, i) => quote(c, String((i % 30) + 1)))],
    };
    const r = await request(app(state)).get(`/api/stocks/${ANCHOR}/co-movement?k=50`);
    expect(r.status).toBe(200);
    // 절단되면 1000 너머 멤버가 사라져 후보가 비거나 일부만 — 페이지네이션이면 50 채움
    expect(r.body.candidates.length).toBe(50);
  });
});
