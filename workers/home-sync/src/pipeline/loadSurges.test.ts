import { describe, expect, it } from "vitest";
import {
  loadSurges,
  kstMidnightIso,
  isExcludedProduct,
  newsWindowCutoffIso,
} from "./loadSurges";
import type { HomeSyncConfig } from "../config";
import {
  createMockSupabase,
  type MockSupabase,
  type MockSupabaseChain,
} from "../../tests/helpers/supabase-mock";
import {
  isEtpProduct,
  newsTitleKey,
  type StockFeedRpcKisRow,
  type StockFeedRpcNaverRow,
} from "@gh-radar/shared";

/**
 * Phase 13 Plan 02 Task 1 + quick 260707-bqj — loadSurges (급등 종목 + 종목명 + 종목별 top-K 뉴스).
 *
 * 검증:
 *   - stock_quotes.change_rate >= surgeThreshold **AND rate_updated_at >= 오늘 KST 자정** 만 로드,
 *     change_rate desc 정렬, surgeMax cap.
 *   - stocks 마스터에서 종목명 해석.
 *   - Phase 41 D-19: 종목별 재료 = RPC `stock_feed_by_codes`(등록 안 함) + shared `mergeStockFeed` 합친 피드 —
 *     top-K 는 최근 공시 최대 2건 → 종목명 든 기사 → 최신순. 네이버 줄은 RPC 가 이미 제목에 종목명 든 것만 준다.
 *   - 신선도 필터 (quick 260707-bqj): stale cleanup 없는 stock_quotes 에서 어제 급등/거래정지
 *     잔존 행 제외 — rate_updated_at gte 컷오프가 주입한 now 의 KST 당일 자정.
 *   - quick 261001-bnc: 신선도 컬럼은 등락률 기준 시각 rate_updated_at. 행 쓰기 시각(updated_at)
 *     으로 판정하던 경로가 되살아나면 회귀 가드 테스트가 실패한다(동일스틸럭스 023790 사고).
 *
 * mock 주의: supabase-mock 의 `gte` 는 단일 vi.fn 이라 stock_quotes 쿼리의 두 gte 호출
 * (change_rate + rate_updated_at) 을 같은 함수가 처리한다. `gte.mockResolvedValue` 는 첫 gte 까지
 * Promise 로 만들어 두 번째 rate_updated_at gte 체이닝을 깨뜨리므로, column 기준
 * mockImplementation(setQuotes) 으로 change_rate gte 는 chain, rate_updated_at gte 는 resolve.
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
 * stock_quotes gte mock 셋업 — change_rate gte 는 chain(this) 반환, rate_updated_at gte 는
 * responses 를 순차 resolve (retry 시퀀싱 재현). 이중 gte 체이닝 대응 핵심 헬퍼.
 */
function setQuotes(
  chain: MockSupabaseChain,
  responses: Array<{ data: unknown; error: unknown }>,
): void {
  let i = 0;
  chain.gte.mockImplementation((col: string) =>
    col === "rate_updated_at"
      ? Promise.resolve(responses[Math.min(i++, responses.length - 1)])
      : chain,
  );
}

/** stock_quotes gte 호출 중 rate_updated_at gte 만 골라 컷오프 값 반환 (없으면 undefined). */
function rateUpdatedAtCutoff(sb: MockSupabase): string | undefined {
  const calls = sb.from("stock_quotes").gte.mock.calls as Array<
    [string, string]
  >;
  return calls.find((c) => c[0] === "rate_updated_at")?.[1];
}

/** stock_quotes rate_updated_at gte 호출 횟수 (= 급등 쿼리 시도 횟수). */
function rateUpdatedAtGteCount(sb: MockSupabase): number {
  const calls = sb.from("stock_quotes").gte.mock.calls as Array<
    [string, string]
  >;
  return calls.filter((c) => c[0] === "rate_updated_at").length;
}

/** RPC `stock_feed_by_codes` 한투 원 행. */
function kis(
  srno: string,
  kind: "news" | "disclosure",
  title: string,
  writtenAt: string,
  source: string,
): StockFeedRpcKisRow {
  return {
    srno,
    kind,
    source,
    title,
    title_key: newsTitleKey(title),
    written_at: writtenAt,
    received_at: writtenAt,
    codes: [],
  };
}

/** RPC `stock_feed_by_codes` 네이버 원 행 (RPC 가 이미 제목에 종목명 든 것만 준다 — 20261112320000). */
function naver(id: string, title: string, publishedAt: string): StockFeedRpcNaverRow {
  return {
    id,
    title,
    description: null,
    source: "연합뉴스",
    url: `https://n/${id}`,
    published_at: publishedAt,
    created_at: publishedAt,
  };
}

/** RPC 응답 주입 — 종목마다 kis · naver 원 행. */
function setFeed(
  sb: MockSupabase,
  stocks: Array<{ code: string; kis?: StockFeedRpcKisRow[]; naver?: StockFeedRpcNaverRow[] }>,
): void {
  sb.rpc.mockResolvedValue({
    data: {
      feed_at: null,
      stocks: stocks.map((s) => ({
        code: s.code,
        collected_at: null,
        kis: s.kis ?? [],
        naver: s.naver ?? [],
      })),
    },
    error: null,
  });
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

describe("newsWindowCutoffIso (quick-260915-boq: min(now−48h, 직전 거래일 15:30 KST))", () => {
  it("월 09:05 → 금 15:30 KST (48h 보다 이름)", () => {
    expect(newsWindowCutoffIso(new Date("2026-09-14T09:05:00+09:00"))).toBe(
      "2026-09-11T06:30:00.000Z",
    );
  });

  it("화 09:05 → now−48h (48h 가 더 이름)", () => {
    expect(newsWindowCutoffIso(new Date("2026-09-15T09:05:00+09:00"))).toBe(
      "2026-09-13T00:05:00.000Z",
    );
  });

  it("추석 연휴 다음날(월) 09:05 → 수 15:30 KST", () => {
    expect(newsWindowCutoffIso(new Date("2026-09-28T09:05:00+09:00"))).toBe(
      "2026-09-23T06:30:00.000Z",
    );
  });

  it("개천절 대체공휴일 다음날(화) 09:05 → 금 15:30 KST", () => {
    expect(newsWindowCutoffIso(new Date("2026-10-06T09:05:00+09:00"))).toBe(
      "2026-10-02T06:30:00.000Z",
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

    const surges = await loadSurges(sb as never, cfg());

    expect(surges.map((s) => s.code)).toEqual(["000660", "005930"]); // desc
    expect(surges.find((s) => s.code === "005930")?.name).toBe("삼성전자");
  });

  it("급등 쿼리에 rate_updated_at 신선도 gte 컷오프 적용 (주입 now 의 KST 당일 자정)", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "005930", change_rate: 25 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930", name: "삼성전자", market: "KOSPI" }],
      error: null,
    });

    await loadSurges(sb as never, cfg(), {
      retryDelayMs: 0,
      now: new Date("2026-07-07T08:26:00+09:00"),
    });

    // rate_updated_at gte 가 호출되고, 값이 오늘 KST 자정(UTC 전일 15:00).
    expect(rateUpdatedAtCutoff(sb)).toBe("2026-07-06T15:00:00.000Z");
  });

  it("회귀 가드(261001-bnc): 급등 신선도를 행 쓰기 시각 updated_at 으로 판정하지 않는다", async () => {
    // updated_at 은 행을 마지막으로 쓴 시각이라 server 상세 on-demand(00:28 KST 전일 스냅샷)·
    // intraday-sync STEP2 hot set UPDATE 가 어제 change_rate 에 오늘 시각을 붙인다
    // (동일스틸럭스 023790 +29.99% 사고). 판정은 rate_updated_at 1회뿐이어야 한다.
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "005930", change_rate: 25 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930", name: "삼성전자", market: "KOSPI" }],
      error: null,
    });

    await loadSurges(sb as never, cfg(), {
      retryDelayMs: 0,
      now: new Date("2026-10-01T08:00:00+09:00"),
    });

    const cols = (
      sb.from("stock_quotes").gte.mock.calls as Array<[string, string]>
    ).map((c) => c[0]);
    expect(cols.filter((c) => c === "updated_at")).toHaveLength(0);
    expect(cols.filter((c) => c === "rate_updated_at")).toHaveLength(1);
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
    expect(rateUpdatedAtCutoff(sbBefore)).toBe("2026-07-05T15:00:00.000Z");

    // 직후: 2026-07-07 00:01 KST → 2026-07-06T15:00Z.
    const sbAfter = createMockSupabase();
    setQuotes(sbAfter.from("stock_quotes"), [{ data: [], error: null }]);
    await loadSurges(sbAfter as never, cfg(), {
      retryDelayMs: 0,
      emptyRetries: 0,
      now: new Date("2026-07-07T00:01:00+09:00"),
    });
    expect(rateUpdatedAtCutoff(sbAfter)).toBe("2026-07-06T15:00:00.000Z");
  });

  it("surgeMax 로 cap", async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      code: String(100000 + i),
      change_rate: 20 + i * 0.1,
    }));
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [{ data: many, error: null }]);
    sb.from("stocks").in.mockResolvedValue({ data: [], error: null });

    const surges = await loadSurges(sb as never, cfg({ surgeMax: 10 }));
    expect(surges).toHaveLength(10);
  });

  it("Pitfall 1 계승: 청크 RPC 로 받아 종목마다 newsPerStock 건 유지 (뒤쪽 종목도 0건 아님)", async () => {
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
    // 종목당 네이버 50건(RPC 출처별 상한).
    const naverFor = (code: string) =>
      Array.from({ length: 50 }, (_, i) =>
        naver(`${code}-${i}`, `종목-${code} 기사 ${i}`, `2026-07-01T00:${String(i % 60).padStart(2, "0")}:00Z`),
      );
    setFeed(sb, codes.map((c) => ({ code: c, naver: naverFor(c) })));

    const surges = await loadSurges(sb as never, cfg({ newsPerStock: 5 }));

    const last = surges.find((s) => s.code === "035420");
    expect(last).toBeDefined();
    expect(last?.news).toHaveLength(5);
    for (const s of surges) expect(s.news.length).toBeLessThanOrEqual(5);
  });

  it("2단 정렬: 종목명이 든 기사(네이버는 RPC 가 이미 종목명 든 것만 준다)를 최신 한투 테마 · 라운드업보다 우선", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "026910", change_rate: 29 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "026910", name: "광진실업", market: "KOSPI" }],
      error: null,
    });
    // 한투 뉴스(종목명 없음 · 한투가 붙인 종목 그대로 — D-11)가 더 최신, 네이버(종목명 있음)는 뒤.
    setFeed(sb, [
      {
        code: "026910",
        kis: [
          kis("r1", "news", "오늘의 급등주 총정리", "2026-07-02T09:00:00Z", "뉴스핌"),
          kis("r2", "news", "부산 항만 재개발 수혜주 정리", "2026-07-02T08:00:00Z", "이데일리"),
        ],
        naver: [
          naver("m1", "광진실업 씨씨홀딩스 지분 인수", "2026-07-01T18:00:00Z"),
          naver("m2", "광진실업, 유상증자 결정", "2026-07-01T17:00:00Z"),
        ],
      },
    ]);

    const surges = await loadSurges(sb as never, cfg({ newsPerStock: 4 }));
    const news = surges[0]?.news ?? [];
    // 종목명 든 기사 2건이 앞, 각 그룹 내부 최신순.
    expect(news.map((n) => n.id)).toEqual(["naver:m1", "naver:m2", "kis:r1", "kis:r2"]);
  });

  it("D-19 top-K: 공시 3 + 뉴스 6(종목명 든 것 2) → 최근 공시 2 → 종목명 든 뉴스 2 → 나머지 최신 1", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "012340", change_rate: 29.9 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "012340", name: "가람전자", market: "KOSDAQ" }],
      error: null,
    });
    setFeed(sb, [
      {
        code: "012340",
        kis: [
          kis("d1", "disclosure", "(주)가람전자 단일판매ㆍ공급계약체결", "2026-07-02T06:15:00Z", "코스닥 공시"),
          kis("d2", "disclosure", "가람전자 유상증자결정(제3자배정)", "2026-07-02T05:00:00Z", "코스닥 공시"),
          // 3번째 공시 — 가장 오래됐고 종목명 없음 → 앞자리 2건 밖, 나머지 경쟁에서도 최신 한투 뉴스에 밀린다.
          kis("d3", "disclosure", "주식선물 가격제한폭 확대요건 안내", "2026-07-02T00:00:00Z", "코스닥 공시"),
          kis("k1", "news", "전자부품 업종 동반 강세", "2026-07-02T06:30:00Z", "이데일리"),
          kis("k2", "news", "수출 회복 기대 업종 정리", "2026-07-02T03:00:00Z", "뉴스핌"),
          kis("k3", "news", "중소형주 수급 동향", "2026-07-02T02:00:00Z", "서울경제"),
          kis("k4", "news", "부품주 투자 포인트", "2026-07-01T23:00:00Z", "한국경제"),
        ],
        naver: [
          naver("n1", "가람전자, 대형 수주 소식에 상한가", "2026-07-02T04:00:00Z"),
          naver("n2", "가람전자 신고가 경신", "2026-07-02T01:00:00Z"),
        ],
      },
    ]);

    const surges = await loadSurges(sb as never, cfg({ newsPerStock: 5 }));
    const news = surges[0]?.news ?? [];
    expect(news.map((n) => n.id)).toEqual(["kis:d1", "kis:d2", "naver:n1", "naver:n2", "kis:k1"]);
    // 합친 줄이 NewsRow 로 — 공시는 링크 없음(D-20) · 자료원 · kind · +09:00 시각.
    expect(news[0]).toEqual({
      id: "kis:d1",
      stock_code: "012340",
      title: "(주)가람전자 단일판매ㆍ공급계약체결",
      url: null,
      source: "코스닥 공시",
      published_at: "2026-07-02T15:15:00.000+09:00",
      description: null,
      kind: "disclosure",
    });
    expect(news[2]).toMatchObject({ kind: "news", url: "https://n/n1" });
  });

  it("D-19 공시 0건 회귀: 이전 규칙 그대로(종목명 든 기사 → 최신순)", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "012340", change_rate: 29.9 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "012340", name: "가람전자", market: "KOSDAQ" }],
      error: null,
    });
    setFeed(sb, [
      {
        code: "012340",
        kis: [kis("k1", "news", "전자부품 업종 동반 강세", "2026-07-02T06:30:00Z", "이데일리")],
        naver: [
          naver("n1", "가람전자, 대형 수주 소식에 상한가", "2026-07-02T04:00:00Z"),
          naver("n2", "가람전자 신고가 경신", "2026-07-02T01:00:00Z"),
        ],
      },
    ]);

    const surges = await loadSurges(sb as never, cfg({ newsPerStock: 5 }));
    expect(surges[0]?.news.map((n) => n.id)).toEqual(["naver:n1", "naver:n2", "kis:k1"]);
  });

  it("D-19 합치기는 shared mergeStockFeed — 같은 기사(한투 ↔ 네이버)는 한 줄 · 시황 제목은 빠진다", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "012340", change_rate: 29.9 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "012340", name: "가람전자", market: "KOSDAQ" }],
      error: null,
    });
    setFeed(sb, [
      {
        code: "012340",
        kis: [
          kis("k1", "news", "가람전자, 대형 수주 소식에 상한가", "2026-07-02T04:00:00Z", "이데일리"),
          kis("k2", "news", "코스닥 699선 후퇴… 외국인·기관 동반 매도에 숨 고르기", "2026-07-02T05:00:00Z", "뉴스핌"),
        ],
        naver: [naver("n1", "가람전자, 대형 수주 소식에 상한가", "2026-07-02T04:01:00Z")],
      },
    ]);

    const surges = await loadSurges(sb as never, cfg());
    const news = surges[0]?.news ?? [];
    expect(news).toHaveLength(1);
    // 합친 줄: url 은 네이버 · 자료원은 한투.
    expect(news[0]).toMatchObject({ kind: "news", url: "https://n/n1", source: "이데일리" });
  });

  it("RPC 인자 — stock_feed_by_codes · 등록 안 함 · 출처별 50 · p_since = 뉴스 창 컷오프", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "005930", change_rate: 25 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930", name: "삼성전자", market: "KOSPI" }],
      error: null,
    });

    await loadSurges(sb as never, cfg(), {
      now: new Date("2026-09-16T09:05:00+09:00"),
    });

    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc).toHaveBeenCalledWith("stock_feed_by_codes", {
      p_codes: ["005930"],
      p_since: "2026-09-14T00:05:00.000Z",
      p_per_source: 50,
      p_register: false,
      p_min_disclosures: 2,
    });
    // news_articles 를 직접 읽지 않는다.
    expect(sb.from).not.toHaveBeenCalledWith("news_articles");
  });

  it("RPC 오류 → throw (쿼리 오류와 같은 처리)", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "005930", change_rate: 25 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930", name: "삼성전자", market: "KOSPI" }],
      error: null,
    });
    const boom = { message: "rpc down", code: "XX000" };
    sb.rpc.mockResolvedValue({ data: null, error: boom });

    await expect(loadSurges(sb as never, cfg())).rejects.toBe(boom);
  });

  it("48h 창 필터: 화~금은 RPC p_since = 주입 now-48h cutoff", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "005930", change_rate: 25 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930", name: "삼성전자", market: "KOSPI" }],
      error: null,
    });

    // 수 09:05 KST — 48h 전(월 09:05)이 직전 거래일(화) 15:30 보다 이르다.
    await loadSurges(sb as never, cfg(), {
      now: new Date("2026-09-16T09:05:00+09:00"),
    });

    expect(sb.rpc.mock.calls[0]?.[1]).toMatchObject({ p_since: "2026-09-14T00:05:00.000Z" });
  });

  it("월요일 창: 주입 now 가 월 09:05 면 p_since = 직전 거래일(금) 15:30 KST (quick-260915-boq)", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "005930", change_rate: 25 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930", name: "삼성전자", market: "KOSPI" }],
      error: null,
    });

    await loadSurges(sb as never, cfg(), {
      now: new Date("2026-09-14T09:05:00+09:00"),
    });

    expect(sb.rpc.mock.calls[0]?.[1]).toMatchObject({ p_since: "2026-09-11T06:30:00.000Z" });
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

    const surges = await loadSurges(sb as never, cfg(), { retryDelayMs: 0 });

    expect(surges.map((s) => s.code)).toEqual(["000660"]);
    expect(rateUpdatedAtGteCount(sb)).toBe(2); // 1 + 재시도 1
  });

  it("retry-on-empty: 모두 빈 결과면 재시도 소진 후 [] (진짜 급등 없는 날)", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [{ data: [], error: null }]);

    const surges = await loadSurges(sb as never, cfg(), {
      emptyRetries: 2,
      retryDelayMs: 0,
    });

    expect(surges).toEqual([]);
    expect(rateUpdatedAtGteCount(sb)).toBe(3); // 1 + 재시도 2
  });
});

/**
 * quick 260803-it6 — ETN/ETF/레버리지·인버스 제외.
 *
 * 이중 필터: security_group('ETF'/'ETN') + 종목명 패턴 fallback.
 * 이름 패턴이 필수인 이유: 실사례 570127 "한투 인버스2X코스피200선물 ETN" 이
 * security_group='주권' 으로 오적재돼 group 필터만으로는 새어 나온다.
 * '스팩' 은 이번 범위 밖 — 계속 통과해야 한다(회귀 가드).
 */
describe("isExcludedProduct", () => {
  it("일반 주권 종목은 통과", () => {
    expect(isExcludedProduct("삼성전자", "주권")).toBe(false);
  });

  it("security_group 이 ETF 면 제외", () => {
    expect(isExcludedProduct("KODEX 200", "ETF")).toBe(true);
  });

  it("security_group 소문자 etn 도 제외 (normalize)", () => {
    expect(isExcludedProduct("아무거나", "etn")).toBe(true);
  });

  it("오분류 ETN(group='주권')도 종목명 패턴으로 제외", () => {
    expect(isExcludedProduct("한투 인버스2X코스피200선물 ETN", "주권")).toBe(
      true,
    );
  });

  it("종목명 레버리지 포함 시 제외", () => {
    expect(isExcludedProduct("KODEX 레버리지", "주권")).toBe(true);
  });

  it("security_group ELW 제외 + 종목명 ELW 패턴 제외 (SQL 선례 정합)", () => {
    expect(isExcludedProduct("아무거나", "ELW")).toBe(true);
    expect(isExcludedProduct("한국투자 콜 ELW 1234", "주권")).toBe(true);
  });

  it("스팩은 이번 범위 밖 — 통과", () => {
    expect(isExcludedProduct("삼성스팩8호", "주권")).toBe(false);
  });

  it("이름/그룹 둘 다 없으면 통과 (마스터 미해석 코드)", () => {
    expect(isExcludedProduct(undefined, undefined)).toBe(false);
    expect(isExcludedProduct(null, null)).toBe(false);
  });

  it("D-09 단일 정의: 결과가 shared isEtpProduct 와 같다 (ETF · ETN · ELW 그룹 · 이름 패턴 · 스팩 통과)", () => {
    const cases: Array<[string | null | undefined, string | null | undefined]> = [
      ["삼성전자", "주권"],
      ["KODEX 200", "ETF"],
      ["아무거나", "etn"],
      ["아무거나", " ELW "],
      ["한투 인버스2X코스피200선물 ETN", "주권"],
      ["TIGER 레버리지", "주권"],
      ["삼성스팩8호", "주권"],
      [undefined, undefined],
      [null, null],
    ];
    for (const [name, group] of cases) {
      expect(isExcludedProduct(name, group)).toBe(isEtpProduct(name, group));
    }
  });
});

describe("loadSurges — ETN/ETF 제외", () => {
  it("security_group='ETF' 종목이 결과에서 빠진다", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      {
        data: [
          { code: "069500", change_rate: 30 },
          { code: "005930", change_rate: 25 },
        ],
        error: null,
      },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [
        {
          code: "069500",
          name: "KODEX 200",
          market: "KOSPI",
          security_group: "ETF",
        },
        {
          code: "005930",
          name: "삼성전자",
          market: "KOSPI",
          security_group: "주권",
        },
      ],
      error: null,
    });

    const surges = await loadSurges(sb as never, cfg());

    expect(surges.map((s) => s.code)).toEqual(["005930"]);
  });

  it("오분류 ETN(570127, group='주권')도 종목명 fallback 으로 빠진다", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      {
        data: [
          { code: "570127", change_rate: 30 },
          { code: "005930", change_rate: 25 },
        ],
        error: null,
      },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [
        {
          code: "570127",
          name: "한투 인버스2X코스피200선물 ETN",
          market: "KOSPI",
          security_group: "주권", // 실사례 오적재 — group 필터로는 못 거른다.
        },
        {
          code: "005930",
          name: "삼성전자",
          market: "KOSPI",
          security_group: "주권",
        },
      ],
      error: null,
    });

    const surges = await loadSurges(sb as never, cfg());

    expect(surges.map((s) => s.code)).toEqual(["005930"]);
  });

  it("종목명 인버스/레버리지 포함 + group='주권' → 빠진다", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      {
        data: [
          { code: "111111", change_rate: 30 },
          { code: "222222", change_rate: 28 },
          { code: "005930", change_rate: 25 },
        ],
        error: null,
      },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [
        {
          code: "111111",
          name: "삼성 인버스 코스닥150 선물",
          market: "KOSPI",
          security_group: "주권",
        },
        {
          code: "222222",
          name: "TIGER 레버리지",
          market: "KOSPI",
          security_group: "주권",
        },
        {
          code: "005930",
          name: "삼성전자",
          market: "KOSPI",
          security_group: "주권",
        },
      ],
      error: null,
    });

    const surges = await loadSurges(sb as never, cfg());

    expect(surges.map((s) => s.code)).toEqual(["005930"]);
  });

  it("**필터가 slice 보다 먼저** — 상위 2건이 ETP 여도 surgeMax 슬롯을 후순위 일반 종목이 채운다", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      {
        data: [
          { code: "069500", change_rate: 30 }, // 1위 ETF
          { code: "570127", change_rate: 29 }, // 2위 오분류 ETN
          { code: "005930", change_rate: 28 }, // 3위 일반
          { code: "000660", change_rate: 27 }, // 4위 일반
        ],
        error: null,
      },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [
        {
          code: "069500",
          name: "KODEX 200",
          market: "KOSPI",
          security_group: "ETF",
        },
        {
          code: "570127",
          name: "한투 인버스2X코스피200선물 ETN",
          market: "KOSPI",
          security_group: "주권",
        },
        {
          code: "005930",
          name: "삼성전자",
          market: "KOSPI",
          security_group: "주권",
        },
        {
          code: "000660",
          name: "SK하이닉스",
          market: "KOSPI",
          security_group: "주권",
        },
      ],
      error: null,
    });

    const surges = await loadSurges(sb as never, cfg({ surgeMax: 2 }));

    // slice 가 먼저였다면 결과가 0건이 된다. 필터 우선이라 3·4위가 슬롯을 채운다.
    expect(surges.map((s) => s.code)).toEqual(["005930", "000660"]);
  });

  it("마스터 미해석 코드는 기존대로 이름=코드로 통과", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "999999", change_rate: 25 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({ data: [], error: null });

    const surges = await loadSurges(sb as never, cfg());

    expect(surges.map((s) => s.code)).toEqual(["999999"]);
    expect(surges[0]?.name).toBe("999999");
  });

  it("stocks select 인자에 security_group 이 포함된다", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "005930", change_rate: 25 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [
        {
          code: "005930",
          name: "삼성전자",
          market: "KOSPI",
          security_group: "주권",
        },
      ],
      error: null,
    });

    await loadSurges(sb as never, cfg());

    const selectArg = sb.from("stocks").select.mock.calls[0][0] as string;
    expect(selectArg).toContain("security_group");
  });

  it("스팩 회귀: 종목명 '스팩' 은 계속 통과 (범위 밖 결정 보존)", async () => {
    const sb = createMockSupabase();
    setQuotes(sb.from("stock_quotes"), [
      { data: [{ code: "123456", change_rate: 25 }], error: null },
    ]);
    sb.from("stocks").in.mockResolvedValue({
      data: [
        {
          code: "123456",
          name: "삼성스팩8호",
          market: "KOSDAQ",
          security_group: "주권",
        },
      ],
      error: null,
    });

    const surges = await loadSurges(sb as never, cfg());

    expect(surges.map((s) => s.code)).toEqual(["123456"]);
  });
});
