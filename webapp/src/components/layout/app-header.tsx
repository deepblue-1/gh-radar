'use client';

import Link from 'next/link';
import { Menu, PanelLeft } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

import { ThemeToggle } from '@/components/layout/theme-toggle';
import { useHeaderAutoHide } from '@/hooks/use-header-auto-hide';
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed';
import { setSidebarCollapsed } from '@/lib/sidebar-collapse';

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
  /**
   * 데스크톱(lg+) 고정 사이드바 접기 토글을 렌더할지. 기본 `false` (quick-260930-e30 D1).
   * 고정 사이드바가 있는 `AppShell` 만 켠다 — `AppShell hideSidebar` · `CenterShell` 에는 접을 사이드바가 없다.
   */
  sidebarToggle?: boolean;
  /**
   * 드로어가 열려 있는가 — `true` 면 스크롤 숨김 중에도 헤더를 강제로 보인다 (quick-260930-e30 D2).
   */
  menuOpen?: boolean;
}

/**
 * AppHeader — UI-SPEC §4.1 / §4.2 공통 헤더.
 * - 56px sticky top-0, `bg-[--bg]/80 backdrop-blur-md` · 아래 테두리 없음(B `--hdr-bd: 0` — 옛 투명 1px 테두리는
 *   Phase 21 D-25 의 `box-content` 전환 때 걷었다: content-box 에서 1px 이 높이 57 을 만든다)
 * - 좌측: 로고(`GH Trade` — 표시명만 바꿨다 · D-21, `/` 로 이동) + 햄버거 버튼(<lg 만 표시, 44×44)
 *   + 사이드바 접기 토글(lg+ 브라우저만 · `sidebarToggle` · quick-260930-e30 D1) — 햄버거와 **같은 자리**(로고 앞).
 * - 중앙: `nav` slot — Phase 6 이후 AppShell 이 `<GlobalSearch />` 를 주입.
 *   ★ 정렬이 폭에 따라 다르다 — `<lg` 는 **우측 정렬**(검색 아이콘 버튼이 탑바 오른쪽 끝),
 *   `lg+` 는 가운데(readonly 입력). 모바일에서 아이콘 하나가 어정쩡하게 가운데 뜨지 않게 한다.
 * - 우측: 테마 토글은 **상시 렌더가 아니다** — `themeToggle` 이 `true` 인 화면
 *   (사이드바가 없는 `CenterShell` · `AppShell hideSidebar`)에서만 나온다.
 *   사이드바가 있는 일반 화면에서는 토글이 사이드바 하단 유저 섹션 줄에 산다.
 * - quick-260930-e30 D2 「상단에서만 헤더」 — 햄버거가 있는 화면만(<lg 브라우저 + 앱 전 폭). 창 스크롤이 8px 를
 *   넘으면 `data-scroll-hidden` 이 서고 배경 레이어·로고·검색이 위로 빠지며(~250ms) 햄버거만 44px 유리 원형으로
 *   뜬다. header 는 sticky 라 흐름 칸(56)은 그대로여서 레이아웃 이동이 없다. 숨김 중 헤더 영역은 클릭이
 *   통과하고 햄버거만 눌린다. 드로어 열림(`menuOpen`) · 헤더 안 키보드 포커스는 강제 표시 · reduced-motion 은
 *   전환 없음(`hooks/use-header-auto-hide.ts`). 알림 토스트(`alert-toasts.tsx` 상단 식)는 그대로이며 원형
 *   (아래끝 safe-top + 52)과 겹치지 않는다(토스트 윗변 64).
 */
export function AppHeader({
  nav,
  onMenuClick,
  themeToggle = false,
  sidebarToggle = false,
  menuOpen = false,
}: AppHeaderProps) {
  const collapsed = useSidebarCollapsed();
  const headerRef = useRef<HTMLElement>(null);
  // 햄버거가 없는 화면(hideSidebar · CenterShell)은 절대 숨지 않는다.
  const scrollHidden = useHeaderAutoHide(headerRef, {
    enabled: Boolean(onMenuClick),
    forceVisible: menuOpen,
  });
  const toggleLabel = collapsed ? '사이드바 펼치기' : '사이드바 접기';
  return (
    <header
      ref={headerRef}
      data-slot="app-header"
      data-scroll-hidden={scrollHidden ? 'true' : undefined}
      /*
        ★ quick-260912-u58 ⑤ — 가로 여백은 `app-shell.tsx` 의 `main` 패딩 램프와 **같은 값**
          이다(8 / 768↑ 16 / 1024↑ 24). 옛 값은 맨몸 `px-6` 이라 폰에서 헤더 24 / 본문 8 로
          16px 어긋나 있었다 — 헤더는 **전 페이지 공통**이라 그 어긋남이 모든 화면에 났다.
          한쪽만 고치면 그대로 되돌아온다. 두 값이 같은지는 `e2e/specs/home.spec.ts` 의 셸
          불변식 케이스가 계산된 스타일로 잰다.
        ★ 세로·높이(`h-14`)는 이번 변경 대상이 아니다.
        ★ Phase 21 D-25 — `box-content pt-[var(--app-safe-top)]`: 풀블리드에서 헤더 블러가 상태바 뒤까지
          이어지고 콘텐츠 56 은 그 아래에 선다(전체 높이 = 56 + 상단 안전영역). 크롬·데스크톱은 0 이라 종전 56.
          ★ 아래 테두리(옛 `border-b border-transparent` — 색은 투명, 1px 기하만)를 두지 않는다 — content-box
            에서는 그 1px 이 높이에 더해져 57 이 되고 aside `top`·카드 `scroll-mt` 식(56 기준)이 1px 어긋난다.
        ★ `z-30` — 스크롤돼 지나가는 본문의 위치 지정 요소(종목상세 탭 바 `sticky z-20` · 카드 더티 자리 `z-10`)가
          헤더 위에 칠해지지 않게 한다. `main` 이 `overflow-auto` 라 그 탭 바의 sticky 는 붙지 않고 흐름대로
          올라와 옛 `z-10` 헤더를 덮었다(21-06 실측 — 앱 본문 108 여백으로 짧은 화면에서도 드러났다).
          하단 고정층(공용 패널 z-20 · CTA z-30 · FAB/더티 바 z-40)과는 겹치지 않고, 시트·토스트(z-50)는 여전히 위다.
        ★ quick-260930-e30 D2 — 배경·블러는 header 가 아니라 아래 첫 자식 `header-bg` 레이어에 있다(이유는 그쪽 주석).
          `group/header` 는 자식들이 `data-scroll-hidden` 을 `group-data-[…]/header:` 로 읽는 표식이고, 숨김 중
          header 는 `pointer-events-none`(클릭 통과) · 햄버거만 `pointer-events-auto` 로 되살린다.
      */
      className="group/header sticky top-0 z-30 box-content flex h-14 items-center pt-[var(--app-safe-top)] gap-3 px-2 md:px-4 lg:px-6 data-[scroll-hidden=true]:pointer-events-none"
    >
      <div
        aria-hidden="true"
        data-part="header-bg"
        /*
          ★ quick-260930-e30 D2 — 헤더 배경 레이어.
            (a) backdrop-filter 를 header 에 남기면 header 가 backdrop root 가 되어, 그 안 원형 햄버거의 블러가
                본문이 아니라 빈 header 만 본다(중첩 backdrop root). 그래서 배경·블러를 형제 레이어로 뺐다 —
                header 자신의 className 에 `backdrop-blur` 가 없어야 한다(app-shell-chrome 단위 계약).
            (b) 이동량은 -100% 가 아니라 정확히 `-3.5rem`(콘텐츠 56)이다 — 앱에서는 `--app-safe-top` 띠만큼 레이어가
                남아 상태바 뒤 흐린 배경이 유지된다(D2 앱 상태바 띠). 브라우저는 safe-top 0 이라 완전히 화면 밖이다.
            header 는 sticky(positioned) + z-30 이라 이 절대 위치·음수 z 레이어의 기준이자 쌓임 맥락이 된다.
            Tailwind v4 의 `translate-*` 는 `transform` 이 아니라 `translate` 속성이라 전환 목록도 `translate` 다.
        */
        className="pointer-events-none absolute inset-0 -z-10 bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] backdrop-blur-md transition-[translate] duration-[250ms] ease-out motion-reduce:transition-none group-data-[scroll-hidden=true]/header:-translate-y-14"
      />
      <div className="flex items-center gap-2">
        {onMenuClick && (
          <button
            type="button"
            data-slot="app-menu-button"
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
              ★ quick-260930-e30 D2 — 떠 있는 원형(`group-data-[scroll-hidden=true]/header:*`). 원형 배경이 생기면
                **박스 테두리가 곧 잉크**라 위 잉크 보정(음수 마진)을 되돌려야 한다 — 마진이 아니라 translate 로
                되돌려 헤더 보임 상태의 기하·home.spec 잉크 불변식을 건드리지 않는다. 결과 위치: 폰은 원 좌측이
                (안전영역) 끝에서 8px(D2 「좌 8px」 — `-ml-2` 박스는 0px 에 붙어 원형이면 잘려 보인다) · md↑ 는
                헤더 패딩선 · 윗변 = safe-top + 8(56 안 가운데 6 + 2). `rounded-full` 이 아니라 `rounded-[50%]` 인
                이유: 무한 반경은 전환이 보간되지 않는다. 44×44 터치 타깃은 그대로다(WCAG 2.5.5).
            */
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--fg)] transition-[color,background-color,border-radius,box-shadow,translate] duration-[250ms] ease-out hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] motion-reduce:transition-none group-data-[scroll-hidden=true]/header:pointer-events-auto group-data-[scroll-hidden=true]/header:translate-x-2 group-data-[scroll-hidden=true]/header:translate-y-0.5 group-data-[scroll-hidden=true]/header:rounded-[50%] group-data-[scroll-hidden=true]/header:bg-[color-mix(in_oklab,var(--card)_82%,transparent)] group-data-[scroll-hidden=true]/header:shadow-[var(--menu-fab-shadow)] group-data-[scroll-hidden=true]/header:backdrop-blur-[14px] md:-ml-3 md:group-data-[scroll-hidden=true]/header:translate-x-3 lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        {sidebarToggle && (
          <button
            type="button"
            data-slot="app-sidebar-toggle"
            onClick={() => setSidebarCollapsed(!collapsed)}
            aria-label={toggleLabel}
            title={toggleLabel}
            aria-expanded={!collapsed}
            aria-controls="app-aside"
            /*
              ★ quick-260930-e30 D1 — 데스크톱 사이드바 접기 토글.
                (i) 햄버거 `lg:hidden` 과 이 토글 `hidden lg:inline-flex` 가 배타라 **같은 자리**(로고 앞)다.
                    앱(`html.native-app`)은 globals.css 「Phase 21 앱 셸」 규칙이 토글을 숨기고 햄버거를 보인다.
                (ii) 잉크 정렬 — 36 박스 안 20 아이콘이라 잉크가 8 안쪽이다. `-ml-2` 로 lg 헤더 패딩 24 선에
                    잉크가 서고, 이는 사이드바 아이콘 열 x=24 와 같다(펼침: aside p-3 12 + 링크 px-3 12 ·
                    레일: aside px-2 8 + (48−16)/2 16). 이 정렬은 `e2e/specs/shell-chrome.spec.ts` A1 이 잰다.
                (iii) 위 모바일 햄버거의 잉크 보정 주석 체계(폰 8 · md↑ 12)는 이 토글과 무관하다 — 건드리지 않는다.
              ★ 상태 표시(aria·title)만 React 값이다. 폭·레일 모양은 html 속성 + CSS 가 첫 페인트부터 정한다
                (`lib/sidebar-collapse.ts`).
            */
            className="-ml-2 hidden size-9 items-center justify-center rounded-md text-[var(--muted-fg)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] motion-reduce:transition-none lg:inline-flex"
          >
            <PanelLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        {/*
          quick-260930-e30 D2 — 숨김 중 로고·검색은 위로 빠지며 투명해진다(목업 translateY(-40px) + opacity 0).
          aria-hidden/inert 로 만들지 않는다 — Tab 으로 들어오면 키보드 포커스 규칙이 헤더를 되살린다.
        */}
        <Link
          href="/"
          aria-label="GH Trade 홈"
          className="rounded-sm transition-[translate,opacity] duration-[250ms] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] motion-reduce:transition-none group-data-[scroll-hidden=true]/header:-translate-y-10 group-data-[scroll-hidden=true]/header:opacity-0"
        >
          <h3 className="text-[length:var(--t-lg)] font-bold tracking-[-0.01em] text-[var(--fg)]">
            GH Trade
          </h3>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-end transition-[translate,opacity] duration-[250ms] ease-out motion-reduce:transition-none group-data-[scroll-hidden=true]/header:-translate-y-10 group-data-[scroll-hidden=true]/header:opacity-0 lg:justify-center">
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
