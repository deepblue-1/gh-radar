'use client';

import { useSyncExternalStore } from 'react';

import { isSidebarCollapsed, subscribeSidebarCollapsed } from '@/lib/sidebar-collapse';

/**
 * 데스크톱 사이드바 레일 접힘 상태 (quick-260930-e30 D1).
 *
 * 서버 스냅샷은 `false` 라 하이드레이션 불일치가 없고, 하이드레이션 직후 실제 값(html 속성)으로
 * 다시 그린다. 모양(폭·레일)은 CSS 가 html 속성으로 이미 첫 페인트부터 맞춰 두므로, 이 값은
 * 토글의 aria·title 과 레일 배지 렌더에만 쓴다(`lib/sidebar-collapse.ts` 머리 주석).
 */
export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribeSidebarCollapsed, isSidebarCollapsed, () => false);
}
