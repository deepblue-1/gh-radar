import { Suspense } from 'react';

import { OrderLogWindow } from '@/components/trading/order-log/order-log-window';

/**
 * `/trading/order-log` — 주문로그 창 분리 페이지 (Phase 25-10 · D-07 · 결정 5 · UI-SPEC ③).
 *
 * - 작업대 공용 패널 「창 분리 ↗」 가 `window.open` 으로 여는 **앱 셸 · 사이드바 없는** 창이다(결정 5 — 창 하나가
 *   로그만 보여 준다). 루트 layout 의 `RelayProvider` 가 전역이라 이 창도 자기 wss 를 열고, 인증은 middleware 가
 *   다른 비공개 경로와 똑같이 판정한다.
 * - ★ 서버 컴포넌트에서 `Suspense` 로 감싼다 — 창이 `useSearchParams()`(쿼리 `account` · `date` · `stock` · `ex` ·
 *   `kind`)를 쓰고 Next 15 는 그 훅에 Suspense 경계를 요구한다(`app/trading/page.tsx` 와 같은 규율). 폴백은 비워
 *   둔다 — 「불러오는 중」 · 스켈레톤으로 위장하지 않는다.
 * - 네이티브 앱 셸에서는 이 라우트로 가는 버튼이 숨겨질 뿐이다(`native:hidden` + `isNativeApp`). 주소로 직접 열리면
 *   일반 페이지로 동작한다.
 */
export default function OrderLogWindowPage() {
  return (
    <Suspense fallback={null}>
      <OrderLogWindow />
    </Suspense>
  );
}
