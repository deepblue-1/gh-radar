import type Anthropic from "@anthropic-ai/sdk";

/**
 * Phase 14 — Anthropic SDK 공용 mock 픽스처 (테스트 헬퍼, CHAT-01).
 *
 * ⚠️ 이 파일은 vitest 가 실행하는 test 파일이 아니다 (`.test.ts` 아님, 테스트 케이스 없음).
 * 다운스트림 서버 테스트(P05 orchestrator, P06 chat-service)가 재사용할 순수 팩토리 모음.
 *
 * Anthropic SDK 의 두 호출 형태를 흉내낸다 (실제 네트워크 호출 없음):
 *  - `messages.stream()` → async iterable + `.finalMessage()` (팀장 스트리밍)
 *  - `messages.create()` → `Anthropic.Message` (전문가 Haiku 단발 호출)
 *
 * 선례: server/src/services/discussion-classify.ts 의 `__resetAnthropicClientForTests`
 *       + SDK mock 교체 패턴. 테스트는 이 픽스처를 client.messages.create/stream mock
 *       의 반환값으로 주입한다.
 */

/** Anthropic.Usage 최소 채움 — 토큰 카운트는 테스트에서 무의미하므로 0. */
function makeUsage(): Anthropic.Usage {
  return {
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    input_tokens: 0,
    output_tokens: 0,
    server_tool_use: null,
    service_tier: null,
  };
}

/** id/model/stop_sequence 기본값을 채운 Anthropic.Message 골격. */
function makeMessageSkeleton(
  content: Anthropic.ContentBlock[],
  stopReason: Anthropic.StopReason,
): Anthropic.Message {
  return {
    id: "msg_test",
    content,
    model: "claude-sonnet-4-6",
    role: "assistant",
    stop_reason: stopReason,
    stop_sequence: null,
    type: "message",
    usage: makeUsage(),
  };
}

/** `messages.stream()` 반환 형태 — async iterable + finalMessage(). */
export interface StreamMock {
  [Symbol.asyncIterator](): AsyncIterator<Anthropic.MessageStreamEvent>;
  finalMessage(): Promise<Anthropic.Message>;
}

/**
 * `messages.stream()` mock.
 * textDeltas 를 `content_block_delta`(text_delta) 이벤트로 순차 방출한 뒤,
 * finalMessage() 로 opts.finalMessage 를 반환한다.
 */
export function makeStreamMock(opts: {
  textDeltas: string[];
  finalMessage: Anthropic.Message;
}): StreamMock {
  const { textDeltas, finalMessage } = opts;
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<Anthropic.MessageStreamEvent> {
      for (const text of textDeltas) {
        const event: Anthropic.RawContentBlockDeltaEvent = {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text },
        };
        yield event;
      }
    },
    finalMessage(): Promise<Anthropic.Message> {
      return Promise.resolve(finalMessage);
    },
  };
}

/**
 * 팀장이 전문가 tool 을 호출한 최종 메시지 — `stop_reason: "tool_use"`.
 * content 에 tool_use 블록 배열을 담는다 (tool-use 루프 다음 라운드 트리거).
 */
export function makeToolUseFinalMessage(
  calls: Array<{ id: string; name: string; input: unknown }>,
): Anthropic.Message {
  const content: Anthropic.ContentBlock[] = calls.map((c) => ({
    type: "tool_use",
    id: c.id,
    name: c.name,
    input: c.input,
  }));
  return makeMessageSkeleton(content, "tool_use");
}

/**
 * 팀장이 도구 없이 자연 종료한 최종 메시지 — `stop_reason: "end_turn"`.
 * content 에 단일 text 블록을 담는다 (tool-use 루프 종료).
 */
export function makeEndTurnFinalMessage(text: string): Anthropic.Message {
  const content: Anthropic.ContentBlock[] = [
    { type: "text", text, citations: null },
  ];
  return makeMessageSkeleton(content, "end_turn");
}

/**
 * 전문가 Haiku `messages.create()` 반환 형태 — text 블록 1개, `end_turn`.
 */
export function makeCreateResponse(text: string): Anthropic.Message {
  const content: Anthropic.ContentBlock[] = [
    { type: "text", text, citations: null },
  ];
  return makeMessageSkeleton(content, "end_turn");
}
