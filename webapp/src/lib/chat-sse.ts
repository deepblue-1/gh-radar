/**
 * Phase 14 Plan 07 — 챗 SSE 소비 계층 (CHAT-01, D-01/D-02/D-06).
 *
 * ⚠️ lib/api.ts 의 JSON 전용 fetch 헬퍼 사용 금지 — 그 헬퍼는 8s AbortController
 * 타임아웃 + `response.json()` 기반이라 SSE 스트림을 8초에 끊고 본문을 통째로 파싱하려
 * 한다(RESEARCH Anti-Pattern). SSE 는 반드시 raw `fetch` + `response.body.getReader()` +
 * `parseSSEStream` 으로 소비해야 한다. (api.ts 에서는 resolveBaseUrl 만 재사용한다.)
 *
 * - `parseSSEStream`: ../weekly-wine-bot packages/somi-chat-core/src/sse-parser.ts 를
 *   verbatim 포팅(타입만 ChatSSEEventMap/ChatSSEEventType 로 교체). TextDecoder stream
 *   경계 + 버퍼 flush + JSON 파싱 실패 무시(throw 안 함) — 파서 견고성(T-14-08).
 * - `streamChat`: Supabase access_token 을 `Authorization: Bearer` 로 부착해 서버가
 *   검증(P03). 클라는 토큰을 저장/조작하지 않고 Supabase SDK 가 관리(T-14-02c).
 */

import { createClient } from "@/lib/supabase/client";
import { resolveBaseUrl } from "@/lib/api";
import type { ChatSSEEventType, ChatSSEEventMap } from "@gh-radar/shared";

/** SSE 이벤트 수신 콜백 — event 이름과 대응 data payload 를 타입 안전하게 전달. */
export type ChatSSEEventHandler = <T extends ChatSSEEventType>(
  event: T,
  data: ChatSSEEventMap[T],
) => void;

/** streamChat 에러 구분용 코드. UI 가 로그인 게이트/세션만료/비활성/일반 에러를 분기. */
export type ChatStreamErrorCode =
  | "LOGIN_REQUIRED"
  | "SESSION_EXPIRED"
  | "CHAT_DISABLED"
  | "STREAM_ERROR";

/** 챗 스트림 실패를 표현하는 통합 에러. `code` 로 UI 분기(D-01 로그인 게이트 등). */
export class ChatStreamError extends Error {
  readonly code: ChatStreamErrorCode;

  constructor(code: ChatStreamErrorCode, message: string) {
    super(message);
    this.name = "ChatStreamError";
    this.code = code;
  }
}

/**
 * ReadableStream 에서 SSE 이벤트를 파싱하여 콜백으로 전달한다.
 *
 * fetch 호출은 포함하지 않음 — 호출자가 fetch 후 `response.body.getReader()` 를 넘긴다.
 * somi-chat-core sse-parser.ts verbatim 포팅: TextDecoder stream 경계 처리 + 마지막
 * 버퍼 flush + JSON 파싱 실패는 무시(throw 안 함).
 *
 * @param reader - ReadableStream 의 reader
 * @param onEvent - 이벤트 수신 콜백
 */
export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: ChatSSEEventHandler,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "";

  function processLines(lines: string[]) {
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7);
      } else if (line.startsWith("data: ") && eventType) {
        try {
          const data = JSON.parse(line.slice(6));
          onEvent(
            eventType as ChatSSEEventType,
            data as ChatSSEEventMap[ChatSSEEventType],
          );
        } catch {
          // ignore JSON parse errors — 깨진 data 라인은 스킵(T-14-08)
        }
        eventType = "";
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    processLines(lines);
  }

  // 남은 버퍼 flush + 처리
  buffer += decoder.decode();
  if (buffer) {
    processLines(buffer.split("\n"));
  }
}

/** streamChat 요청 파라미터. 서버 ChatPostBody(P03 zod) 와 일치. */
export interface StreamChatParams {
  message: string;
  conversationId?: string;
  stockCode?: string;
}

/**
 * 챗 메시지를 서버 SSE 라우트(POST /api/chat)로 보내고 응답 스트림을 소비한다.
 *
 * RESEARCH Code Examples verbatim: getSession → Bearer 부착 → raw fetch → getReader →
 * parseSSEStream. api.ts 의 JSON 헬퍼는 8s 타임아웃으로 스트림을 끊으므로 사용하지 않는다.
 *
 * @param params - message/conversationId/stockCode
 * @param onEvent - SSE 이벤트 콜백 (text/agent_start/stock_card/done ...)
 * @param signal - 중단 신호 (D-06 사용자 취소)
 * @throws ChatStreamError - 세션 없음/만료(401)/비활성(503)/기타 non-ok
 */
export async function streamChat(
  params: StreamChatParams,
  onEvent: ChatSSEEventHandler,
  signal?: AbortSignal,
): Promise<void> {
  const {
    data: { session },
  } = await createClient().auth.getSession();

  if (!session) {
    // D-01 — UI 가 로그인 게이트를 표시한다.
    throw new ChatStreamError("LOGIN_REQUIRED", "로그인이 필요합니다.");
  }

  const resp = await fetch(`${resolveBaseUrl()}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(params),
    signal,
  });

  if (resp.status === 401) {
    throw new ChatStreamError("SESSION_EXPIRED", "세션이 만료되었습니다. 다시 로그인해 주세요.");
  }
  if (resp.status === 503) {
    throw new ChatStreamError("CHAT_DISABLED", "챗 기능이 일시적으로 비활성화되어 있습니다.");
  }
  if (!resp.ok || !resp.body) {
    throw new ChatStreamError("STREAM_ERROR", "챗 응답을 받지 못했습니다.");
  }

  await parseSSEStream(resp.body.getReader(), onEvent);
}
