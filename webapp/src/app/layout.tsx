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
import { NATIVE_DETECT_SCRIPT } from '@/lib/native/native-detect';
import { NativeBridgeProvider } from '@/lib/native/native-bridge-provider';

export const metadata: Metadata = {
  title: 'gh-radar',
  description: '한국 주식 실시간 상한가 근접 종목 탐색',
};

/**
 * theme-color: globals.css `--bg` 토큰과 맞춘 최종 hex (UI-SPEC §8 참조).
 * - light: `#ffffff` (globals.css `--bg` light)
 * - dark:  `#0a0a0a` (globals.css `--bg` dark `oklch(0.08 0 0)` 근사 hex)
 *
 * 확대/축소 금지 (quick-260925-ptw · 사용자 요청) —
 * `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no`.
 * - `maximum-scale=1` 이 iOS Safari 의 16px 미만 입력 포커스 자동 확대를 막는다 — 그래서 입력
 *   글꼴을 터치 기기에서 16px 로 키우지 않고 디자인 시스템 14px(--t-sm) 하나로 쓴다.
 * - iOS 10+ Safari 는 접근성 정책으로 `user-scalable=no` 의 수동 핀치를 무시할 수 있다
 *   (자동 확대 방지는 유효). Android Chrome 은 핀치까지 막는다 — WCAG 1.4.4 트레이드오프를
 *   사용자 요청으로 수용했다(T-ptw-05).
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
      <head>
        {/* D-11 — 앱 셸(Capacitor) 감지. 첫 페인트 전에 `html.native-app` 을 붙이고 `ready` 를
            네이티브로 보낸다. 브라우저에서는 아무것도 하지 않는다(lib/native/native-detect.ts). */}
        <script id="gh-native-detect" dangerouslySetInnerHTML={{ __html: NATIVE_DETECT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          {/* NativeBridgeProvider 는 ThemeProvider 바로 안쪽 — `useTheme` 로 theme 신호를 보낸다(D-23).
              앱(`html.native-app`)에서만 `window.__ghTrade` · 네이티브 송신이 켜지고 브라우저에서는
              no-op 이다. Relay/Chat 보다 바깥이라 모든 페이지·오버레이가 같은 브리지를 본다. */}
          <NativeBridgeProvider>
            <AuthProvider>
              {/* RelayProvider 는 AuthProvider 안쪽 — 연결 게이트가 Supabase 세션이다(D-22/D-23).
                  로그인 상태에서만 relay wss 1연결을 열어 앱이 열려 있는 동안 유지하고,
                  로그아웃하면 즉시 close 한다. 사이드바 전략 목록·My page 가 종목 구독 없이
                  전략 상태를 봐야 하므로 ChatProvider 보다 바깥, 즉 앱 전역이어야 한다. */}
              <RelayProvider>
                {/* ChatProvider 는 AuthProvider 안쪽 — FAB/시트가 useChat + useAuth 둘 다 소비.
                    FAB/Sheet 는 children 뒤에 마운트하되, FAB 이 실제로 보이는 곳은
                    종목상세 본문(`/stocks/{code}`)뿐이다 — 경로 판정은 클라이언트 컴포넌트인
                    `chat-fab.tsx` 안에서 한다(여기서 읽으면 레이아웃이 클라이언트가 된다). */}
                <ChatProvider>
                  <WatchlistSetProvider>{children}</WatchlistSetProvider>
                  <ChatFab />
                  <ChatSheet />
                </ChatProvider>
              </RelayProvider>
            </AuthProvider>
          </NativeBridgeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
