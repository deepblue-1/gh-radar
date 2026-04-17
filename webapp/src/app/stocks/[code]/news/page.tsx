'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { NewsPageClient } from '@/components/stock/news-page-client';

/**
 * `/stocks/[code]/news` — Phase 07 NEWS-01 전체 뉴스 페이지.
 *
 * - Next 15 dynamic route: `params` 는 `Promise<{ code }>` 형태 → `use()` 로 언래핑
 * - 잘못된 code (영문/숫자 1~10자 외) → `notFound()` (부모 `not-found.tsx` 상속)
 * - 부모 `error.tsx` 도 그대로 상속 — 신규 not-found/error 파일 생성 안 함
 */
const CODE_RE = /^[A-Za-z0-9]{1,10}$/;

export default function StockNewsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  if (!CODE_RE.test(code)) notFound();
  return (
    <AppShell sidebar={<AppSidebar />}>
      <div className="mx-auto w-full max-w-4xl">
        <NewsPageClient code={code} />
      </div>
    </AppShell>
  );
}
