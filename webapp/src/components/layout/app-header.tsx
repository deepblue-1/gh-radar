'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/layout/theme-toggle';

export interface AppHeaderProps {
  /** 중앙 slot: 네비게이션 등 (선택). */
  nav?: ReactNode;
  /** 햄버거 버튼 클릭 핸들러. 제공되지 않으면 햄버거는 렌더되지 않는다. */
  onMenuClick?: () => void;
  /**
   * 헤더 우측에 테마 토글을 렌더할지. 기본 `false`.
   *
   * 토글의 집은 **사이드바 하단 유저 섹션 줄**이다. 사이드바가 없는 화면
   * (`CenterShell` · `AppShell hideSidebar`)에는 그 집이 없어 토글이 통째로 사라지므로,
   * 그 화면들만 이 prop 을 켜서 헤더 우측에 되살린다.
   */
  themeToggle?: boolean;
}

/**
 * AppHeader — UI-SPEC §4.1 / §4.2 공통 헤더.
 * - 56px sticky top-0, `bg-[--bg]/80 backdrop-blur-md border-b border-[--border]`
 * - 좌측: 로고(`gh-radar`, `/` 로 이동) + 햄버거 버튼(<lg 만 표시, 44×44)
 * - 중앙: `nav` slot — Phase 6 이후 AppShell 이 `<GlobalSearch />` 를 주입.
 *   ★ 정렬이 폭에 따라 다르다 — `<lg` 는 **우측 정렬**(검색 아이콘 버튼이 탑바 오른쪽 끝),
 *   `lg+` 는 가운데(readonly 입력). 모바일에서 아이콘 하나가 어정쩡하게 가운데 뜨지 않게 한다.
 * - 우측: 테마 토글은 **상시 렌더가 아니다** — `themeToggle` 이 `true` 인 화면
 *   (사이드바가 없는 `CenterShell` · `AppShell hideSidebar`)에서만 나온다.
 *   사이드바가 있는 일반 화면에서는 토글이 사이드바 하단 유저 섹션 줄에 산다.
 */
export function AppHeader({ nav, onMenuClick, themeToggle = false }: AppHeaderProps) {
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
          href="/"
          aria-label="gh-radar 홈"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <h3 className="text-[length:var(--t-lg)] font-bold tracking-[-0.01em] text-[var(--fg)]">
            gh-radar
          </h3>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-end lg:justify-center">
        {nav ?? null}
      </div>

      {themeToggle && (
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      )}
    </header>
  );
}
