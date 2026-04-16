import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Phase 06.2 Plan 06 Task 2 — useWatchlistQuery 단위 테스트.
 *
 * Scanner `usePolling` 동형 패턴 검증:
 * - 1분 (60_000ms) 자동 폴링
 * - visibility API (백그라운드 탭 폴링 억제 + 복귀 시 즉시 refetch)
 * - lastUpdatedAt = MAX(quote.updatedAt) 클라이언트 계산 (RESEARCH §Pattern 10)
 * - stale-but-visible: 에러 시 이전 data 유지, error state 갱신 후 성공 시 error 클리어
 * - unmount 시 interval clear
 */

const fetchMock = vi.fn();

vi.mock('@/lib/watchlist-api', () => ({
  fetchWatchlist: (...args: unknown[]) =>
    (fetchMock as unknown as (...a: unknown[]) => unknown)(...args),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}));

// eslint-disable-next-line import/first -- vi.mock hoist 이후 import
import { useWatchlistQuery } from '../use-watchlist-query';

describe('useWatchlistQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ data: [], error: null });
    // 기본은 visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mount 직후 fetchWatchlist 를 1회 호출한다', async () => {
    renderHook(() => useWatchlistQuery());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('60초마다 재호출 (두 번째 fetch 는 60_000ms 이후)', async () => {
    renderHook(() => useWatchlistQuery());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('visibilitychange → visible 이벤트에 즉시 refetch', async () => {
    renderHook(() => useWatchlistQuery());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('lastUpdatedAt 은 MAX(quote.updatedAt) epoch ms', async () => {
    const t1 = new Date('2026-04-16T06:00:00Z').toISOString();
    const t2 = new Date('2026-04-16T06:02:00Z').toISOString(); // MAX
    const t3 = new Date('2026-04-16T06:01:00Z').toISOString();
    fetchMock.mockResolvedValue({
      data: [
        makeRow('A', t1),
        makeRow('B', t2),
        makeRow('C', t3),
      ],
      error: null,
    });
    const { result } = renderHook(() => useWatchlistQuery());
    await waitFor(() =>
      expect(result.current.lastUpdatedAt).toBe(new Date(t2).getTime()),
    );
  });

  it('에러 발생 시 이전 data 는 유지하고 error state 만 세팅 (stale-but-visible)', async () => {
    // 1회차: 성공 (row 1개)
    fetchMock.mockResolvedValueOnce({
      data: [makeRow('Z', '2026-04-16T06:00:00Z')],
      error: null,
    });
    const { result } = renderHook(() => useWatchlistQuery());
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    // 2회차: 실패
    fetchMock.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toHaveLength(1); // 이전 data 보존
  });

  it('unmount 시 폴링 중단 (clearInterval)', async () => {
    const { unmount } = renderHook(() => useWatchlistQuery());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    // unmount 이후 추가 호출 없음
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function makeRow(code: string, updatedAt: string) {
  return {
    stockCode: code,
    addedAt: updatedAt,
    position: 0,
    stock: {
      code,
      name: code,
      market: 'KOSPI',
      kosdaqSegment: null,
    },
    quote: {
      price: 0,
      changeAmount: 0,
      changeRate: 0,
      tradeAmount: 0,
      updatedAt,
    },
  };
}
