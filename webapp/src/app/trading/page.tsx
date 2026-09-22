import { Suspense } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { TradingWorkbench } from '@/components/trading/workbench/trading-workbench';

/**
 * `/trading` — 단일 트레이딩 작업대 (Phase 18 D-01 · TRADE-09).
 *
 * 탐색(돌파감지 · VI 발동) → 추가 → 전략 설정 → 수동주문 → 미체결/잔고/로그 확인이 이 한 페이지에서
 * 끝난다. 조립 패턴은 `trading/vi/page.tsx`(AppShell + 사이드바 + 표면 클라이언트)를 본떴다 —
 * 그 파일은 18-12 에서 이 경로로의 리다이렉트로 바뀐다.
 *
 * middleware 가 미인증을 `/login?next=/trading` 으로 돌려보낸다. DMA 매핑 판정은 relay wss 가 하고
 * 작업대 안의 `<DmaGate>` 한 곳이 본문을 대체한다.
 *
 * ★ 서버 컴포넌트에서 `Suspense` 로 감싼다 — 작업대가 `useSearchParams()`(`?focus=`, D-02)를 쓰고,
 *   Next 15 는 그 훅에 Suspense 경계를 요구한다(`app/page.tsx` · `app/scanner/page.tsx` 와 같은 규율).
 *   폴백은 비워 둔다 — 「불러오는 중」·스켈레톤으로 위장하지 않는다(surface-placeholder 규율).
 */
export default function TradingPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <TradingWorkbench />
      </Suspense>
    </AppShell>
  );
}
