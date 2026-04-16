import type { ReactNode } from 'react';

export interface VariantFrameProps {
  id: string;
  label: string;
  track: 'baseline' | 'frontend-design';
  rationale?: string;
  children: ReactNode;
}

const TRACK_BADGE: Record<VariantFrameProps['track'], { label: string; cls: string }> = {
  baseline: {
    label: 'Baseline',
    cls: 'bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] text-[var(--primary)] border-[color-mix(in_oklch,var(--primary)_30%,transparent)]',
  },
  'frontend-design': {
    label: 'frontend-design',
    cls: 'bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] text-[var(--destructive)] border-[color-mix(in_oklch,var(--destructive)_30%,transparent)]',
  },
};

export function VariantFrame({ id, label, track, rationale, children }: VariantFrameProps) {
  const badge = TRACK_BADGE[track];
  return (
    <section
      id={id}
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{label}</h3>
          {rationale && (
            <p className="text-sm text-[var(--muted-fg)] leading-normal">{rationale}</p>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badge.cls}`}
        >
          {badge.label}
        </span>
      </header>
      <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--bg)] p-4">
        {children}
      </div>
    </section>
  );
}

export function VariantGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">{children}</div>
  );
}

export function TrackSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-[var(--muted-fg)] leading-normal">{description}</p>
      </header>
      {children}
    </section>
  );
}
