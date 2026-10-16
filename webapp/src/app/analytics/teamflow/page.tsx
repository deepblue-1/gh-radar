import { Suspense } from 'react';

import { TeamflowReport } from '@/components/analytics/teamflow-report';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';

/**
 * `/analytics/teamflow?d=YYYYMMDD` — 팀 매집 보고서 (Phase 33 · TEAM-03 · TEAM-04 · D-05 · D-08).
 *
 * 119 가 평일 밤 적재한 그날 팀(교보 · 한국 · 유진 · 신한 · NH) 매집 탐지 종목을 연다. 세로 순서: 머리(제목 + 날짜) →
 * (KPI 띠 — 33-03) → 탐지 종목 카드(행 기본 전부 접힘 · 펼치면 요약 · 상세).
 *
 * - middleware 가 미인증을 `/login?next=…` 으로 돌려보낸다. DMA 매핑 판정은 server + RPC 가 하고(403 `DMA_UNMAPPED`),
 *   본문 안 `<DmaGate surface="팀 매집">` 은 왜 못 쓰는지를 말하는 표시 장치다.
 * - 서버 컴포넌트에서 `Suspense` 로 감싼다 — 본문이 `useSearchParams()`(`?d=`)를 쓰고 Next 15 는 그 훅에 Suspense
 *   경계를 요구한다(상한가 보고서 페이지와 같은 규율). 폴백은 비워 둔다.
 */
export default function TeamflowReportPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <TeamflowReport />
      </Suspense>
    </AppShell>
  );
}
