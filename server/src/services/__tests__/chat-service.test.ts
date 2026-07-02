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
import {
  handleChatStream,
  sanitizeMessages,
  pruneHistory,
  isRetryableError,
  __resetChatSessionsForTests,
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
