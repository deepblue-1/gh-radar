import '@/styles/globals.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { AuthProvider } from '@/lib/auth-context';
import { RelayProvider } from '@/lib/relay-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { WatchlistSetProvider } from '@/hooks/use-watchlist-set';
import { ChatProvider } from '@/components/chat/chat-provider';
import { ChatFab } from '@/components/chat/chat-fab';
import { ChatSheet } from '@/components/chat/chat-sheet';
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
            {/* RelayProvider 는 AuthProvider 안쪽 — 연결 게이트가 Supabase 세션이다(D-22/D-23).
                로그인 상태에서만 relay wss 1연결을 열어 앱이 열려 있는 동안 유지하고,
                로그아웃하면 즉시 close 한다. 사이드바 전략 목록·My page 가 종목 구독 없이
                전략 상태를 봐야 하므로 ChatProvider 보다 바깥, 즉 앱 전역이어야 한다. */}
            <RelayProvider>
              {/* ChatProvider 는 AuthProvider 안쪽 — FAB/시트가 useChat + useAuth 둘 다 소비.
                  FAB/Sheet 를 children 뒤에 전역 마운트해 모든 페이지 우하단에서 접근한다. */}
              <ChatProvider>
                <WatchlistSetProvider>{children}</WatchlistSetProvider>
                <ChatFab />
                <ChatSheet />
              </ChatProvider>
            </RelayProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
