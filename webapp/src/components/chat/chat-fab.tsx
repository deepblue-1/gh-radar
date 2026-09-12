"use client";

/**
 * Phase 14 Plan 08 — AI FAB (C1, CHAT-01, D-01/D-03).
 *
 * ## 렌더 범위 — 종목상세 본문(`/stocks/{code}`)에서만 (quick-260912-mvo Q-01)
 * 원래는 모든 페이지 우하단에 고정으로 떴다. 상따 화면(`/trading/limit-chaser`)에서
 * 우하단 FAB 이 폼 마지막 행과 「켤 수 없는 이유」 문구를 가리는 것이 사용자
 * 스크린샷으로 관측됐다(DirtyActionBar 의 CTA 와 같은 구석을 쓴다).
 * 그래서 판정을 레이아웃이 아니라 이 클라이언트 컴포넌트 안에서 하고,
 * 경로가 맞지 않으면 `null` 을 반환한다 — `app/layout.tsx` 는 서버 컴포넌트로
 * 남아야 하므로 거기서 경로를 읽지 않는다(클라이언트 경계를 하나 더 만들지 않는다).
 *
 * 좁힌 뒤에도 **AI 진입점은 사라지지 않는다** — 사이드바의 「AI 애널리스트」 항목이
 * `/chat` 으로 그대로 남아 모든 화면에서 도달 가능하다.
 *
 * 하위 라우트(`/stocks/{code}/news` · `/stocks/{code}/discussions`)는 제외한다.
 * FAB 의 종목 라벨은 종목상세 본문이 발행하는 stockContext 에 기대고 있고,
 * 그 컨텍스트가 서는 곳이 본문 한 곳이기 때문이다.
 *
 * 클릭 동작:
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
import { usePathname } from "next/navigation";
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

/**
 * 종목상세 **본문**만 통과시킨다 — `/stocks/{code}` (말미 슬래시 허용).
 * 세그먼트가 정확히 하나여야 하므로 `/stocks/{code}/news` 같은 하위 라우트는 불통과다.
 */
const STOCK_DETAIL_PATH = /^\/stocks\/[^/]+\/?$/;

export function ChatFab() {
  const pathname = usePathname();
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

  // 경로 게이트는 **모든 훅 호출이 끝난 다음**에 온다 — 훅 위로 올리면 경로가 바뀌는
  // 순간 훅 호출 개수가 달라져 React 가 훅 순서 위반으로 터진다.
  if (pathname === null || !STOCK_DETAIL_PATH.test(pathname)) {
    return null;
  }

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
