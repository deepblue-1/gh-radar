import { Suspense } from 'react';

import { LimitupReport } from '@/components/analytics/limitup-report';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';

/**
 * `/analytics/limitup?d=YYYYMMDD` — 상한가 보고서 (Phase 28 · D-09 「분석 › 상한가 보고서」 · D-10 · D-11 · D-12).
 *
 * 119 가 평일 밤 21:20쯤 적재한 그날 상한가 사건을 연다. 세로 순서(gh-trade D-20 · quick-261005-vk1): 머리(제목 + 날짜) →
 * KPI 띠 → (상한가 미도달 제외 한 줄) → 종목 리스트(행 아래 사건 카드 펼침) → 창구 지문표 → 어제 결과.
 *
 * - middleware 가 미인증을 `/login?next=…` 으로 돌려보낸다(공개 경로 whitelist 밖). DMA 매핑 판정은 server + RPC 가
 *   하고(403 `DMA_UNMAPPED`), 본문 안 `<DmaGate surface="상한가 보고서">` 는 왜 못 쓰는지를 말하는 표시 장치다(D-10).
 * - 서버 컴포넌트에서 `Suspense` 로 감싼다 — 본문이 `useSearchParams()`(`?d=`)를 쓰고 Next 15 는 그 훅에 Suspense
 *   경계를 요구한다(`app/trading/page.tsx` 와 같은 규율). 폴백은 비워 둔다 — 스켈레톤으로 위장하지 않는다.
 */
export default function LimitupReportPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <LimitupReport />
      </Suspense>
    </AppShell>
  );
}
