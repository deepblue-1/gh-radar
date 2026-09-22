"use client";

import { useEffect, useRef } from "react";

/**
 * 작업대 카드 포커스 요청 — 사이드바 전략 항목 → `/trading` 작업대 (Phase 18 · 18-12).
 *
 * ★ 왜 URL(`?focus=`)만으로는 안 되나
 *   작업대는 `?focus=` 를 **마운트 1회만** 소비한다(18-11 ⑥ · T-18-53) — 뒤로가기로 URL 이 바뀔 때
 *   사용자가 접어 둔 카드를 다시 펼치지 않기 위해서다. 그 규율 때문에 **이미 `/trading` 위에서**
 *   사이드바 전략을 누르면 URL 만 바뀌고 카드는 펼쳐지지 않았다. 같은 항목을 두 번 누르면 URL 조차
 *   바뀌지 않는다.
 *
 *   그래서 「사용자가 눌렀다」는 사실을 URL 과 **다른 신호**로 보낸다. 클릭은 이 이벤트를 쏘고,
 *   링크는 평소대로 `/trading?focus=` 로 이동한다.
 *   - 작업대가 이미 떠 있으면 → 이벤트로 그 카드를 펼친다(URL 변경은 여전히 무시한다).
 *   - 다른 화면이면 → 듣는 쪽이 없어 이벤트는 흘러가고, 이동 뒤 마운트가 `?focus=` 를 소비한다.
 *   - 뒤로가기 → 클릭이 아니므로 이벤트가 없다. 마운트 1회 규율이 그대로 산다.
 *
 * ★ 값은 전략 키 **원문**이다. 받는 쪽은 `parseStrategyKey` 로만 해석하고, 어긋나면 무시한다.
 */
export const TRADING_FOCUS_EVENT = "gh-radar:trading-focus";

/** 전략 키 원문으로 포커스를 요청한다. 듣는 작업대가 없으면 아무 일도 없다. */
export function requestTradingFocus(key: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(TRADING_FOCUS_EVENT, { detail: key }));
}

/**
 * 포커스 요청을 듣는다. 핸들러는 ref 로 최신값을 읽으므로 호출부가 매 렌더 새 함수를 넘겨도
 * 리스너를 다시 걸지 않는다.
 */
export function useTradingFocusRequest(handler: (key: string) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onFocus = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail === "string") ref.current(detail);
    };
    window.addEventListener(TRADING_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(TRADING_FOCUS_EVENT, onFocus);
  }, []);
}
