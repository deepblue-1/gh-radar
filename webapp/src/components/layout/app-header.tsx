'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Input } from '@/components/ui/input';

export interface AppHeaderProps {
  /** 중앙 slot: 네비게이션 등 (선택). */
  nav?: ReactNode;
  /** 햄버거 버튼 클릭 핸들러. 제공되지 않으면 햄버거는 렌더되지 않는다. */
  onMenuClick?: () => void;
}

/**
 * AppHeader — UI-SPEC §4.1 / §4.2 공통 헤더.
 * - 56px sticky top-0, `bg-[--bg]/80 backdrop-blur-md border-b border-[--border]`
 * - 좌측: 로고(`gh-radar`, `/scanner` 로 이동) + 햄버거 버튼(<lg 만 표시, 44×44)
 * - 중앙: `nav` children (없을 때 Phase 6 종목 검색 자리 예약용 disabled Input 표시, `>=lg` 한정)
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
        <Link
          href="/scanner"
          aria-label="gh-radar 홈"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <h3 className="text-[length:var(--t-lg)] font-bold tracking-[-0.01em] text-[var(--fg)]">
            gh-radar
          </h3>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center">
        {nav ?? (
          <Input
            disabled
            aria-label="종목 검색 (Phase 6 활성)"
            placeholder="종목 검색 (Phase 6)"
            className="hidden max-w-sm lg:flex"
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
