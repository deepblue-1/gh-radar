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

  const slot = (hhmm: string) => ({
    tradeDate: '2026-09-14',
    capturedAt: `2026-09-14T${hhmm}:00Z`,
    themeCount: 1,
    stockCount: 1,
    isCarried: false,
  });

  it('증분 index — 두 번째 조회는 indexSince=가진 최신 슬롯, 새 슬롯만 받아 앞에 병합', async () => {
    fetchHomeMock
      .mockResolvedValueOnce({ snapshot: null, index: [slot('01:01'), slot('01:00')] })
      .mockResolvedValueOnce({ snapshot: null, index: [slot('01:02')] });

    const { result } = renderHook(() => useHomeQuery({}, { autoRefresh: true }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // 처음엔 가진 index 가 없으니 전체 조회.
    expect(fetchHomeMock.mock.calls[0][0]).not.toHaveProperty('indexSince');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await waitFor(() => expect(fetchHomeMock).toHaveBeenCalledTimes(2));
    expect(fetchHomeMock.mock.calls[1][0]).toMatchObject({
      indexSince: '2026-09-14T01:01:00Z',
    });
    await waitFor(() =>
      expect(result.current.data?.index.map((e) => e.capturedAt)).toEqual([
        '2026-09-14T01:02:00Z',
        '2026-09-14T01:01:00Z',
        '2026-09-14T01:00:00Z',
      ]),
    );
  });

  it('페이지 이동 캐시 — 재마운트 시 마지막 응답으로 즉시 그림(isLoading 없음)', async () => {
    fetchHomeMock.mockResolvedValue({ snapshot: null, index: [slot('01:00')] });

    const first = renderHook(() => useHomeQuery({}));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => useHomeQuery({}));
    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.data?.index).toHaveLength(1);
    await waitFor(() => expect(fetchHomeMock).toHaveBeenCalledTimes(2));
  });
});
