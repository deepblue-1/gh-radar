'use client';

import {
  Activity,
  Bell,
  Flame,
  LogOut,
  Radar,
  Search,
  Star,
  TrendingUp,
} from 'lucide-react';

const USER = { email: 'trader.alex@gmail.com', name: 'Alex' };

function Frame({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'dark' }) {
  const bg = variant === 'dark' ? 'bg-[var(--fg)] text-[var(--bg)]' : 'bg-[var(--muted)]';
  return (
    <div className="flex h-[420px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]">
      <aside className={`flex w-56 shrink-0 flex-col border-r border-[var(--border)] ${bg}`}>
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

export function ShellFdCommandCenter() {
  return (
    <Frame>
      <div className="flex flex-1 flex-col gap-4 p-3">
        <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklch,var(--up)_14%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--up)]">
              <Flame className="size-3" aria-hidden="true" />
              LIVE
            </span>
            <span className="font-mono text-[10px] text-[var(--muted-fg)]">14:22:07</span>
          </div>
          <div className="mt-1 font-mono text-xs text-[var(--muted-fg)]">상한가 근접 32 / 코스닥 11</div>
        </div>

        <nav className="flex flex-col gap-0.5">
          <NavRow icon={TrendingUp} label="스캐너" meta="+32" active />
          <NavRow icon={Star} label="관심종목" meta="12/50" />
          <NavRow icon={Search} label="검색" />
          <NavRow icon={Bell} label="알림" meta="3" dot />
        </nav>

        <div className="mt-auto rounded-md border border-[var(--border)] bg-[var(--card)] p-2.5">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--destructive)] text-xs font-semibold text-white">
                A
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[var(--card)] bg-[var(--up)]" aria-label="online" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{USER.name}</p>
              <p className="truncate text-[10px] text-[var(--muted-fg)]">{USER.email}</p>
            </div>
            <button
              type="button"
              aria-label="로그아웃"
              className="rounded-md p-1 text-[var(--muted-fg)] transition hover:bg-[var(--muted)] hover:text-[var(--destructive)]"
            >
              <LogOut className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function NavRow({
  icon: Icon,
  label,
  meta,
  active,
  dot,
}: {
  icon: typeof TrendingUp;
  label: string;
  meta?: string;
  active?: boolean;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition ${
        active
          ? 'bg-[var(--card)] text-[var(--primary)] shadow-sm'
          : 'text-[var(--fg)] hover:bg-[var(--card)]'
      }`}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span>{label}</span>
      {meta && (
        <span className="ml-auto font-mono text-[10px] text-[var(--muted-fg)]">{meta}</span>
      )}
      {dot && !meta && (
        <span className="ml-auto size-1.5 rounded-full bg-[var(--destructive)]" aria-hidden="true" />
      )}
    </button>
  );
}

export function ShellFdEditorial() {
  return (
    <Frame>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted-fg)]">
            Market
          </p>
          <p className="text-2xl font-semibold leading-none tracking-tight">
            Radar.
          </p>
        </div>

        <div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-fg)]">
          ─ Scanning
        </div>
        <div className="flex flex-col gap-1">
          <EditorialRow label="스캐너" count={32} active />
          <EditorialRow label="관심종목" count={12} />
          <EditorialRow label="검색" />
        </div>

        <div className="mb-3 mt-5 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-fg)]">
          ─ Session
        </div>
        <div className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] p-2.5">
          <div className="flex size-7 items-center justify-center rounded-full bg-[var(--fg)] text-[10px] font-semibold text-[var(--bg)]">
            A
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{USER.name}</p>
            <p className="truncate text-[10px] text-[var(--muted-fg)]">{USER.email}</p>
          </div>
        </div>
        <button
          type="button"
          className="mt-2 flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs font-medium text-[var(--fg)] transition hover:border-[var(--destructive)] hover:text-[var(--destructive)]"
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          로그아웃
        </button>
      </div>
    </Frame>
  );
}

function EditorialRow({
  label,
  count,
  active,
}: {
  label: string;
  count?: number;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex items-baseline justify-between border-b border-[var(--border)] px-0 py-1.5 text-left text-sm transition hover:text-[var(--primary)] ${
        active ? 'text-[var(--primary)]' : 'text-[var(--fg)]'
      }`}
    >
      <span className="font-semibold tracking-tight">{label}</span>
      {count != null && (
        <span className="font-mono text-xs text-[var(--muted-fg)]">
          {String(count).padStart(2, '0')}
        </span>
      )}
    </button>
  );
}

export function ShellFdPulse() {
  return (
    <Frame>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
          <div className="relative flex size-8 items-center justify-center rounded-lg bg-[var(--primary)]/10">
            <Activity className="size-4 text-[var(--primary)]" aria-hidden="true" />
            <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[var(--up)]" />
          </div>
          <div>
            <p className="text-xs font-semibold leading-none">시장 개장</p>
            <p className="mt-1 text-[10px] text-[var(--muted-fg)]">마감까지 2시간 38분</p>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-3">
          <button
            type="button"
            className="group relative flex items-center gap-2 overflow-hidden rounded-lg bg-[var(--card)] p-3 shadow-sm ring-1 ring-[var(--primary)]/30"
          >
            <div
              className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[var(--primary)] to-[var(--up)]"
              aria-hidden="true"
            />
            <TrendingUp className="size-4 text-[var(--primary)]" aria-hidden="true" />
            <span className="flex-1 text-left text-sm font-semibold text-[var(--primary)]">
              스캐너
            </span>
            <span className="font-mono text-[10px] text-[var(--up)]">+32</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg p-3 text-sm font-medium text-[var(--fg)] transition hover:bg-[var(--card)]"
          >
            <Star className="size-4" aria-hidden="true" />
            관심종목
            <span className="ml-auto font-mono text-[10px] text-[var(--muted-fg)]">12/50</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg p-3 text-sm font-medium text-[var(--fg)] transition hover:bg-[var(--card)]"
          >
            <Search className="size-4" aria-hidden="true" />
            검색
          </button>
        </div>

        <div className="border-t border-[var(--border)] bg-[var(--card)] p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] text-sm font-semibold text-white">
              A
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{USER.name}</p>
              <p className="truncate text-[10px] text-[var(--muted-fg)]">{USER.email}</p>
            </div>
          </div>
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--muted)] px-2 py-1.5 text-xs font-medium text-[var(--fg)] transition hover:bg-[color-mix(in_oklch,var(--destructive)_14%,var(--muted))] hover:text-[var(--destructive)]"
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            로그아웃
          </button>
        </div>
      </div>
    </Frame>
  );
}
