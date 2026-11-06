import { beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

const { getMarketTicksTextMock } = vi.hoisted(() => ({ getMarketTicksTextMock: vi.fn() }));
vi.mock("../diagnosis/diagnosis-market", async (importActual) => ({
  ...(await importActual<typeof import("../diagnosis/diagnosis-market")>()),
  getMarketTicksText: getMarketTicksTextMock,
}));

import { TICK_REQUEST_DAILY_CAP_DEFAULT } from "../../ticks";
import {
  DIAGNOSIS_TOOL_CAPS,
  DIAGNOSIS_TOOLS,
  dispatchDiagnosisTool,
  type DiagnosisToolState,
} from "../diagnosis/diagnosis-tools";
import { ORDER_LOG_MAX_LINES } from "../diagnosis/diagnosis-order-log";

/**
 * Phase 39 (39-05 Task 3) — 진단 도구 디스패처. 계좌 범위(SC-2) · 종목 검색 · 주문로그 시간 필터 · 400줄 상한 ·
 * 실행 단위 메모 · 도구별 호출 상한. supabase 는 rpc 스파이 + `from("stocks")` 체인 스파이(실 DB 0).
 */

const USER = "00000000-0000-4000-8000-000000003905";
const ISIN = "KR7282720005";
const DATE = "2026-11-05";
/** 2026-11-05 09:00:01.234 KST. */
const T0 = Date.parse("2026-11-05T00:00:01.234Z");

type Call = { method: string; args: unknown[] };

function makeSupabase(opts: { rpcData?: (params: Record<string, unknown>) => unknown; stocks?: unknown[] } = {}) {
  const rpc = vi.fn(async (_fn: string, params: Record<string, unknown>) => ({
    data: opts.rpcData ? opts.rpcData(params) : rpcData(),
    error: null,
  }));
  const chain: Call[] = [];
  const from = vi.fn((table: string) => {
    chain.push({ method: "from", args: [table] });
    const b: Record<string, unknown> = {};
    for (const m of ["select", "or", "not", "eq", "order", "limit"]) {
      b[m] = (...args: unknown[]) => {
        chain.push({ method: m, args });
        return b;
      };
    }
    b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: opts.stocks ?? [], error: null });
    return b;
  });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from, chain };
}

function makeState(client: SupabaseClient): DiagnosisToolState {
  return {
    supabase: client,
    userId: USER,
    calls: {},
    orderLogMemo: new Map(),
    marketMemo: new Map(),
    marketRecords: 0,
    truncated: false,
  };
}

function toolUse(name: string, input: unknown, id = "tu_1"): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input } as Anthropic.ToolUseBlock;
}

function text(r: Anthropic.ToolResultBlockParam): string {
  return typeof r.content === "string" ? r.content : "";
}

function makeEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gateway: "KB120", journal_epoch: "1", seq: 10, trade_date: DATE, gw_time_ms: T0, kind: 3, group: 1,
    exchange: "KRX", isin: ISIN, stock_code: "282720", stock_name: "금양그린파워", cum_volume: 152000,
    account_no: "12343901", order_no: "5001", price: 12300, qty: 10, order_condition: "", reason_code: "PreBuy A3",
    cond_threshold: 3, cond_actual: 4, cond_metric: 0, ev_kind: 0, ev_price: 0, ev_qty_before: 0, ev_qty_after: 0,
    ev_trade_qty: 0, limit_bid_qty: 0, bid1_price: 0, bid1_qty: 0, accept_latency_us: 0, immediate_fill_qty: 0,
    queue_case: 0, base_cum: 0, ahead_qty: 0, expected_cum: 0, error_volume: 0, remaining_volume: 0,
    has_remaining: false, cancel_reason: 0, result_code: 0, message: "", entry_round: 0, snap_qty: [], snap_cum: [],
    ask_qty_at_limit: 0, open_at_limit: false,
    ...over,
  };
}

function makeOrder(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gateway: "KB120", account_no: "12343901", order_no: "5001", isin: ISIN, stock_code: "282720",
    stock_name: "금양그린파워", exchange: "KRX", board: "G1", side: "B", order_type: "지정가", org_order_no: null,
    qty: 10, price: 12300, filled_qty: 10, status: "filled", result_code: "0000", message: "정상처리",
    origin: "strategy", created_ms: T0 + 2, updated_ms: T0 + 50,
    ...over,
  };
}

function makeFill(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gateway: "KB120", seq: 77, gw_time_ms: T0 + 40, account_no: "12343901", order_no: "5001", isin: ISIN,
    stock_code: "282720", exchange: "KRX", side: "B", exec_price: 12300, exec_qty: 10,
    ...over,
  };
}

function rpcData(over: Record<string, unknown> = {}) {
  return { access: true, date: DATE, isin: ISIN, orders: [makeOrder()], fills: [makeFill()], events: [makeEvent()], ...over };
}

describe("계좌 범위(SC-2) — 도구 스키마 · RPC 인자", () => {
  it("모든 도구 input_schema 에 계좌 · 사용자 · 서버 칸이 없다", () => {
    const keys = DIAGNOSIS_TOOLS.flatMap((t) => Object.keys((t.input_schema.properties ?? {}) as object));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => /account|user|gateway|server/i.test(k))).toEqual([]);
    // prefix 캐시 — 도구 순서 고정.
    expect(DIAGNOSIS_TOOLS.map((t) => t.name).slice(0, 2)).toEqual(["get_order_log", "search_stock"]);
  });

  it("모델이 account_no · user_id 를 덧붙여도 RPC 인자는 정확히 p_user_id · p_trade_date · p_isin 이고 p_user_id = state.userId", async () => {
    const sb = makeSupabase();
    const state = makeState(sb.client);
    await dispatchDiagnosisTool(
      toolUse("get_order_log", { date: DATE, isin: ISIN, account_no: "9999", user_id: "x", gateway: "KB121" }),
      state,
    );

    expect(sb.rpc).toHaveBeenCalledTimes(1);
    const [fn, params] = sb.rpc.mock.calls[0];
    expect(fn).toBe("dma_diagnosis_for_user");
    expect(Object.keys(params).sort()).toEqual(["p_isin", "p_trade_date", "p_user_id"]);
    expect(params.p_user_id).toBe(state.userId);
    expect(params).toEqual({ p_user_id: USER, p_trade_date: DATE, p_isin: ISIN });
  });
});

describe("search_stock", () => {
  it("stocks 1쿼리(ETP · 상폐 제외 · limit 10) → `코드 이름 ISIN 시장` 한 줄씩", async () => {
    const sb = makeSupabase({
      stocks: [
        { code: "282720", name: "금양그린파워", isin: ISIN, market: "KOSDAQ" },
        { code: "001570", name: "금양", isin: "KR7001570002", market: "KOSPI" },
      ],
    });
    const out = await dispatchDiagnosisTool(toolUse("search_stock", { query: "금양그린파워" }), makeState(sb.client));

    expect(sb.from).toHaveBeenCalledTimes(1);
    expect(sb.from).toHaveBeenCalledWith("stocks");
    const byMethod = (m: string) => sb.chain.filter((c) => c.method === m).map((c) => c.args);
    expect(byMethod("select")).toEqual([["code,name,isin,market"]]);
    expect(byMethod("or")).toEqual([["name.ilike.%금양그린파워%,code.ilike.%금양그린파워%"]]);
    expect(byMethod("not")).toEqual([["security_group", "in", '("ETF","ETN","ELW")']]);
    expect(byMethod("eq")).toEqual([["is_delisted", false]]);
    expect(byMethod("limit")).toEqual([[10]]);
    expect(out.is_error).toBeFalsy();
    expect(text(out).split("\n")).toEqual(
      expect.arrayContaining(["282720 금양그린파워 KR7282720005 KOSDAQ", "001570 금양 KR7001570002 KOSPI"]),
    );
  });

  it("0건이면 「종목 없음: <query>」", async () => {
    const out = await dispatchDiagnosisTool(toolUse("search_stock", { query: "없는종목" }), makeState(makeSupabase().client));
    expect(text(out)).toBe("종목 없음: 없는종목");
  });

  it("sanitize 뒤 빈 문자열이면 is_error 「입력 오류」 · 쿼리 0", async () => {
    const sb = makeSupabase();
    const out = await dispatchDiagnosisTool(toolUse("search_stock", { query: "%,()'" }), makeState(sb.client));
    expect(out.is_error).toBe(true);
    expect(text(out)).toContain("입력 오류");
    expect(sb.from).not.toHaveBeenCalled();
  });
});

describe("get_order_log — 메모 · 시간 필터 · 400줄 상한", () => {
  it("같은 (date, isin) 두 번 → RPC 1회(실행 단위 메모) · 같은 텍스트", async () => {
    const sb = makeSupabase();
    const state = makeState(sb.client);
    const a = await dispatchDiagnosisTool(toolUse("get_order_log", { date: DATE, isin: ISIN }, "tu_1"), state);
    const b = await dispatchDiagnosisTool(toolUse("get_order_log", { date: DATE, isin: ISIN }, "tu_2"), state);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(text(b)).toBe(text(a));
  });

  it("from/to 밖 줄(주문 created_ms · 체결 · 이벤트 gw_time_ms 기준)이 빠진다", async () => {
    const sb = makeSupabase({
      rpcData: () =>
        rpcData({
          orders: [makeOrder(), makeOrder({ order_no: "5002", created_ms: T0 + 60_000 })],
          fills: [makeFill(), makeFill({ seq: 78, order_no: "5002", gw_time_ms: T0 + 60_100 })],
          events: [makeEvent(), makeEvent({ seq: 12, order_no: "5002", gw_time_ms: T0 + 59_000 })],
        }),
    });
    const out = text(
      await dispatchDiagnosisTool(
        toolUse("get_order_log", { date: DATE, isin: ISIN, from: "09:00:01", to: "09:00:02" }),
        makeState(sb.client),
      ),
    );
    expect(out).toContain("#5001");
    expect(out).not.toContain("#5002");
    expect(out).not.toContain("[5002]");
    expect(out).not.toContain("09:01:00");
  });

  it(`isin 없이 ${ORDER_LOG_MAX_LINES}줄을 넘으면 종목별 요약 모드 + 「종목을 지정해 다시 부르세요」`, async () => {
    const OTHER = "KR7001570002";
    const orders = Array.from({ length: ORDER_LOG_MAX_LINES + 1 }, (_, i) =>
      i % 2 === 0
        ? makeOrder({ order_no: String(6000 + i), created_ms: T0 + i })
        : makeOrder({ order_no: String(6000 + i), isin: OTHER, stock_code: "001570", stock_name: "금양", created_ms: T0 + i }),
    );
    const sb = makeSupabase({ rpcData: () => rpcData({ isin: null, orders, fills: [], events: [makeEvent()] }) });
    const out = text(await dispatchDiagnosisTool(toolUse("get_order_log", { date: DATE }), makeState(sb.client)));

    expect(out).toContain("종목을 지정해 다시 부르세요");
    expect(out).toContain("금양그린파워(282720)");
    expect(out).toContain("금양(001570)");
    expect(out).not.toContain("#6000");
    expect(out.split("\n").length).toBeLessThan(20);
  });

  it(`isin 지정 · ${ORDER_LOG_MAX_LINES}줄 초과면 앞 ${ORDER_LOG_MAX_LINES}줄 + 「잘렸음 — from/to 로 좁혀 다시」`, async () => {
    const orders = Array.from({ length: ORDER_LOG_MAX_LINES + 50 }, (_, i) =>
      makeOrder({ order_no: String(7000 + i), created_ms: T0 + i }),
    );
    const sb = makeSupabase({ rpcData: () => rpcData({ orders, fills: [], events: [] }) });
    const out = text(await dispatchDiagnosisTool(toolUse("get_order_log", { date: DATE, isin: ISIN }), makeState(sb.client)));

    expect(out).toContain("잘렸음 — from/to 로 좁혀 다시");
    expect(out).toContain("#7000");
    expect(out).not.toContain(`#${7000 + ORDER_LOG_MAX_LINES + 49}`);
    const rows = out.split("\n").filter((l) => l.startsWith("[") && l.includes("#7"));
    expect(rows.length).toBeLessThanOrEqual(ORDER_LOG_MAX_LINES);
  });
});

describe("도구별 호출 상한", () => {
  it("상한 값 — search_stock 4 · get_order_log 3 · get_market_ticks 4", () => {
    expect(DIAGNOSIS_TOOL_CAPS).toEqual({ search_stock: 4, get_order_log: 3, get_market_ticks: 4 });
  });

  it("get_order_log 4번째 호출 → 상한 문구(is_error 아님) · RPC 추가 0", async () => {
    const sb = makeSupabase();
    const state = makeState(sb.client);
    for (let i = 0; i < 3; i++) {
      await dispatchDiagnosisTool(toolUse("get_order_log", { date: `2026-11-0${i + 1}` }, `tu_${i}`), state);
    }
    expect(sb.rpc).toHaveBeenCalledTimes(3);

    const over = await dispatchDiagnosisTool(toolUse("get_order_log", { date: "2026-11-09" }, "tu_x"), state);
    expect(over.is_error).toBeFalsy();
    expect(text(over)).toBe("주문로그 조회 상한(3회) 도달 — 지금까지 자료로 답하세요");
    expect(sb.rpc).toHaveBeenCalledTimes(3);
  });

  it("search_stock 5번째 호출도 같은 꼴 · 쿼리 추가 0", async () => {
    const sb = makeSupabase();
    const state = makeState(sb.client);
    for (let i = 0; i < 4; i++) {
      await dispatchDiagnosisTool(toolUse("search_stock", { query: `종목${i}` }, `tu_${i}`), state);
    }
    const over = await dispatchDiagnosisTool(toolUse("search_stock", { query: "하나 더" }, "tu_x"), state);
    expect(over.is_error).toBeFalsy();
    expect(text(over)).toBe("종목 검색 상한(4회) 도달 — 지금까지 자료로 답하세요");
    expect(sb.from).toHaveBeenCalledTimes(4);
  });
});

describe("get_market_ticks (39-07) — 시세 도구 배선", () => {
  const MT = { isin: ISIN, exchange: "KRX", date: DATE, from: "13:10:20", to: "13:10:35" };
  const DEPS = { tickgw: { fetchState: vi.fn() }, tickConvertTrigger: vi.fn(), tickRequestDailyCap: 7 } as never;

  beforeEach(() => {
    getMarketTicksTextMock.mockReset().mockResolvedValue({
      text: "범례: …\n13:10:30.212 A3 …",
      records: 0,
      truncated: false,
      source: "grid",
    });
  });

  it("도구 순서 = get_order_log · search_stock · get_market_ticks · required 5칸 · exchange enum [KRX, NXT]", () => {
    expect(DIAGNOSIS_TOOLS.map((t) => t.name)).toEqual(["get_order_log", "search_stock", "get_market_ticks"]);
    const mt = DIAGNOSIS_TOOLS[2];
    expect(mt.input_schema.required).toEqual(["isin", "exchange", "date", "from", "to"]);
    const props = mt.input_schema.properties as Record<string, { enum?: string[] }>;
    expect(Object.keys(props).sort()).toEqual(["date", "exchange", "from", "isin", "to"]);
    expect(props.exchange.enum).toEqual(["KRX", "NXT"]);
  });

  it("디스패치 → getMarketTicksText 1회 · 둘째 인자 = state 의존성 · 셋째 = state.marketMemo · 덧붙인 account_no 는 버린다", async () => {
    const sb = makeSupabase();
    const state = { ...makeState(sb.client), deps: DEPS };
    const out = await dispatchDiagnosisTool(
      toolUse("get_market_ticks", { ...MT, account_no: "9999", user_id: "x" }),
      state,
    );

    expect(out.is_error).toBeFalsy();
    expect(text(out)).toBe("범례: …\n13:10:30.212 A3 …");
    expect(getMarketTicksTextMock).toHaveBeenCalledTimes(1);
    const [input, deps, memo] = getMarketTicksTextMock.mock.calls[0];
    expect(Object.keys(input).sort()).toEqual(["date", "exchange", "from", "isin", "to"]);
    expect(input).toEqual(MT);
    const d = DEPS as unknown as { tickgw: unknown; tickConvertTrigger: unknown };
    expect(deps).toEqual({
      supabase: state.supabase,
      userId: state.userId,
      tickgw: d.tickgw,
      trigger: d.tickConvertTrigger,
      dailyCap: 7,
    });
    expect(deps.userId).toBe(USER);
    expect(memo).toBe(state.marketMemo);

    // 같은 실행의 두 번째 호출도 같은 메모 객체
    await dispatchDiagnosisTool(toolUse("get_market_ticks", MT, "tu_2"), state);
    expect(getMarketTicksTextMock.mock.calls[1][2]).toBe(state.marketMemo);
  });

  it("5번째 get_market_ticks → 시세 엔진 호출 없음 · 「시세 조회 상한(4회) 도달 — 지금까지 자료로 답하세요」", async () => {
    const state = { ...makeState(makeSupabase().client), deps: DEPS };
    for (let i = 0; i < 4; i++) {
      await dispatchDiagnosisTool(toolUse("get_market_ticks", MT, `tu_${i}`), state);
    }
    expect(getMarketTicksTextMock).toHaveBeenCalledTimes(4);
    const over = await dispatchDiagnosisTool(toolUse("get_market_ticks", MT, "tu_x"), state);
    expect(over.is_error).toBeFalsy();
    expect(text(over)).toBe("시세 조회 상한(4회) 도달 — 지금까지 자료로 답하세요");
    expect(getMarketTicksTextMock).toHaveBeenCalledTimes(4);
  });

  it("잘못된 시각(from: \"1310\") → is_error 「입력 오류」 · 시세 엔진 호출 0", async () => {
    const out = await dispatchDiagnosisTool(
      toolUse("get_market_ticks", { ...MT, from: "1310" }),
      { ...makeState(makeSupabase().client), deps: DEPS },
    );
    expect(out.is_error).toBe(true);
    expect(text(out)).toContain("입력 오류");
    expect(getMarketTicksTextMock).not.toHaveBeenCalled();
  });

  it("state.deps 없음 → dailyCap 기본값 · tickgw · trigger undefined 로 넘긴다", async () => {
    const state = makeState(makeSupabase().client);
    await dispatchDiagnosisTool(toolUse("get_market_ticks", MT), state);
    const deps = getMarketTicksTextMock.mock.calls[0][1];
    expect(deps.dailyCap).toBe(TICK_REQUEST_DAILY_CAP_DEFAULT);
    expect(deps.tickgw).toBeUndefined();
    expect(deps.trigger).toBeUndefined();
    expect(deps.userId).toBe(USER);
  });

  it("결과 records 를 state.marketRecords 에 더하고 truncated 를 OR 로 누적한다", async () => {
    getMarketTicksTextMock
      .mockResolvedValueOnce({ text: "a", records: 3, truncated: false, source: "grid" })
      .mockResolvedValueOnce({ text: "b", records: 5, truncated: true, source: "grid" })
      .mockResolvedValueOnce({ text: "c", records: 0, truncated: false, source: "none" });
    const state = { ...makeState(makeSupabase().client), deps: DEPS };
    await dispatchDiagnosisTool(toolUse("get_market_ticks", MT, "tu_1"), state);
    await dispatchDiagnosisTool(toolUse("get_market_ticks", MT, "tu_2"), state);
    expect(state.marketRecords).toBe(8);
    expect(state.truncated).toBe(true);
    await dispatchDiagnosisTool(toolUse("get_market_ticks", MT, "tu_3"), state);
    expect(state.marketRecords).toBe(8);
    expect(state.truncated).toBe(true);
  });
});
