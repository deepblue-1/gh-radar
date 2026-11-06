import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kstDateIso } from "@gh-radar/shared";

import {
  makeEndTurnFinalMessage,
  makeStreamMock,
  makeToolUseFinalMessage,
} from "../../__tests__/anthropic-mock";

/**
 * Phase 39 (39-05) — 주문 진단 전문가 루프. Opus 스트림은 `../anthropic-client` mock 으로 교체한다(실 API 0).
 *
 * 다중 라운드 팩토리는 이 파일 로컬 헬퍼다 — 공유 `anthropic-mock.ts` 는 import 만 하고 고치지 않는다
 * (chat-service · specialists 스위트가 같은 픽스처를 쓴다).
 */

const { streamMock } = vi.hoisted(() => ({ streamMock: vi.fn() }));

vi.mock("../anthropic-client", () => ({
  getChatAnthropicClient: () => ({ messages: { stream: streamMock } }),
  __resetChatClientForTests: () => {},
}));

import { logger } from "../../../logger";
import { SPECIALIST_UNAVAILABLE } from "../helpers";
import {
  consultDiagnosisSpecialist,
  DIAGNOSIS_CAP_TEXT,
  DIAGNOSIS_HARD_ABORT_GRACE_MS,
  DIAGNOSIS_MAX_ROUNDS,
  DIAGNOSIS_REFUSAL_TEXT,
  DIAGNOSIS_TIMEOUT_TEXT,
  DIAGNOSIS_USAGE_CHECK_FAILED_TEXT,
} from "../diagnosis/diagnosis-specialist";
import { STATE_TRANSITION_EMPTY_TEXT } from "../diagnosis/diagnosis-order-log";

// ── 로컬 테스트 헬퍼(다중 라운드) ─────────────────────────────────

function makeUsage(partial: Partial<Anthropic.Usage> = {}): Anthropic.Usage {
  return {
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    input_tokens: 0,
    output_tokens: 0,
    server_tool_use: null,
    service_tier: null,
    ...partial,
  };
}

/** progress-update thinking 블록 — Opus 5.5 는 기본 display omitted 라 thinking 이 빈 문자열이다. */
function makeThinkingBlock(): Anthropic.ThinkingBlock {
  return { type: "thinking", thinking: "", signature: "sig" };
}

function makeToolUseMessage(
  calls: Array<{ id: string; name: string; input: unknown }>,
  opts: { model?: string; thinking?: boolean; usage?: Partial<Anthropic.Usage> } = {},
): Anthropic.Message {
  const base = makeToolUseFinalMessage(calls);
  return {
    ...base,
    model: opts.model ?? "claude-opus-5-5",
    content: opts.thinking ? [makeThinkingBlock(), ...base.content] : base.content,
    usage: makeUsage(opts.usage),
  };
}

function makeEndTurnMessage(
  text: string,
  opts: { model?: string; usage?: Partial<Anthropic.Usage> } = {},
): Anthropic.Message {
  return { ...makeEndTurnFinalMessage(text), model: opts.model ?? "claude-opus-5-5", usage: makeUsage(opts.usage) };
}

function makeRefusalMessage(opts: { model?: string } = {}): Anthropic.Message {
  return { ...makeEndTurnFinalMessage(""), content: [], stop_reason: "refusal", model: opts.model ?? "claude-opus-5-5" };
}

type StreamSequence = ((params: unknown, opts?: { signal?: AbortSignal }) => ReturnType<typeof makeStreamMock>) & {
  /** 호출 시점 params 스냅숏(messages 는 루프가 push 하므로 깊은 복사로 남긴다). */
  calls: Array<Record<string, unknown>>;
  signals: Array<AbortSignal | undefined>;
};

/**
 * 호출될 때마다 다음 메시지를 스트림으로 내준다. 메시지가 떨어지면 throw(루프 과다 호출을 드러낸다).
 * `onCall(i)` 은 i 번째(0부터) 호출 직후 실행된다 — 가짜 시계를 밀어 「모델 응답이 오래 걸렸다」 를 흉내 낸다.
 */
function makeStreamSequence(
  messages: Anthropic.Message[],
  hooks: { onCall?: (index: number) => void } = {},
): StreamSequence {
  let i = 0;
  const fn = ((params: unknown, opts?: { signal?: AbortSignal }) => {
    fn.calls.push(structuredClone(params) as Record<string, unknown>);
    fn.signals.push(opts?.signal);
    hooks.onCall?.(i);
    const finalMessage = messages[i++];
    if (!finalMessage) throw new Error(`stream sequence exhausted at call ${i}`);
    return makeStreamMock({ textDeltas: [], finalMessage });
  }) as StreamSequence;
  fn.calls = [];
  fn.signals = [];
  return fn;
}

// ── supabase mock ────────────────────────────────────────────────

type RpcHandler = (params: Record<string, unknown>) => { data: unknown; error: unknown };

function makeSupabase(handlers: Record<string, RpcHandler>) {
  const rpc = vi.fn(async (fn: string, params: Record<string, unknown>) => {
    const h = handlers[fn];
    return h ? h(params) : { data: null, error: { message: `no handler ${fn}` } };
  });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const USER = "00000000-0000-4000-8000-000000003905";
const ISIN = "KR7282720005";
const DATE = "2026-11-05";
/** 2026-11-05 09:00:01.234 KST. */
const T0 = Date.parse("2026-11-05T00:00:01.234Z");

function makeEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gateway: "KB120",
    journal_epoch: "1",
    seq: 10,
    trade_date: DATE,
    gw_time_ms: T0,
    kind: 3,
    group: 1,
    exchange: "KRX",
    isin: ISIN,
    stock_code: "282720",
    stock_name: "금양그린파워",
    cum_volume: 152000,
    account_no: "12343901",
    order_no: "5001",
    price: 12300,
    qty: 10,
    order_condition: "",
    reason_code: "PreBuy A3 스윕호가변경(체결가==스윕감시가 && 변경횟수>=최소)",
    cond_threshold: 3,
    cond_actual: 4,
    cond_metric: 0,
    ev_kind: 0,
    ev_price: 0,
    ev_qty_before: 0,
    ev_qty_after: 0,
    ev_trade_qty: 0,
    limit_bid_qty: 0,
    bid1_price: 0,
    bid1_qty: 0,
    accept_latency_us: 0,
    immediate_fill_qty: 0,
    queue_case: 0,
    base_cum: 0,
    ahead_qty: 0,
    expected_cum: 0,
    error_volume: 0,
    remaining_volume: 0,
    has_remaining: false,
    cancel_reason: 0,
    result_code: 0,
    message: "",
    entry_round: 0,
    snap_qty: [],
    snap_cum: [],
    ask_qty_at_limit: 0,
    open_at_limit: false,
    ...over,
  };
}

function makeRpcData(events: Record<string, unknown>[] = [makeEvent()]) {
  return {
    access: true,
    date: DATE,
    isin: ISIN,
    orders: [
      {
        gateway: "KB120",
        account_no: "12343901",
        order_no: "5001",
        isin: ISIN,
        stock_code: "282720",
        stock_name: "금양그린파워",
        exchange: "KRX",
        board: "G1",
        side: "B",
        order_type: "지정가",
        org_order_no: null,
        qty: 10,
        price: 12300,
        filled_qty: 10,
        status: "filled",
        result_code: "0000",
        message: "정상처리",
        origin: "strategy",
        created_ms: T0 + 2,
        updated_ms: T0 + 50,
      },
    ],
    fills: [
      {
        gateway: "KB120",
        seq: 77,
        gw_time_ms: T0 + 40,
        account_no: "12343901",
        order_no: "5001",
        isin: ISIN,
        stock_code: "282720",
        exchange: "KRX",
        side: "B",
        exec_price: 12300,
        exec_qty: 10,
      },
    ],
    events,
  };
}

function toolResultText(msg: Anthropic.MessageParam | undefined): string {
  if (!msg || typeof msg.content === "string") return "";
  return msg.content
    .filter((b): b is Anthropic.ToolResultBlockParam => b.type === "tool_result")
    .map((b) => (typeof b.content === "string" ? b.content : ""))
    .join("\n");
}

function lastMessage(call: Record<string, unknown>): Anthropic.MessageParam {
  const msgs = call.messages as Anthropic.MessageParam[];
  return msgs[msgs.length - 1];
}

const QUESTION = "어제 금양그린파워 주문 왜 나갔어?";

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  delete process.env.CHAT_DIAGNOSIS_MODEL;
  delete process.env.CHAT_DIAGNOSIS_EFFORT;
  streamMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("consultDiagnosisSpecialist — 한 경로 끝까지(Task 1)", () => {
  function runOnePath(rpcData: unknown = makeRpcData(), toolInput: unknown = { date: DATE, isin: ISIN }) {
    const seq = makeStreamSequence([
      makeToolUseMessage([{ id: "tu_1", name: "get_order_log", input: toolInput }], { thinking: true }),
      makeEndTurnMessage("진단문 원문"),
    ]);
    streamMock.mockImplementation(seq);
    const sb = makeSupabase({
      dma_diagnosis_for_user: () => ({ data: rpcData, error: null }),
      incr_api_usage: () => ({ data: 1, error: null }),
    });
    return { seq, sb };
  }

  it("tool_use get_order_log → end_turn 이면 진단문 원문을 text · display 로, Opus usage 1개를 돌려준다", async () => {
    const { sb } = runOnePath();
    const out = await consultDiagnosisSpecialist(sb.client, { question: QUESTION }, { userId: USER });

    expect(out.text).toBe("진단문 원문");
    expect(out.display).toBe("진단문 원문");
    expect(out.usage).toHaveLength(1);
    expect(out.usage[0].model).toBe("claude-opus-5-5");
  });

  it("주문로그 RPC 는 정확히 1회 · 인자는 p_user_id = ctx.userId · 날짜 · ISIN 3개", async () => {
    const { sb } = runOnePath();
    await consultDiagnosisSpecialist(sb.client, { question: QUESTION }, { userId: USER });

    const calls = sb.rpc.mock.calls.filter(([fn]) => fn === "dma_diagnosis_for_user");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      "dma_diagnosis_for_user",
      { p_user_id: USER, p_trade_date: DATE, p_isin: ISIN },
    ]);
  });

  it("둘째 스트림 호출의 마지막 user 메시지 tool_result 에 4절 · 미적재 문구 · 발주 사유 원문이 있다", async () => {
    const { seq, sb } = runOnePath();
    await consultDiagnosisSpecialist(sb.client, { question: QUESTION }, { userId: USER });

    expect(seq.calls).toHaveLength(2);
    const last = lastMessage(seq.calls[1]);
    expect(last.role).toBe("user");
    const text = toolResultText(last);
    for (const s of ["[주문]", "[체결]", "[전략 이벤트]", "[상태전이]", STATE_TRANSITION_EMPTY_TEXT]) {
      expect(text).toContain(s);
    }
    expect(text).toContain('사유="PreBuy A3 스윕호가변경(체결가==스윕감시가 && 변경횟수>=최소)" 임계=3');
    // 계좌번호 전체는 싣지 않는다(끝 4자리).
    expect(text).not.toContain("12343901");
    expect(text).toContain("…3901");
  });

  it("요청 모양 — Opus · effort medium · thinking/temperature/tool_choice 없음 · 캐시 · append-only", async () => {
    const { seq, sb } = runOnePath();
    await consultDiagnosisSpecialist(sb.client, { question: QUESTION }, { userId: USER });

    const first = seq.calls[0];
    expect(first.model).toBe("claude-opus-5-5");
    expect((first.output_config as { effort: string }).effort).toBe("medium");
    expect("thinking" in first).toBe(false);
    expect("temperature" in first).toBe(false);
    expect("tool_choice" in first).toBe(false);
    const system = first.system as Anthropic.TextBlockParam[];
    expect(system[0].cache_control?.type).toBe("ephemeral");
    const tools = first.tools as Anthropic.Tool[];
    expect(tools[tools.length - 1].cache_control?.type).toBe("ephemeral");

    // 둘째 호출 — 첫 응답 content(thinking 블록 포함)가 그대로 assistant 로 들어 있다.
    const msgs = seq.calls[1].messages as Anthropic.MessageParam[];
    expect(msgs[0]).toEqual({ role: "user", content: QUESTION });
    expect(msgs[1].role).toBe("assistant");
    const content = msgs[1].content as Anthropic.ContentBlockParam[];
    expect(content[0]).toEqual({ type: "thinking", thinking: "", signature: "sig" });
    expect(content[1]).toMatchObject({ type: "tool_use", id: "tu_1", name: "get_order_log" });
    expect("tool_choice" in seq.calls[1]).toBe(false);
    // 둘째 호출도 tools 는 첫 호출과 같다(prefix 불변).
    expect(seq.calls[1].tools).toEqual(first.tools);
  });

  it("date 생략 → 오늘(KST) · kind 9 행이 있으면 상태전이 절에 그 줄이 나오고 미적재 문구는 없다", async () => {
    const kind9 = makeEvent({
      seq: 11,
      kind: 9,
      gw_time_ms: T0 + 100,
      order_no: "",
      reason_code: "CfgSubmit",
      order_condition: "milles",
      cond_threshold: 0,
      cond_actual: 0,
    });
    const { seq, sb } = runOnePath(makeRpcData([makeEvent(), kind9]), { isin: ISIN });
    const before = new Date();
    await consultDiagnosisSpecialist(sb.client, { question: QUESTION }, { userId: USER });

    const call = sb.rpc.mock.calls.find(([fn]) => fn === "dma_diagnosis_for_user");
    expect(call?.[1]).toMatchObject({ p_trade_date: kstDateIso(before), p_isin: ISIN });

    const text = toolResultText(lastMessage(seq.calls[1]));
    const stateSection = text.slice(text.indexOf("[상태전이]"));
    expect(stateSection).toContain("[상태전이]");
    expect(stateSection.split("\n")[1]).toContain("상태전이");
    expect(stateSection).toContain('사유="CfgSubmit"');
    expect(text).not.toContain(STATE_TRANSITION_EMPTY_TEXT);
  });
});

// ── Task 2 — 루프 가드 · 비용 상한 · usage 로그 ──────────────────

const SKIP_TEXT = "상한 도달 — 실행 안 함";
const FINISH_TEXT = "더 이상 조회할 수 없습니다. 지금까지 자료로 답하세요.";

function okSupabase(usage: { global?: number; user?: number } = {}) {
  return makeSupabase({
    dma_diagnosis_for_user: () => ({ data: makeRpcData(), error: null }),
    incr_api_usage: (p) => ({
      data: p.p_service === "chat_diagnosis" ? (usage.global ?? 1) : (usage.user ?? 1),
      error: null,
    }),
  });
}

function orderLogCall(id: string) {
  return { id, name: "get_order_log", input: { date: DATE, isin: ISIN } };
}

/** logger 스파이에서 메시지가 msg 인 호출의 첫 인자(객체)를 찾는다. */
function logged(spy: { mock: { calls: unknown[][] } }, msg: string): Record<string, unknown> | undefined {
  const call = spy.mock.calls.find((c) => c[1] === msg);
  return call?.[0] as Record<string, unknown> | undefined;
}

describe("consultDiagnosisSpecialist — 루프 가드(Task 2)", () => {
  it(`${DIAGNOSIS_MAX_ROUNDS}라운드 연속 tool_use → ${DIAGNOSIS_MAX_ROUNDS}번째 호출은 tools 그대로 · tool_choice none 마무리 콜`, async () => {
    const msgs: Anthropic.Message[] = [];
    for (let r = 1; r < DIAGNOSIS_MAX_ROUNDS; r++) msgs.push(makeToolUseMessage([orderLogCall(`tu_${r}`)], { thinking: true }));
    msgs.push(makeEndTurnMessage("마무리 진단"));
    const seq = makeStreamSequence(msgs);
    streamMock.mockImplementation(seq);

    const out = await consultDiagnosisSpecialist(okSupabase().client, { question: QUESTION }, { userId: USER });

    expect(out.text).toBe("마무리 진단");
    expect(seq.calls).toHaveLength(DIAGNOSIS_MAX_ROUNDS);
    for (let i = 0; i < DIAGNOSIS_MAX_ROUNDS - 1; i++) expect("tool_choice" in seq.calls[i]).toBe(false);
    const finish = seq.calls[DIAGNOSIS_MAX_ROUNDS - 1];
    expect(finish.tool_choice).toEqual({ type: "none" });
    expect(finish.tools).toEqual(seq.calls[0].tools);
    expect(finish.system).toEqual(seq.calls[0].system);

    const last = lastMessage(finish);
    const blocks = last.content as Anthropic.ContentBlockParam[];
    expect(blocks[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: `tu_${DIAGNOSIS_MAX_ROUNDS - 1}`,
      content: SKIP_TEXT,
    });
    expect(blocks[blocks.length - 1]).toMatchObject({ type: "text", text: FINISH_TEXT });
  });

  it("마감(150초) 경과 → 다음 호출이 마무리 콜 · 그 라운드 도구는 실행하지 않는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T01:00:00Z"));
    const seq = makeStreamSequence(
      [makeToolUseMessage([orderLogCall("tu_1")]), makeEndTurnMessage("마감 진단")],
      { onCall: (i) => i === 0 && vi.setSystemTime(Date.now() + 151_000) },
    );
    streamMock.mockImplementation(seq);
    const sb = okSupabase();

    const out = await consultDiagnosisSpecialist(sb.client, { question: QUESTION }, { userId: USER });

    expect(out.text).toBe("마감 진단");
    expect(seq.calls).toHaveLength(2);
    expect(seq.calls[1].tool_choice).toEqual({ type: "none" });
    expect(toolResultText(lastMessage(seq.calls[1]))).toBe(SKIP_TEXT);
    expect(sb.rpc.mock.calls.filter(([fn]) => fn === "dma_diagnosis_for_user")).toHaveLength(0);
  });

  it("누적 입력(input + cache_read + cache_creation)이 600,000 을 넘으면 마무리 콜", async () => {
    const seq = makeStreamSequence([
      makeToolUseMessage([orderLogCall("tu_1")], {
        usage: { input_tokens: 400_000, cache_read_input_tokens: 150_000, cache_creation_input_tokens: 50_001 },
      }),
      makeEndTurnMessage("가드 진단"),
    ]);
    streamMock.mockImplementation(seq);

    const out = await consultDiagnosisSpecialist(okSupabase().client, { question: QUESTION }, { userId: USER });

    expect(out.text).toBe("가드 진단");
    expect(seq.calls[1].tool_choice).toEqual({ type: "none" });
    expect(out.usage[0]).toMatchObject({
      inputTokens: 400_000,
      cacheReadInputTokens: 150_000,
      cacheCreationInputTokens: 50_001,
    });
  });

  it("마감 + 30초 강제 중단 → DIAGNOSIS_TIMEOUT_TEXT + warn 로그", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(logger, "warn");
    streamMock.mockImplementation((_params: unknown, opts?: { signal?: AbortSignal }) => ({
      async *[Symbol.asyncIterator]() {},
      finalMessage: () =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("Request was aborted."), { name: "AbortError" })),
          );
        }),
    }));

    const p = consultDiagnosisSpecialist(okSupabase().client, { question: QUESTION }, { userId: USER });
    await vi.advanceTimersByTimeAsync(150_000 + DIAGNOSIS_HARD_ABORT_GRACE_MS + 1);
    const out = await p;

    expect(out.text).toBe(DIAGNOSIS_TIMEOUT_TEXT);
    expect(out.display).toBeUndefined();
    expect(warn.mock.calls.some((c) => String(c[1]).includes("diagnosis"))).toBe(true);
  });

  it("stop_reason refusal → warn(stopReason · usage · 상세) + DIAGNOSIS_REFUSAL_TEXT · 추가 호출 0(대체 모델 없음)", async () => {
    const warn = vi.spyOn(logger, "warn");
    const refusal = { ...makeRefusalMessage(), stop_details: { type: "refusal", category: "cyber" } } as Anthropic.Message;
    const seq = makeStreamSequence([refusal]);
    streamMock.mockImplementation(seq);

    const out = await consultDiagnosisSpecialist(okSupabase().client, { question: QUESTION }, { userId: USER });

    expect(out.text).toBe(DIAGNOSIS_REFUSAL_TEXT);
    expect(out.display).toBeUndefined();
    expect(seq.calls).toHaveLength(1);
    expect("fallbacks" in seq.calls[0]).toBe(false);
    const obj = warn.mock.calls.map((c) => c[0] as Record<string, unknown>).find((o) => o?.stopReason === "refusal");
    expect(obj).toBeDefined();
    expect(obj).toHaveProperty("usage");
    expect(obj?.stopDetails).toEqual({ type: "refusal", category: "cyber" });
  });

  it("end_turn 인데 text 가 비었으면 warn(stopReason · usage) + SPECIALIST_UNAVAILABLE", async () => {
    const warn = vi.spyOn(logger, "warn");
    streamMock.mockImplementation(makeStreamSequence([makeEndTurnMessage("   ")]));

    const out = await consultDiagnosisSpecialist(okSupabase().client, { question: QUESTION }, { userId: USER });

    expect(out.text).toBe(SPECIALIST_UNAVAILABLE);
    const obj = warn.mock.calls.map((c) => c[0] as Record<string, unknown>).find((o) => o?.stopReason === "end_turn");
    expect(obj).toHaveProperty("usage");
  });

  it("stop_reason max_tokens → warn(stopReason · usage) + SPECIALIST_UNAVAILABLE", async () => {
    const warn = vi.spyOn(logger, "warn");
    const cut = { ...makeEndTurnMessage("잘린 진단"), stop_reason: "max_tokens" } as Anthropic.Message;
    streamMock.mockImplementation(makeStreamSequence([cut]));

    const out = await consultDiagnosisSpecialist(okSupabase().client, { question: QUESTION }, { userId: USER });

    expect(out.text).toBe(SPECIALIST_UNAVAILABLE);
    const obj = warn.mock.calls.map((c) => c[0] as Record<string, unknown>).find((o) => o?.stopReason === "max_tokens");
    expect(obj).toHaveProperty("usage");
  });
});

describe("consultDiagnosisSpecialist — 하루 상한 · usage 로그(Task 2)", () => {
  it("전역 사용량 201 → DIAGNOSIS_CAP_TEXT · 스트림 0 · [chat] diagnosis capped(scope global)", async () => {
    const info = vi.spyOn(logger, "info");
    const sb = okSupabase({ global: 201 });

    const out = await consultDiagnosisSpecialist(sb.client, { question: QUESTION }, { userId: USER });

    expect(out).toEqual({ text: DIAGNOSIS_CAP_TEXT, usage: [] });
    expect(streamMock).not.toHaveBeenCalled();
    expect(logged(info, "[chat] diagnosis capped")).toMatchObject({ scope: "global" });
    const incr = sb.rpc.mock.calls.filter(([fn]) => fn === "incr_api_usage").map(([, p]) => p);
    const today = kstDateIso(new Date());
    expect(incr).toEqual(
      expect.arrayContaining([
        { p_service: "chat_diagnosis", p_date: today, p_amount: 1 },
        { p_service: `chat_diagnosis:${USER}`, p_date: today, p_amount: 1 },
      ]),
    );
  });

  it("사용자 사용량 21 → DIAGNOSIS_CAP_TEXT · 스트림 0 · scope user", async () => {
    const info = vi.spyOn(logger, "info");

    const out = await consultDiagnosisSpecialist(okSupabase({ user: 21 }).client, { question: QUESTION }, { userId: USER });

    expect(out.text).toBe(DIAGNOSIS_CAP_TEXT);
    expect(streamMock).not.toHaveBeenCalled();
    expect(logged(info, "[chat] diagnosis capped")).toMatchObject({ scope: "user" });
  });

  it("사용량 RPC 오류 → DIAGNOSIS_USAGE_CHECK_FAILED_TEXT · 스트림 0 · warn(fail-closed)", async () => {
    const warn = vi.spyOn(logger, "warn");
    const sb = makeSupabase({
      incr_api_usage: () => ({ data: null, error: { message: "db down" } }),
    });

    const out = await consultDiagnosisSpecialist(sb.client, { question: QUESTION }, { userId: USER });

    expect(out.text).toBe(DIAGNOSIS_USAGE_CHECK_FAILED_TEXT);
    expect(streamMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("정상 종료 → [chat] diagnosis usage 1줄(rounds · toolCalls · durationMs · stopReason · models · marketRecords · truncated)", async () => {
    const info = vi.spyOn(logger, "info");
    streamMock.mockImplementation(
      makeStreamSequence([
        makeToolUseMessage([orderLogCall("tu_1")], { usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 900 } }),
        makeEndTurnMessage("진단문 원문", { usage: { input_tokens: 300, output_tokens: 700, cache_read_input_tokens: 1900 } }),
      ]),
    );

    await consultDiagnosisSpecialist(okSupabase().client, { question: QUESTION }, { userId: USER });

    const usageLogs = info.mock.calls.filter((c) => c[1] === "[chat] diagnosis usage");
    expect(usageLogs).toHaveLength(1);
    const obj = usageLogs[0][0] as Record<string, unknown>;
    expect(obj).toMatchObject({
      rounds: 2,
      toolCalls: { get_order_log: 1 },
      stopReason: "end_turn",
      marketRecords: 0,
      truncated: false,
    });
    expect(typeof obj.durationMs).toBe("number");
    expect((obj.models as Record<string, unknown>)["claude-opus-5-5"]).toEqual({
      inputTokens: 1300,
      outputTokens: 900,
      cacheReadInputTokens: 1900,
      cacheCreationInputTokens: 900,
    });
  });
});
