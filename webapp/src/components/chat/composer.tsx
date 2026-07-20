"use client";

/**
 * Phase 14 Plan 08 — composer (C9, CHAT-01, D-06).
 *
 * textarea(auto-grow 40→120px) + 전송/정지 토글 버튼.
 * - 유휴: 전송 버튼(--primary, paper-plane, aria-label "전송").
 * - 스트리밍 중: 정지 버튼(square, outline, aria-label "중단") → onStop 으로 abort 위임(D-06).
 * - Enter 전송 / Shift+Enter 줄바꿈(동작 유지, 표시 힌트/placeholder 는 제거 — 사용자 요청).
 * - 면책 문구는 사용자 결정(2026-07-02, 14-11 checkpoint)으로 제거.
 */

import { useState } from "react";
import { Send, Square } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export interface ComposerProps {
  /** 메시지 전송(트리밍된 텍스트). 스트리밍 중에는 호출되지 않는다. */
  onSend: (text: string) => void;
  /** 진행 중 스트리밍 여부 — 전송/정지 버튼 토글 + 입력 잠금. */
  isStreaming: boolean;
  /** 정지 버튼 클릭 — 진행 중 응답 abort(D-06). */
  onStop: () => void;
}

export function Composer({ onSend, isStreaming, onStop }: ComposerProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (isStreaming) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 전송 / Shift+Enter 줄바꿈
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col gap-[var(--s-2)] border-t border-[var(--border)] p-[var(--s-3)]">
      <div className="flex items-end gap-[var(--s-2)]">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          rows={1}
          aria-label="메시지 입력"
          className="max-h-[120px] min-h-[40px] flex-1 resize-none"
        />
        {isStreaming ? (
          <Button
            type="button"
            variant="outline"
            size="default"
            aria-label="중단"
            onClick={onStop}
            className="shrink-0"
          >
            <Square className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            size="default"
            aria-label="전송"
            onClick={submit}
            className="shrink-0"
          >
            <Send className="size-[18px]" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
