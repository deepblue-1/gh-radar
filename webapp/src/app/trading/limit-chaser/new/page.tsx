'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { LimitChaserClient } from '@/components/trading/limit-chaser-client';

/**
 * `/trading/limit-chaser/new` — **새 상따 전략 빈 폼** (UI-SPEC P1).
 *
 * 사이드바 2단 「상따」 항목이 가리키는 곳이고, 이 경로일 때만 그 항목이 `aria-current` 를
 * 받는다(3단 목록 항목과 활성 표시가 겹치지 않게).
 *
 * middleware 가 미인증 접근을 `/login?next=/trading/limit-chaser/new` 로 돌려보내므로
 * 여기 도달하면 세션은 있다. **DMA 매핑 유무**는 relay wss 가 판정하고 클라이언트가
 * `<DmaGate>` 로 가른다 — 사이드바 숨김은 권한이 아니다(T-16-04).
 */
export default function LimitChaserNewPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <LimitChaserClient />
    </AppShell>
  );
}
