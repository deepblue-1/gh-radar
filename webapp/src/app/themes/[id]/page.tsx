'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { ThemeDetailClient } from '@/components/theme/theme-detail-client';

/**
 * `/themes/[id]` — 테마 상세 (UI-SPEC §S2).
 *
 * Next15 dynamic route: 'use client' + React.use(params) (stock detail page 선례).
 * 시스템/유저 테마 모두 ThemeDetailClient 가 분기 처리(시스템=read-only, 유저=편집).
 */

const ID_RE = /^[0-9a-fA-F-]{8,40}$/; // uuid 형식 최소 가드

export default function ThemeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  if (!ID_RE.test(id)) notFound();
  return (
    <AppShell sidebar={<AppSidebar />}>
      <div className="mx-auto w-full max-w-5xl">
        <ThemeDetailClient id={id} />
      </div>
    </AppShell>
  );
}
