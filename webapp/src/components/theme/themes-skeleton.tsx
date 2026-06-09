import { Skeleton } from '@/components/ui/skeleton';

/**
 * ThemesSkeleton — UI-SPEC §S1 states (loading).
 *
 * scanner-skeleton 의 stagger 패턴(`.skeleton-list` nth-child delay)을 차용한 랭킹 행
 * 스켈레톤. 변형 C ritem grid(34px 1.1fr 1fr auto)와 동일 골격으로 8행.
 */
export function ThemesSkeleton() {
  return (
    <div aria-label="테마 로딩 중" aria-busy="true" role="status" className="flex flex-col gap-3">
      <Skeleton className="h-5 w-40" />
      <div className="skeleton-list flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[34px_1.1fr_1fr_auto] items-center gap-4 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
          >
            <Skeleton className="h-6 w-6" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
