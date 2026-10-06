import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * Phase 29 (29-15) — `useAppRole` (D-13 · 사이드바 Admin 노출).
 *
 * undefined = 모름(세션 판정 전 · 조회 중) · null = 로그인 없음 · 허용 표에 없음 · 실패(보수적) · 그 밖 = RPC 결과 그대로.
 */

type AuthShape = { user: { id: string } | null; isLoading: boolean };
let mockAuth: AuthShape;
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockAuth }));

const rpcMock = vi.fn();
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: (name: string) => rpcMock(name) }) }));

import { useAppRole } from '../use-app-role';

beforeEach(() => {
  rpcMock.mockReset();
  mockAuth = { user: { id: 'u1' }, isLoading: false };
});

describe('useAppRole', () => {
  it('로그인 없음 → null · RPC 부르지 않음 · 세션 판정 전 → undefined', () => {
    mockAuth = { user: null, isLoading: false };
    expect(renderHook(() => useAppRole()).result.current).toBeNull();
    mockAuth = { user: null, isLoading: true };
    expect(renderHook(() => useAppRole()).result.current).toBeUndefined();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('RPC my_app_access 결과 그대로 — 조회 중에는 undefined', async () => {
    rpcMock.mockResolvedValue({ data: 'admin', error: null });
    const { result } = renderHook(() => useAppRole());
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe('admin'));
    expect(rpcMock).toHaveBeenCalledWith('my_app_access');
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('허용 표에 없음(null) · 모르는 값 · RPC 오류 · throw → null', async () => {
    for (const outcome of [
      () => Promise.resolve({ data: null, error: null }),
      () => Promise.resolve({ data: 'root', error: null }),
      () => Promise.resolve({ data: 'admin', error: { message: 'x' } }),
      () => Promise.reject(new Error('network')),
    ]) {
      rpcMock.mockReset();
      rpcMock.mockImplementation(outcome);
      const { result, unmount } = renderHook(() => useAppRole());
      await waitFor(() => expect(rpcMock).toHaveBeenCalled());
      await waitFor(() => expect(result.current).toBeNull());
      unmount();
    }
  });

  it('사용자가 바뀌면 재조회 — 그 사이 이전 사용자의 역할을 내지 않는다', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'admin', error: null });
    const { result, rerender } = renderHook(() => useAppRole());
    await waitFor(() => expect(result.current).toBe('admin'));

    let resolve!: (v: unknown) => void;
    rpcMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    mockAuth = { user: { id: 'u2' }, isLoading: false };
    rerender();
    expect(result.current).toBeUndefined();
    resolve({ data: 'viewer', error: null });
    await waitFor(() => expect(result.current).toBe('viewer'));
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});
