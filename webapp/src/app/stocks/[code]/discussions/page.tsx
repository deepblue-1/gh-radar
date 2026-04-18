'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { DiscussionPageClient } from '@/components/stock/discussion-page-client';

/**
 * `/stocks/[code]/discussions` — Phase 08 DISC-01 전체 토론방 페이지.
 *
 * - Next 15 dynamic route: `params` 는 `Promise<{ code }>` 형태 → `use()` 로 언래핑
 *   (Phase 6 `/stocks/[code]` + Phase 7 `/stocks/[code]/news` 동일 패턴 계승)
 * - 잘못된 code (영문/숫자 1~10자 외) → `notFound()` (부모 `not-found.tsx` 상속)
 * - 부모 `error.tsx` 도 그대로 상속 — 신규 not-found/error 파일 생성 안 함
 * - UI-SPEC §3 Compact 풀페이지 (3열 grid, 최근 7일 · 서버 하드캡 50건, 새로고침 없음)
 */
const CODE_RE = /^[A-Za-z0-9]{1,10}$/;

export default function StockDiscussionsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  if (!CODE_RE.test(code)) notFound();
  return (
    <AppShell sidebar={<AppSidebar />}>
      <div className="mx-auto w-full max-w-4xl">
        <DiscussionPageClient code={code} />
      </div>
    </AppShell>
  );
}
