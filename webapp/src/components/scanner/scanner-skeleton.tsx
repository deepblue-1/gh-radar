import { Skeleton } from '@/components/ui/skeleton';

/**
 * Scanner 초기 로딩 Skeleton (UI-SPEC §Wireframes §5).
 * - 데스크톱: thead(정적) + 10 row
 * - 모바일: 5 card
 */
export function ScannerSkeleton() {
  return (
    <div aria-label="스캐너 로딩 중" aria-busy="true" role="status">
      {/* 데스크톱 Table skeleton */}
      <div className="hidden md:block overflow-hidden rounded-[var(--r)] border border-[var(--border)]">
        <table className="w-full border-collapse">
          <thead className="bg-[var(--muted)]">
            <tr>
              {['종목명', '코드', '마켓', '현재가', '등락률', '거래대금'].map(
                (h) => (
                  <th
                    key={h}
                    className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)] uppercase tracking-wide px-3 py-2 text-left"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="skeleton-list">
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className="border-t border-[var(--border)]">
                <td className="px-3 py-3">
                  <Skeleton className="h-4 w-32" />
                </td>
                <td className="px-3 py-3">
                  <Skeleton className="h-4 w-16" />
                </td>
                <td className="px-3 py-3">
                  <Skeleton className="h-5 w-14" />
                </td>
                <td className="px-3 py-3">
                  <Skeleton className="h-4 w-20 ml-auto" />
                </td>
                <td className="px-3 py-3">
                  <Skeleton className="h-4 w-16 ml-auto" />
                </td>
                <td className="px-3 py-3">
                  <Skeleton className="h-4 w-20 ml-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 Card skeleton */}
      <div className="md:hidden flex flex-col gap-3 skeleton-list">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-3 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-3 w-20" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
