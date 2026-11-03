/**
 * 앱 라우터 이동 시작 신호 (Phase 37 R2-WR-30).
 *
 * Next 15 는 `src/instrumentation-client.ts` 의 `onRouterTransitionStart(url, type)` 를 **모든** 앱 라우터 이동의 시작에서
 * 동기로 부른다 — `<Link>` 클릭 · `router.push` / `router.replace`(`push` · `replace`) · 브라우저 뒤로 · 앞으로(`traverse`).
 * 액션을 큐에 넣기 직전이라, 구독자는 그 이동이 끝나기 전에 알 수 있다.
 *
 * 쓰는 곳: 틱뷰어 커서(`useTickCursor`)의 URL `t` 쓰기 — Next 15 는 패치한 `history.replaceState` 를 `ACTION_RESTORE` 로
 * 바꾸고, 대기 중인 이동이 있으면 그 이동을 버린다(app-router-instance `dispatchAction`). 그래서 이동이 대기 중이면 쓰지 않는다.
 * 우리 쪽 `history.replaceState` 는 이 신호를 내지 않는다(Next 가 부르지 않는다).
 */

export type RouterTransitionType = 'push' | 'replace' | 'traverse';
export type RouterTransitionListener = (to: URL, type: RouterTransitionType) => void;

const listeners = new Set<RouterTransitionListener>();

/** `instrumentation-client.ts` 가 부른다 — 구독자 예외는 삼킨다(이동 자체를 막지 않게). */
export function noteRouterTransitionStart(href: string, type: RouterTransitionType): void {
  if (typeof window === 'undefined' || listeners.size === 0) return;
  let to: URL;
  try {
    to = new URL(href, window.location.href);
  } catch {
    return;
  }
  for (const l of [...listeners]) {
    try {
      l(to, type);
    } catch (e) {
      console.warn('[router-transition] 구독자 오류', e);
    }
  }
}

/** 이동 시작을 듣는다 — 돌려준 함수로 해제. */
export function subscribeRouterTransition(l: RouterTransitionListener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
