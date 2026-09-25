import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LoginPage from '../page';
import { nativeGoogleSignIn } from '@/lib/native/native-google-login';
import { isNativeApp } from '@/lib/native/native-detect';

/**
 * Phase 21 Plan 15 Task 2 — `/login` 앱 분기(D-03 · MOBILE-01f) 회귀면.
 *
 * 각 케이스는 **깨졌을 때 사용자가 겪는 일**과 1:1 이다.
 *  - 브라우저가 네이티브 경로를 타면        → 웹 사용자 로그인 전부 불가(`window.Capacitor` 없음)
 *  - 앱이 OAuth 경로를 타면                 → Google 이 WebView 를 `disallowed_userAgent` 로 차단
 *  - 성공 뒤 하드 내비가 없으면             → 세션 쿠키는 생겼는데 화면이 로그인에 머문다
 *  - `//evil.com` 이 통과하면               → 로그인 직후 외부로 튕기는 오픈 리다이렉트(T-21-11)
 *  - 취소·실패 문구가 섞이면                → 닫기만 했는데 「실패」라고 겁주거나 실패를 숨긴다
 *  - 진행 중 재클릭이 막히지 않으면         → 계정 선택 시트가 두 번 뜨고 nonce 가 엇갈린다
 */

let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
}));

const signInWithOAuth = vi.fn(async () => ({ data: {}, error: null }));
const fakeClient = { auth: { signInWithOAuth } };
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => fakeClient,
}));

vi.mock('@/lib/native/native-detect', () => ({
  isNativeApp: vi.fn(() => false),
}));

vi.mock('@/lib/native/native-google-login', async (orig) => ({
  ...(await orig<typeof import('@/lib/native/native-google-login')>()),
  nativeGoogleSignIn: vi.fn(),
}));

const nativeSignIn = vi.mocked(nativeGoogleSignIn);
const nativeDetect = vi.mocked(isNativeApp);

let originalLocation: PropertyDescriptor | undefined;
const replace = vi.fn();

beforeEach(() => {
  search = new URLSearchParams();
  signInWithOAuth.mockClear();
  nativeSignIn.mockReset();
  nativeDetect.mockReset().mockReturnValue(false);
  replace.mockReset();
  originalLocation = Object.getOwnPropertyDescriptor(window, 'location');
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, origin: 'http://localhost:3100', replace },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
  vi.restoreAllMocks();
});

const button = () => screen.getByRole('button', { name: 'Google로 로그인' });

describe('/login', () => {
  it('제목은 「GH Trade에 로그인」', () => {
    render(<LoginPage />);
    expect(screen.getByText('GH Trade에 로그인')).toBeInTheDocument();
  });

  it('브라우저: 종전 OAuth(redirectTo=/auth/callback?next=… · prompt=select_account) · 네이티브 0', async () => {
    search = new URLSearchParams({ next: '/me' });
    render(<LoginPage />);
    await userEvent.click(button());

    expect(nativeSignIn).not.toHaveBeenCalled();
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `http://localhost:3100/auth/callback?next=${encodeURIComponent('/me')}`,
        queryParams: { prompt: 'select_account' },
      },
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it('앱 + 성공: nativeGoogleSignIn(createClient()) 1회 · OAuth 0 · location.replace(safeNext)', async () => {
    nativeDetect.mockReturnValue(true);
    nativeSignIn.mockResolvedValue({ error: null });
    search = new URLSearchParams({ next: '/me' });
    render(<LoginPage />);
    await userEvent.click(button());

    expect(nativeSignIn).toHaveBeenCalledTimes(1);
    expect(nativeSignIn).toHaveBeenCalledWith(fakeClient);
    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/me');
  });

  it('앱 + ?next=//evil.com → location.replace("/")', async () => {
    nativeDetect.mockReturnValue(true);
    nativeSignIn.mockResolvedValue({ error: null });
    search = new URLSearchParams({ next: '//evil.com' });
    render(<LoginPage />);
    await userEvent.click(button());
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('앱 + 사용자 취소 → oauth_denied 문구 · 이동 0', async () => {
    nativeDetect.mockReturnValue(true);
    nativeSignIn.mockRejectedValue(new Error('The user canceled the sign-in flow.'));
    render(<LoginPage />);
    await userEvent.click(button());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google 로그인을 취소하셨습니다. 계속하려면 다시 시도해주세요.',
    );
    expect(replace).not.toHaveBeenCalled();
    expect(button()).not.toBeDisabled();
  });

  it('앱 + 플러그인 실패(취소 아님) → auth_failed 문구', async () => {
    nativeDetect.mockReturnValue(true);
    nativeSignIn.mockRejectedValue(new Error('no_id_token'));
    render(<LoginPage />);
    await userEvent.click(button());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '로그인 처리에 실패했습니다. 잠시 후 다시 시도해주세요.',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('앱 + Supabase { error } → auth_failed 문구 · 이동 0', async () => {
    nativeDetect.mockReturnValue(true);
    nativeSignIn.mockResolvedValue({ error: new Error('Nonces mismatch') });
    render(<LoginPage />);
    await userEvent.click(button());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '로그인 처리에 실패했습니다. 잠시 후 다시 시도해주세요.',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('앱 오류가 URL ?error= 보다 우선한다', async () => {
    nativeDetect.mockReturnValue(true);
    nativeSignIn.mockRejectedValue(new Error('USER_CANCELLED'));
    search = new URLSearchParams({ error: 'session_expired' });
    render(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('세션이 만료되었습니다');
    await userEvent.click(button());
    expect(await screen.findByRole('alert')).toHaveTextContent('Google 로그인을 취소하셨습니다');
  });

  it('진행 중에는 버튼 disabled · aria-busy · 두 번째 클릭은 호출을 만들지 않는다', async () => {
    nativeDetect.mockReturnValue(true);
    let resolve!: (v: { error: Error | null }) => void;
    nativeSignIn.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<LoginPage />);

    fireEvent.click(button());
    fireEvent.click(button());
    expect(nativeSignIn).toHaveBeenCalledTimes(1);
    expect(button()).toBeDisabled();
    expect(button()).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      resolve({ error: null });
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(nativeSignIn).toHaveBeenCalledTimes(1);
    // 성공 뒤 페이지가 떠나는 동안에도 비활성 유지(재탭으로 계정 선택 시트가 또 뜨지 않게).
    expect(button()).toBeDisabled();
  });
});
