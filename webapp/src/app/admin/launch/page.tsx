import { Suspense } from 'react';

import { LaunchClient } from '@/components/admin/launch-client';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';

/**
 * `/admin/launch?tab=orders&d=YYYYMMDD&fire=q16|n0930` — 발사 경계 지도 어드민 (Phase 35 · LAUNCH-06 · D-11 ~ D-14).
 *
 * - 미들웨어 ADMIN_PREFIX 가 admin 아닌 사용자를 `/` 로 돌려보낸다. 데이터 인가는 server `requireAdmin`
 *   (`/api/admin/launch/*`)이 한다 — 웹 쪽 판정은 표시 장치일 뿐이다.
 * - 서버 컴포넌트에서 `Suspense` 로 감싼다 — 본문이 `useSearchParams()`(`?tab` · `?d` · `?fire`)를 쓰고 Next 15 는 그 훅에
 *   Suspense 경계를 요구한다(RESEARCH Pitfall 11 · 클라이언트 지시문만 단 `/admin/servers` 페이지 꼴을 베끼지 않는다). 폴백은 비운다.
 */
export default function AdminLaunchPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <LaunchClient />
      </Suspense>
    </AppShell>
  );
}
