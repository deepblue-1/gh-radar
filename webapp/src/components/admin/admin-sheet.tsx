"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { XIcon } from "lucide-react";

import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * AdminSheet — Admin 화면 공용 반응형 시트 골격 (Phase 29 D-14 · 목업 A 「행 탭 → 시트」).
 *
 * - 폰(뷰포트 640 미만): 바텀시트가 거의 전체 높이(92dvh 상한)로 올라온다(목업 `.sheet` · 손잡이 막대).
 * - 데스크톱: 우측 패널 440px — 목록은 왼쪽에 남는다(목업 `.panel` · `chat-sheet` 와 같은 폭).
 * - side 는 **뷰포트** 기준이다 — 시트는 앱 셸 레벨 오버레이라 본문 폭 컨테이너 쿼리 대상이 아니다
 *   (CLAUDE.md Conventions: 앱 셸 · 사이드바는 뷰포트 브레이크포인트). SSR 첫 렌더는 데스크톱(right).
 * - 머리(제목 = 접근 이름 · 닫기 ×) · 스크롤 본문 · 고정 footer(29-17 의 「사용자 삭제 · 다시 반영」 자리).
 *
 * 29-17(편집) · 29-18(서버) · 29-19(생성) 시트가 이 틀을 쓴다 — 저장 버튼 · 토스트 같은 목업 밖 요소는 두지 않는다.
 */

const DESKTOP_QUERY = "(min-width: 640px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(DESKTOP_QUERY);
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }
  mql.addListener?.(onChange);
  return () => mql.removeListener?.(onChange);
}

function isDesktop(): boolean {
  return typeof window.matchMedia !== "function" || window.matchMedia(DESKTOP_QUERY).matches;
}

/** 뷰포트 640 이상인가 — 서버 스냅샷은 true(데스크톱 우측 패널로 시작). */
function useIsDesktopViewport(): boolean {
  return useSyncExternalStore(subscribe, isDesktop, () => true);
}

export interface AdminSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 시트 제목 — 대화상자의 접근 이름. */
  title: ReactNode;
  /** 제목 옆 보조(역할 칩 등). */
  titleAside?: ReactNode;
  /** 스크린리더 설명 — 없으면 제목을 그대로 쓴다(Radix 경고 방지). */
  description?: string;
  children: ReactNode;
  /** 본문 밖 고정 하단 영역. */
  footer?: ReactNode;
}

export function AdminSheet({
  open,
  onOpenChange,
  title,
  titleAside,
  description,
  children,
  footer,
}: AdminSheetProps) {
  const desktop = useIsDesktopViewport();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        showCloseButton={false}
        data-admin-sheet=""
        className={cn(
          "gap-0 p-0",
          desktop ? "w-full sm:max-w-[440px]" : "max-h-[92dvh] rounded-t-[22px] border-x-0",
        )}
      >
        {!desktop && (
          <span aria-hidden="true" className="mx-auto mt-2.5 block h-1 w-10 flex-none rounded-full bg-[var(--faint)]" />
        )}
        <div className="flex flex-none items-center gap-2.5 px-4 pt-4 pb-2 sm:px-5">
          <SheetTitle className="min-w-0 truncate text-[17px] font-bold text-[var(--fg)]">{title}</SheetTitle>
          {titleAside}
          <SheetDescription className="sr-only">{description ?? (typeof title === "string" ? title : "")}</SheetDescription>
          <SheetClose
            aria-label="닫기"
            className="-mr-1.5 ml-auto grid size-8 flex-none place-items-center rounded-full text-[var(--muted-fg)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--fg)]"
          >
            <XIcon aria-hidden="true" className="size-5" />
          </SheetClose>
        </div>
        <div data-slot="admin-sheet-body" className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-5">
          {children}
        </div>
        {footer && (
          <div
            data-slot="admin-sheet-footer"
            className="flex flex-none items-center gap-2 border-t border-[var(--border-subtle)] px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:px-5"
          >
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
