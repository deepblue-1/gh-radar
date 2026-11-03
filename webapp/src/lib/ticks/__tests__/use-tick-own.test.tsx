import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { TickOwnResponse } from '@gh-radar/shared';

const api = vi.hoisted(() => ({ fetchTickOwn: vi.fn() }));
vi.mock('@/lib/ticks/tick-api', () => api);

import { ApiClientError } from '@/lib/api';

import { useTickOwn } from '../use-tick-own';

/**
 * Phase 38 Plan 08 Task 2 — useTickOwn 호출 규율(SC-4 · CLAUDE.md 공식 API 기준 3):
 * 마운트 1 · 같은 키 재렌더 0 · refreshKey +1 = 1 · 시계 10분 = 0(타이머 없음) · 늦은 이전 응답 버림 · 실패 = own null · 'error' ·
 * throw 없음 · console.warn 1회.
 */

const Q = { isin: 'KR7101360000', d: '2026-10-16', ex: 'KRX' as const };
function respOf(tag: string): TickOwnResponse {
  return { access: true, date: Q.d, exchange: 'KRX', isin: Q.isin, servers: [tag], fills: [], events: [], orders: [] };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  api.fetchTickOwn.mockReset();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  vi.useRealTimers();
});

describe('useTickOwn — 호출 수', () => {
  it('마운트 = 1 · 같은 키 재렌더 = 0 · refreshKey +1 = 1', async () => {
    api.fetchTickOwn.mockResolvedValue(respOf('A'));
    const { result, rerender } = renderHook(({ k }) => useTickOwn(Q, k), { initialProps: { k: 0 } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.fetchTickOwn).toHaveBeenCalledTimes(1);
    expect(api.fetchTickOwn).toHaveBeenCalledWith(Q);
    rerender({ k: 0 });
    rerender({ k: 0 });
    expect(api.fetchTickOwn).toHaveBeenCalledTimes(1);
    rerender({ k: 1 });
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.fetchTickOwn).toHaveBeenCalledTimes(2);
  });

  it('시계 10분 진행 = 요청 0(자동 타이머 · 폴링 없음)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.fetchTickOwn.mockResolvedValue(respOf('A'));
    const { result } = renderHook(() => useTickOwn(Q, 0));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(api.fetchTickOwn).toHaveBeenCalledTimes(1);
  });

  it('(38-09) StrictMode 이중 effect = 요청 1 · 응답 반영 · 끝난 뒤 refreshKey +1 = 1', async () => {
    api.fetchTickOwn.mockResolvedValue(respOf('A'));
    const { result, rerender } = renderHook(({ k }) => useTickOwn(Q, k), {
      initialProps: { k: 0 },
      reactStrictMode: true,
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.fetchTickOwn).toHaveBeenCalledTimes(1);
    expect(result.current.own?.servers).toEqual(['A']);
    rerender({ k: 1 });
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.fetchTickOwn).toHaveBeenCalledTimes(2);
  });

  it('isin · d 없음 = 요청 0 · idle', () => {
    const { result } = renderHook(() => useTickOwn({ isin: null, d: Q.d, ex: 'KRX' }, 0));
    expect(result.current).toEqual({ own: null, status: 'idle' });
    expect(api.fetchTickOwn).not.toHaveBeenCalled();
  });
});

describe('useTickOwn — 늦은 응답 · 실패', () => {
  it('요청 A 진행 중 refreshKey 증가 → 요청 B · A 가 나중에 와도 own = B', async () => {
    const a = deferred<TickOwnResponse>();
    const b = deferred<TickOwnResponse>();
    api.fetchTickOwn.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { result, rerender } = renderHook(({ k }) => useTickOwn(Q, k), { initialProps: { k: 0 } });
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalledTimes(1));
    rerender({ k: 1 });
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalledTimes(2));
    await act(async () => {
      b.resolve(respOf('B'));
      await b.promise;
    });
    expect(result.current.own?.servers).toEqual(['B']);
    await act(async () => {
      a.resolve(respOf('A'));
      await a.promise;
    });
    expect(result.current.own?.servers).toEqual(['B']);
    expect(result.current.status).toBe('ready');
  });

  it.each([
    ['401', new ApiClientError({ code: 'UNAUTHENTICATED', message: 'x', status: 401 })],
    ['403', new ApiClientError({ code: 'FORBIDDEN', message: 'x', status: 403 })],
    ['404', new ApiClientError({ code: 'NOT_FOUND', message: 'x', status: 404 })],
    ['500', new ApiClientError({ code: 'INTERNAL', message: 'x', status: 500 })],
    ['네트워크', new TypeError('Failed to fetch')],
  ])('실패(%s) → own null · status error · throw 없음 · console.warn 1회', async (_name, err) => {
    api.fetchTickOwn.mockRejectedValue(err);
    const { result } = renderHook(() => useTickOwn(Q, 0));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.own).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe('[tick-own]');
  });
});
