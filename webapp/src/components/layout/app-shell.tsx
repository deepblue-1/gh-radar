'use client';

import { useState, type ReactNode } from 'react';

import { AppHeader } from '@/components/layout/app-header';
import { GlobalSearch } from '@/components/search/global-search';
import { Sheet, SheetContent } from '@/components/ui/sheet';

export interface AppShellProps {
  /** 좌측 사이드바 콘텐츠. Desktop 240px, Mobile Drawer 렌더. */
  sidebar?: ReactNode;
  /** 헤더 중앙 네비 slot. */
  nav?: ReactNode;
  /**
   * `true` 면 사이드바 영역과 모바일 Drawer 토글을 렌더하지 않고 헤더 전용 모드로 동작.
   * Phase 06.2: 일반 페이지는 `sidebar={<AppSidebar />}` 지정하여 사이드바 활성 (Auth 도입 + D-16).
   * `/design` 카탈로그 및 AppShell 기반 error/not-found 는 여전히 `hideSidebar` 유지하여
   * 스캐폴드/오류 화면의 단순성과 회귀 방지 (D-17).
   * 기본값 `false` 유지.
   */
  hideSidebar?: boolean;
  children: ReactNode;
}

/**
 * AppShell — UI-SPEC §4.1 (스캐너/대시보드 레이아웃).
 * - Desktop(>=lg): 56px top header + 240px left sidebar + 24px padding main
 * - Mobile(<lg): sidebar → `<Sheet side="left">` Drawer (햄버거 트리거)
 * - ESC / scrim 클릭 / 내부 nav 링크 클릭 시 자동 닫힘 (Radix Dialog 기본 + 외부 훅)
 * - `hideSidebar` 활성 시: 사이드바/Drawer 비활성 → 헤더 + 단일 main 컬럼.
 */
export function AppShell({
  sidebar,
  nav,
  hideSidebar = false,
  children,
}: AppShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const showSidebar = !hideSidebar && Boolean(sidebar);
  // Phase 6 — nav 미지정 시 GlobalSearch 자동 마운트. 명시적 `null` 은 그대로 존중.
  const navContent = nav === undefined ? <GlobalSearch /> : nav;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--fg)]">
      <AppHeader
        nav={navContent}
        onMenuClick={showSidebar ? () => setSheetOpen(true) : undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        {showSidebar && (
          <aside className="hidden w-60 shrink-0 border-r border-[var(--border)] bg-[var(--muted)] p-3 lg:block">
            {sidebar}
          </aside>
        )}

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>

      {showSidebar && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="left"
            className="w-[min(280px,85vw)] bg-[var(--muted)] p-3"
          >
            <div
              onClick={(e) => {
                // 내부 nav 링크/버튼 클릭 시 Drawer 자동 닫힘.
                let node: HTMLElement | null = e.target as HTMLElement;
                while (node && node !== e.currentTarget) {
                  const tag = node.tagName;
                  if (
                    tag === 'A' ||
                    (tag === 'BUTTON' && node.hasAttribute('data-nav-item'))
                  ) {
                    setSheetOpen(false);
                    return;
                  }
                  node = node.parentElement;
                }
              }}
            >
              {sidebar}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
