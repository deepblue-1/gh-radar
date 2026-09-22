"use client";

import { useEffect } from "react";

/**
 * 이탈 경고 문구 — UI-SPEC §CTA verbatim. `beforeunload` 와 라우터 가드가 **같은 말**을 쓴다.
 */
export const LEAVE_WARNING = "수정하지 않은 값이 있어요. 이 페이지를 벗어나면 사라져요.";

/**
 * 이탈 경고 — 더티일 때**만** 건다 (조작 규율 7).
 *
 * 18-11 에서 옛 상따 화면(18-13 삭제)의 지역 함수를 여기로 옮겼다. 작업대(`/trading`)는 카드 N개의
 * 더티 수를 합산해 **이 훅을 한 곳에서만** 부른다 — 카드마다 걸면 링크 한 번에 `confirm` 이 N번 뜬다.
 * 옛 상따 화면은 18-12 에서 사라질 때까지 같은 훅을 빌려 쓴다(정의 1벌).
 *
 * ★ 확인 창을 **브라우저 것**으로 쓴다. UI-SPEC D6 이 앱 다이얼로그를 4개로 못박았고
 *   (VI 시작 · VI 중지 · 전체 비활성화 · 미체결 취소), 이탈 경고는 그 목록에 없다.
 *   `beforeunload`(새로고침·탭 닫기)와 라우터 가드(링크 클릭)가 **같은 문구**를 쓴다.
 * ★ 더티가 0 이면 리스너를 아예 걸지 않는다 — 항상 걸어 두고 안에서 분기하면 「저장할 게
 *   없는데 나갈 때마다 물어보는 화면」이 되고, 사용자는 곧 경고를 읽지 않게 된다.
 * ★ 같은 경로 안의 쿼리만 바뀌는 링크(`/trading?focus=…`)는 막지 않는다 — 페이지를 떠나지 않는다.
 */
export function useLeaveWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = LEAVE_WARNING;
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      if (window.confirm(LEAVE_WARNING)) return; // 나가겠다고 했다
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    // capture 단계에서 잡아야 Next `<Link>` 의 핸들러보다 먼저 막을 수 있다.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}
