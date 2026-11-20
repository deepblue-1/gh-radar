import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SettlementClient } from '@/components/settlement/settlement-client';

/**
 * `/admin/settlement` — 어드민 정산 (Phase 44 · D-18 · UI-SPEC ①).
 *
 * - 미들웨어 ADMIN_PREFIX 가 admin 아닌 사용자를 `/` 로 돌려보낸다. 데이터 인가는 server `requireAdmin`
 *   (`GET /api/admin/settlement`)이 한다 — 웹 쪽 판정은 표시 장치일 뿐이다.
 * - `/admin/pnl/page.tsx` 와 같은 꼴(AppShell + AppSidebar + Suspense 폴백 없음 + 클라이언트 본문).
 * - 문서 제목 「정산 · Admin」 은 서버 메타데이터가 정본이고 본문 effect 도 같은 값을 단다.
 */
export const metadata: Metadata = { title: '정산 · Admin' };

export default function AdminSettlementPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <SettlementClient />
      </Suspense>
    </AppShell>
  );
}
