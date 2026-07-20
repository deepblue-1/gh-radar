"use client";

/**
 * Phase 14 Plan 08 — 전역 FAB (C1, CHAT-01, D-01/D-03).
 *
 * 모든 페이지 우하단 고정 진입점. 클릭 동작:
 * - 비로그인(useAuth().user 없음) → 로그인 필요 상태 다이얼로그(D-01). 체험 모드 없음.
 *   실제 서버 방어는 requireAuth(P03) — 이 게이트는 UX(T-14-02b accept).
 * - 로그인 → openChat(stockContext) 로 챗 시트 오픈.
 *
 * ## 종목명 라벨 출처 (D-03, Warning 해소)
 * usePathname 은 `/stocks/{code}` 에서 code 만 준다. 종목명(name)은 종목상세 페이지가
 * `stock.name` 로드 후 `useChat().setStockContext({code,name})` 로 발행하는 provider
 * 채널에서 읽는다(이미 fetch 한 stock 데이터 재사용, 추가 조회 없음). stockContext 가
 * 있으면 `AI · {종목명} 분석`, 없으면 `AI`.
 */

import { useState } from "react";
import { MessageSquare } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { useChat } from "./chat-provider";
import { LoginRequiredState } from "./chat-states";

const BASE_LABEL = "AI";

export function ChatFab() {
  const { user } = useAuth();
  const { openChat, stockContext } = useChat();
  const [showLoginGate, setShowLoginGate] = useState(false);

  const label = stockContext
    ? `${BASE_LABEL} · ${stockContext.name} 분석`
    : BASE_LABEL;

  const handleClick = () => {
    if (!user) {
      // D-01 — 로그인 유도. 챗 시트는 열지 않는다.
      setShowLoginGate(true);
      return;
    }
    openChat(stockContext ?? undefined);
  };

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={handleClick}
        className="fixed right-6 bottom-6 z-40 flex h-14 min-w-14 items-center gap-[var(--s-2)] rounded-full bg-[var(--primary)] px-5 text-[var(--primary-fg)] shadow-[0_8px_24px_oklch(0_0_0/0.16)] transition-[background,opacity] duration-[120ms] hover:bg-[color-mix(in_oklch,var(--primary)_88%,black)] active:opacity-90"
      >
        <MessageSquare className="size-[22px]" aria-hidden="true" />
        {stockContext ? (
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[length:var(--t-sm)] font-semibold">
              {BASE_LABEL}
            </span>
            <span className="text-[length:var(--t-caption)] opacity-85">
              {stockContext.name} 분석
            </span>
          </span>
        ) : (
          <span className="text-[length:var(--t-sm)] font-semibold">
            {BASE_LABEL}
          </span>
        )}
      </button>

      <Dialog open={showLoginGate} onOpenChange={setShowLoginGate}>
        <DialogContent>
          {/* 스크린리더용 제목 — 시각적으론 상태 박스 제목이 대신한다 */}
          <DialogTitle className="sr-only">AI 애널리스트 로그인</DialogTitle>
          <DialogDescription className="sr-only">
            로그인 후 AI 애널리스트를 이용할 수 있어요.
          </DialogDescription>
          <LoginRequiredState />
        </DialogContent>
      </Dialog>
    </>
  );
}
