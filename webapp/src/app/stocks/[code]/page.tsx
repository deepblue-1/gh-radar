'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { StockDetailClient } from '@/components/stock/stock-detail-client';

const CODE_RE = /^[A-Za-z0-9]{1,10}$/;

export default function StockPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  if (!CODE_RE.test(code)) notFound();
  return (
    <AppShell sidebar={<AppSidebar />}>
      {/*
        Phase 15 Plan 11 (UI-SPEC T6) — 폭 제한이 페이지가 아니라 탭 패널별로 걸린다.
        `호가주문` 탭만 넓은 컨테이너를 쓰고 나머지 3탭은 패널에서 기존 896px 폭을 유지한다.
      */}
      <div className="mx-auto w-full">
        <StockDetailClient code={code} />
      </div>
    </AppShell>
  );
}
