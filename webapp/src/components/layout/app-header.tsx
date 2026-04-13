'use client';

import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/layout/theme-toggle';

export interface AppHeaderProps {
  /** 중앙 slot: 네비게이션 등 (선택). */
  nav?: ReactNode;
  /** 햄버거 버튼 클릭 핸들러. 제공되지 않으면 햄버거는 렌더되지 않는다. */
  onMenuClick?: () => void;
}

/**
 * AppHeader — UI-SPEC §4.1 / §4.2 공통 헤더.
 * - 56px sticky top-0, `bg-[--bg]/80 backdrop-blur-md border-b border-[--border]`
 * - 좌측: 로고(`gh-radar`) + 햄버거 버튼(<lg 만 표시, 44×44)
 * - 중앙: `nav` children
 * - 우측: `<ThemeToggle />` 고정
 */
export function AppHeader({ nav, onMenuClick }: AppHeaderProps) {
  return (
    <header
      className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--bg)_88%,transparent)] px-6 backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="사이드바 열기"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--fg)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <h3 className="text-[length:var(--t-lg)] font-bold tracking-[-0.01em] text-[var(--fg)]">
          gh-radar
        </h3>
      </div>

      {nav && <div className="flex flex-1 items-center justify-center">{nav}</div>}
      {!nav && <div className="flex-1" />}

      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
