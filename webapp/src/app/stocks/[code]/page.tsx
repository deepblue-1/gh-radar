'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/app-shell';
import { CenterShell } from '@/components/layout/center-shell';
import { StockDetailClient } from '@/components/stock/stock-detail-client';

const CODE_RE = /^[A-Za-z0-9]{1,10}$/;

/**
 * Stock Detail Route — Phase 6 SRCH-03.
 * - 'use client' + React.use(params) (Next 15 Promise params, R4)
 * - code regex 클라 1차 검증 실패 시 즉시 notFound() → not-found.tsx
 * - StockDetailClient 가 실제 fetch/refresh/404/error 분기 처리
 */
export default function StockPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  if (!CODE_RE.test(code)) notFound();
  return (
    <AppShell hideSidebar>
      <CenterShell>
        <StockDetailClient code={code} />
      </CenterShell>
    </AppShell>
  );
}
