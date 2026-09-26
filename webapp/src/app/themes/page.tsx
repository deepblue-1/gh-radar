'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { ThemesClient } from '@/components/theme/themes-client';

/**
 * `/themes` — 테마 목록 (UI-SPEC §S1 변형 C 랭킹).
 *
 * 내 테마(상단 칩) + 시스템 테마 랭킹(상위3평균 desc) + 유저 테마 CRUD 모달.
 * watchlist/page 패턴 — AppShell + AppSidebar 두르고 ThemesClient 가 데이터/폴링/렌더 담당.
 * 진입은 `/search` 허브 타일이고, 사이드바는 「검색」이 aria-current="page" 로 켜진다(quick-260926-o2u D1).
 */
export default function ThemesPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <ThemesClient />
    </AppShell>
  );
}
