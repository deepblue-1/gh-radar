'use client';

import { ServersClient } from '@/components/admin/servers-client';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';

/**
 * `/admin/servers` — 웹 Admin 서버 레지스트리 (Phase 29 D-09 · D-17 · ADMIN-10).
 *
 * middleware 가 admin 이 아닌 사용자를 `/` 로 돌려보낸다(`access-gate.ts` 의 `/admin` 접두 판정). 데이터는 Express
 * `/api/admin/servers` 만 읽고 쓴다(D-07). 주문 서버 · 시세 주 서버 전환의 실행은 relay 몫이다(29-22 · 29-23).
 */
export default function AdminServersPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <ServersClient />
    </AppShell>
  );
}
