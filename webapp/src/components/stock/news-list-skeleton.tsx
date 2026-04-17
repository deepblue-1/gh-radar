/**
 * NewsListSkeleton — Phase 07 UI-SPEC §Component Inventory.
 *
 * - 로딩 중 placeholder (기본 5행)
 * - `data-slot="skeleton"` + `skeleton-list` 부모 클래스 stagger 는 globals.css 에서 처리
 * - `animate-pulse` 는 `prefers-reduced-motion` 시 Tailwind 가 자동 무효화
 */
export interface NewsListSkeletonProps {
  rows?: number;
}

export function NewsListSkeleton({ rows = 5 }: NewsListSkeletonProps) {
  return (
    <ul
      className="divide-y divide-[var(--border-subtle)] skeleton-list"
      data-testid="news-list-skeleton"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="py-3 space-y-2">
          <div
            data-slot="skeleton"
            className="bg-[var(--muted)] animate-pulse h-4 w-full rounded-sm"
          />
          <div
            data-slot="skeleton"
            className="bg-[var(--muted)] animate-pulse h-3 w-24 rounded-sm"
          />
        </li>
      ))}
    </ul>
  );
}
