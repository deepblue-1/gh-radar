'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * 상세 안 접힘 토글 — 「구간표 보기」 · 「10분 표 보기」 · 「판정 기준」 공용 (Phase 33 · UI-SPEC 「접힘 토글」 · D-14).
 *
 * - `button type="button"` · `aria-expanded` · 열렸을 때만 `aria-controls`(본문 래퍼 id) — 행 아코디언과 같은 문법.
 *   브라우저 기본 접힘 요소(details/summary)는 쓰지 않는다.
 * - **기본 접힘 · 닫히면 본문을 마운트하지 않는다**. 토글마다 상태가 따로라 서로 독립이고, 행을 접으면 상세째
 *   언마운트되어 초기화된다.
 * - 최소 높이 32 · `ChevronRight` 16px(`aria-hidden` · 열림 `rotate-90` 200ms) · 글자 12/600 ·
 *   tone `accent` = `--accent-fg`(표 토글) · `muted` = `--fg-2`(판정 기준) · hover 밑줄.
 */
export function TeamflowToggle({
  label,
  tone,
  children,
}: {
  label: string;
  tone: 'accent' | 'muted';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={() => setOpen((v) => !v)}
        data-slot="teamflow-toggle"
        className={cn(
          'inline-flex min-h-8 items-center gap-1 text-[length:var(--t-caption)] font-semibold hover:underline',
          tone === 'accent' ? 'text-[var(--accent-fg)]' : 'text-[var(--fg-2)]',
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn('size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-90')}
        />
        {label}
      </button>
      {open && (
        <div id={bodyId} className="mt-2">
          {children}
        </div>
      )}
    </div>
  );
}
