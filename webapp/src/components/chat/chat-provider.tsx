"use client";

/**
 * Phase 14 Plan 07 — 전역 챗 상태 provider (CHAT-01, D-03).
 *
 * 관리 대상은 "챗 UI 열림 여부(open)" 와 "현재 종목 컨텍스트(stockContext)" 뿐 —
 * SSE 스트리밍 자체는 시트 컴포넌트(P08)가 chat-sse 로 직접 수행한다. provider 는
 * 상태만 소유해 FAB/시트(P08)와 종목상세(P08 배선)가 공유한다.
 *
 * ## 종목 컨텍스트 채널 (D-03)
 * usePathname 은 `/stocks/{code}` 에서 code 만 준다 — 종목명(name)은 상세 페이지가
 * `stock.name` 로드 후 `setStockContext({ code, name })` 로 발행하는 이 채널로만 공급된다.
 * FAB 라벨("{종목명} 물어보기")과 openChat 이 이 값을 읽어 종목명을 채운다. 상세 페이지
 * 이탈(언마운트) 시 `setStockContext(null)` 로 해제해 일반 대화 모드로 되돌린다.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** 종목 컨텍스트 — 종목상세 페이지가 발행, FAB/시트 라벨·openChat 이 소비. */
export interface StockContext {
  code: string;
  name: string;
}

interface ChatContextValue {
  /** 챗 시트 열림 여부. */
  open: boolean;
  /** 챗을 연다. ctx 전달 시 종목 컨텍스트도 함께 갱신(FAB 종목상세 진입). */
  openChat: (ctx?: StockContext) => void;
  /** 챗을 닫는다(종목 컨텍스트는 유지). */
  closeChat: () => void;
  /** 현재 종목 컨텍스트. null 이면 일반 대화 모드. */
  stockContext: StockContext | null;
  /** 종목 컨텍스트 발행/해제 채널(종목상세 마운트/언마운트, D-03). */
  setStockContext: (ctx: StockContext | null) => void;
}

const NOOP = () => {
  /* Provider 바깥 기본 no-op */
};

const EMPTY: ChatContextValue = {
  open: false,
  openChat: NOOP,
  closeChat: NOOP,
  stockContext: null,
  setStockContext: NOOP,
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [stockContext, setStockContextState] = useState<StockContext | null>(
    null,
  );

  const openChat = useCallback((ctx?: StockContext) => {
    if (ctx) setStockContextState(ctx);
    setOpen(true);
  }, []);

  const closeChat = useCallback(() => setOpen(false), []);

  const setStockContext = useCallback((ctx: StockContext | null) => {
    setStockContextState(ctx);
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({ open, openChat, closeChat, stockContext, setStockContext }),
    [open, openChat, closeChat, stockContext, setStockContext],
  );

  return <ChatContext value={value}>{children}</ChatContext>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  return ctx ?? EMPTY;
}
