import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { mockSupabase } from "../../../tests/fixtures/supabase-mock";

// ============================================================
// GET /api/stocks/:code/limit-up (상한가 다음날 이력 — LIMIT-01).
//
// 계약(packages/shared LimitUpResponse): 응답은 **객체** { hero, events, themes }
//   (배열 아님 — comovement 계약 드리프트 lesson). events 는 date DESC.
//   라우트는 limit_up_* 테이블만 SELECT — 시세 조인/재계산 없음 (D-22).
// ============================================================

const ANCHOR = "000440"; // 황금 케이스 (events>0)
const TID = "11111111-1111-4111-8111-111111111111";

function eventRow(p: {
  date: string;
  is_jeomsang?: boolean;
  next_open_ret?: number;
  next_low_ret?: number;
  turnover?: number | null;
}) {
  return {
    code: ANCHOR,
    date: p.date,
    is_jeomsang: p.is_jeomsang ?? false,
    next_open_ret: p.next_open_ret ?? 3.5,
    next_high_ret: 8.2,
    next_low_ret: p.next_low_ret ?? -2.1,
    next_close_ret: 1.4,
    trade_amount: 12_345_678_900,
    turnover: "turnover" in p ? p.turnover : 4.5,
    computed_at: "2026-06-28T00:00:00Z",
  };
}

function statsRow() {
  return {
    code: ANCHOR,
    total_events: 4,
    resolved_events: 4,
    win_count: 2,
    win_rate: 0.5,
    avg_open_ret: 2.1,
    worst_low_ret: -5.3,
    recent_wins: 2,
    recent_losses: 1,
    bucket_n10_n5: 0,
    bucket_n5_0: 2,
    bucket_0_p5: 1,
    bucket_p5_p10: 1,
    bucket_p10: 0,
    computed_at: "2026-06-28T00:00:00Z",
  };
}

function themeStatRow(theme_id: string, sample_n: number) {
  return {
    theme_id,
    sample_n,
    win_count: Math.round(sample_n * 0.6),
    win_rate: 0.6,
    avg_open_ret: 3.3,
    computed_at: "2026-06-28T00:00:00Z",
  };
}

function themeRow(id: string, name: string, hidden = false) {
  return {
    id,
    name,
    description: null,
    is_system: true,
    owner_id: null,
    sources: ["naver"],
    top3_avg_change_rate: null,
    stats_updated_at: null,
    created_at: "2026-06-28T00:00:00Z",
    updated_at: "2026-06-28T00:00:00Z",
    hidden,
  };
}

function themeStockRow(theme_id: string, stock_code: string, effective_to: string | null = null) {
  return {
    theme_id,
    stock_code,
    source: "naver",
    confidence: null,
    reason: null,
    effective_from: "2026-06-28T00:00:00Z",
    effective_to,
  };
}

const baseState = () => ({
  limitUpEvents: [
    eventRow({ date: "2026-01-10", is_jeomsang: true }),
    eventRow({ date: "2026-03-15" }),
    eventRow({ date: "2026-02-20", turnover: null }),
    eventRow({ date: "2026-04-01" }),
  ],
  limitUpStockStats: [statsRow()],
  limitUpThemeStats: [themeStatRow(TID, 12)],
  themes: [themeRow(TID, "정유")],
  themeStocks: [themeStockRow(TID, ANCHOR)],
});

const app = (state: any = baseState()) => createApp({ supabase: mockSupabase(state) });

describe("GET /api/stocks/:code/limit-up (상한가 다음날 이력)", () => {
  // 1 — 응답은 객체 { hero, events, themes } (배열 아님)
  it("1: 응답이 객체 { hero, events, themes } (Array.isArray(body)===false)", async () => {
    const r = await request(app()).get(`/api/stocks/${ANCHOR}/limit-up`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(false);
    expect(r.body.hero).toBeDefined();
    expect(Array.isArray(r.body.events)).toBe(true);
    expect(Array.isArray(r.body.themes)).toBe(true);
  });

  // 2 — events 는 date DESC + hero 매핑 + turnover NULL 보존
  it("2: events date DESC 정렬 + hero/themes 매핑 + turnover null 보존", async () => {
    const r = await request(app()).get(`/api/stocks/${ANCHOR}/limit-up`);
    expect(r.status).toBe(200);
    const dates = r.body.events.map((e: any) => e.date);
    expect(dates).toEqual(["2026-04-01", "2026-03-15", "2026-02-20", "2026-01-10"]);
    // hero 카멜케이스 매핑
    expect(r.body.hero.totalEvents).toBe(4);
    expect(r.body.hero.winRate).toBe(0.5);
    expect(r.body.hero.histogram).toEqual([0, 2, 1, 1, 0]);
    // turnover NULL 보존 (2026-02-20 행)
    const feb = r.body.events.find((e: any) => e.date === "2026-02-20");
    expect(feb.turnover).toBeNull();
    // 점상 태그 (2026-01-10 행)
    const jan = r.body.events.find((e: any) => e.date === "2026-01-10");
    expect(jan.isJeomsang).toBe(true);
    // 테마 매핑 (themeName 조인)
    expect(r.body.themes[0].themeName).toBe("정유");
    expect(r.body.themes[0].sampleN).toBe(12);
  });

  // 3 — 이벤트 0회 종목 → 200 + zero hero + 빈 배열 (빈 상태)
  it("3: 이벤트 0회 → 200 + hero.totalEvents 0 + events:[] + themes:[]", async () => {
    const r = await request(
      app({
        limitUpEvents: [],
        limitUpStockStats: [],
        limitUpThemeStats: [],
        themes: [],
        themeStocks: [],
      }),
    ).get(`/api/stocks/005930/limit-up`);
    expect(r.status).toBe(200);
    expect(r.body.hero.totalEvents).toBe(0);
    expect(r.body.events).toEqual([]);
    expect(r.body.themes).toEqual([]);
  });

  // 4 — 잘못된 :code → 400 INVALID_QUERY_PARAM
  it("4: 잘못된 :code (특수문자) → 400", async () => {
    const r = await request(app()).get(`/api/stocks/!!!/limit-up`);
    expect(r.status).toBe(400);
  });
});
