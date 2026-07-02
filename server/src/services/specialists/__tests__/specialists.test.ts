import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeCreateResponse } from "../../__tests__/anthropic-mock";

/**
 * Phase 14 Plan 04 — 데이터 전문가 4종 유닛 테스트 (CHAT-01, RESEARCH Pattern 2/Anti-pattern).
 *
 * 검증 핵심:
 *   - 각 전문가 = 결정적 Supabase 조회 후 Haiku messages.create **1콜** (내부 tool-use 루프 없음)
 *   - 함수가 Haiku opinion text 를 그대로 반환
 *   - news 전문가는 discussions 조회에 relevance != 'noise' 필터 포함
 *   - theme 전문가는 theme_stocks(effective_to IS NULL) 필터 포함
 *   - anthropicApiKey 미설정 → graceful 안내 텍스트(throw 안 함, create 미호출)
 *
 * Anthropic client 는 `../anthropic-client` 모듈을 mock 해 create 스파이로 교체한다
 * (helpers 의 specialistText 는 real — 텍스트 추출 경로 검증).
 */

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("../anthropic-client", () => ({
  getChatAnthropicClient: () => ({ messages: { create: createMock } }),
  __resetChatClientForTests: () => {},
}));

// mock 이후 import (specialists 가 mock 된 anthropic-client 를 참조).
import { consultQuoteSpecialist } from "../quote-specialist";
import { consultThemeSpecialist } from "../theme-specialist";
import { consultNewsSpecialist } from "../news-specialist";
import { consultLimitupSpecialist } from "../limitup-specialist";

type Row = Record<string, unknown>;
interface Call {
  table: string;
  method: string;
  args: unknown[];
}

/**
 * 테이블별 seed row 를 반환하는 in-memory supabase mock.
 * 모든 필터 메서드(eq/is/in/or/neq/gte/lt/order/limit/select)는 no-op passthrough 로
 * 호출 로그(_calls)만 남긴다. terminal: maybeSingle/single → 첫 row, thenable → 전체 배열.
 */
function makeSupabase(seed: Record<string, Row[]>) {
  const calls: Call[] = [];
  const PASSTHROUGH = [
    "select",
    "eq",
    "is",
    "in",
    "or",
    "neq",
    "gte",
    "lt",
    "order",
    "limit",
    "range",
  ];

  function builder(table: string) {
    const b: Record<string, unknown> = {};
    for (const m of PASSTHROUGH) {
      b[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args });
        return b;
      };
    }
    b.maybeSingle = async () => ({ data: (seed[table] ?? [])[0] ?? null, error: null });
    b.single = async () => ({ data: (seed[table] ?? [])[0] ?? null, error: null });
    b.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: seed[table] ?? [], error: null });
    return b;
  }

  const client = {
    from: (t: string) => {
      calls.push({ table: t, method: "from", args: [] });
      return builder(t);
    },
    _calls: calls,
  };
  return client as unknown as SupabaseClient & { _calls: Call[] };
}

const OPINION = "이 종목은 최근 거래대금이 늘며 수급이 개선되는 흐름입니다.";

describe("데이터 전문가 4종 (결정적 조회 + Haiku 1콜)", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    createMock.mockReset();
    createMock.mockResolvedValue(makeCreateResponse(OPINION));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: consultQuoteSpecialist — 조회 후 Haiku 1콜, opinion text 반환 (내부 루프 없음)", async () => {
    const sb = makeSupabase({
      stocks: [{ code: "005930", name: "삼성전자", market: "KOSPI", updated_at: "2026-07-02T00:00:00Z" }],
      stock_quotes: [
        {
          code: "005930",
          price: "70000",
          change_amount: "1000",
          change_rate: "1.45",
          volume: 1000,
          trade_amount: 5000,
          open: "69000",
          high: "70500",
          low: "68900",
          market_cap: 1000000,
          upper_limit: "91000",
          lower_limit: "49000",
          updated_at: "2026-07-02T00:00:00Z",
        },
      ],
      stock_daily_ohlcv: [
        { date: "2026-07-01", open: "69000", high: "70000", low: "68000", close: "69500", volume: 900 },
      ],
    });

    const text = await consultQuoteSpecialist(sb, { code: "005930", question: "지금 시세 어때?" });

    expect(text).toBe(OPINION);
    // Haiku create 는 정확히 1회 — 내부 tool-use 루프 없음 (RESEARCH Anti-pattern).
    expect(createMock).toHaveBeenCalledTimes(1);
    // 결정적 조회가 stock_quotes 를 실제로 읽었다.
    expect(sb._calls.some((c) => c.table === "stock_quotes")).toBe(true);
    // create 인자에 max_tokens 700 상한 (비용).
    const arg = createMock.mock.calls[0][0] as { max_tokens: number };
    expect(arg.max_tokens).toBe(700);
  });

  it("Test 2: consultThemeSpecialist — theme_stocks(effective_to IS NULL) 필터 + Haiku 1콜", async () => {
    const sb = makeSupabase({
      theme_stocks: [{ theme_id: "t1", stock_code: "005930" }],
      themes: [{ id: "t1", name: "반도체", description: "반도체 테마", top3_avg_change_rate: "12.3" }],
      theme_comovement: [{ theme_id: "t1", conf_d0: "0.5", lift: "2.1", avg_ret: "3.2" }],
    });

    const text = await consultThemeSpecialist(sb, { code: "005930", question: "무슨 테마야?" });

    expect(text).toBe(OPINION);
    expect(createMock).toHaveBeenCalledTimes(1);
    // active 멤버 필터 (effective_to IS NULL) 사용.
    expect(
      sb._calls.some(
        (c) => c.method === "is" && c.args[0] === "effective_to" && c.args[1] === null,
      ),
    ).toBe(true);
  });

  it("Test 3: consultNewsSpecialist — discussions 조회에 relevance != 'noise' 필터 포함", async () => {
    const sb = makeSupabase({
      news_articles: [
        { title: "삼성전자 실적 개선", source: "junggi", url: "https://ex.com/a", published_at: "2026-07-01T00:00:00Z" },
      ],
      discussions: [
        { title: "실적 기대", body: "컨센 상회", relevance: "price_reason", posted_at: "2026-07-01T00:00:00Z" },
      ],
    });

    const text = await consultNewsSpecialist(sb, { code: "005930", question: "뉴스랑 심리 어때?" });

    expect(text).toBe(OPINION);
    expect(createMock).toHaveBeenCalledTimes(1);
    // discussions 조회에 noise 제외 필터 (meaningful) 포함.
    expect(
      sb._calls.some(
        (c) =>
          c.table === "discussions" &&
          c.method === "or" &&
          typeof c.args[0] === "string" &&
          (c.args[0] as string).includes("noise"),
      ),
    ).toBe(true);
  });

  it("Test 4: consultLimitupSpecialist — limit_up_stock_stats + events 조회 후 opinion", async () => {
    const sb = makeSupabase({
      limit_up_stock_stats: [
        {
          code: "005930",
          total_events: 5,
          resolved_events: 5,
          win_count: 3,
          win_rate: "0.6",
          avg_open_ret: "2.1",
          worst_low_ret: "-5.0",
          recent_wins: 2,
          recent_losses: 1,
          bucket_n10_n5: 0,
          bucket_n5_0: 1,
          bucket_0_p5: 2,
          bucket_p5_p10: 1,
          bucket_p10: 1,
        },
      ],
      limit_up_events: [
        {
          code: "005930",
          date: "2026-06-30",
          is_jeomsang: false,
          next_open_ret: "2.0",
          next_high_ret: "5.0",
          next_low_ret: "-1.0",
          next_close_ret: "1.5",
          trade_amount: 100,
          turnover: "3.2",
        },
      ],
      theme_stocks: [],
    });

    const text = await consultLimitupSpecialist(sb, { code: "005930", question: "상한가 이력 어때?" });

    expect(text).toBe(OPINION);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(sb._calls.some((c) => c.table === "limit_up_stock_stats")).toBe(true);
    expect(sb._calls.some((c) => c.table === "limit_up_events")).toBe(true);
  });

  it("Test 5: anthropicApiKey 미설정 → graceful 안내 텍스트 (throw 안 함, create 미호출)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const sb = makeSupabase({ stock_quotes: [] });

    const text = await consultQuoteSpecialist(sb, { code: "005930", question: "시세?" });

    expect(text).toContain("실시간 분석을 사용할 수 없습니다");
    // key 없으면 Haiku 를 호출하지 않는다 (비용 0, graceful).
    expect(createMock).not.toHaveBeenCalled();
  });
});
