'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * D-32 (G-21-R3-11) — 탭 루트 스크롤 복원.
 *
 * - **창(window)이 스크롤 주체다.** AppShell 바깥 div 가 `flex min-h-dvh flex-col` 이고 `<main overflow-auto>`
 *   는 높이 제한이 없어 스스로 스크롤하지 않는다 — 그래서 `main.scrollTop` 이 아니라 `window.scrollY` 를 잰다.
 * - 같은 탭 재탭 = 맨 위는 `native-bridge-provider` 의 `navigate()` 가 처리한다(D-06a) — 여기서는 건드리지 않는다.
 * - keep-alive 가 아니다 — 화면은 재마운트되고 내용은 `lib/query-cache` 가 첫 렌더부터 바로 채운다.
 *   그래서 입력·펼침 상태는 초기화돼도 된다(사용자 수용).
 * - 탭 루트가 아닌 경로(종목상세 등)는 기록도 복원도 하지 않는다 · 검색 파라미터를 달고 들어온 탭 루트
 *   (`/trading?code=` · `?focus=` 등)는 목적지 스크롤이 이기므로 복원하지 않는다.
 */

export const TAB_ROOTS = ['/', '/search', '/trading', '/chat', '/me'] as const;
export type TabRoot = (typeof TAB_ROOTS)[number];

/** 내용이 아직 덜 그려져 문서가 짧을 때 기다리는 최대 프레임(≈0.5초) — 복원이 스크롤을 붙잡지 않게. */
export const TAB_SCROLL_RESTORE_MAX_FRAMES = 30;

/** 루트별 마지막 창 스크롤 위치(탭 메모리에만 · 새로고침하면 사라진다). */
const saved = new Map<TabRoot, number>();

export function isTabRoot(pathname: string | null | undefined): pathname is TabRoot {
  return (TAB_ROOTS as readonly string[]).includes(pathname ?? '');
}

/** 테스트 격리용 — 기록을 모두 지운다. */
export function clearTabScrollMemory(): void {
  saved.clear();
}

export function useTabRootScrollMemory(): void {
  const pathname = usePathname();
  const root = isTabRoot(pathname) ? pathname : null;

  useEffect(() => {
    if (!root) return;
    // (a) 기록을 먼저 읽는다 — 아래 리스너가 이동 직후의 0 으로 덮어도 복원 목표는 그대로다.
    const target = saved.get(root) ?? 0;

    // (b) 이 루트에 실제로 머무는 동안의 스크롤만 기록한다. 다른 경로로 넘어가는 동안(URL 이 먼저 바뀐다)의
    //     스크롤 · 문서가 짧아지며 생기는 클램프는 버린다.
    const record = () => {
      if (window.location.pathname !== root) return;
      saved.set(root, window.scrollY);
    };
    window.addEventListener('scroll', record, { passive: true });

    // (c) 복원 — 저장값이 있고 검색 파라미터 착지가 아닐 때만.
    let raf: number | null = null;
    if (target > 0 && window.location.search === '') {
      let frames = 0;
      const attempt = () => {
        raf = null;
        const room = document.documentElement.scrollHeight - window.innerHeight;
        if (room < target && frames < TAB_SCROLL_RESTORE_MAX_FRAMES) {
          frames += 1;
          raf = requestAnimationFrame(attempt);
          return;
        }
        // 끝내 모자라면 브라우저가 가능한 만큼만 내린다(클램프).
        window.scrollTo(0, target);
      };
      raf = requestAnimationFrame(attempt);
    }

    return () => {
      window.removeEventListener('scroll', record);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [root]);
}
