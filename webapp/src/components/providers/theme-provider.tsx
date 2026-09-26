'use client';

import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import { useEffect, type ComponentProps, type ReactNode } from 'react';

type ThemeProviderProps = {
  children: ReactNode;
} & Omit<ComponentProps<typeof NextThemesProvider>, 'children'>;

/**
 * next-themes 래퍼. Light/Dark 2 상태만 지원 (system 제외 — OS 다크모드는 보지 않는다 · D-23).
 * 기본값 dark(D-23a · G-21-N1) — iOS/Android `ThemeStore` 미저장 기본 · 오프라인 폴백
 *   (`mobile/www/index.html`) 기본과 **반드시 같아야 한다.** 한 곳만 바꾸면 앱 첫 프레임(창 배경 ·
 *   상태바 · 탭바)과 웹 첫 페인트가 어긋나 번쩍인다.
 * ★ 기본값은 **localStorage 에 선택이 없는 새 방문자에게만** 적용된다 — next-themes 는
 *   저장된 선택을 항상 우선하므로, 이미 dark 를 고른 사용자는 이 값을 바꿔도 dark 를 그대로
 *   본다(「기본값을 바꿨는데 왜 안 바뀌나」의 답이다).
 * `disableTransitionOnChange` 로 테마 전환 시 깜빡임/트랜지션 플래시 방지.
 * `ThemeColorSync` — `<meta name="theme-color">` 를 앱 테마에 맞춘다(IN-06 · 서버 기본값은 layout.tsx).
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}

/** 브라우저 크롬 색 — globals.css `--bg` 와 같은 값. 다크는 layout.tsx `viewport.themeColor`(서버 기본)와 같아야 한다. */
const THEME_COLOR = { dark: '#17171c', light: '#ffffff' } as const;

/**
 * `<meta name="theme-color">` 를 OS 다크모드가 아니라 앱 테마(`resolvedTheme`)에 맞춘다(IN-06).
 * 해석 전(undefined)이면 아무것도 하지 않는다 — DOM 을 만들지 않는다(null 렌더).
 * App Router 는 클라 내비(경로·쿼리 모두)마다 viewport 메타 요소를 새로 만들어 서버 기본값(`#17171c`)으로
 * 되돌린다(실측). 그래서 한 번 설정하고 끝내지 않고 `<head>` 변화를 지켜보며 다시 맞춘다 — 값이 이미
 * 같으면 쓰지 않으므로 자기 쓰기로 되먹임이 돌지 않는다. 메타가 없으면 아무것도 하지 않는다.
 */
function ThemeColorSync(): null {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const color = resolvedTheme === 'light' ? THEME_COLOR.light : THEME_COLOR.dark;
    const apply = () => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta && meta.content !== color) meta.content = color;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['content'],
    });
    return () => observer.disconnect();
  }, [resolvedTheme]);
  return null;
}
