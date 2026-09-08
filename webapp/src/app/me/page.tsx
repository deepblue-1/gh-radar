'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { MeClient } from '@/components/trading/me-client';

/**
 * `/me` — My page (전략 현황 · 미체결 · 잔고).
 *
 * middleware 가 미인증을 `/login?next=/me` 로 돌려보낸다. DMA 매핑 판정은 relay wss 가
 * 하고 `<DmaGate>` 가 본문을 대체한다.
 */
export default function MePage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <MeClient />
    </AppShell>
  );
}
