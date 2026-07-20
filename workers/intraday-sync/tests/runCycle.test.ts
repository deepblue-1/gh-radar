import { describe, it, expect, vi, beforeEach } from "vitest";

// index 모듈은 dotenv/config + loadConfig() 가 import 시점 실행될 수 있어
// 환경변수 stub 후 동적 import.
function stubEnv() {
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "key";
  process.env.KIWOOM_APPKEY = "appkey";
  process.env.KIWOOM_SECRETKEY = "secret";
  process.env.HOT_SET_TOP_N = "5";
}

// 체이닝 + thenable 빌더:
//   - fetchStocksMasterChunked: .from("stocks").select().in()  → await
//   - fetchPrevDayRows:         .from("stock_daily_ohlcv").select().in().lt().gte().order() → await
// 두 경로 모두 지원하려면 .in() 반환이 thenable 이면서 .lt/.gte/.order 체이닝도 돼야 한다.
function makeBuilder(result: { data: unknown[]; error: null }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    in: () => builder,
    lt: () => builder,
    gte: () => builder,
    order: () => builder,
    then: (resolve: (v: typeof result) => unknown) => resolve(result),
  };
  return builder;
}

// fetchStocksMasterChunked 는 빈 마스터로 응답(marketMap/eligibleCodes 비움 — 본 테스트 관심사 아님).
// stock_daily_ohlcv 는 prevDayRows 로 응답(stale 가드 입력). 기본 [] → stale=false.
function supabaseStub(prevDayRows: unknown[] = []) {
  return {
    from: (table: string) =>
      makeBuilder(
        table === "stock_daily_ohlcv"
          ? { data: prevDayRows, error: null }
          : { data: [], error: null },
      ),
    rpc: () => Promise.resolve({ error: null }),
  };
}

describe("runIntradayCycle — 가드 동작", () => {
  beforeEach(() => {
    stubEnv();
    vi.resetModules();
  });

  it("ka10027 0 row → step1Count=0, step2Count=0, failed=0 (warn + exit 정상)", async () => {
    // fetchKa10027 mock 이 모든 호출에 [] 반환 → sort_tp=1/3 두 호출 모두 [] → 병합 [] → guard.
    vi.doMock("../src/kiwoom/tokenStore", () => ({
      getKiwoomToken: vi
        .fn()
        .mockResolvedValue({ accessToken: "TOK", expiresAt: new Date() }),
    }));
    vi.doMock("../src/kiwoom/fetchRanking", () => ({
      fetchKa10027: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("../src/services/supabase", () => ({
      createSupabaseClient: vi.fn().mockReturnValue({}),
    }));

    const { runIntradayCycle } = await import("../src/index");
    const out = await runIntradayCycle();
    expect(out).toEqual({ step1Count: 0, step2Count: 0, failed: 0 });
  });

  it("sort_tp 1+3 병합 — fetchKa10027 2회 호출(1/3) + 하락 종목 STEP1 upsert 포함", async () => {
    const upRow = {
      stk_cd: "005930",
      stk_nm: "삼성전자",
      cur_prc: "+70500",
      pred_pre: "+500",
      flu_rt: "+0.71",
      now_trde_qty: "10000000",
    };
    const downRow = {
      stk_cd: "009150",
      stk_nm: "삼성전기",
      cur_prc: "-1000",
      pred_pre: "-1000",
      flu_rt: "-2.50",
      now_trde_qty: "500000",
    };

    const fetchKa10027 = vi
      .fn()
      .mockResolvedValueOnce([upRow]) // sort_tp=1 (상승)
      .mockResolvedValueOnce([downRow]); // sort_tp=3 (하락)
    const intradayUpsertClose = vi.fn().mockResolvedValue({ count: 2 });

    vi.doMock("../src/kiwoom/tokenStore", () => ({
      getKiwoomToken: vi
        .fn()
        .mockResolvedValue({ accessToken: "TOK", expiresAt: new Date() }),
    }));
    vi.doMock("../src/kiwoom/fetchRanking", () => ({ fetchKa10027 }));
    vi.doMock("../src/services/supabase", () => ({
      createSupabaseClient: vi.fn().mockReturnValue(supabaseStub()),
    }));
    vi.doMock("../src/pipeline/bootstrapStocks", () => ({
      bootstrapMissingStocks: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../src/pipeline/upsertClose", () => ({ intradayUpsertClose }));
    vi.doMock("../src/pipeline/upsertQuotes", () => ({
      upsertQuotesStep1: vi.fn().mockResolvedValue(undefined),
      upsertQuotesStep2: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../src/pipeline/topMovers", () => ({
      rebuildTopMovers: vi.fn().mockResolvedValue({ count: 0 }),
    }));
    vi.doMock("../src/pipeline/hotSet", () => ({
      computeHotSet: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("../src/kiwoom/fetchHotSet", () => ({
      fetchKa10001ForHotSet: vi
        .fn()
        .mockResolvedValue({ successful: [], failed: 0, failures: [] }),
    }));
    vi.doMock("../src/pipeline/upsertOhlc", () => ({
      intradayUpsertOhlc: vi.fn().mockResolvedValue(undefined),
    }));

    const { runIntradayCycle } = await import("../src/index");
    await runIntradayCycle();

    // fetchKa10027 이 sort_tp=1, sort_tp=3 두 번 호출됨 (세 번째 인자 = sortTp)
    expect(fetchKa10027).toHaveBeenCalledTimes(2);
    expect(fetchKa10027.mock.calls[0][2]).toBe("1");
    expect(fetchKa10027.mock.calls[1][2]).toBe("3");

    // 하락 종목(009150)이 STEP1 upsert 대상에 포함 (병합 효과)
    const step1Codes = (intradayUpsertClose.mock.calls[0][1] as Array<{ code: string }>).map(
      (u) => u.code,
    );
    expect(step1Codes).toContain("009150");
    expect(step1Codes).toContain("005930");
  });

  it("STEP2 step1Codes 필터 제거 — STEP1 미포함 watchlist 종목도 intradayUpsertOhlc 대상", async () => {
    const upRow = {
      stk_cd: "005930",
      stk_nm: "삼성전자",
      cur_prc: "+70500",
      pred_pre: "+500",
      flu_rt: "+0.71",
      now_trde_qty: "10000000",
    };

    // hotSet 이 STEP1 에 없는 watchlist 종목(111111)을 반환 → 과거 필터라면 STEP2 에서 탈락.
    const intradayUpsertOhlc = vi.fn().mockResolvedValue(undefined);
    const ohlcUpdate = {
      code: "111111",
      date: "2026-07-06",
      open: 1000,
      high: 1100,
      low: 900,
      upperLimit: null,
      lowerLimit: null,
      marketCap: null,
    };

    vi.doMock("../src/kiwoom/tokenStore", () => ({
      getKiwoomToken: vi
        .fn()
        .mockResolvedValue({ accessToken: "TOK", expiresAt: new Date() }),
    }));
    vi.doMock("../src/kiwoom/fetchRanking", () => ({
      fetchKa10027: vi.fn().mockResolvedValue([upRow]),
    }));
    vi.doMock("../src/services/supabase", () => ({
      createSupabaseClient: vi.fn().mockReturnValue(supabaseStub()),
    }));
    vi.doMock("../src/pipeline/bootstrapStocks", () => ({
      bootstrapMissingStocks: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../src/pipeline/upsertClose", () => ({
      intradayUpsertClose: vi.fn().mockResolvedValue({ count: 1 }),
    }));
    vi.doMock("../src/pipeline/upsertQuotes", () => ({
      upsertQuotesStep1: vi.fn().mockResolvedValue(undefined),
      upsertQuotesStep2: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../src/pipeline/topMovers", () => ({
      rebuildTopMovers: vi.fn().mockResolvedValue({ count: 0 }),
    }));
    vi.doMock("../src/pipeline/hotSet", () => ({
      computeHotSet: vi.fn().mockResolvedValue(["111111"]),
    }));
    vi.doMock("../src/kiwoom/fetchHotSet", () => ({
      fetchKa10001ForHotSet: vi.fn().mockResolvedValue({
        successful: [{ stk_cd: "111111" }],
        failed: 0,
        failures: [],
      }),
    }));
    // mapOhlc 는 stub — raw ka10001 필드 없이 111111 OHLC update 를 직접 반환.
    vi.doMock("../src/pipeline/mapOhlc", () => ({
      ka10001RowToOhlcUpdate: vi.fn().mockReturnValue(ohlcUpdate),
    }));
    vi.doMock("../src/pipeline/upsertOhlc", () => ({ intradayUpsertOhlc }));

    const { runIntradayCycle } = await import("../src/index");
    await runIntradayCycle();

    // 111111 은 STEP1(005930)에 없지만 필터가 제거되어 intradayUpsertOhlc 대상에 포함
    const ohlcCodes = (intradayUpsertOhlc.mock.calls[0][1] as Array<{ code: string }>).map(
      (u) => u.code,
    );
    expect(ohlcCodes).toContain("111111");
  });

  it("stale snapshot(직전 거래일 재방출) → step1/step2 count 0, DB write 미호출 no-op", async () => {
    // 키움 ka10027 이 직전 거래일과 동일한 30 종목을 그대로 반환 + prev-day 조회도 동일값 →
    // detectStaleSnapshot stale=true → cycle skip.
    const N = 30;
    const rows = Array.from({ length: N }, (_, i) => ({
      stk_cd: String(100000 + i),
      stk_nm: `종목${i}`,
      cur_prc: "+1000",
      pred_pre: "+50",
      flu_rt: "+5.00",
      now_trde_qty: "10000",
    }));
    // prev-day 저장 데이터: 동일 code/close/change_rate (price 1000, changeRate 5)
    const prevDayRows = Array.from({ length: N }, (_, i) => ({
      code: String(100000 + i),
      close: 1000,
      change_rate: 5,
    }));

    const intradayUpsertClose = vi.fn().mockResolvedValue({ count: 0 });
    const bootstrapMissingStocks = vi.fn().mockResolvedValue(undefined);
    const intradayUpsertOhlc = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../src/kiwoom/tokenStore", () => ({
      getKiwoomToken: vi
        .fn()
        .mockResolvedValue({ accessToken: "TOK", expiresAt: new Date() }),
    }));
    vi.doMock("../src/kiwoom/fetchRanking", () => ({
      // sort_tp=1 이 30 종목, sort_tp=3 은 [] → 병합 30
      fetchKa10027: vi
        .fn()
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([]),
    }));
    vi.doMock("../src/services/supabase", () => ({
      createSupabaseClient: vi.fn().mockReturnValue(supabaseStub(prevDayRows)),
    }));
    vi.doMock("../src/pipeline/bootstrapStocks", () => ({ bootstrapMissingStocks }));
    vi.doMock("../src/pipeline/upsertClose", () => ({ intradayUpsertClose }));
    vi.doMock("../src/pipeline/upsertQuotes", () => ({
      upsertQuotesStep1: vi.fn().mockResolvedValue(undefined),
      upsertQuotesStep2: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../src/pipeline/topMovers", () => ({
      rebuildTopMovers: vi.fn().mockResolvedValue({ count: 0 }),
    }));
    vi.doMock("../src/pipeline/hotSet", () => ({
      computeHotSet: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("../src/kiwoom/fetchHotSet", () => ({
      fetchKa10001ForHotSet: vi
        .fn()
        .mockResolvedValue({ successful: [], failed: 0, failures: [] }),
    }));
    vi.doMock("../src/pipeline/upsertOhlc", () => ({ intradayUpsertOhlc }));

    const { runIntradayCycle } = await import("../src/index");
    const out = await runIntradayCycle();

    // stale 판정 → no-op exit
    expect(out).toEqual({ step1Count: 0, step2Count: 0, failed: 0 });
    // DB write + bootstrap 미호출 (stale 가드가 그 앞에서 return)
    expect(intradayUpsertClose).not.toHaveBeenCalled();
    expect(bootstrapMissingStocks).not.toHaveBeenCalled();
    expect(intradayUpsertOhlc).not.toHaveBeenCalled();
  });
});
