'use client';

import { useEffect } from 'react';

import { CenterShell } from '@/components/layout/center-shell';
import { Button } from '@/components/ui/button';

/**
 * 전역 에러 경계 (App Router `error.tsx`).
 * - 프로덕션에서는 `error.digest` 만 노출, stack 비노출 (D-16)
 * - `reset()` 으로 세그먼트 재렌더 시도
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 로컬 디버깅 보조용. Sentry 등은 v2 에서 연결.
    // eslint-disable-next-line no-console
    console.error('[gh-radar] App error boundary:', error);
  }, [error]);

  const isProd = process.env.NODE_ENV === 'production';

  return (
    <CenterShell>
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-[length:var(--t-2xl)] font-bold tracking-[-0.01em] text-[var(--fg)]">
          문제가 발생했어요
        </h1>
        <p className="max-w-md text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          일시적인 오류로 페이지를 표시하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>

        {!isProd && error.message && (
          <pre className="max-w-full overflow-auto rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            {error.message}
          </pre>
        )}

        {error.digest && (
          <p className="font-mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            digest: {error.digest}
          </p>
        )}

        <Button onClick={reset} className="mt-2">
          다시 시도
        </Button>
      </div>
    </CenterShell>
  );
}
