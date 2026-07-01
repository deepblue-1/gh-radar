import { describe, expect, it } from "vitest";
import { loadSurges } from "./loadSurges";
import type { HomeSyncConfig } from "../config";
import { createMockSupabase } from "../../tests/helpers/supabase-mock";

/**
 * Phase 13 Plan 02 Task 1 — loadSurges (급등 종목 + 종목명 + 종목별 top-K 뉴스 로드).
 *
 * 검증:
 *   - stock_quotes.change_rate >= surgeThreshold 만 로드, change_rate desc 정렬, surgeMax cap.
 *   - stocks 마스터에서 종목명 해석.
 *   - Pitfall 1 (D-07): 종목별 top-K 뉴스를 청크 fetch 로 로드 → 단일 .in() 1000-row
 *     truncation 회피. 여러 종목이 각각 500건 뉴스여도 마지막 종목이 newsPerStock 건 유지.
 */

function cfg(over: Partial<HomeSyncConfig> = {}): HomeSyncConfig {
  return {
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "svc",
    anthropicApiKey: "test",
    classifyModel: "claude-haiku-4-5",
    surgeThreshold: 20,
    newsPerStock: 5,
    surgeMax: 80,
    appVersion: "test",
    logLevel: "silent",
    ...over,
  };
}

describe("loadSurges", () => {
  it("change_rate >= threshold 만, desc 정렬 + 종목명 해석", async () => {
    const sb = createMockSupabase();
    sb.from("stock_quotes").gte.mockResolvedValue({
      data: [
        { code: "005930", change_rate: 25 },
        { code: "000660", change_rate: 30 },
      ],
      error: null,
    });
    sb.from("stocks").in.mockResolvedValue({
      data: [
        { code: "005930", name: "삼성전자", market: "KOSPI" },
        { code: "000660", name: "SK하이닉스", market: "KOSPI" },
      ],
      error: null,
    });
    sb.from("news_articles").order.mockResolvedValue({ data: [], error: null });

    const surges = await loadSurges(sb as never, cfg());

    expect(surges.map((s) => s.code)).toEqual(["000660", "005930"]); // desc
    expect(surges.find((s) => s.code === "005930")?.name).toBe("삼성전자");
  });

  it("surgeMax 로 cap", async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      code: String(100000 + i),
      change_rate: 20 + i * 0.1,
    }));
    const sb = createMockSupabase();
    sb.from("stock_quotes").gte.mockResolvedValue({ data: many, error: null });
    sb.from("stocks").in.mockResolvedValue({ data: [], error: null });
    sb.from("news_articles").order.mockResolvedValue({ data: [], error: null });

    const surges = await loadSurges(sb as never, cfg({ surgeMax: 10 }));
    expect(surges).toHaveLength(10);
  });

  it("Pitfall 1: 종목별 500건 뉴스여도 마지막 종목이 newsPerStock 건 유지 (1000-row truncation 회피)", async () => {
    const codes = ["005930", "000660", "035420"];
    const sb = createMockSupabase();
    sb.from("stock_quotes").gte.mockResolvedValue({
      data: codes.map((c) => ({ code: c, change_rate: 25 })),
      error: null,
    });
    sb.from("stocks").in.mockResolvedValue({
      data: codes.map((c) => ({ code: c, name: `종목-${c}`, market: "KOSPI" })),
      error: null,
    });

    // 각 종목당 500건 (총 1500) — 단일 .in() 이면 PostgREST 1000-row truncation 으로
    // 정렬상 마지막 종목(035420)의 뉴스가 통째로 사라진다. per-code top-K 는 이를 회피.
    const newsFor = (code: string) =>
      Array.from({ length: 500 }, (_, i) => ({
        id: `${code}-${i}`,
        stock_code: code,
        title: `t-${i}`,
        url: `https://n/${code}/${i}`,
        source: "s",
        published_at: `2026-07-01T00:${String(i % 60).padStart(2, "0")}:00Z`,
      }));

    // news_articles.order 는 각 청크 응답 — 각 종목 500건씩 순서대로 반환.
    // per-code 청크 로드 패턴이므로 order 가 호출될 때마다 해당 청크 종목들의 뉴스를 반환.
    sb.from("news_articles").order.mockImplementation(() =>
      Promise.resolve({
        data: codes.flatMap((c) => newsFor(c)),
        error: null,
      }),
    );

    const surges = await loadSurges(sb as never, cfg({ newsPerStock: 5 }));

    // 마지막 종목이 5건 유지 (0건 아님 = truncation 회피).
    const last = surges.find((s) => s.code === "035420");
    expect(last).toBeDefined();
    expect(last?.news).toHaveLength(5);
    // 모든 종목이 정확히 newsPerStock cap.
    for (const s of surges) expect(s.news.length).toBeLessThanOrEqual(5);
  });
});
