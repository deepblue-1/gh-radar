'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/layout/theme-toggle';

export interface AppHeaderProps {
  /** 중앙 slot: 네비게이션 등 (선택). */
  nav?: ReactNode;
  /** 햄버거 버튼 클릭 핸들러. 제공되지 않으면 햄버거는 렌더되지 않는다. */
  onMenuClick?: () => void;
  /**
   * 헤더 우측에 테마 토글을 렌더할지. 기본 `false`.
   *
   * 토글의 집은 **사이드바 하단 유저 섹션 줄**이다. 사이드바가 없는 화면
   * (`CenterShell` · `AppShell hideSidebar`)에는 그 집이 없어 토글이 통째로 사라지므로,
   * 그 화면들만 이 prop 을 켜서 헤더 우측에 되살린다.
   */
  themeToggle?: boolean;
}

/**
 * AppHeader — UI-SPEC §4.1 / §4.2 공통 헤더.
 * - 56px sticky top-0, `bg-[--bg]/80 backdrop-blur-md border-b border-[--border]`
 * - 좌측: 로고(`gh-radar`, `/` 로 이동) + 햄버거 버튼(<lg 만 표시, 44×44)
 * - 중앙: `nav` slot — Phase 6 이후 AppShell 이 `<GlobalSearch />` 를 주입.
 *   ★ 정렬이 폭에 따라 다르다 — `<lg` 는 **우측 정렬**(검색 아이콘 버튼이 탑바 오른쪽 끝),
 *   `lg+` 는 가운데(readonly 입력). 모바일에서 아이콘 하나가 어정쩡하게 가운데 뜨지 않게 한다.
 * - 우측: 테마 토글은 **상시 렌더가 아니다** — `themeToggle` 이 `true` 인 화면
 *   (사이드바가 없는 `CenterShell` · `AppShell hideSidebar`)에서만 나온다.
 *   사이드바가 있는 일반 화면에서는 토글이 사이드바 하단 유저 섹션 줄에 산다.
 */
export function AppHeader({ nav, onMenuClick, themeToggle = false }: AppHeaderProps) {
  return (
    <header
      /*
        ★ quick-260912-u58 ⑤ — 가로 여백은 `app-shell.tsx` 의 `main` 패딩 램프와 **같은 값**
          이다(8 / 768↑ 16 / 1024↑ 24). 옛 값은 맨몸 `px-6` 이라 폰에서 헤더 24 / 본문 8 로
          16px 어긋나 있었다 — 헤더는 **전 페이지 공통**이라 그 어긋남이 모든 화면에 났다.
          한쪽만 고치면 그대로 되돌아온다. 두 값이 같은지는 `e2e/specs/home.spec.ts` 의 셸
          불변식 케이스가 계산된 스타일로 잰다.
        ★ 세로·높이(`h-14`)는 이번 변경 대상이 아니다.
      */
      className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--bg)_88%,transparent)] px-2 backdrop-blur-md md:px-4 lg:px-6"
    >
      <div className="flex items-center gap-2">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="사이드바 열기"
            /*
              ★ quick-260913-0em — **잉크 보정용 음수 마진**. 여기를 읽고 「여백이 안 맞네」라며
                위 `px-2 md:px-4 lg:px-6` 램프를 고치지 마라. **박스는 이미 정확히 맞아 있다**
                (실측: 헤더 패딩 == `app-shell.tsx` 의 `main` 패딩, 모든 폭에서 동일).
                어긋나 보이는 것은 **보이는 잉크**다 — 44×44 터치 타깃 한가운데 20px 아이콘이
                박혀 있어 버튼 상자가 여백선에 붙어 있어도 아이콘은 12px 안쪽에서 시작한다.
                본문 카드는 테두리가 여백선에 딱 붙으므로 둘이 12px 어긋나 보인다.
                패딩을 건드리면 260912-u58 이 맞춰 놓은 박스가 도로 어긋난다.
              ★ 44×44 를 **줄여서 맞추지 마라**(WCAG 2.5.5 Target Size). 타깃 크기는 그대로 두고
                음수 마진으로만 당긴다 — 그것이 잉크만 움직이는 유일한 방법이다.
              ★ 폰 8 / `md`(768)↑ 12 의 **비대칭에는 실측 근거가 있다**. 패딩이 8 인 폰에서 12 를
                당기면 반대쪽(오른쪽) 버튼이 뷰포트 밖으로 4px 나가 **가로 스크롤이 생긴다**
                (왼쪽 음수 오버플로는 스크롤을 만들지 않지만 오른쪽은 만든다). 좌우를 같은
                값으로 유지하려고 폰 구간만 8 로 멈춘다 — 잉크가 좌우 대칭으로 4px 안쪽에 서고,
                지금의 12px 짝짝이보다 3배 낫다. `md` 부터는 패딩이 16 이라 12 를 다 당겨도
                안전하고 잉크가 본문선과 **정확히 일치**한다.
              ★ 실제 픽셀은 `e2e/specs/home.spec.ts` 의 잉크 케이스가 390·768·1004·1023 에서 잰다.
            */
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--fg)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] md:-ml-3 lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <Link
          href="/"
          aria-label="gh-radar 홈"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <h3 className="text-[length:var(--t-lg)] font-bold tracking-[-0.01em] text-[var(--fg)]">
            gh-radar
          </h3>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-end lg:justify-center">
        {nav ?? null}
      </div>

      {themeToggle && (
        <div
          /*
            ★ quick-260913-0em — 이 화면(사이드바 없는 셸)에서는 토글이 **헤더 오른쪽 끝
              컨트롤**이라 위 햄버거와 같은 잉크 보정(-8 / md↑ -12)을 받는다. 값의 근거와
              폰 8 의 이유는 햄버거 쪽 주석이 정본이다.
            ★ 보정은 **호출부인 여기**에만 준다. `ThemeToggle` 컴포넌트 자체를 고치면 토글의
              본거지인 사이드바 하단 유저 섹션 줄까지 딸려가는데, 거기서는 이 보정이 틀린다
              (그 자리는 헤더 여백선과 무관하다). 그 컴포넌트의 `className` 은 「크기·여백만
              덮어쓰라고 있는 구멍」이라고 스스로 주석에 적어 두었다 — 그 용법대로 쓴다.
          */
          className="-mr-2 flex items-center gap-2 md:-mr-3"
        >
          <ThemeToggle />
        </div>
      )}
    </header>
  );
}
