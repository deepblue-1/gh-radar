"use client";

/**
 * Phase 14 Plan 09 — user 메시지 버블 (C3, CHAT-01).
 *
 * 우측 정렬, `--accent` 배경 버블, 14px, 비대칭 radius `12px 12px 4px 12px`(말꼬리 방향,
 * UI-SPEC Spacing Exceptions). 사용자 입력은 순수 텍스트라 whitespace-pre-wrap 로 개행 보존.
 */

export interface MessageUserProps {
  content: string;
}

export function MessageUser({ content }: MessageUserProps) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-[12px_12px_4px_12px] bg-[var(--accent)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-sm)] leading-relaxed text-[var(--accent-fg)]">
        {content}
      </div>
    </div>
  );
}
