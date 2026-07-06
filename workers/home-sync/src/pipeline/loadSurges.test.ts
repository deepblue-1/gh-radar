import { describe, expect, it } from "vitest";
import { loadSurges, kstMidnightIso } from "./loadSurges";
import type { HomeSyncConfig } from "../config";
import {
  createMockSupabase,
  type MockSupabase,
  type MockSupabaseChain,
} from "../../tests/helpers/supabase-mock";

/**
 * Phase 13 Plan 02 Task 1 + quick 260707-bqj — loadSurges (급등 종목 + 종목명 + 종목별 top-K 뉴스).
 *
 * 검증:
 *   - stock_quotes.change_rate >= surgeThreshold **AND updated_at >= 오늘 KST 자정** 만 로드,
 *     change_rate desc 정렬, surgeMax cap.
 *   - stocks 마스터에서 종목명 해석.
 *   - Pitfall 1 (D-07): 종목별 top-K 뉴스를 청크 fetch 로 로드 → 단일 .in() 1000-row
 *     truncation 회피. 여러 종목이 각각 500건 뉴스여도 마지막 종목이 newsPerStock 건 유지.
 *   - 신선도 필터 (quick 260707-bqj): stale cleanup 없는 stock_quotes 에서 어제 급등/거래정지
 *     잔존 행 제외 — updated_at gte 컷오프가 주입한 now 의 KST 당일 자정.
 *
 * mock 주의: supabase-mock 의 `gte` 는 단일 vi.fn 이라 stock_quotes 쿼리의 두 gte 호출
 * (change_rate + updated_at) 을 같은 함수가 처리한다. `gte.mockResolvedValue` 는 첫 gte 까지
 * Promise 로 만들어 두 번째 `.gte("updated_at")` 체이닝을 깨뜨리므로, column 기준
 * mockImplementation(setQuotes) 으로 change_rate gte 는 chain, updated_at gte 는 resolve.
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

/**
 * stock_quotes gte mock 셋업 — change_rate gte 는 chain(this) 반환, updated_at gte 는
 * responses 를 순차 resolve (retry 시퀀싱 재현). 이중 gte 체이닝 대응 핵심 헬퍼.
 */
function setQuotes(
  chain: MockSupabaseChain,
  responses: Array<{ data: unknown; error: unknown }>,
): void {
  let i = 0;
  chain.gte.mockImplementation((col: string) =>
    col === "updated_at"
      ? Promise.resolve(responses[Math.min(i++, responses.length - 1)])
      : chain,
  );
}

/** stock_quotes gte 호출 중 updated_at gte 만 골라 컷오프 값 반환 (없으면 undefined). */
function updatedAtCutoff(sb: MockSupabase): string | undefined {
  const calls = sb.from("stock_quotes").gte.mock.calls as Array<
    [string, string]
  >;
  return calls.find((c) => c[0] === "updated_at")?.[1];
}

/** stock_quotes updated_at gte 호출 횟수 (= 급등 쿼리 시도 횟수). */
function updatedAtGteCount(sb: MockSupabase): number {
  const calls = sb.from("stock_quotes").gte.mock.calls as Array<
    [string, string]
  >;
  return calls.filter((c) => c[0] === "updated_at").length;
}

describe("kstMidnightIso", () => {
  it("08:26 KST → 오늘 KST 자정 = UTC 전일 15:00", () => {
    expect(kstMidnightIso(new Date("2026-07-07T08:26:00+09:00"))).toBe(
      "2026-07-06T15:00:00.000Z",
    );
  });

  it("자정 직전(전일 23:59 KST) → 그 날 KST 자정", () => {
    // 2026-07-06 23:59 KST → KST 당일 2026-07-06 자정 = 2026-07-05T15:00Z.
    expect(kstMidnightIso(new Date("2026-07-06T23:59:00+09:00"))).toBe(
      "2026-07-05T15:00:00.000Z",
    );
  });

  it("자정 직후(당일 00:01 KST) → 그 날 KST 자정", () => {
    // 2026-07-07 00:01 KST → KST 당일 2026-07-07 자정 = 2026-07-06T15:00Z.
    expect(kstMidnightIso(new Date("2026-07-07T00:01:00+09:00"))).toBe(
      "2026-07-06T15:00:00.000Z",
    );
  });
});

describe("loadSurges", () => {
  it("change_rate >= threshold 만, desc 정렬 + 종목명 해석", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      {
        data: [
          { code: "005930", change_rate: 25 },
          { code: "000660", change_rate: 30 },
        ],
        error: null,
      },
    ]);
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

  it("급등 쿼리에 updated_at 신선도 gte 컷오프 적용 (주입 now 의 KST 당일 자정)", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "005930", change_rate: 25 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930", name: "삼성전자", market: "KOSPI" }],
      error: null,
    });
    sb.from("news_articles").order.mockResolvedValue({ data: [], error: null });

    await loadSurges(sb as never, cfg(), {
      retryDelayMs: 0,
      now: new Date("2026-07-07T08:26:00+09:00"),
    });

    // updated_at gte 가 호출되고, 값이 오늘 KST 자정(UTC 전일 15:00).
    expect(updatedAtCutoff(sb)).toBe("2026-07-06T15:00:00.000Z");
  });

  it("신선도 컷오프는 자정 경계(직전/직후)에서 각자의 KST 당일 자정으로 계산", async () => {
    // 직전: 2026-07-06 23:59 KST → 2026-07-05T15:00Z.
    const sbBefore = createMockSupabase();
    setQuotes(sbBefore.from("stock_quotes"), [{ data: [], error: null }]);
    await loadSurges(sbBefore as never, cfg(), {
      retryDelayMs: 0,
      emptyRetries: 0,
      now: new Date("2026-07-06T23:59:00+09:00"),
    });
    expect(updatedAtCutoff(sbBefore)).toBe("2026-07-05T15:00:00.000Z");

    // 직후: 2026-07-07 00:01 KST → 2026-07-06T15:00Z.
    const sbAfter = createMockSupabase();
    setQuotes(sbAfter.from("stock_quotes"), [{ data: [], error: null }]);
    await loadSurges(sbAfter as never, cfg(), {
      retryDelayMs: 0,
      emptyRetries: 0,
      now: new Date("2026-07-07T00:01:00+09:00"),
    });
    expect(updatedAtCutoff(sbAfter)).toBe("2026-07-06T15:00:00.000Z");
  });

  it("surgeMax 로 cap", async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      code: String(100000 + i),
      change_rate: 20 + i * 0.1,
    }));
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [{ data: many, error: null }]);
    sb.from("stocks").in.mockResolvedValue({ data: [], error: null });
    sb.from("news_articles").order.mockResolvedValue({ data: [], error: null });

    const surges = await loadSurges(sb as never, cfg({ surgeMax: 10 }));
    expect(surges).toHaveLength(10);
  });

  it("Pitfall 1: 종목별 500건 뉴스여도 마지막 종목이 newsPerStock 건 유지 (1000-row truncation 회피)", async () => {
    const codes = ["005930", "000660", "035420"];
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      {
        data: codes.map((c) => ({ code: c, change_rate: 25 })),
        error: null,
      },
    ]);
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
        description: null,
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

  it("2단 정렬: 종목명이 title/description 에 있는 재료 기사를 최신 라운드업보다 우선 배치", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "026910", change_rate: 29 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "026910", name: "광진실업", market: "KOSPI" }],
      error: null,
    });
    // 최신순으로 내려온 응답: 라운드업(종목명 없음)이 앞, 재료 기사(종목명 포함)가 뒤.
    const rows = [
      {
        id: "r1",
        stock_code: "026910",
        title: "오늘의 급등주 총정리",
        url: "https://n/r1",
        source: "s",
        published_at: "2026-07-02T09:00:00Z",
        description: "코스닥 상승 종목 모음",
      },
      {
        id: "r2",
        stock_code: "026910",
        title: "장마감 시황 브리핑",
        url: "https://n/r2",
        source: "s",
        published_at: "2026-07-02T08:00:00Z",
        description: "코스피 강세 마감",
      },
      {
        id: "m1",
        stock_code: "026910",
        title: "광진실업 씨씨홀딩스 지분 인수",
        url: "https://n/m1",
        source: "s",
        published_at: "2026-07-01T18:00:00Z",
        description: "지분 인수 및 유상증자 결정",
      },
      {
        id: "m2",
        stock_code: "026910",
        title: "코스닥 특징주 정리",
        url: "https://n/m2",
        source: "s",
        published_at: "2026-07-01T17:00:00Z",
        description: "광진실업 유상증자 결정 공시",
      },
    ];
    sb.from("news_articles").order.mockResolvedValue({ data: rows, error: null });

    const surges = await loadSurges(sb as never, cfg({ newsPerStock: 4 }));
    const news = surges[0]?.news ?? [];
    // 재료 기사(name-match) 2건이 앞, 각 그룹 내부 published_at desc.
    expect(news.map((n) => n.id)).toEqual(["m1", "m2", "r1", "r2"]);
  });

  it("48h 창 필터: news_articles 쿼리에 published_at >= now-48h cutoff 적용", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "005930", change_rate: 25 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930", name: "삼성전자", market: "KOSPI" }],
      error: null,
    });
    sb.from("news_articles").order.mockResolvedValue({ data: [], error: null });

    const lower = Date.now() - 48 * 60 * 60 * 1000 - 5000;
    await loadSurges(sb as never, cfg());
    const upper = Date.now() - 48 * 60 * 60 * 1000 + 5000;

    const gte = sb.from("news_articles").gte;
    expect(gte).toHaveBeenCalled();
    const [col, val] = gte.mock.calls[0] as [string, string];
    expect(col).toBe("published_at");
    const cutoff = Date.parse(val);
    expect(cutoff).toBeGreaterThanOrEqual(lower);
    expect(cutoff).toBeLessThanOrEqual(upper);
  });

  it("retry-on-empty: 첫 read 가 빈 결과면 재시도 후 non-empty 반환", async () => {
    const sb = createMockSupabase();
    // 1회차 [] (상류 갱신 갭 시뮬), 2회차 데이터.
    setQuotes(sb.from("stock_quotes"), [
      { data: [], error: null },
      { data: [{ code: "000660", change_rate: 30 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "000660", name: "SK하이닉스", market: "KOSPI" }],
      error: null,
    });
    sb.from("news_articles").order.mockResolvedValue({ data: [], error: null });

    const surges = await loadSurges(sb as never, cfg(), { retryDelayMs: 0 });

    expect(surges.map((s) => s.code)).toEqual(["000660"]);
    expect(updatedAtGteCount(sb)).toBe(2); // 1 + 재시도 1
  });

  it("retry-on-empty: 모두 빈 결과면 재시도 소진 후 [] (진짜 급등 없는 날)", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [{ data: [], error: null }]);

    const surges = await loadSurges(sb as never, cfg(), {
      emptyRetries: 2,
      retryDelayMs: 0,
    });

    expect(surges).toEqual([]);
    expect(updatedAtGteCount(sb)).toBe(3); // 1 + 재시도 2
  });
});
