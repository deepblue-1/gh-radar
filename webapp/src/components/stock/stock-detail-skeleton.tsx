import { Skeleton } from '@/components/ui/skeleton';

/**
 * StockDetailSkeleton — Phase 6 초기 로딩 placeholder.
 * Hero + Stats grid 의 레이아웃 형태를 동일하게 유지하여 CLS 를 최소화.
 */
export function StockDetailSkeleton() {
  return (
    <div
      className="space-y-8"
      aria-busy="true"
      aria-label="종목 정보 로딩 중"
    >
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <div className="flex items-baseline gap-3">
          <Skeleton className="h-8 w-32 md:h-10 md:w-40" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </section>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
