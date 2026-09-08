'use client';

import { use } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { LimitChaserClient } from '@/components/trading/limit-chaser-client';

/**
 * `/trading/limit-chaser/[key]` — 등록된 상따 전략 **편집**.
 *
 * `key` 는 `{ISIN}:{accountNo}:{exchange}` 다. `:` 를 품기 때문에 사이드바가
 * `encodeURIComponent` 로 인코딩해 링크를 만든다 — 여기서 다시 디코드해 내려 준다.
 *
 * Next 15 는 `params` 를 **Promise 로** 넘긴다. `React.use()` 로 푼다
 * (`/stocks/[code]` 와 같은 규약).
 */
export default function LimitChaserEditPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  return (
    <AppShell sidebar={<AppSidebar />}>
      <LimitChaserClient strategyKey={decodeURIComponent(key)} />
    </AppShell>
  );
}
