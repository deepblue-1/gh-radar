'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { MeClient } from '@/components/trading/me-client';

/**
 * `/me` — My page (전략 현황 · 미체결 · 잔고).
 *
 * middleware 가 미인증을 `/login?next=/me` 로 돌려보낸다. DMA 매핑 판정은 relay wss 가
 * 하고 `<DmaGate>` 가 본문을 대체한다.
 *
 * 본문 구성은 `MeClient` 가 전부 소유한다 — 상태줄 → 전략 현황 카드 → **계좌별** 미체결·
 * 잔고(계좌마다 카드 1개, 계좌 선택 UI 없음 — D-21). 16-11 이 두었던 자리표시
 * (`surface-placeholder`)는 16-15 에서 걷어냈다.
 */
export default function MePage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <MeClient />
    </AppShell>
  );
}
