import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { ApiClientError } from '@/lib/api';
import { clearQueryCache } from '@/lib/query-cache';

/**
 * quick-261009-c43 D-02 · D-03 — `useChatAccess` (AI 애널리스트 접근 탐침).
 *
 * 깨졌을 때 사용자가 겪는 일:
 *  - 세션 판정 전 · enabled=false 에 탐침하면  → 모든 페이지가 GET /api/chat/access 를 두드린다(전역 FAB)
 *  - 403 을 "error" 로 접으면                 → 미매핑 사용자에게 「다시 시도」 오류 상자(게이트 아님)
 *  - 동시 마운트가 두 번 탐침하면             → 종목상세 진입마다 Cloud Run 왕복 2회
 *  - "ok" 를 기억하지 않으면                   → 앱 AI 탭 재방문마다 본문이 비었다가 선다
 *  - 사용자 전환 뒤 이전 결과를 쓰면           → 다른 사람의 판정으로 한 박자 그린다
 */

type AuthShape = { user: { id: string } | null; isLoading: boolean };
let mockAuth: AuthShape;
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockAuth }));

const checkMock = vi.fn();
vi.mock('@/lib/chat-api', () => ({ checkChatAccess: () => checkMock() }));

import { useChatAccess } from '../use-chat-access';

const apiErr = (status: number) =>
  new ApiClientError({ code: status === 403 ? 'DMA_UNMAPPED' : 'X', message: 'x', status });

let seq = 0;
/** 모듈 수준 진행 중 Promise 가 테스트 사이에 새지 않게 케이스마다 다른 사용자 id. */
const freshUser = () => ({ id: `u-${++seq}` });

beforeEach(() => {
  clearQueryCache();
  checkMock.mockReset();
  mockAuth = { user: freshUser(), isLoading: false };
});

describe('useChatAccess', () => {
  it('세션 판정 중 → "pending", 탐침 0회', () => {
    mockAuth = { user: null, isLoading: true };
    expect(renderHook(() => useChatAccess()).result.current.access).toBe('pending');
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('로그인 없음 → "unauthenticated", 탐침 0회', () => {
    mockAuth = { user: null, isLoading: false };
    expect(renderHook(() => useChatAccess()).result.current.access).toBe('unauthenticated');
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('enabled=false → "pending", 탐침 0회', () => {
    expect(renderHook(() => useChatAccess(false)).result.current.access).toBe('pending');
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('탐침 성공 → "ok" (응답 전에는 "pending")', async () => {
    checkMock.mockResolvedValue({ access: true });
    const { result } = renderHook(() => useChatAccess());
    expect(result.current.access).toBe('pending');
    await waitFor(() => expect(result.current.access).toBe('ok'));
  });

  it('403 → "unmapped" · 401 → "unauthenticated" · 500 · 네트워크 → "error"', async () => {
    for (const [err, want] of [
      [apiErr(403), 'unmapped'],
      [apiErr(401), 'unauthenticated'],
      [apiErr(500), 'error'],
      [new TypeError('Failed to fetch'), 'error'],
    ] as const) {
      checkMock.mockReset().mockRejectedValue(err);
      mockAuth = { user: freshUser(), isLoading: false };
      const { result } = renderHook(() => useChatAccess());
      await waitFor(() => expect(result.current.access).toBe(want));
    }
  });

  it('같은 사용자 두 인스턴스 동시 마운트 → 탐침 1회', async () => {
    checkMock.mockResolvedValue({ access: true });
    const a = renderHook(() => useChatAccess());
    const b = renderHook(() => useChatAccess());
    await waitFor(() => {
      expect(a.result.current.access).toBe('ok');
      expect(b.result.current.access).toBe('ok');
    });
    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  it('"ok" 기억 후 재마운트 → 첫 렌더부터 "ok", 탐침 0회', async () => {
    checkMock.mockResolvedValue({ access: true });
    const first = renderHook(() => useChatAccess());
    await waitFor(() => expect(first.result.current.access).toBe('ok'));
    first.unmount();
    checkMock.mockClear();

    const second = renderHook(() => useChatAccess());
    expect(second.result.current.access).toBe('ok');
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('error 후 retry() → 재탐침해 결과 반영', async () => {
    checkMock.mockRejectedValueOnce(apiErr(500)).mockResolvedValueOnce({ access: true });
    const { result } = renderHook(() => useChatAccess());
    await waitFor(() => expect(result.current.access).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.access).toBe('ok'));
    expect(checkMock).toHaveBeenCalledTimes(2);
  });

  it('markUnmapped() → 즉시 "unmapped", 이후 재마운트도 "unmapped"(탐침 없음)', async () => {
    checkMock.mockResolvedValue({ access: true });
    const first = renderHook(() => useChatAccess());
    await waitFor(() => expect(first.result.current.access).toBe('ok'));
    act(() => first.result.current.markUnmapped());
    expect(first.result.current.access).toBe('unmapped');
    first.unmount();
    checkMock.mockClear();

    const second = renderHook(() => useChatAccess());
    expect(second.result.current.access).toBe('unmapped');
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('사용자 id 가 바뀌면 이전 사용자 결과를 쓰지 않는다', async () => {
    checkMock.mockResolvedValueOnce({ access: true });
    const { result, rerender } = renderHook(() => useChatAccess());
    await waitFor(() => expect(result.current.access).toBe('ok'));

    let resolveNext: (v: unknown) => void = () => {};
    checkMock.mockReturnValueOnce(new Promise((r) => (resolveNext = r)));
    mockAuth = { user: freshUser(), isLoading: false };
    rerender();
    expect(result.current.access).toBe('pending');
    // 다음 사용자의 탐침을 settle 시켜 모듈 수준 진행 중 Promise 를 비운다.
    await act(async () => {
      resolveNext({ access: true });
    });
    await waitFor(() => expect(result.current.access).toBe('ok'));
  });
});
