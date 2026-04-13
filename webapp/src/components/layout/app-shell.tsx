'use client';

import { useState, type ReactNode } from 'react';

import { AppHeader } from '@/components/layout/app-header';
import { Sheet, SheetContent } from '@/components/ui/sheet';

export interface AppShellProps {
  /** 좌측 사이드바 콘텐츠. Desktop 240px, Mobile Drawer 렌더. */
  sidebar?: ReactNode;
  /** 헤더 중앙 네비 slot. */
  nav?: ReactNode;
  children: ReactNode;
}

/**
 * AppShell — UI-SPEC §4.1 (스캐너/대시보드 레이아웃).
 * - Desktop(>=lg): 56px top header + 240px left sidebar + 24px padding main
 * - Mobile(<lg): sidebar → `<Sheet side="left">` Drawer (햄버거 트리거)
 * - ESC / scrim 클릭 / 내부 nav 링크 클릭 시 자동 닫힘 (Radix Dialog 기본 + 외부 훅)
 */
export function AppShell({ sidebar, nav, children }: AppShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--fg)]">
      <AppHeader
        nav={nav}
        onMenuClick={sidebar ? () => setSheetOpen(true) : undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        {sidebar && (
          <aside className="hidden w-60 shrink-0 border-r border-[var(--border)] bg-[var(--muted)] p-3 lg:block">
            {sidebar}
          </aside>
        )}

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>

      {sidebar && (
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
