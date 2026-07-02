"use client";

/**
 * Phase 14 Plan 09 — thread 컨테이너 (C2 내부, CHAT-01).
 *
 * 메시지 배열을 순서대로 렌더(user→MessageUser / assistant→MessageAssistant) + 스트리밍 중
 * 마지막 assistant 자리에 진행 스텝퍼(progressSlot) + streamingText(부분 append) 를 표시한다.
 * append-only 렌더로 레이아웃 shift 를 최소화(Phase 13 오실레이션 교훈).
 *
 * 자동 스크롤: 메시지/스트리밍 텍스트 변화 시 하단 앵커로 scrollIntoView.
 * progressSlot 은 AgentProgress(Task 2)를 주입받는 렌더 슬롯 — thread 는 표시 위치만 소유.
 */

import { useEffect, useRef, type ReactNode } from "react";
import type { ChatRole, MessageBlock } from "@gh-radar/shared";

import { MessageUser } from "./message-user";
import { MessageAssistant } from "./message-assistant";

export interface ChatThreadMessage {
  id: string;
  role: ChatRole;
  content: string;
  blocks?: MessageBlock[] | null;
}

export interface ChatThreadProps {
  messages: ChatThreadMessage[];
  /** 스트리밍 중 부분 텍스트(완성 전). 빈 문자열이면 미표시. */
  streamingText: string;
  /** 진행 중 여부 — 스텝퍼/스트리밍 블록 노출. */
  isStreaming: boolean;
  /** 스트리밍 중 진행 스텝퍼(AgentProgress, Task 2) 렌더 슬롯. */
  progressSlot?: ReactNode;
}

export function ChatThread({
  messages,
  streamingText,
  isStreaming,
  progressSlot,
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streamingText, isStreaming]);

  return (
    <div className="flex flex-col gap-[var(--s-4)]">
      {messages.map((m) =>
        m.role === "user" ? (
          <MessageUser key={m.id} content={m.content} />
        ) : (
          <MessageAssistant key={m.id} content={m.content} blocks={m.blocks} />
        ),
      )}

      {isStreaming && (
        <div className="flex flex-col gap-[var(--s-2)]">
          {progressSlot}
          {streamingText && (
            <MessageAssistant content={streamingText} streaming />
          )}
        </div>
      )}

      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
