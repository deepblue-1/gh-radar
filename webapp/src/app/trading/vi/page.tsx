'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { ViClient } from '@/components/trading/vi-client';

/**
 * `/trading/vi` — VI 변동성완화 종합주문.
 *
 * middleware 가 미인증을 `/login?next=/trading/vi` 로 돌려보낸다. DMA 매핑 판정은
 * relay wss 가 하고 `<DmaGate>` 가 본문을 대체한다.
 */
export default function ViPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <ViClient />
    </AppShell>
  );
}
