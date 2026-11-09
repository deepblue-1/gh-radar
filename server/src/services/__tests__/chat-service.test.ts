import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { SPECIALIST_TOOL_NAMES, SPECIALIST_LABELS } from "@gh-radar/shared";
import {
  makeStreamMock,
  makeToolUseFinalMessage,
  makeEndTurnFinalMessage,
} from "./anthropic-mock";

/**
 * Phase 14 Plan 06 — chat-service (팀장 tool-use 루프) 유닛 테스트 (CHAT-01).
 *
 * 검증 핵심 (ww-bot chat-service.ts 이식 + gh-radar 전문가 tool 배선):
 *   1) sanitizeMessages — 고아 tool_result 제거 + 연속 role 병합
 *   2) pruneHistory — 슬라이딩 윈도우 + 첫 메시지 user 보장
 *   3) isRetryableError — overloaded/rate_limit/429/529 만 true
 *   4) handleChatStream end_turn → text SSE + response_complete + user/assistant 저장
 *   5) handleChatStream tool_use(2) → agent_start×2 병렬 + runSpecialist×2 + tool_result 후 재호출
 *   6) 새 요청이 interruptController.abort 로 이전 스트림 abort (D-06)
 *   7) extractStockRefs 감지 종목 → stock_quotes 조회 → stock_card SSE (D-07)
 *
 * lead Anthropic client(`./specialists/anthropic-client`)와 runSpecialist(orchestrator),
 * chat-history 를 mock — dispatch/SSE/저장 배선만 검증한다.
 */

const { streamMock, runSpecialistMock, loadConversationMock, createConversationMock, appendMessageMock } =
  vi.hoisted(() => ({
    streamMock: vi.fn(),
    runSpecialistMock: vi.fn(),
    loadConversationMock: vi.fn(),
    createConversationMock: vi.fn(),
    appendMessageMock: vi.fn(),
  }));

vi.mock("../specialists/anthropic-client", () => ({
  getChatAnthropicClient: () => ({ messages: { stream: streamMock } }),
  __resetChatClientForTests: () => {},
}));

vi.mock("../chat-orchestrator", async (importActual) => {
  const actual = await importActual<typeof import("../chat-orchestrator")>();
  return { ...actual, runSpecialist: runSpecialistMock };
});

vi.mock("../chat-history", () => ({
  loadConversation: loadConversationMock,
  createConversation: createConversationMock,
  appendMessage: appendMessageMock,
}));

// mock 이후 import
import { logger } from "../../logger";
import {
  handleChatStream,
  sanitizeMessages,
  pruneHistory,
  isRetryableError,
  __resetChatSessionsForTests,
  DIAGNOSIS_RELAY_HEADER,
} from "../chat-service";

// --- test helpers ---

interface SSEEvent {
  event: string;
  data: unknown;
}

/** res.write 스파이 — SSE chunk 를 누적 파싱한다. */
function makeResSpy(): { res: Response; events: () => SSEEvent[] } {
  const chunks: string[] = [];
  const res = {
    writableEnded: false,
    write: vi.fn((c: string) => {
      chunks.push(c);
      return true;
    }),
    end: vi.fn(),
  } as unknown as Response;
  const events = (): SSEEvent[] => {
    const raw = chunks.join("");
    const out: SSEEvent[] = [];
    for (const block of raw.split("\n\n")) {
      const m = block.match(/^event: (.+)\ndata: (.*)$/s);
      if (m) out.push({ event: m[1], data: JSON.parse(m[2]) });
    }
    return out;
  };
  return { res, events };
}

/** stock_quotes / stocks 만 지원하는 최소 supabase mock (Test 7). */
function makeSupabase(seed: {
  stocks?: Record<string, unknown>[];
  quotes?: Record<string, unknown>[];
}): SupabaseClient {
  const datasetFor = (t: string): Record<string, unknown>[] =>
    t === "stocks" ? seed.stocks ?? [] : t === "stock_quotes" ? seed.quotes ?? [] : [];
  const makeBuilder = (table: string) => {
    let filtered = [...datasetFor(table)];
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      eq: vi.fn((col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] === val);
        return b;
      }),
      maybeSingle: vi.fn(async () => ({ data: filtered[0] ?? null, error: null })),
    };
    return b;
  };
  return { from: vi.fn((t: string) => makeBuilder(t)) } as unknown as SupabaseClient;
}

const um = (content: string): Anthropic.MessageParam => ({ role: "user", content });
const am = (content: string): Anthropic.MessageParam => ({ role: "assistant", content });

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  __resetChatSessionsForTests();
  streamMock.mockReset();
  runSpecialistMock.mockReset().mockResolvedValue({ text: "전문가 의견" });
  loadConversationMock.mockReset().mockResolvedValue({ conversation: {}, messages: [] });
  createConversationMock.mockReset().mockResolvedValue({ id: "conv-new" });
  appendMessageMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// 1) sanitizeMessages
// ============================================================
describe("sanitizeMessages", () => {
  it("Test 1: 고아 tool_result 제거 + 연속 user role 병합", () => {
    const msgs: Anthropic.MessageParam[] = [
      // 선행 tool_use 없는 고아 tool_result → 제거
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "orphan", content: "x" }],
      },
      um("첫 질문"),
      um("연속 user"),
      am("답변"),
    ];
    sanitizeMessages(msgs);
    // 고아 제거 후 연속 user 하나로 병합 → user, assistant
    expect(msgs.every((m) => !(Array.isArray(m.content) && m.content.some((b) => (b as { type?: string }).type === "tool_result")))).toBe(true);
    // 첫 메시지는 user
    expect(msgs[0].role).toBe("user");
    // 연속 user 제거로 user 하나만 남고 assistant 로 교차
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
  });
});

// ============================================================
// 2) pruneHistory
// ============================================================
describe("pruneHistory", () => {
  it("Test 2: max 초과 시 최근 max 개만 유지 + 첫 메시지 user 보장", () => {
    const msgs: Anthropic.MessageParam[] = [
      um("u1"),
      am("a1"),
      um("u2"),
      am("a2"),
      um("u3"),
      am("a3"),
    ];
    const pruned = pruneHistory(msgs, 3);
    expect(pruned.length).toBeLessThanOrEqual(4); // 첫 user 보장 위해 앞으로 밀 수 있음
    expect(pruned[0].role).toBe("user");
    // 마지막은 유지
    expect(pruned[pruned.length - 1]).toEqual(am("a3"));
  });

  it("Test 2b: max 이하면 그대로", () => {
    const msgs: Anthropic.MessageParam[] = [um("u1"), am("a1")];
    expect(pruneHistory(msgs, 30)).toEqual(msgs);
  });
});

// ============================================================
// 3) isRetryableError
// ============================================================
describe("isRetryableError", () => {
  it("Test 3: overloaded_error / rate_limit_error / 429 / 529 만 true", () => {
    expect(isRetryableError({ error: { type: "overloaded_error" } })).toBe(true);
    expect(isRetryableError({ error: { type: "rate_limit_error" } })).toBe(true);
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 529 })).toBe(true);
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError(new Error("boom"))).toBe(false);
  });
});

// ============================================================
// 4) handleChatStream — end_turn
// ============================================================
describe("handleChatStream (end_turn)", () => {
  it("Test 4: text SSE + response_complete + user/assistant appendMessage", async () => {
    streamMock.mockReturnValueOnce(
      makeStreamMock({
        textDeltas: ["안녕", "하세요"],
        finalMessage: makeEndTurnFinalMessage("안녕하세요"),
      }),
    );
    const { res, events } = makeResSpy();
    const sb = makeSupabase({});
    const ac = new AbortController();

    await handleChatStream(res, sb, ac.signal, {
      userId: "u1",
      message: "질문",
    });

    const evs = events();
    expect(evs.find((e) => e.event === "session")).toBeDefined();
    const textEvs = evs.filter((e) => e.event === "text");
    expect(textEvs.map((e) => (e.data as { text: string }).text).join("")).toBe("안녕하세요");
    expect(evs.find((e) => e.event === "response_complete")).toBeDefined();

    // 새 대화 생성 후 user + assistant 저장
    expect(createConversationMock).toHaveBeenCalledTimes(1);
    expect(appendMessageMock).toHaveBeenCalledTimes(2);
    expect(appendMessageMock.mock.calls[0][2]).toMatchObject({ role: "user", content: "질문" });
    expect(appendMessageMock.mock.calls[1][2]).toMatchObject({ role: "assistant", content: "안녕하세요" });
  });
});

// ============================================================
// 5) handleChatStream — tool_use (병렬 전문가)
// ============================================================
describe("handleChatStream (tool_use 루프)", () => {
  it("Test 5: tool_use 2개 → agent_start×2 병렬 + runSpecialist×2 + 재호출 후 end_turn", async () => {
    streamMock
      .mockReturnValueOnce(
        makeStreamMock({
          textDeltas: [],
          finalMessage: makeToolUseFinalMessage([
            { id: "t1", name: SPECIALIST_TOOL_NAMES.quote, input: { code: "005930", question: "시세?" } },
            { id: "t2", name: SPECIALIST_TOOL_NAMES.theme, input: { question: "테마?" } },
          ]),
        }),
      )
      .mockReturnValueOnce(
        makeStreamMock({
          textDeltas: ["종합 답변"],
          finalMessage: makeEndTurnFinalMessage("종합 답변"),
        }),
      );

    runSpecialistMock
      .mockResolvedValueOnce({ text: "시세 의견" })
      .mockResolvedValueOnce({ text: "테마 의견" });

    const { res, events } = makeResSpy();
    const sb = makeSupabase({});
    const ac = new AbortController();

    await handleChatStream(res, sb, ac.signal, { userId: "u1", message: "분석해줘" });

    // 두 전문가 dispatch
    expect(runSpecialistMock).toHaveBeenCalledTimes(2);
    // 팀장 재호출 (tool_result 붙은 2번째 stream)
    expect(streamMock).toHaveBeenCalledTimes(2);

    const evs = events();
    const starts = evs.filter((e) => e.event === "agent_start");
    const ends = evs.filter((e) => e.event === "agent_end");
    expect(starts).toHaveLength(2);
    expect(ends).toHaveLength(2);
    // 라벨 매핑 (SPECIALIST_LABELS)
    const startAgents = starts.map((e) => (e.data as { agent: string }).agent).sort();
    expect(startAgents).toEqual(["quote", "theme"]);
    const quoteStart = starts.find((e) => (e.data as { agent: string }).agent === "quote");
    expect((quoteStart!.data as { label: string }).label).toBe(SPECIALIST_LABELS.quote);
  });
});

// ============================================================
// 6) interrupt (D-06)
// ============================================================
describe("handleChatStream (interrupt D-06)", () => {
  it("Test 6: 새 요청이 이전 요청의 Claude 스트림 signal 을 abort", async () => {
    const capturedSignals: (AbortSignal | undefined)[] = [];
    let releaseGate!: () => void;
    const gate = new Promise<void>((r) => {
      releaseGate = r;
    });
    const call1Stream = {
      async *[Symbol.asyncIterator]() {
        await gate;
      },
      finalMessage: async () => makeEndTurnFinalMessage("call1"),
    };
    const call2Stream = makeStreamMock({
      textDeltas: [],
      finalMessage: makeEndTurnFinalMessage("call2"),
    });
    const queue = [call1Stream, call2Stream];
    streamMock.mockImplementation((_params: unknown, opts?: { signal?: AbortSignal }) => {
      capturedSignals.push(opts?.signal);
      return queue.shift();
    });

    const { res: res1 } = makeResSpy();
    const { res: res2 } = makeResSpy();
    const sb = makeSupabase({});
    const ac1 = new AbortController();
    const ac2 = new AbortController();

    const p1 = handleChatStream(res1, sb, ac1.signal, {
      userId: "u1",
      conversationId: "c-shared",
      message: "first",
    });
    // call1 이 stream() 호출까지 진행 (gate 에서 대기) → signal1 캡처
    await flush();
    expect(capturedSignals.length).toBe(1);
    const signal1 = capturedSignals[0]!;
    expect(signal1.aborted).toBe(false);

    // 두번째 요청 → 동기 top 에서 이전 interruptController.abort() → signal1 aborted
    const p2 = handleChatStream(res2, sb, ac2.signal, {
      userId: "u1",
      conversationId: "c-shared",
      message: "second",
    });
    expect(signal1.aborted).toBe(true);

    releaseGate();
    await Promise.all([p1, p2]);
  });
});

// ============================================================
// 6b) 동시 생성 직렬화 (WR-07)
// ============================================================
describe("handleChatStream (동시 생성 직렬화 WR-07)", () => {
  it("Test 6b: 새 요청은 이전 요청의 히스토리 저장 완료 후에 복원을 시작한다", async () => {
    const order: string[] = [];
    let releaseAppend!: () => void;
    const appendGate = new Promise<void>((r) => {
      releaseAppend = r;
    });
    appendMessageMock.mockImplementation(
      async (_sb: unknown, _id: unknown, msg: { role: string }) => {
        order.push(`append:${msg.role}`);
        await appendGate;
      },
    );
    loadConversationMock.mockImplementation(async () => {
      order.push("load");
      return { conversation: {}, messages: [] };
    });
    streamMock.mockImplementation(() =>
      makeStreamMock({ textDeltas: ["답"], finalMessage: makeEndTurnFinalMessage("답") }),
    );

    const { res: res1 } = makeResSpy();
    const { res: res2 } = makeResSpy();
    const sb = makeSupabase({});
    const ac1 = new AbortController();
    const ac2 = new AbortController();

    const p1 = handleChatStream(res1, sb, ac1.signal, {
      userId: "u1",
      conversationId: "c1",
      message: "first",
    });
    await flush();
    // req1 이 user append(gate)에서 대기 중. 시트 닫힘(clientAbort) — 생성은 계속(D-06).
    ac1.abort();

    const p2 = handleChatStream(res2, sb, ac2.signal, {
      userId: "u1",
      conversationId: "c1",
      message: "second",
    });
    await flush();
    // req2 의 복원(load)은 req1 저장 완료 전에 시작되지 않는다 — load 는 req1 것 1개뿐.
    expect(order.filter((o) => o === "load")).toHaveLength(1);

    releaseAppend();
    await Promise.all([p1, p2]);

    // req1 의 user/assistant 저장이 모두 끝난 뒤에야 req2 의 load 가 실행된다.
    expect(order).toEqual([
      "load",
      "append:user",
      "append:assistant",
      "load",
      "append:user",
      "append:assistant",
    ]);
  });
});

// ============================================================
// 7) stock_card (D-07)
// ============================================================
describe("handleChatStream (stock_card D-07)", () => {
  it("Test 7: 답변 텍스트의 종목 참조 → stock_quotes 조회 → stock_card SSE", async () => {
    streamMock.mockReturnValueOnce(
      makeStreamMock({
        textDeltas: ["삼성전자(005930) 강세입니다."],
        finalMessage: makeEndTurnFinalMessage("삼성전자(005930) 강세입니다."),
      }),
    );
    const { res, events } = makeResSpy();
    const sb = makeSupabase({
      stocks: [{ code: "005930", name: "삼성전자" }],
      quotes: [{ code: "005930", price: 71000, change_rate: 4.5 }],
    });
    const ac = new AbortController();

    await handleChatStream(res, sb, ac.signal, { userId: "u1", message: "삼성 어때?" });

    const card = events().find((e) => e.event === "stock_card");
    expect(card).toBeDefined();
    expect(card!.data).toMatchObject({ code: "005930", name: "삼성전자", price: 71000, changeRate: 4.5 });

    // assistant 메시지 blocks 에 stock_card 저장
    const assistantCall = appendMessageMock.mock.calls.find((c) => c[2].role === "assistant");
    expect(assistantCall![2].blocks).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "stock_card", code: "005930" })]),
    );
  });
});

// ============================================================
// 8) 주문 진단 — 진단문 화면 직접 전달 (Phase 39 D-01 · D-02 · D-03 · SC-2)
// ============================================================
describe("handleChatStream (주문 진단 D-01)", () => {
  /** 진단 전문가가 돌려주는 진단문 — 시각 ms · 수량 · 조건 문구가 글자 그대로 남아야 한다. */
  const D = [
    "13:10:30.385 선매수 5,940주 — 사유 PreBuy A3 스윕호가변경",
    "- 직전 A3 13:10:30.212 체결량 160,463주 · 단일가 아님(bs 공백 b_)",
    "- 조건: 스윕 임계 150,000주 초과 → 발주",
  ].join("\n");
  const HEAD = "확인해 볼게요.";
  const TAIL = "더 궁금한 점 있으면 물어 주세요.";
  const DEPS = { tickgw: undefined, tickConvertTrigger: undefined, tickRequestDailyCap: 7 };

  function diagnosisRound1() {
    return makeStreamMock({
      textDeltas: [HEAD],
      finalMessage: {
        ...makeToolUseFinalMessage([]),
        content: [
          { type: "text", text: HEAD, citations: null },
          {
            type: "tool_use",
            id: "td1",
            name: SPECIALIST_TOOL_NAMES.diagnosis,
            input: { question: "선매수 왜 나갔어?" },
          },
        ],
      } as Anthropic.Message,
    });
  }

  const textOf = (evs: SSEEvent[]) =>
    evs
      .filter((e) => e.event === "text")
      .map((e) => (e.data as { text: string }).text)
      .join("");

  /** 팀장 루프는 같은 messages 배열을 계속 민다(호출 뒤 assistant 가 붙는다) — tool_result user 메시지를 찾아 읽는다. */
  const toolResultsSent = (): Anthropic.ToolResultBlockParam[] => {
    const params = streamMock.mock.calls[1][0] as { messages: Anthropic.MessageParam[] };
    const msg = params.messages.find(
      (m) =>
        m.role === "user" &&
        Array.isArray(m.content) &&
        (m.content[0] as { type?: string })?.type === "tool_result",
    );
    return msg!.content as Anthropic.ToolResultBlockParam[];
  };

  const assistantContent = () =>
    appendMessageMock.mock.calls.find((c) => c[2].role === "assistant")![2].content as string;

  it("SSE 순서: 머리말 → agent_start(diagnosis) → 진단문 그대로 → agent_end → 꼬리말 · 저장 content = 화면 글자", async () => {
    streamMock
      .mockReturnValueOnce(diagnosisRound1())
      .mockReturnValueOnce(
        makeStreamMock({ textDeltas: [TAIL], finalMessage: makeEndTurnFinalMessage(TAIL) }),
      );
    runSpecialistMock.mockResolvedValueOnce({ text: D, display: D, usage: [] });

    const { res, events } = makeResSpy();
    await handleChatStream(res, makeSupabase({}), new AbortController().signal, {
      userId: "user-1",
      message: "선매수 왜 나갔어?",
      diagnosisDeps: DEPS,
    });

    const evs = events();
    const seq = evs
      .filter((e) => ["text", "agent_start", "agent_end"].includes(e.event))
      .map((e) => (e.event === "text" ? `text:${(e.data as { text: string }).text}` : e.event));
    expect(seq).toEqual([
      `text:${HEAD}`,
      "agent_start",
      `text:\n\n${D}\n\n`,
      "agent_end",
      `text:${TAIL}`,
    ]);
    expect(evs.find((e) => e.event === "agent_start")!.data).toEqual({
      agent: "diagnosis",
      label: "주문 진단 전문가",
    });
    expect(evs.find((e) => e.event === "agent_end")!.data).toEqual({ agent: "diagnosis" });

    expect(assistantContent()).toBe(textOf(evs));
    expect(assistantContent()).toContain(D);
  });

  it("2라운드 tool_result content 는 DIAGNOSIS_RELAY_HEADER 로 시작하고 진단문 원문을 담는다", async () => {
    streamMock
      .mockReturnValueOnce(diagnosisRound1())
      .mockReturnValueOnce(
        makeStreamMock({ textDeltas: [TAIL], finalMessage: makeEndTurnFinalMessage(TAIL) }),
      );
    runSpecialistMock.mockResolvedValueOnce({ text: D, display: D, usage: [] });

    const { res } = makeResSpy();
    await handleChatStream(res, makeSupabase({}), new AbortController().signal, {
      userId: "user-1",
      message: "선매수 왜 나갔어?",
      diagnosisDeps: DEPS,
    });

    const tr = toolResultsSent()[0];
    expect(tr.tool_use_id).toBe("td1");
    expect(typeof tr.content).toBe("string");
    expect((tr.content as string).startsWith(DIAGNOSIS_RELAY_HEADER)).toBe(true);
    expect(tr.content as string).toContain(D);
  });

  it("2라운드 첫 시도가 529 로 부분 delta 뒤 실패 → text_clear 다음 재전송분에 진단문이 있다(Pitfall 9)", async () => {
    const failing = {
      async *[Symbol.asyncIterator]() {
        yield {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "더 궁" },
        } as Anthropic.MessageStreamEvent;
        throw Object.assign(new Error("overloaded"), { status: 529 });
      },
      finalMessage: async () => makeEndTurnFinalMessage(""),
    };
    streamMock
      .mockReturnValueOnce(diagnosisRound1())
      .mockReturnValueOnce(failing)
      .mockReturnValueOnce(
        makeStreamMock({ textDeltas: [TAIL], finalMessage: makeEndTurnFinalMessage(TAIL) }),
      );
    runSpecialistMock.mockResolvedValueOnce({ text: D, display: D, usage: [] });

    const { res, events } = makeResSpy();
    await handleChatStream(res, makeSupabase({}), new AbortController().signal, {
      userId: "user-1",
      message: "선매수 왜 나갔어?",
      diagnosisDeps: DEPS,
    });

    const evs = events();
    const clearIdx = evs.findIndex((e) => e.event === "text_clear");
    expect(clearIdx).toBeGreaterThan(-1);
    const resent = evs[clearIdx + 1];
    expect(resent.event).toBe("text");
    expect((resent.data as { text: string }).text).toContain(D);

    // text_clear 뒤 화면 누적 == 저장 content (글자 그대로)
    expect(textOf(evs.slice(clearIdx + 1))).toBe(assistantContent());
    expect(assistantContent()).toContain(D);
  });

  it("runSpecialist 넷째 인자 = { userId, signal, deps: opts.diagnosisDeps } — 계좌 인자 없음(SC-2)", async () => {
    streamMock
      .mockReturnValueOnce(diagnosisRound1())
      .mockReturnValueOnce(
        makeStreamMock({ textDeltas: [TAIL], finalMessage: makeEndTurnFinalMessage(TAIL) }),
      );
    runSpecialistMock.mockResolvedValueOnce({ text: D, display: D, usage: [] });

    const { res } = makeResSpy();
    await handleChatStream(res, makeSupabase({}), new AbortController().signal, {
      userId: "user-1",
      message: "선매수 왜 나갔어?",
      diagnosisDeps: DEPS,
    });

    expect(runSpecialistMock).toHaveBeenCalledTimes(1);
    const [name, input, , ctx] = runSpecialistMock.mock.calls[0];
    expect(name).toBe(SPECIALIST_TOOL_NAMES.diagnosis);
    expect(input).toEqual({ question: "선매수 왜 나갔어?" });
    expect(Object.keys(ctx).sort()).toEqual(["deps", "signal", "turnDeadlineAt", "userId"]);
    expect(ctx.userId).toBe("user-1");
    expect(ctx.signal).toBeInstanceOf(AbortSignal);
    expect(ctx.deps).toBe(DEPS);
    expect(typeof ctx.turnDeadlineAt).toBe("number");
  });

  it("한 턴에서 라운드를 바꿔 진단을 두 번 불러도 같은 턴 마감(turnDeadlineAt)을 받는다(WR-07)", async () => {
    streamMock
      .mockReturnValueOnce(diagnosisRound1())
      .mockReturnValueOnce(diagnosisRound1())
      .mockReturnValueOnce(
        makeStreamMock({ textDeltas: [TAIL], finalMessage: makeEndTurnFinalMessage(TAIL) }),
      );
    runSpecialistMock
      .mockResolvedValueOnce({ text: D, display: D, usage: [] })
      .mockResolvedValueOnce({ text: D, display: D, usage: [] });

    const { res } = makeResSpy();
    await handleChatStream(res, makeSupabase({}), new AbortController().signal, {
      userId: "user-1",
      message: "선매수 왜 나갔어?",
      diagnosisDeps: DEPS,
    });

    expect(runSpecialistMock).toHaveBeenCalledTimes(2);
    const [a, b] = runSpecialistMock.mock.calls.map((c) => c[3].turnDeadlineAt as number);
    expect(a).toBe(b);
  });

  it("display 없는 결과(다른 전문가 · 진단 고정 문구)는 SSE text 로 흘리지 않는다", async () => {
    streamMock
      .mockReturnValueOnce(
        makeStreamMock({
          textDeltas: [],
          finalMessage: makeToolUseFinalMessage([
            { id: "t1", name: SPECIALIST_TOOL_NAMES.theme, input: { question: "테마?" } },
            { id: "t2", name: SPECIALIST_TOOL_NAMES.diagnosis, input: { question: "왜 안 나갔어?" } },
          ]),
        }),
      )
      .mockReturnValueOnce(
        makeStreamMock({ textDeltas: ["종합"], finalMessage: makeEndTurnFinalMessage("종합") }),
      );
    runSpecialistMock
      .mockResolvedValueOnce({ text: "테마 의견" })
      .mockResolvedValueOnce({ text: "주문 진단을 지금 쓸 수 없습니다.", usage: [] });

    const { res, events } = makeResSpy();
    await handleChatStream(res, makeSupabase({}), new AbortController().signal, {
      userId: "user-1",
      message: "둘 다",
    });

    expect(textOf(events())).toBe("종합");
    expect(toolResultsSent().map((t) => t.content)).toEqual(["테마 의견", "주문 진단을 지금 쓸 수 없습니다."]);
  });
});

// ============================================================
// 9) [chat] usage 모델별 토큰 맵 (Phase 39 SC-3)
// ============================================================
describe("handleChatStream ([chat] usage models 맵 SC-3)", () => {
  /** 팀장 라운드 usage 를 채운 finalMessage — 공용 mock 은 0 이라 합산을 볼 수 없다. */
  function withUsage(
    msg: Anthropic.Message,
    u: { input: number; output: number; read?: number | null; creation?: number | null },
  ): Anthropic.Message {
    return {
      ...msg,
      usage: {
        ...msg.usage,
        input_tokens: u.input,
        output_tokens: u.output,
        cache_read_input_tokens: u.read ?? null,
        cache_creation_input_tokens: u.creation ?? null,
      },
    };
  }

  function usageLog(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
    const call = spy.mock.calls.find((c) => c[1] === "[chat] usage");
    expect(call).toBeDefined();
    return call![0] as Record<string, unknown>;
  }

  it("진단 턴: 기존 키 그대로 + models 에 팀장(sonnet) · 진단(opus) 두 키 — opus 값 = 전문가 usage 합", async () => {
    const info = vi.spyOn(logger, "info");
    streamMock
      .mockReturnValueOnce(
        makeStreamMock({
          textDeltas: [],
          finalMessage: withUsage(
            makeToolUseFinalMessage([
              { id: "td1", name: SPECIALIST_TOOL_NAMES.diagnosis, input: { question: "왜?" } },
            ]),
            { input: 100, output: 10, read: 5, creation: 7 },
          ),
        }),
      )
      .mockReturnValueOnce(
        makeStreamMock({
          textDeltas: ["끝"],
          finalMessage: withUsage(makeEndTurnFinalMessage("끝"), { input: 200, output: 20, read: null }),
        }),
      );
    runSpecialistMock.mockResolvedValueOnce({
      text: "진단",
      display: "진단",
      usage: [
        {
          model: "claude-opus-5-5",
          inputTokens: 1000,
          outputTokens: 200,
          cacheReadInputTokens: 50,
          cacheCreationInputTokens: 300,
        },
      ],
    });

    const { res } = makeResSpy();
    await handleChatStream(res, makeSupabase({}), new AbortController().signal, {
      userId: "user-1",
      message: "왜?",
    });

    const log = usageLog(info);
    expect(log).toMatchObject({
      conversationId: "conv-new",
      model: "claude-sonnet-5",
      inputTokens: 300,
      outputTokens: 30,
      toolRounds: 1,
    });
    expect(log).toHaveProperty("models");
    expect(Object.keys(log.models as object).sort()).toEqual(["claude-opus-5-5", "claude-sonnet-5"]);
    expect((log.models as Record<string, unknown>)["claude-sonnet-5"]).toEqual({
      inputTokens: 300,
      outputTokens: 30,
      cacheReadInputTokens: 5,
      cacheCreationInputTokens: 7,
    });
    expect((log.models as Record<string, unknown>)["claude-opus-5-5"]).toEqual({
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadInputTokens: 50,
      cacheCreationInputTokens: 300,
    });
  });

  it("진단 없는 턴: models 에 팀장 키 하나뿐", async () => {
    const info = vi.spyOn(logger, "info");
    streamMock.mockReturnValueOnce(
      makeStreamMock({
        textDeltas: ["안녕"],
        finalMessage: withUsage(makeEndTurnFinalMessage("안녕"), { input: 40, output: 4 }),
      }),
    );

    const { res } = makeResSpy();
    await handleChatStream(res, makeSupabase({}), new AbortController().signal, {
      userId: "user-1",
      message: "안녕",
    });

    const log = usageLog(info);
    expect(log.models).toEqual({
      "claude-sonnet-5": {
        inputTokens: 40,
        outputTokens: 4,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    });
  });
});
