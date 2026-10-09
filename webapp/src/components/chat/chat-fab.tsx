"use client";

/**
 * Phase 14 Plan 08 — AI FAB (C1, CHAT-01, D-01/D-03).
 *
 * ## 렌더 범위 — 종목상세 본문(`/stocks/{code}`)에서만 (quick-260912-mvo Q-01)
 * 원래는 모든 페이지 우하단에 고정으로 떴다. 옛 상따 화면(지금은 `/trading` 작업대로 합쳐졌다)에서
 * 우하단 FAB 이 폼 마지막 행과 「켤 수 없는 이유」 문구를 가리는 것이 사용자
 * 스크린샷으로 관측됐다(DirtyActionBar 의 CTA 와 같은 구석을 쓴다).
 * 그래서 판정을 레이아웃이 아니라 이 클라이언트 컴포넌트 안에서 하고,
 * 경로가 맞지 않으면 `null` 을 반환한다 — `app/layout.tsx` 는 서버 컴포넌트로
 * 남아야 하므로 거기서 경로를 읽지 않는다(클라이언트 경계를 하나 더 만들지 않는다).
 *
 * AI 진입점과 차단 위치(quick-261009-c43 D-01~D-04) — 사이드바 「AI 애널리스트」 항목은 2026-10-05
 * (quick-261005-vk1 D-01)부터 트레이딩 권한자에게만 「분석」 하위로 보인다. 이 FAB(웹 종목상세) · 앱 히어로
 * 「AI 분석」 은 서버 판정 ok(`useChatAccess`)일 때만 렌더된다. 네이티브 앱 AI 탭 · `/chat` 직접 주소는
 * 남지만 `/chat` 이 미매핑 사용자에게 DmaGate 를 보이고, 실제 차단은 server `requireDmaMapped` 가 챗 API
 * 전부를 403 `DMA_UNMAPPED` 로 막는 것이다(숨김은 권한이 아니다).
 *
 * 하위 라우트(`/stocks/{code}/news` · `/stocks/{code}/discussions`)는 제외한다.
 * FAB 의 종목 라벨은 종목상세 본문이 발행하는 stockContext 에 기대고 있고,
 * 그 컨텍스트가 서는 곳이 본문 한 곳이기 때문이다.
 *
 * 렌더 · 클릭 규칙(quick-261009-c43 D-03):
 * - 접근 탐침은 종목상세 본문 경로에서만 켠다(`useChatAccess(isStockDetail)`) — 이 컴포넌트는 `app/layout.tsx`
 *   에 전역 마운트되므로 무조건 켜면 매 페이지가 탐침한다.
 * - 판정이 `"ok"` 가 아니면(판정 전 · 미매핑 · 비로그인 · 오류) 버튼이 DOM 에 없다 — ChatSheet 를 여는 경로가 없다.
 * - 클릭 = openChat(stockContext) 하나. 옛 비로그인 로그인 다이얼로그는 없앴다 — 앱 전체가 로그인 벽 뒤라
 *   비로그인 사용자는 종목상세에 닿지 못한다(chat.spec 260912-ok2).
 *
 * ## 종목명 라벨 출처 (D-03, Warning 해소)
 * usePathname 은 `/stocks/{code}` 에서 code 만 준다. 종목명(name)은 종목상세 페이지가
 * `stock.name` 로드 후 `useChat().setStockContext({code,name})` 로 발행하는 provider
 * 채널에서 읽는다(이미 fetch 한 stock 데이터 재사용, 추가 조회 없음). stockContext 가
 * 있으면 `AI · {종목명} 분석`, 없으면 `AI`.
 */

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { useChatAccess } from "@/hooks/use-chat-access";

import { CHAT_FAB_WIDTH_VAR } from "./fab-clearance";
import { useChat } from "./chat-provider";

const BASE_LABEL = "AI";

/**
 * 종목상세 **본문**만 통과시킨다 — `/stocks/{code}` (말미 슬래시 허용).
 * 세그먼트가 정확히 하나여야 하므로 `/stocks/{code}/news` 같은 하위 라우트는 불통과다.
 */
const STOCK_DETAIL_PATH = /^\/stocks\/[^/]+\/?$/;

export function ChatFab() {
  const pathname = usePathname();
  const isStockDetail = pathname !== null && STOCK_DETAIL_PATH.test(pathname);
  const { access } = useChatAccess(isStockDetail);
  const { openChat, stockContext } = useChat();

  const label = stockContext
    ? `${BASE_LABEL} · ${stockContext.name} 분석`
    : BASE_LABEL;

  /*
    18-10 — 자기 실측 폭을 문서 루트의 CSS 변수로 싣는다(`fab-clearance.ts`). 같은 화면의 하단
    고정 바(호가 탭 더티 바)가 이 값만큼 오른쪽을 비워 「수정」 버튼이 FAB 아래로 들어가지 않는다.
    폭은 종목명 라벨에 따라 바뀌므로 한 번 재지 않고 크기 변화를 따라간다. 사라지면 변수도 지운다.
  */
  const observerRef = useRef<ResizeObserver | null>(null);
  const measureRef = useCallback((el: HTMLButtonElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    const root = document.documentElement;
    if (el === null) {
      root.style.removeProperty(CHAT_FAB_WIDTH_VAR);
      return;
    }
    const publish = () => root.style.setProperty(CHAT_FAB_WIDTH_VAR, `${el.offsetWidth}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    observerRef.current = new ResizeObserver(publish);
    observerRef.current.observe(el);
  }, []);
  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      document.documentElement.style.removeProperty(CHAT_FAB_WIDTH_VAR);
    },
    [],
  );

  const handleClick = () => {
    openChat(stockContext ?? undefined);
  };

  // 경로 · 판정 게이트는 **모든 훅 호출이 끝난 다음**에 온다 — 훅 위로 올리면 경로가 바뀌는
  // 순간 훅 호출 개수가 달라져 React 가 훅 순서 위반으로 터진다.
  // 판정 ok 아님(판정 전 · 미매핑 · 비로그인 · 오류) → 비렌더(quick-261009-c43 D-03).
  if (!isStockDetail || access !== "ok") {
    return null;
  }

  /*
    Phase 21 D-10 — 앱(`html.native-app`)에서는 `native` 변형의 hidden 으로 **표시만** 숨긴다. 진입점은 종목상세
    히어로 첫 줄의 「AI 분석」 버튼(`stock-hero.tsx` `data-slot="stock-ai-button"`)이 대신한다.
    경로·판정 게이트와 measureRef 는 그대로다 — 숨은 버튼은 offsetWidth 0 이라 `CHAT_FAB_WIDTH_VAR`
    에 0px 가 실리고, 더티 바의 우측 여백도 0 이 된다(가릴 FAB 이 없으니 맞는 값이다).
  */
  return (
    <button
      ref={measureRef}
      type="button"
      data-slot="chat-fab"
      aria-label={label}
      onClick={handleClick}
      className="fixed right-6 bottom-[max(24px,var(--app-safe-bottom))] z-40 flex h-14 min-w-14 items-center gap-[var(--s-2)] rounded-full bg-[var(--primary)] px-5 text-[var(--primary-fg)] shadow-[0_8px_24px_oklch(0_0_0/0.16)] transition-[background,opacity] duration-[120ms] hover:bg-[color-mix(in_oklab,var(--primary)_88%,black)] active:opacity-90 native:hidden"
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
  );
}
