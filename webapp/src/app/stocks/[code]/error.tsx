'use client';

import { useEffect } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';

/**
 * /stocks/[code] error boundary (Phase 6 D6).
 * - StockDetailClient 에서 setState 대신 throw 된 에러만 여기로 도달 (Pitfall 5)
 * - 주로 렌더 중 unexpected error — fetch 에러는 DetailClient 에서 인라인 처리
 */
export default function StockError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[gh-radar] stock detail error:', error);
  }, [error]);

  return (
    <AppShell hideSidebar>
      <main className="mx-auto w-full max-w-md px-6 py-12" role="alert">
        <section className="space-y-4 text-center">
          <h1 className="text-[length:var(--t-h2)] font-semibold text-[var(--fg)]">
            데이터를 불러오지 못했습니다
          </h1>
          <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            {error.message} 잠시 후 다시 시도해 주세요.
          </p>
          <Button onClick={reset}>다시 시도</Button>
        </section>
      </main>
    </AppShell>
  );
}
