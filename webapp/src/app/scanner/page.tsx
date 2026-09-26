import { Suspense } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { PAGE_WRAP } from '@/components/layout/page-layout';
import { ScannerClient } from '@/components/scanner/scanner-client';
import { ScannerSkeleton } from '@/components/scanner/scanner-skeleton';

/**
 * `/scanner` — Phase 5 실 Scanner UI.
 *
 * 서버 컴포넌트에서 Suspense 로 ScannerClient(`'use client'`) 를 감싼다 — useSearchParams 가
 * Suspense 경계를 요구하는 Next 15 제약(Pitfall 1)은 이 경계로 충족된다.
 *
 * 정적 페이지다(`force-dynamic` 없음). 동적이면 사이드바 Link 가 프리페치할 것이 없어
 * 클릭마다 서버 렌더를 기다렸다. 정적 셸이 프리페치되어 클릭 즉시 전환된다.
 *
 * Phase 06.2: `<AppSidebar />` 주입 — UserSection 팝오버 (D-16).
 * 진입은 `/search` 허브 타일 — 사이드바에는 이 페이지 링크가 없고 「검색」이 켜진다(quick-260926-o2u D1).
 * 본문은 공용 PAGE_WRAP(900 · 가운데 — D3).
 */

export default function ScannerPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <div className={PAGE_WRAP}>
        <Suspense fallback={<ScannerSkeleton />}>
          <ScannerClient />
        </Suspense>
      </div>
    </AppShell>
  );
}
