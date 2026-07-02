"use client";

/**
 * Phase 14 Plan 10 — 대화 삭제 확인 다이얼로그 (C11, CHAT-01, T-14-11).
 *
 * shadcn Dialog 로 hard delete(messages FK CASCADE) 전 확인을 강제한다. Copywriting 은
 * 14-UI-SPEC Destructive 계약 verbatim: `이 대화를 삭제할까요?` / `삭제한 대화는 되돌릴 수
 * 없어요.` / `삭제`(destructive) · `취소`(outline). 되돌릴 수 없는 파괴적 액션이므로 명시
 * 확인 없이는 삭제하지 않는다(실수 삭제 방지).
 *
 * IDOR 방어(T-14-01b)는 서버 assertConversationOwner(P03/P06)가 담당 — 클라는 본인 목록만
 * 표시하며 소유권 불일치 DELETE 는 서버가 404 로 흡수한다.
 *
 * 제어형 컴포넌트: `conversation` 이 non-null 이면 열림. 부모(ConversationList/page)가
 * open 상태를 소유하고 onOpenChange 로 닫힘을, onDeleted 로 목록 갱신을 배선한다.
 */

import { useState } from "react";
import type { ConversationRow } from "@gh-radar/shared";

import { deleteConversation } from "@/lib/chat-api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface DeleteConversationDialogProps {
  /** 삭제 대상 대화. null 이면 다이얼로그 닫힘. */
  conversation: ConversationRow | null;
  /** 다이얼로그 열림 상태 변경(취소/ESC/overlay 클릭 시 false). */
  onOpenChange: (open: boolean) => void;
  /** 삭제 성공 시 삭제된 대화 id 전달 — 목록 갱신/활성 대화 리셋 배선. */
  onDeleted: (id: string) => void;
}

export function DeleteConversationDialog({
  conversation,
  onOpenChange,
  onDeleted,
}: DeleteConversationDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!conversation || deleting) return;
    setDeleting(true);
    try {
      await deleteConversation(conversation.id);
      onDeleted(conversation.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={conversation !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>이 대화를 삭제할까요?</DialogTitle>
          <DialogDescription>삭제한 대화는 되돌릴 수 없어요.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            취소
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
