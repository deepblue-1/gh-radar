'use client';

/**
 * 오버레이 열림 마커 (Phase 21 · D-12 · D-26 · 21-RESEARCH Pattern 8).
 *
 * Sheet·Dialog·NumberPadSheet·Popover(WR-04) 의 **Content 첫 자식**으로 렌더한다. Radix Content 는 열려 있는 동안
 * (+퇴장 애니메이션)만 마운트되므로 이 컴포넌트의 마운트 수명이 곧 오버레이 열림 수명이다 —
 * 마운트 때 참조를 획득하고 언마운트 때 해제한다. Provider 가 참조계수 0↔1 전이에서만 네이티브에
 * `overlay {open}` 을 보낸다(탭바 숨김 · 당겨서 새로고침 비활성 · `back()` 판정).
 *
 * 열림 콜백을 훅킹하지 않는 이유: Radix 는 **부모가 `open` prop 을 직접 바꿀 때** 그 콜백을 부르지
 * 않는다(AppShell 햄버거 드로어가 `setSheetOpen(true)` 로 여는 경로). 콜백으로 세면 그 열림을 놓친다.
 *
 * DOM 을 만들지 않으므로(null) Content 의 레이아웃·포커스 순서에 영향이 없다. 브라우저에서는 Provider 가
 * 송신하지 않고, Provider 밖에서는 no-op 폴백이라 단독 렌더 테스트도 그대로 돈다.
 *
 * `immediate` 는 키보드 대체 입력(키패드 시트)만 쓴다 — 네이티브가 150ms 대기·페이드 없이 탭바를 즉시
 * 숨긴다(D-12a''). Sheet · Dialog · Popover 는 쓰지 않는다 — 150ms 가 리다이렉트·짧은 오버레이
 * 깜빡임을 삼키기 때문이다(D-12).
 */

import { useEffect } from 'react';

import { useNativeBridge } from './native-bridge-provider';

export function NativeOverlayMarker({ immediate = false }: { immediate?: boolean }): null {
  const { acquireOverlay } = useNativeBridge();
  // immediate 는 호출부 리터럴 상수라 재획득이 생기지 않는다.
  useEffect(() => acquireOverlay({ immediate }), [acquireOverlay, immediate]);
  return null;
}
