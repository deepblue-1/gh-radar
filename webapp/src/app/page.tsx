import { Suspense } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { HomeClient } from '@/components/home/home-client';
import { HomeSkeleton } from '@/components/home/home-skeleton';

/**
 * `/` — Phase 13 홈("오늘의 급등 테마", HOME-01).
 *
 * Phase 13 D-07: 홈을 앱 루트(`/`)로 승격 — 기존 `/scanner` 서버사이드 이동을 대체한다.
 * (스캐너는 사이드바 2번째 메뉴로 유지되며, 직접 접근/북마크는 회귀 없이 동작한다.)
 *
 * 서버 컴포넌트에서 Suspense 로 HomeClient(`'use client'`) 를 감싸고,
 * `dynamic = 'force-dynamic'` 으로 useSearchParams 등 클라이언트 훅이 Suspense 경계를
 * 요구하는 Next 15 제약을 충족한다 (scanner/page.tsx 선례 mirror).
 */
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 md:gap-6">
        <Suspense fallback={<HomeSkeleton />}>
          <HomeClient />
        </Suspense>
      </div>
    </AppShell>
  );
}
