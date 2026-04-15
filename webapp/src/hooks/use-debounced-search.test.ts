import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/lib/stock-api', () => ({
  searchStocks: vi.fn(),
}));

import { searchStocks } from '@/lib/stock-api';
import { useDebouncedSearch } from './use-debounced-search';

const mockSearch = searchStocks as unknown as ReturnType<typeof vi.fn>;

describe('useDebouncedSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSearch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("query='' 이면 fetcher 미호출, results=[] · loading=false", async () => {
    const { result } = renderHook(() => useDebouncedSearch(''));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockSearch).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it('입력 후 300ms 이내에는 fetcher 미호출', async () => {
    mockSearch.mockResolvedValue([]);
    renderHook(() => useDebouncedSearch('삼'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('300ms 경과 시 fetcher 1회 호출 + results 업데이트', async () => {
    const data = [{ code: '005930', name: '삼성전자' } as unknown as import('@gh-radar/shared').Stock];
    mockSearch.mockResolvedValue(data);
    const { result } = renderHook(() => useDebouncedSearch('삼'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await waitFor(() => expect(result.current.results).toEqual(data));
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it('300ms 내 연속 입력 시 마지막 쿼리로 1회만 호출', async () => {
    mockSearch.mockResolvedValue([]);
    const { rerender } = renderHook(({ q }) => useDebouncedSearch(q), {
      initialProps: { q: '삼' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    rerender({ q: '삼성' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    rerender({ q: '삼성전' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch.mock.calls[0]![0]).toBe('삼성전');
  });

  it('이전 in-flight 요청을 새 입력 발생 시 abort 한다', async () => {
    const signals: AbortSignal[] = [];
    mockSearch.mockImplementation((_q: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise((_res, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    });
    const { rerender } = renderHook(({ q }) => useDebouncedSearch(q), {
      initialProps: { q: '삼' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(signals).toHaveLength(1);
    rerender({ q: '삼성' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true);
  });

  it('fetcher reject 시 error 에 Error 인스턴스, loading=false, results=[]', async () => {
    mockSearch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDebouncedSearch('삼'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await waitFor(() => expect(result.current.error?.message).toBe('boom'));
    expect(result.current.loading).toBe(false);
    expect(result.current.results).toEqual([]);
  });

  it('AbortError reject 는 error 에 채우지 않는다', async () => {
    mockSearch.mockImplementation((_q: string, signal: AbortSignal) => {
      return new Promise((_res, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    });
    const { result, rerender } = renderHook(({ q }) => useDebouncedSearch(q), {
      initialProps: { q: '삼' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    // 새 입력 → 이전 호출 abort (AbortError reject)
    rerender({ q: '삼성' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    // AbortError 는 error 에 노출되지 않아야 함
    expect(result.current.error).toBeUndefined();
  });
});
