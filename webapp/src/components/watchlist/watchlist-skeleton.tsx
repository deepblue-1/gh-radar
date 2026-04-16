import { Skeleton } from '@/components/ui/skeleton';

/**
 * WatchlistSkeleton — UI-SPEC §4.6.
 *
 * 로딩 상태:
 * - `lg+`: Table 7컬럼 grid 8행 (⭐ 컬럼 자리 포함)
 * - `<lg`: InfoStockCard 스켈레톤 6 카드 (좌측 배지 + 중앙 2줄 + sparkline + 우측 가격)
 *
 * breakpoint 는 Scanner duality (`lg:`) 와 통일 — Phase 06.2 Plan 05 D-23.1.
 */
export function WatchlistSkeleton() {
  return (
    <div aria-label="관심종목 로딩 중" aria-busy="true" role="status">
      {/* 데스크톱 Table skeleton (lg+) */}
      <div className="hidden lg:block overflow-hidden rounded-[var(--r)] border border-[var(--border)]">
        <div
          className={
            'grid grid-cols-[1fr_100px_80px_120px_100px_140px_44px] items-center gap-3 px-3 bg-[var(--muted)] py-2 text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)] uppercase tracking-wide'
          }
        >
          <span>종목명</span>
          <span>코드</span>
          <span>마켓</span>
          <span className="text-right">현재가</span>
          <span className="text-right">등락률</span>
          <span className="text-right">거래대금</span>
          <span className="text-right" aria-hidden="true">
            ⭐
          </span>
        </div>
        <div className="skeleton-list">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_100px_80px_120px_100px_140px_44px] items-center gap-3 px-3 border-t border-[var(--border)] py-3"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-4 w-20 ml-auto" />
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-4 w-20 ml-auto" />
              <Skeleton className="size-9 rounded-md ml-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* 모바일/태블릿 InfoStockCard skeleton (<lg) */}
      <div className="lg:hidden flex flex-col gap-2 skeleton-list">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <Skeleton className="size-9 rounded-md shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-6 w-[60px] shrink-0" />
            <div className="w-24 shrink-0 space-y-2">
              <Skeleton className="h-4 w-20 ml-auto" />
              <Skeleton className="h-3 w-16 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
