'use client';

import Link from 'next/link';
import { DiscussionFullList } from './discussion-full-list';

/**
 * DiscussionPageClient — Phase 08 DISC-01 `/stocks/[code]/discussions` 전체 토론방 페이지.
 *
 * Phase 21 D-29 — 필터 줄 · 목록 본문은 `DiscussionFullList` 로 옮겼다(종목상세 탭 안 전체목록과
 * 공용 · 필터는 로컬 상태). 이 페이지는 21-30 Task 3 에서 `/stocks/{code}?tab=news&view=discussions`
 * 리다이렉트로 바뀌며 지워진다.
 */
export interface DiscussionPageClientProps {
  code: string;
}

export function DiscussionPageClient({ code }: DiscussionPageClientProps) {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Link
          href={`/stocks/${encodeURIComponent(code)}`}
          aria-label="종목 상세로 돌아가기"
          className="inline-flex items-center text-[length:var(--t-h3)] text-[var(--muted-fg)] hover:text-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-sm py-2 pr-1"
        >
          ←
        </Link>
        <h1 className="text-[length:var(--t-h3)] font-semibold text-[var(--fg)]">
          {code} — 최근 7일 토론
        </h1>
      </header>
      <DiscussionFullList code={code} />
    </div>
  );
}
