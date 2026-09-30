/**
 * 데스크톱 사이드바 레일 접힘 저장소 (quick-260930-e30 D1 · 목업 A 「아이콘 레일 240 → 64」).
 *
 * ★ 이 파일에는 `'use client'` 도 React import 도 두지 않는다 — 서버 컴포넌트 `app/layout.tsx` 가
 *   여기서 `SIDEBAR_RAIL_SCRIPT` 문자열을 import 한다. React 훅을 여기 두면 서버 그래프에 클라이언트
 *   훅이 섞인다(`lib/native/native-detect.ts` 와 같은 이유). 훅은 `hooks/use-sidebar-collapsed.ts`.
 *
 * ★ 모양의 정본은 **html 속성**이다 — `<head>` 인라인 스크립트가 첫 페인트 전에
 *   `html[data-sidebar="rail"]` 을 붙이고, CSS(`globals.css` 의 `@custom-variant rail`)가 그 속성만 보고
 *   aside 폭·레일 모양을 정한다. 그래서 SSR 마크업이 접힘 여부와 무관하게 같고 첫 페인트부터 맞다
 *   (펼침 → 접힘 깜빡임 없음). React 상태는 토글의 aria·title 과 레일 배지 렌더 여부에만 쓴다.
 *
 * 탭 간 동기화(storage 이벤트)는 하지 않는다 — 다른 탭은 다음 새로고침·이동 때 맞춰진다(단순성).
 */

/** localStorage 키. 값이 정확히 `'1'` 일 때만 접힘이다. */
export const SIDEBAR_COLLAPSED_KEY = 'gh-radar:sidebar-collapsed';
/** 접힘 표식이 붙는 `<html>` 속성 이름. */
export const SIDEBAR_RAIL_ATTR = 'data-sidebar';
/** 접힘 표식 값. */
export const SIDEBAR_RAIL_VALUE = 'rail';

/**
 * `<head>` 인라인 스크립트(의존성 0 IIFE). 저장값을 DOM·HTML 로 흘리지 않고 `=== '1'` 비교만 한다
 * (T-e30-01). 예외는 전부 삼킨다 — `<head>` 스크립트가 throw 하면 뒤따르는 초기화까지 흔들린다.
 * 키·속성 문자열은 위 상수에서 조립해 상수와 스크립트가 갈라지지 않게 한다.
 */
export const SIDEBAR_RAIL_SCRIPT = `(function(){try{if(window.localStorage.getItem(${JSON.stringify(
  SIDEBAR_COLLAPSED_KEY,
)})==='1'){document.documentElement.setAttribute(${JSON.stringify(
  SIDEBAR_RAIL_ATTR,
)},${JSON.stringify(SIDEBAR_RAIL_VALUE)});}}catch(e){}})();`;

const listeners = new Set<() => void>();

/** 접힘인가 — html 속성을 그대로 읽는다. SSR 에서는 false. */
export function isSidebarCollapsed(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute(SIDEBAR_RAIL_ATTR) === SIDEBAR_RAIL_VALUE
  );
}

/** 접힘 상태를 바꾼다 — html 속성(모양) → 저장(영속, 실패 무시) → 구독자 알림 순. */
export function setSidebarCollapsed(next: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (next) root.setAttribute(SIDEBAR_RAIL_ATTR, SIDEBAR_RAIL_VALUE);
  else root.removeAttribute(SIDEBAR_RAIL_ATTR);
  try {
    if (next) window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1');
    else window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
  } catch {
    /* 저장 불가(사파리 개인 모드 등) — 이번 세션 모양만 바뀐다 */
  }
  for (const cb of listeners) cb();
}

/** 접힘 변경 구독. 해제 함수를 돌려준다(`useSyncExternalStore` 규약). */
export function subscribeSidebarCollapsed(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
