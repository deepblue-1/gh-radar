'use client';

import { UsersClient } from '@/components/admin/users-client';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';

/**
 * `/admin/users` — 웹 Admin 사용자 관리 (Phase 29 D-14 · ADMIN-09).
 *
 * middleware 가 admin 이 아닌 사용자를 `/` 로 돌려보낸다(`access-gate.ts` 의 `/admin` 접두 판정 — 사이드바
 * 숨김은 권한이 아니다). 데이터는 Express `/api/admin/users` 만 읽는다(D-07). relay wss 는 필요 없다.
 */
export default function AdminUsersPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <UsersClient />
    </AppShell>
  );
}
