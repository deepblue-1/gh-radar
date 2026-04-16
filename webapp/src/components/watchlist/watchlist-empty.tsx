import Link from 'next/link';
import { Star } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * WatchlistEmpty — UI-SPEC §4.5.
 *
 * 관심종목 0개 상태. Scanner 로 유도하는 primary CTA 1개.
 * `role="status"` 로 screen reader 가 안내 → 제목 → CTA 순으로 읽도록.
 */
export function WatchlistEmpty() {
  return (
    <div
      role="status"
      className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-6 text-center"
    >
      <Star
        className="size-10 text-[var(--muted-fg)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h2 className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
        아직 관심종목이 없습니다
      </h2>
      <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
        스캐너에서 ⭐ 를 눌러 관심종목을 추가해보세요.
      </p>
      <Button asChild>
        <Link href="/scanner">스캐너로 가기</Link>
      </Button>
    </div>
  );
}
