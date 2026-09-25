import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * 21-09 · D-08 · D-08a — `/me` 계정 카드 A(스케치 005 채택안).
 *
 * 잠그는 것: user 없으면 렌더 안 함 · 아바타 폴백 체인(avatar_url → 이니셜, 이미지 실패 잠금) ·
 * 이름/이메일 · 테마 버튼 아이콘(다크=Sun · 라이트=Moon)과 반대 테마로 전환 · 로그아웃 → signOut ·
 * 카드 마크업 계약(`data-slot` · radius 16 · 높이 72).
 */

type AuthShape = ReturnType<typeof import('@/lib/auth-context').useAuth>;

let mockAuth: AuthShape;
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockAuth,
}));

let resolvedTheme: 'light' | 'dark' = 'dark';
const setTheme = vi.fn();
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme, theme: resolvedTheme, setTheme }),
}));

import { AccountCard } from '../account-card';

const signOut = vi.fn(async () => {});

function authed(meta: Record<string, unknown> = {}, displayName: string | null = 'Alex'): AuthShape {
  return {
    user: { id: 'u1', email: 'alex@example.com', user_metadata: meta },
    displayName,
    isLoading: false,
    signOut,
  } as unknown as AuthShape;
}

beforeEach(() => {
  resolvedTheme = 'dark';
  setTheme.mockClear();
  signOut.mockClear();
  mockAuth = authed();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AccountCard — 존재 조건 · 마크업 계약', () => {
  it('user 가 없으면 아무것도 그리지 않는다', () => {
    mockAuth = { user: null, displayName: null, isLoading: false, signOut } as unknown as AuthShape;
    const { container } = render(<AccountCard />);
    expect(container.firstChild).toBeNull();
  });

  it('루트가 data-slot="account-card" 이고 radius 16 · 높이 72 클래스를 갖는다', () => {
    const { container } = render(<AccountCard />);
    const root = container.querySelector('[data-slot="account-card"]');
    expect(root).not.toBeNull();
    expect(root!.className).toContain('rounded-[16px]');
    expect(root!.className).toContain('min-h-[72px]');
  });
});

describe('AccountCard — 아바타 폴백 체인', () => {
  it('avatar_url 이 있으면 <img> 를 그리고, 로드 실패 시 이메일 첫 글자 이니셜로 바뀐다', () => {
    mockAuth = authed({ avatar_url: 'https://example.com/a.png' });
    const { container } = render(<AccountCard />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://example.com/a.png');

    fireEvent.error(img!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-slot="account-avatar-initial"]')?.textContent).toBe('A');
  });

  it('avatar_url 이 없으면 이니셜을 그린다', () => {
    const { container } = render(<AccountCard />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-slot="account-avatar-initial"]')?.textContent).toBe('A');
  });
});

describe('AccountCard — 이름 · 이메일', () => {
  it('displayName 과 이메일을 보인다', () => {
    render(<AccountCard />);
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByText('alex@example.com')).toBeTruthy();
  });

  it('displayName 이 없으면 「사용자」', () => {
    mockAuth = authed({}, null);
    render(<AccountCard />);
    expect(screen.getByText('사용자')).toBeTruthy();
  });
});

describe('AccountCard — 테마 버튼 (D-08a)', () => {
  it('다크면 Sun 을 보이고 누르면 라이트로 바꾼다', () => {
    resolvedTheme = 'dark';
    render(<AccountCard />);
    const btn = screen.getByRole('button', { name: '테마 전환' });
    expect(btn.querySelector('[data-icon="sun"]')).not.toBeNull();
    expect(btn.querySelector('[data-icon="moon"]')).toBeNull();
    fireEvent.click(btn);
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('라이트면 Moon 을 보이고 누르면 다크로 바꾼다', () => {
    resolvedTheme = 'light';
    render(<AccountCard />);
    const btn = screen.getByRole('button', { name: '테마 전환' });
    expect(btn.querySelector('[data-icon="moon"]')).not.toBeNull();
    expect(btn.querySelector('[data-icon="sun"]')).toBeNull();
    fireEvent.click(btn);
    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});

describe('AccountCard — 로그아웃', () => {
  it('접근 이름이 정확히 「로그아웃」이고 누르면 signOut 을 1회 부른다', () => {
    render(<AccountCard />);
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
