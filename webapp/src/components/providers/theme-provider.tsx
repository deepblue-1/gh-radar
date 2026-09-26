'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps, ReactNode } from 'react';

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
      {children}
    </NextThemesProvider>
  );
}
