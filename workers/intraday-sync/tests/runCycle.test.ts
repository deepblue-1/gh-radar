import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// index 모듈은 dotenv/config + loadConfig() 가 import 시점 실행될 수 있어
// 환경변수 stub 후 동적 import.
function stubEnv() {
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "key";
  process.env.KIWOOM_APPKEY = "appkey";
  process.env.KIWOOM_SECRETKEY = "secret";
  process.env.HOT_SET_TOP_N = "5";
  // 기본 off — 1차 dt 가드(ka10081 probe)를 쓰지 않는 케이스가 실 axios 로 키움을 때리지 않도록.
  // dt 가드 전용 describe 가 "true" 로 덮어쓰고 fetchDailyChart 를 mock 한다.
  process.env.DT_GUARD_ENABLED = "false";
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
    // 0차 캘린더 가드(quick-260817-f1a) 도입 후 cycle 결과가 "오늘 날짜"에 의존한다.
    // 실제 실행일이 휴장일이면 아래 케이스들이 전부 skip 돼 무의미해지므로 정상 거래일로 고정.
    // Date 만 fake (setTimeout 은 실제 유지 — withRetry 백오프 간섭 방지).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-18T01:00:00Z")); // 10:00 KST 화요일, 정상 거래일
  });
  afterEach(() => {
    vi.useRealTimers();
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

describe("runIntradayCycle — 일봉 쓰기 창 + EOD 종가 패스 (quick-260820-fh2)", () => {
  const UP_ROW = {
    stk_cd: "005930",
    stk_nm: "삼성전자",
    cur_prc: "+70500",
    pred_pre: "+500",
    flu_rt: "+0.71",
    now_trde_qty: "10000000",
  };

  type Spies = {
    intradayUpsertClose: ReturnType<typeof vi.fn>;
    intradayUpsertOhlc: ReturnType<typeof vi.fn>;
    upsertQuotesStep1: ReturnType<typeof vi.fn>;
    upsertQuotesStep2: ReturnType<typeof vi.fn>;
    rebuildTopMovers: ReturnType<typeof vi.fn>;
    runEodClosePass: ReturnType<typeof vi.fn>;
  };

  /** 전 파이프라인 stub + 관찰용 spy 반환. STEP2 는 111111 종목 1건을 항상 만들어낸다. */
  function mockPipeline(): Spies {
    const spies: Spies = {
      intradayUpsertClose: vi.fn().mockResolvedValue({ count: 1 }),
      intradayUpsertOhlc: vi.fn().mockResolvedValue(undefined),
      upsertQuotesStep1: vi.fn().mockResolvedValue(undefined),
      upsertQuotesStep2: vi.fn().mockResolvedValue(undefined),
      rebuildTopMovers: vi.fn().mockResolvedValue({ count: 0 }),
      runEodClosePass: vi.fn().mockResolvedValue({ count: 7 }),
    };

    vi.doMock("../src/kiwoom/tokenStore", () => ({
      getKiwoomToken: vi
        .fn()
        .mockResolvedValue({ accessToken: "TOK", expiresAt: new Date() }),
    }));
    vi.doMock("../src/kiwoom/fetchRanking", () => ({
      fetchKa10027: vi.fn().mockResolvedValue([UP_ROW]),
    }));
    vi.doMock("../src/services/supabase", () => ({
      createSupabaseClient: vi.fn().mockReturnValue(supabaseStub()),
    }));
    vi.doMock("../src/pipeline/bootstrapStocks", () => ({
      bootstrapMissingStocks: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../src/pipeline/upsertClose", () => ({
      intradayUpsertClose: spies.intradayUpsertClose,
    }));
    vi.doMock("../src/pipeline/upsertQuotes", () => ({
      upsertQuotesStep1: spies.upsertQuotesStep1,
      upsertQuotesStep2: spies.upsertQuotesStep2,
    }));
    vi.doMock("../src/pipeline/topMovers", () => ({
      rebuildTopMovers: spies.rebuildTopMovers,
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
    vi.doMock("../src/pipeline/mapOhlc", () => ({
      ka10001RowToOhlcUpdate: vi.fn().mockReturnValue({
        code: "111111",
        date: "2026-08-18",
        open: 1000,
        high: 1100,
        low: 900,
        upperLimit: null,
        lowerLimit: null,
        marketCap: null,
      }),
    }));
    vi.doMock("../src/pipeline/upsertOhlc", () => ({
      intradayUpsertOhlc: spies.intradayUpsertOhlc,
    }));
    vi.doMock("../src/pipeline/eodClose", () => ({
      runEodClosePass: spies.runEodClosePass,
    }));

    return spies;
  }

  beforeEach(() => {
    stubEnv();
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("10:00 정규장 → 일봉 쓰기(close/ohlc) 정상 수행, EOD 패스 미호출", async () => {
    vi.setSystemTime(new Date("2026-08-18T01:00:00Z")); // 10:00 KST
    const s = mockPipeline();

    const { runIntradayCycle } = await import("../src/index");
    const out = await runIntradayCycle();

    expect(s.intradayUpsertClose).toHaveBeenCalled();
    expect(s.intradayUpsertOhlc).toHaveBeenCalled();
    expect(s.runEodClosePass).not.toHaveBeenCalled();
    expect(out).toEqual({ step1Count: 1, step2Count: 1, failed: 0 });
  });

  it("08:30 프리마켓 → 일봉 쓰기 skip, stock_quotes 는 계속 갱신 (NXT 현재가 유지)", async () => {
    vi.setSystemTime(new Date("2026-08-17T23:30:00Z")); // 2026-08-18 08:30 KST
    const s = mockPipeline();

    const { runIntradayCycle } = await import("../src/index");
    const out = await runIntradayCycle();

    expect(s.intradayUpsertClose).not.toHaveBeenCalled();
    expect(s.intradayUpsertOhlc).not.toHaveBeenCalled();
    expect(s.upsertQuotesStep1).toHaveBeenCalled();
    expect(s.upsertQuotesStep2).toHaveBeenCalled();
    expect(s.runEodClosePass).not.toHaveBeenCalled();
    // 반환 shape 3키 유지, 일봉 skip 이므로 step1Count=0
    expect(out).toEqual({ step1Count: 0, step2Count: 1, failed: 0 });
  });

  it("15:45 → 일봉 직접 쓰기 skip + quotes 갱신 + runEodClosePass 호출", async () => {
    vi.setSystemTime(new Date("2026-08-18T06:45:00Z")); // 15:45 KST
    const s = mockPipeline();

    const { runIntradayCycle } = await import("../src/index");
    const out = await runIntradayCycle();

    expect(s.intradayUpsertClose).not.toHaveBeenCalled();
    expect(s.intradayUpsertOhlc).not.toHaveBeenCalled();
    expect(s.upsertQuotesStep1).toHaveBeenCalled();
    expect(s.upsertQuotesStep2).toHaveBeenCalled();
    expect(s.runEodClosePass).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ step1Count: 0, step2Count: 1, failed: 0 });
  });

  it("15:31 (EOD 슬롯 아님) → runEodClosePass 미호출, 일봉 쓰기도 skip", async () => {
    vi.setSystemTime(new Date("2026-08-18T06:31:00Z")); // 15:31 KST
    const s = mockPipeline();

    const { runIntradayCycle } = await import("../src/index");
    await runIntradayCycle();

    expect(s.runEodClosePass).not.toHaveBeenCalled();
    expect(s.intradayUpsertClose).not.toHaveBeenCalled();
  });

  it("EOD 패스 실패가 cycle 전체를 죽이지 않는다 (error 로그 후 정상 반환)", async () => {
    vi.setSystemTime(new Date("2026-08-18T06:45:00Z")); // 15:45 KST
    const s = mockPipeline();
    s.runEodClosePass.mockRejectedValue(new Error("키움 429 — rate limit"));

    const { runIntradayCycle } = await import("../src/index");
    const out = await runIntradayCycle();

    expect(out).toEqual({ step1Count: 0, step2Count: 1, failed: 0 });
  });
});

describe("runIntradayCycle — KRX 휴장일 0차 가드 (quick-260817-f1a)", () => {
  beforeEach(() => {
    stubEnv();
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("2026-08-17(휴장일) → step1/step2 0, fetchKa10027 미호출 (DB 쓰기 없음)", async () => {
    vi.setSystemTime(new Date("2026-08-17T01:00:00Z")); // 10:00 KST, 광복절 대체공휴일
    const fetchKa10027 = vi.fn().mockResolvedValue([]);
    const intradayUpsertClose = vi.fn().mockResolvedValue({ count: 0 });

    vi.doMock("../src/kiwoom/tokenStore", () => ({
      getKiwoomToken: vi
        .fn()
        .mockResolvedValue({ accessToken: "TOK", expiresAt: new Date() }),
    }));
    vi.doMock("../src/kiwoom/fetchRanking", () => ({ fetchKa10027 }));
    vi.doMock("../src/kiwoom/fetchDailyChart", () => ({
      fetchKa10081LatestDt: vi.fn().mockResolvedValue("20260814"),
    }));
    vi.doMock("../src/services/supabase", () => ({
      createSupabaseClient: vi.fn().mockReturnValue(supabaseStub()),
    }));
    vi.doMock("../src/pipeline/upsertClose", () => ({ intradayUpsertClose }));

    const { runIntradayCycle } = await import("../src/index");
    const out = await runIntradayCycle();

    expect(out).toEqual({ step1Count: 0, step2Count: 0, failed: 0 });
    expect(fetchKa10027).not.toHaveBeenCalled();
    expect(intradayUpsertClose).not.toHaveBeenCalled();
  });
});

describe("runIntradayCycle — ka10081 dt 1차 가드 (quick-260817-f1a)", () => {
  const UP_ROW = {
    stk_cd: "005930",
    stk_nm: "삼성전자",
    cur_prc: "+70500",
    pred_pre: "+500",
    flu_rt: "+0.71",
    now_trde_qty: "10000000",
  };

  /** dt 가드 이후 흐름이 끝까지 돌도록 나머지 파이프라인을 전부 stub. */
  function mockPipeline(fetchKa10027: ReturnType<typeof vi.fn>) {
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
  }

  beforeEach(() => {
    stubEnv();
    process.env.DT_GUARD_ENABLED = "true";
    process.env.DT_GUARD_PROBE_CODES = "005930,069500";
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["Date"] });
    // 2026-08-18(화) 09:30 KST = 2026-08-18T00:30:00Z — 정상 거래일 정규장.
    vi.setSystemTime(new Date("2026-08-18T00:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.DT_GUARD_PROBE_CODES;
  });

  it("정규장(09:30) + 모든 probe 가 직전 거래일 dt → cycle skip, fetchKa10027 미호출", async () => {
    const fetchKa10027 = vi.fn().mockResolvedValue([UP_ROW]);
    const fetchKa10081LatestDt = vi.fn().mockResolvedValue("20260814");
    vi.doMock("../src/kiwoom/fetchDailyChart", () => ({ fetchKa10081LatestDt }));
    mockPipeline(fetchKa10027);

    const { runIntradayCycle } = await import("../src/index");
    const out = await runIntradayCycle();

    expect(out).toEqual({ step1Count: 0, step2Count: 0, failed: 0 });
    expect(fetchKa10081LatestDt).toHaveBeenCalledTimes(2); // probe 2 종목
    expect(fetchKa10027).not.toHaveBeenCalled();
  });

  it("프리마켓(08:30) + probe 가 직전 거래일 dt → skip 하지 않음 (정상 거래일 오늘 봉 미생성이 정상)", async () => {
    // NXT 프리마켓 사이클은 정상 거래일에도 오늘 일봉이 아직 없다 → dt 가드로 skip 하면
    // 정상 거래일 프리마켓 시세 갱신이 통째로 멈추는 역방향 오탐이 된다. 관측 로그만 남긴다.
    vi.setSystemTime(new Date("2026-08-17T23:30:00Z")); // 2026-08-18 08:30 KST
    const fetchKa10027 = vi.fn().mockResolvedValue([UP_ROW]);
    const fetchKa10081LatestDt = vi.fn().mockResolvedValue("20260814");
    vi.doMock("../src/kiwoom/fetchDailyChart", () => ({ fetchKa10081LatestDt }));
    mockPipeline(fetchKa10027);

    const { runIntradayCycle } = await import("../src/index");
    await runIntradayCycle();

    expect(fetchKa10081LatestDt).toHaveBeenCalled(); // 관측은 수행
    expect(fetchKa10027).toHaveBeenCalled(); // 그러나 skip 되지 않음
  });

  it("probe 중 하나라도 오늘 dt → 정상 진행 (보수적 판정)", async () => {
    const fetchKa10027 = vi.fn().mockResolvedValue([UP_ROW]);
    const fetchKa10081LatestDt = vi
      .fn()
      .mockResolvedValueOnce("20260814") // 거래정지 등으로 오늘 봉 없음
      .mockResolvedValueOnce("20260818"); // 오늘 봉 존재 → 거래일 확정
    vi.doMock("../src/kiwoom/fetchDailyChart", () => ({ fetchKa10081LatestDt }));
    mockPipeline(fetchKa10027);

    const { runIntradayCycle } = await import("../src/index");
    await runIntradayCycle();

    expect(fetchKa10027).toHaveBeenCalled();
  });

  it("probe 전부 throw → fail-open (warn 후 정상 진행)", async () => {
    const fetchKa10027 = vi.fn().mockResolvedValue([UP_ROW]);
    const fetchKa10081LatestDt = vi.fn().mockRejectedValue(new Error("키움 429 — rate limit"));
    vi.doMock("../src/kiwoom/fetchDailyChart", () => ({ fetchKa10081LatestDt }));
    mockPipeline(fetchKa10027);

    const { runIntradayCycle } = await import("../src/index");
    await runIntradayCycle();

    expect(fetchKa10081LatestDt).toHaveBeenCalledTimes(2);
    expect(fetchKa10027).toHaveBeenCalled(); // probe 장애가 데이터 수집을 죽이지 않는다
  });

  it("DT_GUARD_ENABLED=false → probe 미호출, 정상 진행 (킬 스위치)", async () => {
    process.env.DT_GUARD_ENABLED = "false";
    const fetchKa10027 = vi.fn().mockResolvedValue([UP_ROW]);
    const fetchKa10081LatestDt = vi.fn().mockResolvedValue("20260814");
    vi.doMock("../src/kiwoom/fetchDailyChart", () => ({ fetchKa10081LatestDt }));
    mockPipeline(fetchKa10027);

    const { runIntradayCycle } = await import("../src/index");
    await runIntradayCycle();

    expect(fetchKa10081LatestDt).not.toHaveBeenCalled();
    expect(fetchKa10027).toHaveBeenCalled();
  });
});
