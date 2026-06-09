'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ThemeWithStats } from '@gh-radar/shared';

import { createClient } from '@/lib/supabase/client';
import { fetchMyThemes, fetchSystemThemes } from '@/lib/theme-api';

/**
 * Phase 10 Plan 05 Task 2 — useThemesQuery.
 *
 * useWatchlistQuery 동형 패턴 (60s 폴링 + visibility API + stale-but-visible + mountedRef).
 * watchlist 와 다른 점 — 두 데이터 소스 합성:
 * - **시스템 테마**: Express `GET /api/themes` (service-role 집계) — 항상 fetch (공개).
 * - **내 테마**: Supabase 직접 (RLS owner-only) — 로그인 세션이 있을 때만 fetch.
 *   비로그인 시 myThemes=[] (시스템 테마만 표시). 세션은 supabase.auth.getSession() 로 판별.
 *
 * 두 소스를 `Promise.all` 로 병렬 호출 — 한쪽 지연이 다른 쪽을 막지 않음.
 *
 * 에러 정책 (watchlist 선례):
 * - 훅은 raw Error 만 `error` state 로 노출. UI 레이어에서 고정 한글 문구로 렌더.
 * - 에러 발생 시 systemThemes/myThemes 는 보존 (stale-but-visible).
 *
 * DoS 방어 (watchlist 선례):
 * - `document.visibilityState === 'visible'` 체크로 백그라운드 탭 폴링 금지.
 * - visibilitychange 복귀 시 즉시 refetch.
 *
 * mountedRef: fetch 가 AbortSignal 미사용(Supabase 클라이언트 주입형)이라, unmount 후
 * 도착하는 in-flight 응답의 setState 를 차단한다.
 */

const POLL_INTERVAL_MS = 60_000; // 1분 — watchlist/Scanner 동일

export interface UseThemesQueryResult {
  /** 시스템 테마 (top3avg desc 정렬, Express). fetch 전/에러 후 이전 값 유지(stale-but-visible). */
  systemThemes: ThemeWithStats[];
  /** 로그인 사용자의 내 테마 (최신순, Supabase RLS). 비로그인 시 빈 배열. */
  myThemes: ThemeWithStats[];
  /** 최초 fetch 중 여부 (mount → 첫 응답). */
  isLoading: boolean;
  /** 폴링/수동 refetch 중 여부 (최초 fetch 이후). */
  isRefreshing: boolean;
  /** 마지막 fetch 에러. 성공 시 null 로 리셋. */
  error: Error | null;
  /** 수동 refetch — 사용자 "새로고침" 트리거용. */
  refresh: () => Promise<void>;
  /**
   * 내 테마를 즉시(낙관적) 추가/갱신 — 생성·편집·종목 변경 직후 호출.
   * 동일 id 가 있으면 교체(최신순 유지 위해 맨 앞으로), 없으면 맨 앞에 prepend.
   * 실 통계(top3AvgChangeRate 등)는 뒤따르는 refresh() 가 reconcile.
   * Supabase 풀러 read-after-write 지연으로 refresh() 가 갓 생성한 row 를 놓치는
   * 레이스를 회피한다(비로그인 시 정책상 호출 안 함 — myThemes 는 항상 빈 배열).
   */
  upsertMyTheme: (theme: ThemeWithStats) => void;
  /** 내 테마를 즉시(낙관적) 제거 — 삭제 직후 호출. 이후 refresh() 가 reconcile. */
  removeMyTheme: (id: string) => void;
}

export function useThemesQuery(): UseThemesQueryResult {
  const [systemThemes, setSystemThemes] = useState<ThemeWithStats[]>([]);
  const [myThemes, setMyThemes] = useState<ThemeWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  const isInitialRef = useRef(true);

  const load = useCallback(async () => {
    const initial = isInitialRef.current;
    if (initial) setIsLoading(true);
    else setIsRefreshing(true);

    const supabase = createClient();

    try {
      // 세션 확인 — 비로그인이면 내 테마 fetch 스킵 (myThemes=[]).
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const [system, mine] = await Promise.all([
        fetchSystemThemes(),
        session ? fetchMyThemes(supabase) : Promise.resolve<ThemeWithStats[]>([]),
      ]);

      if (!mountedRef.current) return;
      setSystemThemes(system);
      setMyThemes(mine);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      // systemThemes/myThemes 는 유지 (stale-but-visible)
    } finally {
      if (!mountedRef.current) return;
      if (initial) {
        setIsLoading(false);
        isInitialRef.current = false;
      } else {
        setIsRefreshing(false);
      }
    }
  }, []);

  const upsertMyTheme = useCallback((theme: ThemeWithStats) => {
    if (!mountedRef.current) return;
    setMyThemes((prev) => {
      const rest = prev.filter((t) => t.id !== theme.id);
      return [theme, ...rest];
    });
  }, []);

  const removeMyTheme = useCallback((id: string) => {
    if (!mountedRef.current) return;
    setMyThemes((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();

    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  return {
    systemThemes,
    myThemes,
    isLoading,
    isRefreshing,
    error,
    refresh: load,
    upsertMyTheme,
    removeMyTheme,
  };
}
