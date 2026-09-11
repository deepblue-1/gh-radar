import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * 260911-w5h — **전역 크롬 계약 2건**.
 *
 * ① 앱 기본 테마가 **라이트**다. `localStorage` 에 선택이 없는 새 방문자가 밝은 화면을 본다.
 *    이미 고른 사용자의 선택은 next-themes 가 저장값을 우선하므로 그대로 유지된다 —
 *    그 사실은 next-themes 의 계약이라 여기서 다시 증명하지 않고, 이 파일은 **우리가 넘기는
 *    기본값**만 잠근다.
 * ② 모바일(<lg) 본문 여백이 **8px**, 데스크톱(≥lg)이 **24px** 이다. 390px 에서 24px×2 는
 *    본문 폭의 12% 였다.
 *
 * ★ 이 두 계약은 **한 묶음으로 깨진다**: `main` 의 패딩을 줄이면 그 패딩을 가로지르도록
 *   만들어진 `stock-detail-tabs` 의 sticky 탭 바(`-mx-*`)가 함께 갈려야 한다. 그쪽 단언은
 *   `stock/__tests__/stock-detail-client.test.tsx` 가 같은 커밋에서 잠근다.
 */

// next-themes 를 스텁해 **우리가 넘긴 props** 를 그대로 들여다본다.
// (실제 테마 적용은 next-themes 소관이고, 우리 계약은 기본값 하나다.)
const themeProps = vi.fn();
vi.mock('next-themes', () => ({
  ThemeProvider: (props: Record<string, unknown>) => {
    themeProps(props);
    return <>{props.children as React.ReactNode}</>;
  },
  // `hideSidebar` 셸은 헤더 우측에 `ThemeToggle` 을 되살린다 — 그 훅도 함께 스텁한다.
  useTheme: () => ({ resolvedTheme: 'light', theme: 'light', setTheme: vi.fn() }),
}));

// GlobalSearch 가 `useRouter` 를 쓴다 — jsdom 에 app router 가 없다.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { ThemeProvider } from '@/components/providers/theme-provider';
import { AppShell } from '@/components/layout/app-shell';

describe('① 앱 기본 테마는 라이트다 (260911-w5h)', () => {
  it('`defaultTheme="light"` 로 next-themes 를 부른다', () => {
    render(
      <ThemeProvider>
        <div>본문</div>
      </ThemeProvider>,
    );

    expect(themeProps).toHaveBeenCalled();
    const props = themeProps.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(props.defaultTheme).toBe('light');
    // 나머지 계약은 그대로다 — system 은 여전히 제외다(2 상태만 지원).
    expect(props.enableSystem).toBe(false);
    expect(props.attribute).toBe('class');
    expect(props.disableTransitionOnChange).toBe(true);
  });
});

describe('② 본문 여백은 모바일 8px · 데스크톱 24px 이다 (260911-w5h)', () => {
  it('`main` 이 `p-2 lg:p-6` 을 갖는다', () => {
    render(
      <AppShell hideSidebar>
        <div>본문</div>
      </AppShell>,
    );

    const main = screen.getByRole('main');
    expect(main.className).toContain('p-2');
    expect(main.className).toContain('lg:p-6');
    // 맨몸 `p-6` 이 남아 있으면 모바일에서도 24px 이 그대로 걸린다.
    expect(main.className).not.toMatch(/(^|\s)p-6(\s|$)/);
  });
});
