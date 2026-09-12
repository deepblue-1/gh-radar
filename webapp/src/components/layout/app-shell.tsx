'use client';

import { useState, type ReactNode } from 'react';

import { AppHeader } from '@/components/layout/app-header';
import { GlobalSearch } from '@/components/search/global-search';
import { Sheet, SheetContent } from '@/components/ui/sheet';

export interface AppShellProps {
  /** 좌측 사이드바 콘텐츠. Desktop 240px, Mobile Drawer 렌더. */
  sidebar?: ReactNode;
  /** 헤더 중앙 네비 slot. */
  nav?: ReactNode;
  /**
   * `true` 면 사이드바 영역과 모바일 Drawer 토글을 렌더하지 않고 헤더 전용 모드로 동작.
   * Phase 06.2: 일반 페이지는 `sidebar={<AppSidebar />}` 지정하여 사이드바 활성 (Auth 도입 + D-16).
   * `/design` 카탈로그 및 AppShell 기반 error/not-found 는 여전히 `hideSidebar` 유지하여
   * 스캐폴드/오류 화면의 단순성과 회귀 방지 (D-17).
   * 기본값 `false` 유지.
   */
  hideSidebar?: boolean;
  children: ReactNode;
}

/**
 * AppShell — UI-SPEC §4.1 (상승률 상위/대시보드 레이아웃).
 * - Desktop(>=lg): 56px top header + 240px left sidebar + 24px padding main
 * - Mobile(<lg): 본문 좌우/상하 여백 8px(`p-2`) — 좁은 화면에서 콘텐츠 폭을 최대로 회수한다.
 * - Desktop 사이드바는 **뷰포트에 고정**(`lg:sticky top-14` + `h-[calc(100dvh-3.5rem)]`)이라
 *   본문을 끝까지 스크롤해도 하단 유저 섹션·테마 토글이 화면 안에 남는다.
 *   ★ 이 세 가지는 한 묶음이다 — ① `aside` 의 sticky/self-start ② 부모 flex 래퍼에
 *   `overflow-hidden` 을 **두지 않음**(스크롤 컨테이너가 생기면 sticky 가 죽는다)
 *   ③ `main` 의 `min-w-0`(자동 최소 크기가 되살아나 긴 콘텐츠가 레이아웃을 밀어내는 것을 막는다).
 *   하나라도 빠지면 고정이 풀리거나 본문이 넘친다.
 * - Mobile(<lg): sidebar → `<Sheet side="left">` Drawer (햄버거 트리거)
 * - ESC / scrim 클릭 / 내부 nav 링크 클릭 시 자동 닫힘 (Radix Dialog 기본 + 외부 훅)
 * - `hideSidebar` 활성 시: 사이드바/Drawer 비활성 → 헤더 + 단일 main 컬럼.
 *   이때 테마 토글의 집(사이드바 하단)이 없으므로 헤더 우측에 토글을 되살린다
 *   (`themeToggle={!showSidebar}`).
 */
export function AppShell({
  sidebar,
  nav,
  hideSidebar = false,
  children,
}: AppShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const showSidebar = !hideSidebar && Boolean(sidebar);
  // Phase 6 — nav 미지정 시 GlobalSearch 자동 마운트. 명시적 `null` 은 그대로 존중.
  const navContent = nav === undefined ? <GlobalSearch /> : nav;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--fg)]">
      <AppHeader
        nav={navContent}
        onMenuClick={showSidebar ? () => setSheetOpen(true) : undefined}
        themeToggle={!showSidebar}
      />

      {/* ★ `overflow-hidden` 을 두지 않는다 — 스크롤 컨테이너가 되어 aside 의 sticky 를 죽인다. */}
      <div className="flex flex-1">
        {showSidebar && (
          <aside className="hidden w-60 shrink-0 border-r border-[var(--border)] bg-[var(--muted)] p-3 lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)] lg:self-start lg:overflow-y-auto">
            {sidebar}
          </aside>
        )}

        {/*
          `min-w-0` — 부모의 `overflow-hidden` 을 걷어내며 되살아난 flex 자동 최소 크기 차단.

          ★ quick-260912-u58 ⑤ — 여백은 **8 / 768↑ 16 / 1024↑ 24 한 램프**다. 사용자가 실측
            3안 중 고른 확정안이고, `app-header.tsx` 의 `px` 램프와 **같은 값**이어야 한다 —
            두 값이 갈라지는 순간 전 페이지에서 헤더와 본문의 좌측 끝이 어긋난다(옛 상태가
            정확히 그랬다: `main` 은 `p-2 lg:p-6`, `header` 는 맨몸 `px-6` 이라 폰에서 16px 차).
          ★ **폰 구간은 못 늘린다.** 상따 본문이 안 잘리는 하한이 컨테이너 344px 이고,
            여백 8px 기준 뷰포트 360px 폰이 정확히 344 라 여유가 0 이다(실폭 스윕 300~1220).
            768 이상에서 16 으로 키워도 컨테이너가 ≥700 이라 컴팩트 밴드는 유지된다.
          ★ 이 램프가 `globals.css` §2.2b 밴드 경계의 **뷰포트 환산**을 정한다 — 표 자체는
            컨테이너 폭 기준이라 불변이지만, 「뷰포트 몇에서 그 밴드가 시작하는가」는 여기가
            정본이다. 값을 바꾸면 §2.2b 의 그 단락도 함께 고쳐야 한다.
        */}
        <main className="min-w-0 flex-1 overflow-auto p-2 md:p-4 lg:p-6">{children}</main>
      </div>

      {showSidebar && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="left"
            className="w-[min(280px,85vw)] bg-[var(--muted)] p-3"
          >
            <div
              className="h-full"
              onClick={(e) => {
                // 내부 nav 링크/버튼 클릭 시 Drawer 자동 닫힘.
                let node: HTMLElement | null = e.target as HTMLElement;
                while (node && node !== e.currentTarget) {
                  const tag = node.tagName;
                  if (
                    tag === 'A' ||
                    (tag === 'BUTTON' && node.hasAttribute('data-nav-item'))
                  ) {
                    setSheetOpen(false);
                    return;
                  }
                  node = node.parentElement;
                }
              }}
            >
              {sidebar}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
