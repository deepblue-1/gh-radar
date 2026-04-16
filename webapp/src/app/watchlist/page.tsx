'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { WatchlistClient } from '@/components/watchlist/watchlist-client';

/**
 * `/watchlist` — 로그인 사용자의 관심종목 페이지.
 *
 * middleware 에 의해 미인증 사용자는 `/login?next=/watchlist` 로 리다이렉트되므로
 * 이 페이지는 세션이 있는 상태에서만 도달한다 (Plan 03 게이트).
 *
 * AppShell + AppSidebar 를 두르고 WatchlistClient 에서 모든 데이터/폴링/렌더 책임을
 * 맡는다. 사이드바의 "관심종목" 링크가 `aria-current="page"` 로 active 상태가 된다.
 */
export default function WatchlistPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <WatchlistClient />
    </AppShell>
  );
}
