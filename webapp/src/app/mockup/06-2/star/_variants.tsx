'use client';

import { useState } from 'react';
import { Heart, Plus, Star } from 'lucide-react';

function StateGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
  );
}

function StateLabel({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="font-medium text-[var(--fg)]">{label}</span>
      {sub && <span className="text-[var(--muted-fg)]">{sub}</span>}
    </div>
  );
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
      <div className="flex h-10 items-center">{children}</div>
      <StateLabel label={label} sub={sub} />
    </div>
  );
}

// V1 · UI-SPEC 기본: shadcn Toggle + Star lucide, 36x36
export function StarBaselineToggle() {
  const [pressed, setPressed] = useState(true);
  return (
    <div className="flex flex-col gap-4">
      <StateGrid>
        <StateCell label="Unset" sub="관심종목 아님">
          <button
            type="button"
            aria-label="삼성전자 관심종목 추가"
            className="flex size-9 items-center justify-center rounded-md text-[var(--muted-fg)] transition hover:bg-[var(--muted)] hover:text-[var(--primary)]"
          >
            <Star className="size-4" aria-hidden="true" />
          </button>
        </StateCell>
        <StateCell label="Set" sub="관심종목">
          <button
            type="button"
            aria-label="삼성전자 관심종목 해제"
            className="flex size-9 items-center justify-center rounded-md bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] text-[var(--primary)]"
          >
            <Star className="size-4 fill-[var(--primary)]" aria-hidden="true" />
          </button>
        </StateCell>
        <StateCell label="Loading" sub="optimistic">
          <button
            type="button"
            aria-busy="true"
            className="flex size-9 items-center justify-center rounded-md bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] text-[var(--primary)] opacity-70"
          >
            <Star className="size-4 fill-[var(--primary)] animate-pulse" aria-hidden="true" />
          </button>
        </StateCell>
        <StateCell label="Disabled" sub="50/50 초과">
          <button
            type="button"
            disabled
            aria-label="관심종목은 최대 50개까지 저장할 수 있습니다"
            className="flex size-9 items-center justify-center rounded-md text-[var(--muted-fg)] opacity-50"
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
          onClick={() => setPressed((v) => !v)}
          aria-pressed={pressed}
          aria-label={pressed ? '삼성전자 관심종목 해제' : '삼성전자 관심종목 추가'}
          className={`flex size-9 items-center justify-center rounded-md transition ${
            pressed
              ? 'bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] text-[var(--primary)]'
              : 'text-[var(--muted-fg)] hover:bg-[var(--muted)] hover:text-[var(--primary)]'
          }`}
        >
          <Star
            className={`size-4 ${pressed ? 'fill-[var(--primary)]' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}

// V2 · Button ghost variant (icon-only, no bg when set)
export function StarBaselineGhost() {
  return (
    <StateGrid>
      <StateCell label="Unset">
        <button
          type="button"
          aria-label="추가"
          className="flex size-9 items-center justify-center rounded-md text-[var(--muted-fg)]/70 transition hover:text-[var(--primary)]"
        >
          <Star className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </StateCell>
      <StateCell label="Set">
        <button
          type="button"
          aria-label="해제"
          className="flex size-9 items-center justify-center rounded-md text-[var(--primary)]"
        >
          <Star className="size-4 fill-[var(--primary)]" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </StateCell>
      <StateCell label="Loading">
        <button
          type="button"
          aria-busy="true"
          className="flex size-9 items-center justify-center rounded-md text-[var(--primary)]"
        >
          <Star
            className="size-4 fill-[var(--primary)]/60 text-[var(--primary)]/60 animate-pulse"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      </StateCell>
      <StateCell label="Disabled">
        <button
          type="button"
          disabled
          className="flex size-9 items-center justify-center rounded-md text-[var(--muted-fg)] opacity-40"
        >
          <Star className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </StateCell>
    </StateGrid>
  );
}

// V3 · 텍스트 chip ("관심 +" / "관심 ✓")
export function StarBaselineChip() {
  return (
    <StateGrid>
      <StateCell label="Unset">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-medium text-[var(--muted-fg)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          <Plus className="size-3" aria-hidden="true" />
          관심
        </button>
      </StateCell>
      <StateCell label="Set">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)]"
        >
          <Star className="size-3 fill-[var(--primary)]" aria-hidden="true" />
          관심 ✓
        </button>
      </StateCell>
      <StateCell label="Loading">
        <button
          type="button"
          aria-busy="true"
          className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)]/60 bg-[color-mix(in_oklch,var(--primary)_14%,transparent)]/70 px-2.5 py-1 text-xs font-semibold text-[var(--primary)]/80"
        >
          <Star className="size-3 animate-pulse fill-[var(--primary)]/80" aria-hidden="true" />
          저장 중…
        </button>
      </StateCell>
      <StateCell label="Disabled">
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 text-xs font-medium text-[var(--muted-fg)] opacity-60"
        >
          <Plus className="size-3" aria-hidden="true" />
          50/50
        </button>
      </StateCell>
    </StateGrid>
  );
}
