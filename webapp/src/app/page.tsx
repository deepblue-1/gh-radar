import { Suspense } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { PAGE_WRAP } from '@/components/layout/page-layout';
import { HomeClient } from '@/components/home/home-client';
import { HomeSkeleton } from '@/components/home/home-skeleton';

/**
 * `/` — Phase 13 홈("오늘의 급등 테마", HOME-01).
 *
 * Phase 13 D-07: 홈을 앱 루트(`/`)로 승격 — 기존 `/scanner` 서버사이드 이동을 대체한다.
 * (상승률 상위는 `/search` 허브 타일로 진입하며, 직접 접근/북마크는 회귀 없이 동작한다.)
 * 본문은 공용 PAGE_WRAP(900 · 가운데 — quick-260926-o2u D3). 서버 컴포넌트라 지시문 없는 모듈에서 가져온다.
 *
 * 서버 컴포넌트에서 Suspense 로 HomeClient(`'use client'`) 를 감싼다 — useSearchParams 가
 * Suspense 경계를 요구하는 Next 15 제약은 이 경계로 충족된다.
 *
 * 정적 페이지다(`force-dynamic` 없음). 서버에서 읽는 데이터가 없는데 동적으로 두면
 * 사이드바 Link 가 프리페치할 것이 없어, 클릭마다 서버 렌더를 기다린 뒤에야 화면이 바뀌었다.
 * 정적이면 셸이 프리페치되어 클릭 즉시 전환되고, 데이터는 HomeClient 가 받는다.
 */

export default function HomePage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <div className={PAGE_WRAP}>
        <Suspense fallback={<HomeSkeleton />}>
          <HomeClient />
        </Suspense>
      </div>
    </AppShell>
  );
}
