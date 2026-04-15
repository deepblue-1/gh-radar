import Link from 'next/link';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';

/**
 * /stocks/[code] 전용 404 (Phase 6 D6).
 * - 잘못된 형식 code (regex 실패) 또는 서버 404 (미수집 종목) 진입 시 렌더
 */
export default function StockNotFound() {
  return (
    <AppShell hideSidebar>
      <main className="mx-auto w-full max-w-md px-6 py-12">
        <section className="space-y-4 text-center">
          <h1 className="text-[length:var(--t-h2)] font-semibold text-[var(--fg)]">
            종목을 찾을 수 없습니다
          </h1>
          <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            종목코드를 다시 확인해 주세요. (영문/숫자 1~10자, 예: 005930)
          </p>
          <Button asChild>
            <Link href="/scanner">스캐너로 돌아가기</Link>
          </Button>
        </section>
      </main>
    </AppShell>
  );
}
