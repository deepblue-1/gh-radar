'use client';

import { useEffect, useState, type ReactNode } from 'react';

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
 * - 판정은 마운트 뒤 `isNativeApp()`(order-log-filters 와 같은 규칙) — SSR · 첫 하이드레이션은 브라우저 모양이고 앱이면
 *   곧바로 셸로 다시 그린다.
 */
export function OrderLogRoute({ sidebar }: { sidebar: ReactNode }) {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);

  if (!native) return <OrderLogWindow />;
  return (
    <AppShell sidebar={sidebar}>
      <OrderLogWindow embedded />
    </AppShell>
  );
}
