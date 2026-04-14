import Link from 'next/link';

import { CenterShell } from '@/components/layout/center-shell';
import { Button } from '@/components/ui/button';

/**
 * 전역 404 (App Router `not-found.tsx`). D-17.
 * - CenterShell + 안내 카피 + /scanner 복귀 링크
 */
export default function NotFound() {
  return (
    <CenterShell>
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-mono text-[length:var(--t-caption)] uppercase tracking-[0.08em] text-[var(--muted-fg)]">
          404
        </p>
        <h1 className="text-[length:var(--t-2xl)] font-bold tracking-[-0.01em] text-[var(--fg)]">
          페이지를 찾을 수 없어요
        </h1>
        <p className="max-w-md text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          요청하신 주소가 이동되었거나 존재하지 않습니다.
        </p>
        <Button asChild className="mt-2">
          <Link href="/scanner">스캐너로 돌아가기</Link>
        </Button>
      </div>
    </CenterShell>
  );
}
