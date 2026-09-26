'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

export type ThemeValue = 'light' | 'dark';

/**
 * 테마 버튼 규칙(D-08b · G-21-N2) — **정의는 여기 한 곳**이다. 사이드바 `ThemeToggle` 과
 * `/me` 계정 카드(`AccountCard`)가 같은 규칙을 가져다 쓴다(두 곳에 따로 적으면 다시 갈라진다).
 *
 * - 아이콘 = 누르면 바뀔 테마(목적지): 다크일 때 Sun(해) · 라이트일 때 Moon(달).
 * - 접근 이름(aria-label · title) = 행동 문구: 다크일 때 「라이트 모드로 전환」 · 라이트일 때
 *   「다크 모드로 전환」. 아이콘이 목적지를 보이므로 문구도 목적지를 말해야 스크린리더와 시각
 *   표현이 어긋나지 않는다.
 *
 * `THEME_SWITCH_LABEL` 의 키는 **목적지 테마**(`nextTheme`)다.
 */
export const THEME_SWITCH_LABEL: Record<ThemeValue, string> = {
  dark: '다크 모드로 전환',
  light: '라이트 모드로 전환',
};

/** 목적지 테마 아이콘 — `next === 'dark'` 면 Moon, 아니면 Sun. 장식이므로 aria-hidden. */
export function ThemeSwitchIcon({ next, className }: { next: ThemeValue; className?: string }) {
  return next === 'dark' ? (
    <Moon className={className} data-icon="moon" aria-hidden="true" />
  ) : (
    <Sun className={className} data-icon="sun" aria-hidden="true" />
  );
}

/**
 * 2 상태 토글 ThemeToggle — Light ↔ Dark. UI-SPEC §4.3 / D-26: 44×44px hit target.
 *
 * 아이콘 = 누르면 바뀔 테마(목적지) · 접근 이름 = 행동 문구 — D-08b · 계정 카드와 같은 규칙,
 * 정의는 위 `ThemeSwitchIcon` · `THEME_SWITCH_LABEL` 한 곳.
 *
 * 하이드레이션 전(mounted 가드)에는 다크로 읽는다 — 서버 HTML 과 첫 클라이언트 렌더가 같아야 한다.
 *
 * `className` 은 크기·여백만 덮어쓰라고 있는 구멍이다. 기본값 `h-11 w-11`(44×44 hit target)은
 * 그대로 두고, 사이드바 하단처럼 유저 섹션과 한 줄을 나눠 쓰는 자리에서만 좁힌다.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current: ThemeValue = mounted && resolvedTheme === 'light' ? 'light' : 'dark';
  const nextTheme: ThemeValue = current === 'light' ? 'dark' : 'light';

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={THEME_SWITCH_LABEL[nextTheme]}
      title={THEME_SWITCH_LABEL[nextTheme]}
      className={cn(
        'inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      suppressHydrationWarning
    >
      <ThemeSwitchIcon next={nextTheme} className="h-5 w-5" />
    </button>
  );
}
