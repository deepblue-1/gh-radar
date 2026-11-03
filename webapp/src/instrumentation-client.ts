/**
 * Next 15 클라이언트 계측 훅 — 앱 라우터 이동 시작을 `router-transition` 구독자에게 알린다(Phase 37 R2-WR-30).
 * Next 가 하이드레이션 전에 이 모듈을 읽고, 이동마다 `onRouterTransitionStart` 를 동기로 부른다.
 */

import { noteRouterTransitionStart, type RouterTransitionType } from '@/lib/router-transition';

export function onRouterTransitionStart(url: string, navigationType: RouterTransitionType): void {
  noteRouterTransitionStart(url, navigationType);
}
