'use client';

import { Search } from 'lucide-react';

export interface SearchTriggerProps {
  onClick: () => void;
}

/**
 * SearchTrigger — AppHeader 중앙 nav slot 에 마운트되는 readonly input 트리거.
 * - 데스크탑(lg+): readonly input 스타일 버튼 + `⌘K` 키캡 힌트 (UI-SPEC Copywriting)
 * - 모바일(<lg): 아이콘 버튼만 노출 (터치 타깃 44×44 보장)
 * - 클릭 시 GlobalSearch Dialog 토글 (onClick 위임)
 */
export function SearchTrigger({ onClick }: SearchTriggerProps) {
  return (
    <>
      {/* Desktop: readonly input (lg+) */}
      <button
        type="button"
        onClick={onClick}
        aria-label="종목 검색 열기"
        className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 text-left text-[length:var(--t-sm)] text-[var(--muted-fg)] transition-colors hover:bg-[color-mix(in_oklch,var(--muted)_80%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] lg:flex"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <span className="flex-1">종목명 또는 코드 검색</span>
        <kbd className="mono rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px] text-[var(--muted-fg)]">
          ⌘K
        </kbd>
      </button>

      {/* Mobile: 아이콘 버튼 (lg 미만) */}
      <button
        type="button"
        onClick={onClick}
        aria-label="종목 검색 열기"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--fg)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] lg:hidden"
      >
        <Search className="h-5 w-5" aria-hidden="true" />
      </button>
    </>
  );
}
