'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { isNativeApp } from '@/lib/native/native-detect';

import { OrderLogWindow } from './order-log-window';

/**
 * `/trading/order-log` 라우트 본문 — 브라우저는 셸 없는 분리 창, 네이티브 앱은 앱 셸 안(체결 알림 탭 착지).
 *
 * - 브라우저: 작업대 「창 분리 ↗」 가 `window.open` 으로 여는 창이다(결정 5) — 지금 모양 그대로 셸 · 사이드바 없음.
 * - 앱: 이 경로로 오는 길은 체결 알림 탭(Phase 40 D-21)뿐이다. 하단 탭바가 걷힌 뒤(quick-261107-fbj) 앱의 이동 입구는
 *   셸 머리줄 햄버거 드로어 하나라, 셸 없이 열면 iOS 에서는 나갈 길이 없다(뒤로 스와이프 없음). 그래서 앱에서는
 *   `AppShell` 로 감싸 머리줄 · 햄버거를 붙이고 창은 `embedded` 로 머리줄 아래를 채운다.
 * - 판정은 `isNativeApp()`(order-log-filters 와 같은 규칙)을 `useSyncExternalStore` 로 읽는다(리뷰 IN-02). 서버 · 하이드레이션
 *   스냅숏은 null(모름) → 아무것도 그리지 않고, 판정이 나온 뒤 맞는 트리를 **한 번만** 마운트한다. 클라이언트 이동(알림 탭
 *   `router.push`)은 하이드레이션이 없어 첫 렌더부터 맞는 트리다. 예전처럼 브라우저 모양(`<OrderLogWindow />`)으로 먼저
 *   그렸다가 셸로 바꾸면 트리 위치가 달라 창이 언마운트 → 재마운트돼 주문 · 이벤트 조회와 구독이 두 번 돌고 셸 없는 화면이
 *   한 번 번쩍였다. 클래스는 첫 페인트 전 인라인 스크립트가 붙이고 바뀌지 않으니 구독할 것이 없다.
 */
const subscribeNothing = () => () => {};
const nativeSnapshot = (): boolean => isNativeApp();
const unknownSnapshot = (): boolean | null => null;

export function OrderLogRoute({ sidebar }: { sidebar: ReactNode }) {
  const native = useSyncExternalStore<boolean | null>(subscribeNothing, nativeSnapshot, unknownSnapshot);

  if (native === null) return null;
  if (!native) return <OrderLogWindow />;
  return (
    <AppShell sidebar={sidebar}>
      <OrderLogWindow embedded />
    </AppShell>
  );
}
