'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 공용 페이지 헤더 — quick-260926-o2u D2.
 *
 * 제목 줄 = [뒤로가기(선택)] + h1(22px/700/-0.02em · 검색 페이지 h1 과 같은 규격) + 오른쪽 보조 영역(선택),
 * 그 아래 설명 문단(선택). 제목 줄 최소 높이 44px.
 *
 * 뒤로가기는 검색 허브 하위 페이지(상승률 상위 · 테마 · 관심종목)에만 단다. 탭 루트(홈 · My page · 검색)는
 * 뒤로가기 없이 규격만 쓴다.
 *
 * 루트는 `div` 다 — `<header>` 로 만들면 home.spec 잉크 불변식(`header svg` 개수)이 본문 날짜 네비 셰브론까지 센다.
 */

/** 이력이 없을 때(직접 진입) 돌아갈 곳 — 사용자 입력·쿼리에서 오지 않는 고정 경로. */
const BACK_FALLBACK = '/search';

export interface PageHeaderProps {
  title: string;
  back?: boolean;
  actions?: ReactNode;
  description?: ReactNode;
  className?: string;
}

export function PageHeader({ title, back, actions, description, className }: PageHeaderProps) {
  return (
    <div data-slot="page-header" className={cn('flex flex-col gap-1.5', className)}>
      <div className="mt-0.5 flex min-h-11 flex-wrap items-center gap-x-1 gap-y-2">
        {back && <BackButton />}
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[var(--fg)]">{title}</h1>
        {actions && (
          <div className="ml-auto flex items-center gap-2 text-[13px] text-[var(--muted-fg)]">{actions}</div>
        )}
      </div>
      {description && (
        <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">{description}</p>
      )}
    </div>
  );
}

/**
 * useRouter 는 이 컴포넌트 안에서만 부른다 — back 없는 페이지는 라우터 컨텍스트 없이도 렌더돼야 한다.
 * 포커스 표시는 전역 `*:focus-visible` 이중 링에 맡긴다(outline 을 걷지 않는다).
 */
function BackButton() {
  const router = useRouter();
  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(BACK_FALLBACK);
    }
  };
  return (
    <button
      type="button"
      aria-label="뒤로가기"
      onClick={handleBack}
      className="-ml-2 flex h-10 w-9 shrink-0 items-center justify-center rounded-[10px] text-[var(--fg)] transition-colors hover:bg-[color-mix(in_oklch,var(--muted)_60%,transparent)]"
    >
      <ChevronLeft className="size-6" aria-hidden="true" />
    </button>
  );
}
