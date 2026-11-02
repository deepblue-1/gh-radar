import { Suspense } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { TickViewerPage } from '@/components/ticks/tick-viewer-page';

/**
 * `/analytics/ticks?isin=&d=YYYYMMDD&ex=KRX|NXT&t=HH:MM:SS.mmm` — 틱 전문 뷰어 (Phase 37 D-16 · D-18).
 *
 * 진입 = 목업 A(종목 검색 + 그날 격자 목록 + 상태 카드) · 종목을 고르면 같은 머리 아래 뷰어 본문(37-10 이후).
 *
 * - middleware 가 미인증을 `/login?next=…` 으로 돌려보낸다. DMA 매핑 판정(D-08)은 server + RPC(`tick_*_for_user`)가 하고
 *   (403 `DMA_UNMAPPED`), 본문 안 `<DmaGate surface="틱 전문 뷰어">` 는 왜 못 쓰는지를 말하는 표시 장치다.
 * - 서버 컴포넌트에서 `Suspense` 로 감싼다 — 본문이 `useSearchParams()` 를 쓰고 Next 15 는 그 훅에 Suspense 경계를
 *   요구한다(보고서 페이지들과 같은 규율). 폴백은 비워 둔다.
 */
export default function TickViewerRoute() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <TickViewerPage />
      </Suspense>
    </AppShell>
  );
}
