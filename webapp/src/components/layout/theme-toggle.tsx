'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

type ThemeValue = 'light' | 'dark' | 'system';

const ORDER: ThemeValue[] = ['light', 'dark', 'system'];

const LABELS: Record<ThemeValue, string> = {
  light: '라이트 모드 (클릭 시 다크 모드)',
  dark: '다크 모드 (클릭 시 시스템 설정)',
  system: '시스템 설정 (클릭 시 라이트 모드)',
};

/**
 * 3 상태 순환 ThemeToggle — Light → Dark → System → Light.
 * UI-SPEC §4.3 / D-26: 44×44px 이상 hit target, 동적 aria-label.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // SSR/CSR mismatch 방지 — 마운트 전에는 중립 아이콘.
  useEffect(() => {
    setMounted(true);
  }, []);

  const current: ThemeValue = (mounted && (theme as ThemeValue)) || 'system';
  const nextTheme = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={LABELS[current]}
      title={LABELS[current]}
      className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      suppressHydrationWarning
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
