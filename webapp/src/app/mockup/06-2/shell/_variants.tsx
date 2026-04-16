'use client';

import { useState } from 'react';
import { LogOut, Radar, Search, Star, TrendingUp } from 'lucide-react';

const NAV_ITEMS = [
  { key: 'scanner', label: '스캐너', icon: TrendingUp, active: true },
  { key: 'watchlist', label: '관심종목', icon: Star, active: false, badge: 12 },
  { key: 'search', label: '검색', icon: Search, active: false },
];

const USER = {
  email: 'trader.alex@gmail.com',
  name: 'Alex Trader',
  avatar: null as string | null,
};

function Initial() {
  return (
    <div className="flex size-8 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--muted-fg)_25%,transparent)] text-sm font-semibold uppercase text-[var(--fg)]">
      A
    </div>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[420px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--muted)]">
        {children}
      </aside>
      <div className="flex flex-1 flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-4">
          <Radar className="size-4 text-[var(--primary)]" aria-hidden="true" />
          <span className="text-sm font-semibold">gh-radar</span>
        </div>
        <div className="flex-1 p-6">
          <div className="h-full rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/40" />
        </div>
      </div>
    </div>
  );
}

function NavList() {
  return (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
              item.active
                ? 'bg-[color-mix(in_oklch,var(--primary)_16%,transparent)] text-[var(--primary)]'
                : 'text-[var(--fg)] hover:bg-[var(--bg)]'
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
            {item.badge != null && (
              <span className="ml-auto rounded-full bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-fg)]">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export function ShellBaselineUiSpec() {
  return (
    <ShellFrame>
      <NavList />
      <div className="border-t border-[var(--border)] p-3">
        <div className="flex items-center gap-2">
          <Initial />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-[var(--fg)]">{USER.email}</p>
          </div>
          <button
            type="button"
            aria-label="로그아웃"
            className="rounded-md p-1.5 text-[var(--muted-fg)] transition hover:bg-[var(--bg)] hover:text-[var(--destructive)]"
          >
            <LogOut className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </ShellFrame>
  );
}

export function ShellBaselinePopover() {
  const [open, setOpen] = useState(false);
  return (
    <ShellFrame>
      <NavList />
      <div className="relative border-t border-[var(--border)] p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-md p-1 transition hover:bg-[var(--bg)]"
          aria-expanded={open}
        >
          <Initial />
          <span className="truncate text-sm text-[var(--fg)]">{USER.name}</span>
        </button>
        {open && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-md border border-[var(--border)] bg-[var(--card)] p-2 shadow-sm">
            <p className="truncate px-2 py-1 text-xs text-[var(--muted-fg)]">{USER.email}</p>
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-[var(--fg)] transition hover:bg-[var(--muted)] hover:text-[var(--destructive)]"
            >
              <LogOut className="size-4" aria-hidden="true" />
              로그아웃
            </button>
          </div>
        )}
      </div>
    </ShellFrame>
  );
}

export function ShellBaselineCompact() {
  return (
    <ShellFrame>
      <NavList />
      <div className="flex items-center justify-between border-t border-[var(--border)] p-3">
        <div className="flex items-center gap-2" title={USER.email}>
          <Initial />
        </div>
        <button
          type="button"
          aria-label={`로그아웃 (${USER.email})`}
          title={`로그아웃 (${USER.email})`}
          className="rounded-md p-1.5 text-[var(--muted-fg)] transition hover:bg-[var(--bg)] hover:text-[var(--destructive)]"
        >
          <LogOut className="size-4" aria-hidden="true" />
        </button>
      </div>
    </ShellFrame>
  );
}
