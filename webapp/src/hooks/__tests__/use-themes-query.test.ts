import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Phase 10 Plan 05 Task 2 — useThemesQuery 단위 테스트.
 *
 * useWatchlistQuery 동형 패턴 + 두 소스 합성 검증:
 * - 1분(60_000ms) 자동 폴링 (visible 일 때만)
 * - visibility API (백그라운드 탭 폴링 억제 + 복귀 시 즉시 refetch)
 * - 로그인 세션 있으면 fetchMyThemes 호출 / 비로그인이면 myThemes=[] (시스템만)
 * - stale-but-visible: 에러 시 이전 systemThemes/myThemes 유지
 * - unmount 시 interval clear
 */

const fetchSystemThemesMock = vi.fn();
const fetchMyThemesMock = vi.fn();

vi.mock('@/lib/theme-api', () => ({
  fetchSystemThemes: (...args: unknown[]) =>
    (fetchSystemThemesMock as unknown as (...a: unknown[]) => unknown)(...args),
  fetchMyThemes: (...args: unknown[]) =>
    (fetchMyThemesMock as unknown as (...a: unknown[]) => unknown)(...args),
}));

// createClient().auth.getSession() — 세션 유무 제어
const getSessionMock = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: (...args: unknown[]) =>
        (getSessionMock as unknown as (...a: unknown[]) => unknown)(...args),
    },
  }),
}));

import { useThemesQuery } from '../use-themes-query';

function systemTheme(id: string): unknown {
  return {
    id,
    name: id,
    description: null,
    isSystem: true,
    ownerId: null,
    sources: ['naver'],
    top3AvgChangeRate: 5,
    statsUpdatedAt: null,
    createdAt: '2026-06-09T00:00:00Z',
    updatedAt: '2026-06-09T00:00:00Z',
    stockCount: 3,
  };
}

function myTheme(id: string): unknown {
  return {
    id,
    name: id,
    description: null,
    isSystem: false,
    ownerId: 'user-123',
    sources: ['user'],
    top3AvgChangeRate: null,
    statsUpdatedAt: null,
    createdAt: '2026-06-09T00:00:00Z',
    updatedAt: '2026-06-09T00:00:00Z',
    stockCount: 1,
  };
}

const LOGGED_IN = { data: { session: { user: { id: 'user-123' } } } };
const LOGGED_OUT = { data: { session: null } };

describe('useThemesQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchSystemThemesMock.mockReset();
    fetchMyThemesMock.mockReset();
    getSessionMock.mockReset();
    fetchSystemThemesMock.mockResolvedValue([systemTheme('sys-1')]);
    fetchMyThemesMock.mockResolvedValue([myTheme('mine-1')]);
    getSessionMock.mockResolvedValue(LOGGED_IN);
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mount 직후 시스템 테마 + 내 테마를 1회씩 fetch (로그인 상태)', async () => {
    const { result } = renderHook(() => useThemesQuery());
    await waitFor(() => expect(fetchSystemThemesMock).toHaveBeenCalledTimes(1));
    expect(fetchMyThemesMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(result.current.systemThemes).toHaveLength(1);
      expect(result.current.myThemes).toHaveLength(1);
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('비로그인 시 fetchMyThemes 호출 안 함 + myThemes=[] (시스템만 표시)', async () => {
    getSessionMock.mockResolvedValue(LOGGED_OUT);
    const { result } = renderHook(() => useThemesQuery());
    await waitFor(() => expect(result.current.systemThemes).toHaveLength(1));
    expect(fetchMyThemesMock).not.toHaveBeenCalled();
    expect(result.current.myThemes).toEqual([]);
  });

  it('60초마다 재호출 (두 번째 fetch 는 60_000ms 이후)', async () => {
    renderHook(() => useThemesQuery());
    await waitFor(() => expect(fetchSystemThemesMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await waitFor(() => expect(fetchSystemThemesMock).toHaveBeenCalledTimes(2));
  });

  it('백그라운드 탭(visibilityState=hidden)에서는 폴링 스킵', async () => {
    renderHook(() => useThemesQuery());
    await waitFor(() => expect(fetchSystemThemesMock).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    // hidden 상태라 추가 호출 없음
    expect(fetchSystemThemesMock).toHaveBeenCalledTimes(1);
  });

  it('visibilitychange → visible 이벤트에 즉시 refetch', async () => {
    renderHook(() => useThemesQuery());
    await waitFor(() => expect(fetchSystemThemesMock).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(fetchSystemThemesMock).toHaveBeenCalledTimes(2));
  });

  it('에러 발생 시 이전 data 유지 + error state 세팅 (stale-but-visible)', async () => {
    const { result } = renderHook(() => useThemesQuery());
    await waitFor(() => expect(result.current.systemThemes).toHaveLength(1));

    // 2회차: 시스템 테마 fetch 실패
    fetchSystemThemesMock.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.systemThemes).toHaveLength(1); // 이전 data 보존
  });

  it('성공 → 실패 → 성공 시 error 클리어', async () => {
    const { result } = renderHook(() => useThemesQuery());
    await waitFor(() => expect(result.current.systemThemes).toHaveLength(1));

    fetchSystemThemesMock.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeTruthy();

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
  });

  it('unmount 시 폴링 중단 (clearInterval)', async () => {
    const { unmount } = renderHook(() => useThemesQuery());
    await waitFor(() => expect(fetchSystemThemesMock).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(fetchSystemThemesMock).toHaveBeenCalledTimes(1);
  });

  // ── 낙관적 갱신 (10-07 optimistic) ──────────────────────────────
  // 생성/편집/삭제 직후 myThemes 를 즉시 반영 → refetch(풀러 read-after-write) 레이스 회피.

  it('upsertMyTheme: 신규 id 는 myThemes 맨 앞에 prepend', async () => {
    const { result } = renderHook(() => useThemesQuery());
    await waitFor(() => expect(result.current.myThemes).toHaveLength(1));

    act(() => {
      result.current.upsertMyTheme(myTheme('mine-2') as never);
    });
    expect(result.current.myThemes).toHaveLength(2);
    // 맨 앞 = 방금 upsert 한 항목(최신순).
    expect(result.current.myThemes[0]!.id).toBe('mine-2');
    expect(result.current.myThemes[1]!.id).toBe('mine-1');
  });

  it('upsertMyTheme: 동일 id 는 교체(중복 추가 안 함) + 맨 앞으로 이동', async () => {
    fetchMyThemesMock.mockResolvedValue([myTheme('mine-1'), myTheme('mine-2')]);
    const { result } = renderHook(() => useThemesQuery());
    await waitFor(() => expect(result.current.myThemes).toHaveLength(2));

    const renamed = { ...(myTheme('mine-2') as Record<string, unknown>), name: '편집됨' };
    act(() => {
      result.current.upsertMyTheme(renamed as never);
    });
    // 길이 그대로(2) — 교체. mine-2 가 맨 앞으로 + 새 name 반영.
    expect(result.current.myThemes).toHaveLength(2);
    expect(result.current.myThemes[0]!.id).toBe('mine-2');
    expect(result.current.myThemes[0]!.name).toBe('편집됨');
  });

  it('removeMyTheme: 해당 id 를 myThemes 에서 즉시 제거', async () => {
    fetchMyThemesMock.mockResolvedValue([myTheme('mine-1'), myTheme('mine-2')]);
    const { result } = renderHook(() => useThemesQuery());
    await waitFor(() => expect(result.current.myThemes).toHaveLength(2));

    act(() => {
      result.current.removeMyTheme('mine-1');
    });
    expect(result.current.myThemes).toHaveLength(1);
    expect(result.current.myThemes[0]!.id).toBe('mine-2');
  });
});
