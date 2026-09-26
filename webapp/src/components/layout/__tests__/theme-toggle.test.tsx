import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

/**
 * 21-19 · G-21-N2 · D-08b — 테마 버튼 규칙 단일 정의(`theme-toggle.tsx`).
 *
 * 잠그는 것: 아이콘 = 누르면 바뀔 테마(목적지 — 다크일 때 Sun · 라이트일 때 Moon) · 접근 이름과
 * title = 행동 문구(「라이트 모드로 전환」/「다크 모드로 전환」) · 클릭 → 반대 테마 · 하이드레이션
 * 전(mounted 가드)에는 다크로 읽음 · `className` 크기 덮어쓰기 계약 · export 된 `ThemeSwitchIcon`.
 * 계정 카드(`account-card.test.tsx`)도 같은 문자열·같은 data-icon 으로 잠근다.
 */

let resolvedTheme: 'light' | 'dark' = 'dark';
const setTheme = vi.fn();
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme, theme: resolvedTheme, setTheme }),
}));

import { THEME_SWITCH_LABEL, ThemeSwitchIcon, ThemeToggle } from '../theme-toggle';

beforeEach(() => {
  resolvedTheme = 'dark';
  setTheme.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ThemeToggle — 목적지 아이콘 · 행동 문구 (D-08b)', () => {
  it('다크면 「라이트 모드로 전환」 · Sun 아이콘 · 누르면 라이트로 바꾼다', () => {
    resolvedTheme = 'dark';
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: '라이트 모드로 전환' });
    expect(btn.getAttribute('title')).toBe('라이트 모드로 전환');
    expect(btn.querySelectorAll('[data-icon="sun"]')).toHaveLength(1);
    expect(btn.querySelectorAll('[data-icon="moon"]')).toHaveLength(0);
    fireEvent.click(btn);
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('라이트면 「다크 모드로 전환」 · Moon 아이콘 · 누르면 다크로 바꾼다', () => {
    resolvedTheme = 'light';
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: '다크 모드로 전환' });
    expect(btn.getAttribute('title')).toBe('다크 모드로 전환');
    expect(btn.querySelectorAll('[data-icon="moon"]')).toHaveLength(1);
    expect(btn.querySelectorAll('[data-icon="sun"]')).toHaveLength(0);
    fireEvent.click(btn);
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('마운트 전(서버 렌더)에는 저장값이 라이트여도 다크로 읽는다 — Sun · 「라이트 모드로 전환」', () => {
    resolvedTheme = 'light';
    const html = renderToString(<ThemeToggle />);
    expect(html).toContain('aria-label="라이트 모드로 전환"');
    expect(html).toContain('data-icon="sun"');
    expect(html).not.toContain('data-icon="moon"');
  });

  it('className 을 넘기면 그 크기를 쓰되 버튼 기본 스타일은 유지한다', () => {
    render(<ThemeToggle className="size-9 shrink-0" />);
    const btn = screen.getByRole('button', { name: /모드로 전환$/ });
    expect(btn.className).toContain('size-9');
    expect(btn.className).toContain('inline-flex');
    expect(btn.className).toContain('items-center');
  });
});

describe('ThemeSwitchIcon · THEME_SWITCH_LABEL — 공용 규칙 export', () => {
  it("next='dark' 면 moon · next='light' 면 sun, 둘 다 aria-hidden", () => {
    const { container: dark } = render(<ThemeSwitchIcon next="dark" />);
    const moon = dark.querySelector('svg');
    expect(moon?.getAttribute('data-icon')).toBe('moon');
    expect(moon?.getAttribute('aria-hidden')).toBe('true');

    const { container: light } = render(<ThemeSwitchIcon next="light" className="size-[18px]" />);
    const sun = light.querySelector('svg');
    expect(sun?.getAttribute('data-icon')).toBe('sun');
    expect(sun?.getAttribute('aria-hidden')).toBe('true');
    expect(sun?.getAttribute('class')).toContain('size-[18px]');
  });

  it('문구 키는 목적지 테마다', () => {
    expect(THEME_SWITCH_LABEL).toEqual({ dark: '다크 모드로 전환', light: '라이트 모드로 전환' });
  });
});
