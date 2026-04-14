'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

type ThemeValue = 'light' | 'dark';

const LABELS: Record<ThemeValue, string> = {
  light: '라이트 모드 (클릭 시 다크 모드)',
  dark: '다크 모드 (클릭 시 라이트 모드)',
};

/**
 * 2 상태 토글 ThemeToggle — Light ↔ Dark. UI-SPEC §4.3 / D-26: 44×44px hit target.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current: ThemeValue = mounted && resolvedTheme === 'light' ? 'light' : 'dark';
  const nextTheme: ThemeValue = current === 'light' ? 'dark' : 'light';

  const Icon = current === 'light' ? Sun : Moon;

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
