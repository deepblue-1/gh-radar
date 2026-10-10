"use client";

import { useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { XIcon } from "lucide-react";

import { PAGE_WRAP } from "@/components/layout/page-layout";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * AdminSheet — Admin 화면 공용 반응형 시트 골격 (Phase 29 D-14 · 목업 A 「행 탭 → 시트」).
 *
 * - 폰(뷰포트 640 미만): 바텀시트가 거의 전체 높이(92dvh 상한)로 올라온다(목업 `.sheet` · 손잡이 막대).
 * - 데스크톱: 우측 패널 440px — 목록은 왼쪽에 남는다(목업 `.panel` · `chat-sheet` 와 같은 폭).
 *   **비모달 패널**(목업 A `.panel` · D-14 「목록은 남는다」 · UI-REVIEW-2): 스크림 · blur 가 없고(`overlay={false}`),
 *   포커스 트랩 · 바깥 aria-hidden 이 없으며(`modal={false}`), 목록 행 클릭 · 바깥 포커스로 닫히지 않는다 — 다른 행을 누르면
 *   시트가 닫혔다 다시 열리는 깜빡임 없이 그 사용자로 바뀐다(선택은 호출자 상태). 닫기는 × · Esc 뿐.
 *   (deferred-items 29-17 「데스크톱 Admin 시트의 배경 흐림」 이 여기서 닫힌다.) 폰 바텀시트는 종전 모달 + 스크림.
 *   목록이 패널 밑에 깔리지 않게 본문이 패널 폭을 비우는 것은 본문 루트 몫이다(아래 `AdminPanelPage`).
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
    <Sheet open={open} onOpenChange={onOpenChange} modal={!desktop}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        showCloseButton={false}
        overlay={!desktop}
        // 데스크톱 비모달: 바깥 pointerdown · focus 로 닫지 않는다(목록 행 클릭 = 선택 전환). Esc · × 는 그대로 닫는다.
        onInteractOutside={desktop ? (e) => e.preventDefault() : undefined}
        data-admin-sheet=""
        className={cn(
          // 다크의 --popover 는 --muted 와 같은 색(#2d2d2d)이라 시트 안 muted 면(버튼 · 세그먼트 · 입력 · 배지)이 사라진다 —
          // 다크만 카드 면으로 한 단 낮춰 목업(.sheet 보다 밝은 .btn/.seg 면) 대비를 되살린다(29-17 스크린샷).
          "gap-0 p-0 dark:bg-[var(--card)]",
          // ★ 기본 Sheet 의 `data-[side=right]:w-3/4 · sm:max-w-sm` 는 속성 선택자라 맨 유틸리티(`w-full` · `sm:max-w-[440px]`)보다
          //   우선한다 — 같은 변형 접두를 달아야 tailwind-merge 가 기본값을 갈아 끼운다(29-17 e2e 실측: 접두 없이는 384px).
          desktop
            ? "data-[side=right]:w-full data-[side=right]:sm:max-w-[440px]"
            : "max-h-[92dvh] rounded-t-[22px] border-x-0",
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

/**
 * 패널이 열린 동안 본문이 비우는 폭 — 본문 폭(`@container/admin-page`) 784 이상에서만.
 * 784 = 패널 440 + 목록 하한 344(뷰포트 360 폰의 본문 폭 — 목록 행이 서는 가장 좁은 폭). `max-w` 900+440 · `pr` 440 은
 * `PAGE_WRAP` 의 900 상한 · `mx-auto` 를 그대로 두고 목록(최대 900)을 패널 왼쪽 남은 폭의 가운데에 세운다.
 * 900 은 `page-layout.ts` `PAGE_WRAP` 과, 440 은 위 `AdminSheet` 패널 폭(`sm:max-w-[440px]`)과 같아야 한다.
 */
const PANEL_RESERVE = "@min-[784px]/admin-page:max-w-[calc(900px+440px)] @min-[784px]/admin-page:pr-[440px]";

export interface AdminPanelPageProps extends ComponentProps<"div"> {
  /** 이 화면의 `AdminSheet` 가 열려 있다(데스크톱이면 우측 패널). */
  panelOpen: boolean;
}

/**
 * AdminPanelPage — `AdminSheet` 를 여는 Admin 화면의 본문 루트(`PAGE_WRAP`).
 *
 * 목업 A DESC 「우측 패널(440px)이 열려 목록이 왼쪽에 남는다」 · D-14. 패널은 뷰포트 오른쪽에 고정(포털)이라 본문을
 * 밀지 않는다 — 그대로 두면 1080 에서 목록 행의 오른쪽 절반(서버 반영 칩 · ›)과 머리 「+ 사용자」 가 패널 밑에 깔린다
 * (29-31 메인 트리 e2e P29-A3b 실측: 행 중심 660 > 패널 640). 그래서 패널이 열린 동안 본문이 오른쪽 440 을 비운다.
 *
 * - 판정은 **본문 폭** 컨테이너 쿼리다 — 본문 폭은 사이드바(240/64/없음) · 앱 셸 여백에 따라 뷰포트와 어긋난다(/me 선례).
 *   784 보다 좁은 본문은 비우면 목록이 폰보다 좁아지므로 비우지 않고 패널이 목록 오른쪽을 덮는다(목업 `.panel` 의 그림).
 *   640 미만(바텀시트 · 모달)은 본문이 784 를 넘을 수 없어 저절로 꺼진다.
 * - 바깥 `div` 가 컨테이너다(자기 자신은 못 잰다). 컨테이너는 `position:fixed` 자손의 컨테이닝 블록이 되지만
 *   (globals.css §2.2b) Admin 본문 안의 fixed 는 Radix 포털(시트 · 확인 다이얼로그)뿐이라 body 에 선다.
 */
export function AdminPanelPage({ panelOpen, className, children, ...props }: AdminPanelPageProps) {
  return (
    <div className="@container/admin-page">
      <div
        {...props}
        data-panel-open={panelOpen ? "true" : undefined}
        className={cn(PAGE_WRAP, panelOpen && PANEL_RESERVE, className)}
      >
        {children}
      </div>
    </div>
  );
}
