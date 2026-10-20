import { Suspense } from 'react';

import { AccumReport } from '@/components/analytics/accum-report';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';

/**
 * `/analytics/accum?d=YYYYMMDD` — 매집감지 보고서 (Phase 34 · D-06 · D-07 · D-08).
 *
 * 119 가 평일 밤 적재한 그날 매집감지(KYOBO119 판정) 종목을 연다. 세로 순서: 머리(제목 + 출처 칩 + 날짜) →
 * (KPI 4칸 — 34-04) → 매집감지 종목 카드(행 기본 전부 접힘 · 펼치면 상세를 그때 받아 온다 — 지연 로드).
 *
 * - middleware 가 미인증을 `/login?next=…` 으로 돌려보낸다. DMA 매핑 판정은 server + RPC 가 하고(403 `DMA_UNMAPPED`),
 *   본문 안 `<DmaGate surface="매집감지 보고서">` 는 왜 못 쓰는지를 말하는 표시 장치다.
 * - 서버 컴포넌트에서 `Suspense` 로 감싼다 — 본문이 `useSearchParams()`(`?d=`)를 쓰고 Next 15 는 그 훅에 Suspense
 *   경계를 요구한다(팀 매집 · 상한가 보고서 페이지와 같은 규율). 폴백은 비워 둔다.
 */
export default function AccumReportPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <AccumReport />
      </Suspense>
    </AppShell>
  );
}
