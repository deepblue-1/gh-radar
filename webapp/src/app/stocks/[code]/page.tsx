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
      <div className="mx-auto w-full max-w-4xl">
        <StockDetailClient code={code} />
      </div>
    </AppShell>
  );
}
