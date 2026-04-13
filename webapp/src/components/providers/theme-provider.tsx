'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps, ReactNode } from 'react';

type ThemeProviderProps = {
  children: ReactNode;
} & Omit<ComponentProps<typeof NextThemesProvider>, 'children'>;

/**
 * next-themes 래퍼. CONTEXT.md D-15/D-16 에 따라 `class` 전략 + system 기본값.
 * `disableTransitionOnChange` 로 테마 전환 시 깜빡임/트랜지션 플래시 방지.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
