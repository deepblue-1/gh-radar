import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { AppRole } from '@gh-radar/shared';

/**
 * quick 261121-n1b — `useAdminMenus(role)` (사이드바 trader 어드민 메뉴 노출).
 *
 * trader 일 때만 `my_admin_menus` 1회 · 그 밖 역할 · 모름은 RPC 0회 · [] · 실패 · throw → [] · ADMIN_MENU_KEYS 밖 값 제거.
 */

type AuthShape = { user: { id: string } | null; isLoading: boolean };
let mockAuth: AuthShape;
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockAuth }));

const rpcMock = vi.fn();
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: (name: string) => rpcMock(name) }) }));

import { useAdminMenus } from '../use-admin-menus';

beforeEach(() => {
  rpcMock.mockReset();
  mockAuth = { user: { id: 'u1' }, isLoading: false };
});

describe('useAdminMenus', () => {
  it.each<AppRole | null | undefined>(['admin', 'viewer', null, undefined])(
    '역할 %j → [] · RPC 0회',
    async (role) => {
      const { result } = renderHook(() => useAdminMenus(role));
      expect(result.current).toEqual([]);
      await Promise.resolve();
      expect(rpcMock).not.toHaveBeenCalled();
    },
  );

  it('로그인 없음 → [] · RPC 0회', () => {
    mockAuth = { user: null, isLoading: false };
    expect(renderHook(() => useAdminMenus('trader')).result.current).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('trader → my_admin_menus 1회 · 모르는 값 제거 · ADMIN_MENU_KEYS 순서', async () => {
    rpcMock.mockResolvedValue({ data: ['settlement', 'users', 'pnl'], error: null });
    const { result } = renderHook(() => useAdminMenus('trader'));
    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current).toEqual(['pnl', 'settlement']));
    expect(rpcMock).toHaveBeenCalledWith('my_admin_menus');
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('RPC 오류 · 배열 아님 · throw → []', async () => {
    for (const outcome of [
      () => Promise.resolve({ data: ['pnl'], error: { message: 'x' } }),
      () => Promise.resolve({ data: 'pnl', error: null }),
      () => Promise.reject(new Error('network')),
    ]) {
      rpcMock.mockReset();
      rpcMock.mockImplementation(outcome);
      const { result, unmount } = renderHook(() => useAdminMenus('trader'));
      await waitFor(() => expect(rpcMock).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(result.current).toEqual([]);
      unmount();
    }
  });

  it('사용자가 바뀌면 재조회 — 그 사이 이전 사용자의 메뉴를 내지 않는다', async () => {
    rpcMock.mockResolvedValueOnce({ data: ['pnl'], error: null });
    const { result, rerender } = renderHook(() => useAdminMenus('trader'));
    await waitFor(() => expect(result.current).toEqual(['pnl']));

    let resolve!: (v: unknown) => void;
    rpcMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    mockAuth = { user: { id: 'u2' }, isLoading: false };
    rerender();
    expect(result.current).toEqual([]);
    resolve({ data: ['settlement'], error: null });
    await waitFor(() => expect(result.current).toEqual(['settlement']));
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});
