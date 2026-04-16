import '@/styles/globals.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { WatchlistSetProvider } from '@/hooks/use-watchlist-set';
import { pretendard, geistMono } from '@/lib/fonts';

export const metadata: Metadata = {
  title: 'gh-radar',
  description: '한국 주식 실시간 상한가 근접 스캐너',
};

/**
 * theme-color: globals.css `--bg` 토큰과 맞춘 최종 hex (UI-SPEC §8 참조).
 * - light: `#ffffff` (globals.css `--bg` light)
 * - dark:  `#0a0a0a` (globals.css `--bg` dark `oklch(0.08 0 0)` 근사 hex)
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${pretendard.variable} ${geistMono.variable}`}
    >
      <body>
        <ThemeProvider>
          <AuthProvider>
            <WatchlistSetProvider>{children}</WatchlistSetProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
