'use client';

import { useState } from 'react';
import { Bookmark, Check, Plus, Radar, Sparkles, Star, X } from 'lucide-react';

function StateGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>;
}

function StateCell({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex h-12 items-center">{children}</div>
      <div className="flex flex-col gap-0.5 text-xs">
        <span className="font-medium text-[var(--fg)]">{label}</span>
        {sub && <span className="text-[var(--muted-fg)]">{sub}</span>}
      </div>
    </div>
  );
}

// F1 · Radial pulse fill
export function StarFdRadialPulse() {
  const [set, setSet] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <StateGrid>
        <StateCell label="Unset">
          <button
            type="button"
            className="relative flex size-10 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted-fg)] transition hover:text-[var(--primary)]"
          >
            <Star className="size-4" aria-hidden="true" />
          </button>
        </StateCell>
        <StateCell label="Set">
          <button
            type="button"
            className="relative flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-[color-mix(in_oklch,var(--primary)_60%,var(--accent))] text-white shadow-sm shadow-[var(--primary)]/30"
          >
            <Star className="size-4 fill-white" aria-hidden="true" />
          </button>
        </StateCell>
        <StateCell label="Loading">
          <button
            type="button"
            aria-busy="true"
            className="relative flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-[color-mix(in_oklch,var(--primary)_60%,var(--accent))] text-white"
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--primary)]/30" />
            <Star className="relative size-4 fill-white" aria-hidden="true" />
          </button>
        </StateCell>
        <StateCell label="Disabled">
          <button
            type="button"
            disabled
            className="flex size-10 items-center justify-center rounded-full border border-dashed border-[var(--muted-fg)]/30 text-[var(--muted-fg)]/50"
          >
            <Star className="size-4" aria-hidden="true" />
          </button>
        </StateCell>
      </StateGrid>

      <div className="rounded-md border border-dashed border-[var(--border)] p-3">
        <p className="mb-2 text-[11px] font-medium uppercase text-[var(--muted-fg)]">
          인터랙티브 (클릭해보세요)
        </p>
        <button
          type="button"
          onClick={() => setSet((v) => !v)}
          aria-pressed={set}
          className={`relative flex size-10 items-center justify-center rounded-full transition ${
            set
              ? 'bg-gradient-to-br from-[var(--primary)] to-[color-mix(in_oklch,var(--primary)_60%,var(--accent))] text-white shadow-sm shadow-[var(--primary)]/30'
              : 'border border-[var(--border)] text-[var(--muted-fg)] hover:text-[var(--primary)]'
          }`}
        >
          <Star className={`size-4 ${set ? 'fill-white' : ''}`} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// F2 · Count chip with badge
export function StarFdCountBadge() {
  return (
    <div className="flex flex-col gap-4">
      <StateGrid>
        <StateCell label="Unset">
          <button
            type="button"
            className="group inline-flex items-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)] text-xs font-medium text-[var(--muted-fg)] transition hover:border-[var(--primary)]"
          >
            <span className="flex size-8 items-center justify-center">
              <Plus className="size-3.5" aria-hidden="true" />
            </span>
            <span className="border-l border-[var(--border)] px-2">관심</span>
          </button>
        </StateCell>
        <StateCell label="Set (count: 12)">
          <button
            type="button"
            className="inline-flex items-center overflow-hidden rounded-md border border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_12%,var(--bg))] text-xs font-semibold text-[var(--primary)]"
          >
            <span className="flex size-8 items-center justify-center">
              <Star className="size-3.5 fill-[var(--primary)]" aria-hidden="true" />
            </span>
            <span className="border-l border-[var(--primary)]/40 px-2">저장됨</span>
            <span className="border-l border-[var(--primary)]/40 bg-[var(--primary)] px-2 py-1 font-mono text-[10px] text-white">
              12
            </span>
          </button>
        </StateCell>
        <StateCell label="Loading">
          <button
            type="button"
            aria-busy="true"
            className="inline-flex items-center overflow-hidden rounded-md border border-[var(--primary)]/50 bg-[color-mix(in_oklch,var(--primary)_6%,var(--bg))] text-xs font-semibold text-[var(--primary)]/80"
          >
            <span className="flex size-8 items-center justify-center">
              <Star className="size-3.5 animate-pulse fill-[var(--primary)]/70" aria-hidden="true" />
            </span>
            <span className="border-l border-[var(--primary)]/30 px-2">저장 중</span>
          </button>
        </StateCell>
        <StateCell label="50/50">
          <button
            type="button"
            disabled
            className="inline-flex items-center overflow-hidden rounded-md border border-[var(--destructive)]/50 bg-[color-mix(in_oklch,var(--destructive)_8%,var(--bg))] text-xs font-semibold text-[var(--destructive)] opacity-80"
          >
            <span className="flex size-8 items-center justify-center">
              <X className="size-3.5" aria-hidden="true" />
            </span>
            <span className="border-l border-[var(--destructive)]/30 px-2">한도 초과</span>
          </button>
        </StateCell>
      </StateGrid>
    </div>
  );
}

// F3 · Sticker fill (bold typographic)
export function StarFdStickerSwap() {
  return (
    <StateGrid>
      <StateCell label="Unset" sub="스탬프형">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-sm border-2 border-dashed border-[var(--border)] bg-[var(--bg)] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--muted-fg)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          <Radar className="size-3" aria-hidden="true" />
          add
        </button>
      </StateCell>
      <StateCell label="Set">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-sm border-2 border-[var(--primary)] bg-[var(--primary)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
        >
          <Check className="size-3" aria-hidden="true" />
          tracked
        </button>
      </StateCell>
      <StateCell label="Loading">
        <button
          type="button"
          aria-busy="true"
          className="flex items-center gap-1.5 rounded-sm border-2 border-[var(--primary)]/60 bg-[var(--primary)]/60 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
        >
          <Sparkles className="size-3 animate-pulse" aria-hidden="true" />
          saving
        </button>
      </StateCell>
      <StateCell label="Disabled">
        <button
          type="button"
          disabled
          className="flex items-center gap-1.5 rounded-sm border-2 border-[var(--muted-fg)]/30 bg-[var(--muted)] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--muted-fg)] opacity-60"
        >
          <Bookmark className="size-3" aria-hidden="true" />
          50 max
        </button>
      </StateCell>
    </StateGrid>
  );
}
