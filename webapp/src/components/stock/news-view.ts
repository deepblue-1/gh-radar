'use client';

import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * 종목상세 「뉴스토론」 탭 안 전체목록 상태 (Phase 21 D-29 · G-21-R3-8).
 *
 * 무엇:
 *   「전체 뉴스 보기」「전체 토론 보기」가 페이지를 떠나지 않고 같은 탭 안에서 전체목록으로 바뀐다.
 *   상태의 정본은 URL `?tab=news&view=news|discussions` 다 — 딥링크 · 새로고침 · 뒤로가기가 모두
 *   같은 한 줄(`useSearchParams`)로 설명된다. 탭 셸(`stock-detail-tabs.tsx` T3)과 같은 방식으로
 *   네이티브 `history.pushState` 를 쓴다(Next 15 가 검색 파라미터 훅과 동기화 · 서버 왕복 0).
 *
 * 뒤로가기 네 경로 = 요약 복귀:
 *   ① 브라우저 뒤로 · ② Android 뒤로(오버레이가 없으면 WebView goBack) — 둘 다 우리가 쌓은 기록을
 *      pop → popstate → 검색 파라미터 갱신 → view=null.
 *   ③ Esc — `StockNewsTabPanel` 이 문서 keydown 을 받아 `back()`.
 *   ④ 화면 안 ← — iOS 셸에는 네이티브 뒤로가기가 없어 필수. `back()`.
 *   `back()` 규칙: 지금 기록이 **우리가 쌓은 것**(history.state 표식)이면 `history.back()` —
 *   기록을 하나 덜어 뒤로가기 한 번 = 요약이 되게 한다. 딥링크로 바로 들어왔으면 되돌아갈 요약
 *   기록이 없으므로 `replaceState('?tab=news')` — 페이지를 떠나지 않는다.
 *   표식을 모듈 변수가 아니라 history.state 에 두는 이유: 브라우저 뒤로가기로 기록이 pop 되면
 *   모듈 변수는 낡지만 history.state 는 그 기록과 함께 사라진다(새로고침 뒤에도 기록과 함께 남는다).
 *
 * 스크롤:
 *   스크롤 주체는 창(window)이다 — AppShell `<main>` 은 높이 제한이 없어 스크롤하지 않는다
 *   (shared-panels.tsx ⑤-b 18-13 실측). `showAll` 이 그 순간의 `window.scrollY` 를 코드별로 저장하고,
 *   같은 뉴스토론 탭에서 view 가 값 → null 로 바뀌면 그 위치로 되돌린다. 열 때는 목록 머리가 보이게
 *   탭 바를 헤더 바로 아래로 올린다.
 *
 * T-21-82 — `?view=` 는 사용자 제어 입력이다. 허용 목록 밖 값은 null(= 요약)로 떨어진다.
 */
export const NEWS_VIEWS = ['news', 'discussions'] as const;

export type NewsView = (typeof NEWS_VIEWS)[number];

export function toNewsView(raw: string | null | undefined): NewsView | null {
  return NEWS_VIEWS.some((v) => v === raw) ? (raw as NewsView) : null;
}

/** 우리가 쌓은 기록 표식 — history.state 에 종목코드로 남긴다. */
const STATE_MARK = 'ghNewsView';

/** 전체목록을 열기 전 창 스크롤 위치(종목코드별). 요약으로 돌아올 때 한 번 쓰고 지운다. */
const savedScrollY = new Map<string, number>();

function isOwnEntry(code: string): boolean {
  const state: unknown = window.history.state;
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[STATE_MARK] === code
  );
}

/**
 * 전체목록 → 요약. 화면 안 ← · Esc · 활성 뉴스토론 탭 재클릭이 모두 이 한 규칙을 쓴다.
 * 실시간 URL 에 view 가 없으면 아무것도 하지 않는다(중복 호출 안전).
 */
export function exitNewsView(code: string): void {
  const params = new URLSearchParams(window.location.search);
  if (toNewsView(params.get('view')) === null) return;
  if (isOwnEntry(code)) {
    window.history.back();
    return;
  }
  window.history.replaceState(null, '', '?tab=news');
}

/** 목록 머리가 보이게 — 기준 요소의 윗변을 앱 헤더(sticky) 바로 아래로 올린다. */
function scrollToHead(el: HTMLElement | null): void {
  if (!el) return;
  const tabBar = el.closest('[data-stock-code]')?.querySelector<HTMLElement>('[role="tablist"]');
  const target = tabBar ?? el;
  const header = document.querySelector<HTMLElement>('header');
  const offset = header ? header.getBoundingClientRect().height : 0;
  const top = target.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo(0, Math.max(0, top));
}

export interface NewsViewState {
  /** 지금 보이는 전체목록. null = 요약. */
  view: NewsView | null;
  /** 요약 → 전체목록. 창 스크롤을 저장하고 기록을 하나 쌓는다. */
  showAll: (v: NewsView) => void;
  /** 전체목록 → 요약(`exitNewsView`). */
  back: () => void;
}

/**
 * @param headRef 전체목록을 열 때 머리 스크롤의 기준 요소(패널 루트). 없으면 스크롤하지 않는다.
 */
export function useNewsView(
  code: string,
  headRef?: RefObject<HTMLElement | null>,
): NewsViewState {
  const searchParams = useSearchParams();
  const onNewsTab = searchParams.get('tab') === 'news';
  const view = onNewsTab ? toNewsView(searchParams.get('view')) : null;

  const showAll = useCallback(
    (v: NewsView) => {
      if (toNewsView(v) === null) return;
      savedScrollY.set(code, window.scrollY);
      window.history.pushState({ [STATE_MARK]: code }, '', `?tab=news&view=${v}`);
    },
    [code],
  );

  const back = useCallback(() => exitNewsView(code), [code]);

  // view 전이마다 스크롤을 맞춘다. 레이아웃 effect — 요약/목록이 바뀐 첫 페인트 전에 위치를 잡아
  // 한 프레임 튐을 없앤다. 다른 탭으로 떠나 view 가 null 이 된 경우는 탭 셸의 스크롤에 맡기고
  // 저장값은 남겨 둔다(뒤로가기로 전체목록에 돌아왔다가 한 번 더 뒤로 가면 그때 복원).
  const prevViewRef = useRef(view);
  useLayoutEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = view;
    if (prev === view) return;
    if (view === null) {
      if (!onNewsTab) return;
      const y = savedScrollY.get(code);
      if (y === undefined) return;
      savedScrollY.delete(code);
      window.scrollTo(0, y);
      return;
    }
    if (prev === null) scrollToHead(headRef?.current ?? null);
  }, [code, view, onNewsTab, headRef]);

  return { view, showAll, back };
}
