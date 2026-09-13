import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useAutoRefresh } from './use-auto-refresh';

/** 월 2026-09-14 10:00 KST — 자동 갱신 창 안. */
const IN_WINDOW = new Date('2026-09-14T01:00:00Z');

function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
}

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(IN_WINDOW);
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (document as unknown as { visibilityState?: string }).visibilityState;
  });

  it('창 안·visible → 30s 마다 onTick (mount 즉시 호출 없음)', async () => {
    const onTick = vi.fn();
    renderHook(() => useAutoRefresh(onTick, { enabled: true }));
    expect(onTick).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(onTick).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('hidden 이면 tick 무호출', async () => {
    const onTick = vi.fn();
    setVisibility('hidden');
    renderHook(() => useAutoRefresh(onTick, { enabled: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(onTick).not.toHaveBeenCalled();
  });

  it('visibilitychange → visible 이면 즉시 1회', async () => {
    const onTick = vi.fn();
    setVisibility('hidden');
    renderHook(() => useAutoRefresh(onTick, { enabled: true }));
    setVisibility('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('창 밖(토요일) → tick·visibility 둘 다 무호출', async () => {
    vi.setSystemTime(new Date('2026-09-19T01:00:00Z')); // 토 10:00 KST
    const onTick = vi.fn();
    renderHook(() => useAutoRefresh(onTick, { enabled: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(onTick).not.toHaveBeenCalled();
  });

  it('창 밖(평일 20:06) → tick·visibility 둘 다 무호출', async () => {
    vi.setSystemTime(new Date('2026-09-14T11:06:00Z')); // 월 20:06 KST
    const onTick = vi.fn();
    renderHook(() => useAutoRefresh(onTick, { enabled: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(onTick).not.toHaveBeenCalled();
  });

  it('enabled=false → 무호출', async () => {
    const onTick = vi.fn();
    renderHook(() => useAutoRefresh(onTick, { enabled: false }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(onTick).not.toHaveBeenCalled();
  });

  it('unmount 후 무호출', async () => {
    const onTick = vi.fn();
    const { unmount } = renderHook(() => useAutoRefresh(onTick, { enabled: true }));
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(onTick).not.toHaveBeenCalled();
  });

  it('최신 onTick 을 호출한다 (stale closure 방지)', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useAutoRefresh(cb, { enabled: true }), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
