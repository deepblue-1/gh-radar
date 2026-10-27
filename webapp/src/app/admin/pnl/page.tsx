import { Suspense } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { PnlAdminClient } from '@/components/pnl/pnl-admin-client';

/**
 * `/admin/pnl?group=user|account&range=7|30|90|month` — 일자별 매매손익 어드민 (Phase 36 · D-17 ① · D-18 · UI-SPEC ⑤a).
 *
 * - 미들웨어 ADMIN_PREFIX 가 admin 아닌 사용자를 `/` 로 돌려보낸다. 데이터 인가는 server `requireAdmin`
 *   (`GET /api/admin/pnl`)이 한다 — 웹 쪽 판정은 표시 장치일 뿐이다.
 * - 서버 컴포넌트에서 `Suspense` 로 감싼다 — 본문이 `useSearchParams()`(`?group` · `?range`)를 쓰고 Next 15 는 그 훅에
 *   Suspense 경계를 요구한다(발사 페이지와 같은 꼴). 폴백은 비운다 — 본문이 즉시 머리 · 세그먼트를 그리고 아래만 Skeleton 이다.
 * - 문서 제목 「매매손익 · Admin」 은 본문이 effect 로 단다(발사 페이지 launch-client 와 같은 방식).
 */
export default function AdminPnlPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <PnlAdminClient />
      </Suspense>
    </AppShell>
  );
}
