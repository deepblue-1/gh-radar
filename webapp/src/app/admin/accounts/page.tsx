'use client';

import { AccountsClient } from '@/components/admin/accounts-client';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';

/**
 * `/admin/accounts` — 웹 Admin 계좌 마스터 (quick 261106-lwu D-01 · D-06 · D-07 · D-08).
 *
 * middleware 가 admin 이 아닌 사용자를 `/` 로 돌려보낸다(`access-gate.ts` 의 `/admin` 접두 판정). 데이터는 Express
 * `/api/admin/accounts` 만 읽고 쓴다(Express `requireAdmin` 경로 한정 관문). 사용자에게 계좌를 연결하는 일은 `/admin/users`.
 */
export default function AdminAccountsPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <AccountsClient />
    </AppShell>
  );
}
