import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { HomeSnapshotResponse } from '@gh-radar/shared';

const fetchHomeMock = vi.fn();
vi.mock('@/lib/home-api', () => ({
  fetchHome: (...a: unknown[]) => fetchHomeMock(...a),
}));

import { useHomeQuery } from '../use-home-query';

const RESPONSE: HomeSnapshotResponse = { snapshot: null, index: [] };

describe('useHomeQuery autoRefresh (quick-260913-g4c)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-14T01:00:00Z')); // 월 10:00 KST
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    fetchHomeMock.mockReset();
    fetchHomeMock.mockResolvedValue(RESPONSE);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (document as unknown as { visibilityState?: string }).visibilityState;
  });

  it('autoRefresh=true → 30s 후 fetchHome 2회, isLoading 은 다시 true 가 되지 않음, data 보존', async () => {
    const loadingHistory: boolean[] = [];
    const { result } = renderHook(() => {
      const r = useHomeQuery({}, { autoRefresh: true });
      loadingHistory.push(r.isLoading);
      return r;
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchHomeMock).toHaveBeenCalledTimes(1);
    const firstFalse = loadingHistory.indexOf(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await waitFor(() => expect(fetchHomeMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    // 폴링 갱신은 isRefreshing 경로 — 스켈레톤(isLoading) 재진입 없음.
    expect(loadingHistory.slice(firstFalse)).not.toContain(true);
    expect(result.current.data).toEqual(RESPONSE);
  });

  it('autoRefresh 미지정(기본 false) → 30s·60s 후에도 1회', async () => {
    const { result } = renderHook(() => useHomeQuery({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchHomeMock).toHaveBeenCalledTimes(1);
  });
});
