'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps, ReactNode } from 'react';

type ThemeProviderProps = {
  children: ReactNode;
} & Omit<ComponentProps<typeof NextThemesProvider>, 'children'>;

/**
 * next-themes 래퍼. Light/Dark 2 상태만 지원 (system 제외). 기본값 dark.
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
