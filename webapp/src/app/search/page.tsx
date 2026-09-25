'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SearchPageClient } from '@/components/search/search-page-client';

/**
 * `/search` — 탐색 허브 (Phase 21 D-07 · D-07a, 스케치 005 B).
 *
 * 앱 「검색」 탭의 목적지이자 웹 신규 페이지다(웹 사이드바 「홈」 아래 「검색」 링크).
 * middleware 기본 차단 규칙이 그대로 적용된다 — 공개 경로가 아니므로 미인증 사용자는
 * `/login?next=/search` 로 간다. 조립은 `/watchlist` 와 같은 모양이다.
 */
export default function SearchPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <SearchPageClient />
    </AppShell>
  );
}
