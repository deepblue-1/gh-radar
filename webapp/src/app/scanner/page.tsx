import { Suspense } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { ScannerClient } from '@/components/scanner/scanner-client';
import { ScannerSkeleton } from '@/components/scanner/scanner-skeleton';

/**
 * `/scanner` — Phase 5 실 Scanner UI.
 *
 * 서버 컴포넌트에서 Suspense 로 ScannerClient(`'use client'`) 를 감싸고,
 * `dynamic = 'force-dynamic'` 으로 useSearchParams 가 Suspense 경계를 요구하는
 * Next 15 제약을 충족한다 (Pitfall 1).
 */
export const dynamic = 'force-dynamic';

export default function ScannerPage() {
  return (
    <AppShell hideSidebar>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 md:gap-6">
        <Suspense fallback={<ScannerSkeleton />}>
          <ScannerClient />
        </Suspense>
      </div>
    </AppShell>
  );
}
