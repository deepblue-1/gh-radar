import type { ReactNode } from 'react';

import { AppHeader } from '@/components/layout/app-header';

export interface CenterShellProps {
  /** 헤더 중앙 네비 slot. */
  nav?: ReactNode;
  children: ReactNode;
}

/**
 * CenterShell — UI-SPEC §4.2 (종목 상세 레이아웃).
 * - Header 재사용 + `<main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">{children}</main>`
 * - `<sm` 에서 px-4, `>=sm` 에서 px-6 으로 여백 확장.
 */
export function CenterShell({ nav, children }: CenterShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--fg)]">
      <AppHeader nav={nav} />
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
