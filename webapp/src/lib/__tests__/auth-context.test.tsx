/**
 * AuthProvider — 복귀 때 세션 확인이 망에 막혀도 로그아웃으로 떨어지지 않는다 (debug ios-resume-sidebar-stall).
 * auth-js 는 만료 토큰 갱신이 망 실패면 세션을 스토리지에 둔 채 `{session:null, error}` 를 준다.
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type GetSessionResult = { data: { session: { user: { id: string; email: string } } | null }; error: Error | null };

const getSessionMock = vi.fn<() => Promise<GetSessionResult>>();
let authListener: ((event: string, session: unknown) => void) | null = null;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: () => getSessionMock(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => {},
    },
  }),
}));
vi.mock('@/lib/query-cache', () => ({ clearQueryCache: () => {} }));
vi.mock('@/lib/push/push-devices-api', () => ({ unregisterThisDeviceBeforeSignOut: async () => {} }));

import { AuthProvider, useAuth } from '@/lib/auth-context';

const SESSION = { user: { id: 'u1', email: 'a@b.c' } };

function Probe() {
  const { user, isLoading } = useAuth();
  return <span data-testid="who">{isLoading ? 'loading' : (user?.id ?? 'none')}</span>;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('AuthProvider 복귀 세션 확인', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    authListener = null;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('복귀 때 getSession 이 망 실패({session:null, error})면 로그인 상태를 유지한다', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: SESSION }, error: null });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await flush();
    expect(screen.getByTestId('who').textContent).toBe('u1');

    getSessionMock.mockResolvedValueOnce({ data: { session: null }, error: new Error('Load failed') });
    setVisibility('hidden');
    setVisibility('visible');
    await flush();
    expect(getSessionMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('who').textContent).toBe('u1');
  });

  it('복귀 때 getSession 이 오류 없이 세션 없음이면 로그아웃으로 받는다', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: SESSION }, error: null });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await flush();
    getSessionMock.mockResolvedValueOnce({ data: { session: null }, error: null });
    setVisibility('visible');
    await flush();
    expect(screen.getByTestId('who').textContent).toBe('none');
  });

  it('SIGNED_OUT 구독 이벤트는 그대로 로그아웃시킨다', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: SESSION }, error: null });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await flush();
    act(() => authListener?.('SIGNED_OUT', null));
    expect(screen.getByTestId('who').textContent).toBe('none');
  });
});
