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
        /*
          ★ quick-260913-0em — **잉크 보정용 음수 마진**. `<lg` 에서 이 버튼은 헤더 nav slot 이
            우측 정렬이라 **탑바 오른쪽 끝 컨트롤**이다(AppHeader 주석 참조). 44×44 타깃 한가운데
            20px 아이콘이 박혀 있어 버튼 상자가 여백선에 붙어도 잉크는 12px 모자란다 — 본문 카드
            오른쪽 끝과 그만큼 어긋나 보인다. 고칠 대상은 **잉크**이지 헤더 패딩 램프가 아니다
            (박스는 실측상 이미 본문과 같다).
          ★ 44×44 를 줄여서 맞추지 마라(WCAG 2.5.5). 음수 마진만 쓴다.
          ★ 폰은 8, `md`(768)↑ 는 12 다. 폰에서 12 를 당기면 이 버튼이 뷰포트 오른쪽 밖으로 4px
            나가 **가로 스크롤이 생긴다** — 오른쪽 오버플로는 스크롤을 만든다. 전체 근거는
            `app-header.tsx` 햄버거 주석이 정본이다.
          ★ 바로 위 **데스크톱 readonly input 버튼(`lg:flex`)에는 이 보정을 주지 마라** — 그것은
            `lg+` 에서 헤더 **가운데**에 뜨는 컨트롤이라 좌우 여백선과 아무 관계가 없다.
        */
        className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--fg)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] md:-mr-3 lg:hidden"
      >
        <Search className="h-5 w-5" aria-hidden="true" />
      </button>
    </>
  );
}
