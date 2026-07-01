import { Skeleton } from '@/components/ui/skeleton';

/**
 * HomeSkeleton — 홈 초기 로딩 (13-UI-SPEC §States · loading).
 *
 * scanner/themes skeleton 계열(.skeleton-list stagger + prefers-reduced-motion 정지).
 * 헤더 골격(타이틀 + 날짜 네비 + 슬롯 pill) + 테마 카드 골격 2개.
 */
export function HomeSkeleton() {
  return (
    <div
      aria-label="홈 로딩 중"
      aria-busy="true"
      role="status"
      className="flex flex-col gap-[var(--s-4)]"
    >
      {/* 헤더 골격 */}
      <div className="flex flex-col gap-[var(--s-3)]">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="flex gap-[6px]">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>
      </div>

      {/* 카드 골격 */}
      <div className="skeleton-list flex flex-col gap-[var(--s-4)]">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-[var(--s-3)] rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-4)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-56" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-14" />
                </div>
              ))}
            </div>
            <Skeleton className="h-4 w-48" />
          </div>
        ))}
      </div>
    </div>
  );
}
