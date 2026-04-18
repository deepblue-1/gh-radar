/**
 * DiscussionListSkeleton — Phase 08 UI-SPEC §Component Inventory.
 *
 * variants:
 *  - `card` (상세): 5행 × (제목 + body preview 2줄 + 메타) — `py-3 border-b`
 *  - `full` (`/stocks/[code]/discussions` Compact): 10행 × 3열 grid 스켈레톤 — `py-2 border-b`
 *
 * - `data-slot="skeleton"` + `skeleton-list` 부모 클래스 stagger 는 globals.css 에서 처리
 * - `animate-pulse` 는 `prefers-reduced-motion` 시 Tailwind 가 자동 무효화
 */
export interface DiscussionListSkeletonProps {
  variant?: 'card' | 'full';
  rows?: number;
}

export function DiscussionListSkeleton({
  variant = 'card',
  rows,
}: DiscussionListSkeletonProps) {
  const n = rows ?? (variant === 'card' ? 5 : 10);

  if (variant === 'card') {
    return (
      <ul
        className="divide-y divide-[var(--border-subtle)] skeleton-list"
        data-testid="discussion-list-skeleton"
        aria-hidden
      >
        {Array.from({ length: n }).map((_, i) => (
          <li key={i} className="py-3 space-y-2">
            <div
              data-slot="skeleton"
              className="bg-[var(--muted)] animate-pulse h-4 w-full rounded-sm"
            />
            <div
              data-slot="skeleton"
              className="bg-[var(--muted)] animate-pulse h-3 w-11/12 rounded-sm"
            />
            <div
              data-slot="skeleton"
              className="bg-[var(--muted)] animate-pulse h-3 w-2/3 rounded-sm"
            />
            <div
              data-slot="skeleton"
              className="bg-[var(--muted)] animate-pulse h-3 w-32 rounded-sm"
            />
          </li>
        ))}
      </ul>
    );
  }

  // 'full' Compact
  return (
    <ul
      className="divide-y divide-[var(--border-subtle)] skeleton-list"
      data-testid="discussion-list-skeleton"
      aria-hidden
    >
      {Array.from({ length: n }).map((_, i) => (
        <li
          key={i}
          className="grid items-center gap-3 py-2 md:grid-cols-[1fr_140px_120px]"
        >
          <div className="space-y-1">
            <div
              data-slot="skeleton"
              className="bg-[var(--muted)] animate-pulse h-4 w-4/5 rounded-sm"
            />
            <div
              data-slot="skeleton"
              className="bg-[var(--muted)] animate-pulse h-3 w-3/5 rounded-sm"
            />
          </div>
          <div
            data-slot="skeleton"
            className="bg-[var(--muted)] animate-pulse h-3 w-24 rounded-sm"
          />
          <div
            data-slot="skeleton"
            className="bg-[var(--muted)] animate-pulse h-3 w-28 rounded-sm ml-auto"
          />
        </li>
      ))}
    </ul>
  );
}
