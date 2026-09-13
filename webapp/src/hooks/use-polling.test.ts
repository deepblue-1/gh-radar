import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePolling } from './use-polling';

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 자동 갱신은 KST 평일 08:00~20:05 창에서만 돈다 — 실행 시각에 따라 깨지지 않게 창 안으로 고정.
    vi.setSystemTime(new Date('2026-09-14T01:00:00Z')); // 월 10:00 KST
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (document as unknown as { visibilityState?: string }).visibilityState;
  });

  it('창 밖(토요일)이면 interval 무호출, refresh() 는 즉시 호출', async () => {
    vi.setSystemTime(new Date('2026-09-19T01:00:00Z')); // 토 10:00 KST
    const fetcher = vi.fn().mockResolvedValue('v1');
    const { result } = renderHook(() =>
      usePolling(fetcher, { intervalMs: 30_000, key: 'k1' }),
    );
    await waitFor(() => expect(result.current.data).toBe('v1'));
    expect(fetcher).toHaveBeenCalledTimes(1); // 초기 로드는 게이트 무관

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('mount 즉시 1회 호출 + 60s 후 재호출', async () => {
    const fetcher = vi.fn().mockResolvedValue('v1');
    const { result } = renderHook(() =>
      usePolling(fetcher, { intervalMs: 60_000, key: 'k1' }),
    );

    await waitFor(() => expect(result.current.data).toBe('v1'));
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('unmount 시 interval clear + abort', async () => {
    const fetcher = vi.fn().mockResolvedValue('v1');
    const { result, unmount } = renderHook(() =>
      usePolling(fetcher, { intervalMs: 60_000, key: 'k1' }),
    );
    await waitFor(() => expect(result.current.data).toBe('v1'));

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('cacheKey — 재마운트 시 캐시로 즉시 그리고(초기 로딩 없음) 백그라운드로 교체', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');
    const opts = { intervalMs: 60_000, key: 'k1', cacheKey: 'test:k1' };

    const first = renderHook(() => usePolling(fetcher, opts));
    await waitFor(() => expect(first.result.current.data).toBe('v1'));
    first.unmount();

    // 페이지 재방문 — 첫 렌더부터 마지막 값, 스켈레톤 경로(isInitialLoading) 없음.
    const second = renderHook(() => usePolling(fetcher, opts));
    expect(second.result.current.data).toBe('v1');
    expect(second.result.current.isInitialLoading).toBe(false);
    await waitFor(() => expect(second.result.current.data).toBe('v2'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('cacheKey 없으면 재마운트 시 다시 초기 로딩부터', async () => {
    const fetcher = vi.fn().mockResolvedValue('v1');
    const first = renderHook(() => usePolling(fetcher, { intervalMs: 60_000, key: 'k1' }));
    await waitFor(() => expect(first.result.current.data).toBe('v1'));
    first.unmount();

    const second = renderHook(() => usePolling(fetcher, { intervalMs: 60_000, key: 'k1' }));
    expect(second.result.current.data).toBeUndefined();
    expect(second.result.current.isInitialLoading).toBe(true);
    await waitFor(() => expect(second.result.current.data).toBe('v1'));
  });

  it('key 변경 시 즉시 재요청', async () => {
    const fetcher = vi.fn().mockResolvedValue('v1');
    const { result, rerender } = renderHook(
      ({ k }) => usePolling(fetcher, { intervalMs: 60_000, key: k }),
      { initialProps: { k: 'k1' } },
    );
    await waitFor(() => expect(result.current.data).toBe('v1'));
    expect(fetcher).toHaveBeenCalledTimes(1);

    rerender({ k: 'k2' });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it('에러 시 data 유지 (stale-but-visible), 다음 성공 시 error 클리어', async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) return Promise.resolve('good');
      if (callCount === 2) return Promise.reject(new Error('boom'));
      return Promise.resolve('good2');
    });
    const { result } = renderHook(() =>
      usePolling(fetcher, { intervalMs: 60_000, key: 'k1' }),
    );
    await waitFor(() => expect(result.current.data).toBe('good'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await waitFor(() => expect(result.current.error?.message).toBe('boom'));
    expect(result.current.data).toBe('good'); // stale 유지

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await waitFor(() => expect(result.current.data).toBe('good2'));
    expect(result.current.error).toBeUndefined();
  });

  it('refresh() 호출 시 즉시 재요청 + isRefreshing 전이', async () => {
    const fetcher = vi.fn().mockResolvedValue('v1');
    const { result } = renderHook(() =>
      usePolling(fetcher, { intervalMs: 60_000, key: 'k1' }),
    );
    await waitFor(() => expect(result.current.data).toBe('v1'));
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('연속 refresh() 호출 시 이전 요청 abort (T-5-03)', async () => {
    const signals: AbortSignal[] = [];
    let resolveFirst: ((v: string) => void) | null = null;
    const fetcher = vi.fn().mockImplementation((signal: AbortSignal) => {
      signals.push(signal);
      if (signals.length === 1) {
        // 첫 호출은 즉시 resolve (mount)
        return Promise.resolve('v0');
      }
      if (signals.length === 2) {
        return new Promise<string>((res) => {
          resolveFirst = res;
        });
      }
      return Promise.resolve('v2');
    });
    const { result } = renderHook(() =>
      usePolling(fetcher, { intervalMs: 60_000, key: 'k1' }),
    );
    await waitFor(() => expect(result.current.data).toBe('v0'));

    // 2번째 호출은 pending, 3번째 호출 시 2번째 signal abort 되어야 함
    await act(async () => {
      void result.current.refresh();
      await Promise.resolve();
      void result.current.refresh();
      await Promise.resolve();
      resolveFirst?.('late');
    });
    await waitFor(() => expect(signals[1]!.aborted).toBe(true));
  });
});
