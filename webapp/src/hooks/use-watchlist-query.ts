'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { fetchWatchlist, type WatchlistRow } from '@/lib/watchlist-api';

/**
 * Phase 06.2 Plan 06 Task 2 — useWatchlistQuery.
 *
 * Scanner `usePolling` 동형 패턴 (60s 폴링 + visibility API + stale-but-visible 에러).
 * Scanner 와 다른 점:
 * - lastUpdatedAt 은 서버 `X-Last-Updated-At` 헤더가 아니라, 응답 row 들의
 *   `MAX(quote.updatedAt)` 을 클라이언트에서 계산 (RESEARCH §Pattern 10). Supabase
 *   직접 쿼리이므로 서버 헤더가 없다.
 * - fetchWatchlist 는 Supabase 클라이언트를 주입받는 형태라 AbortSignal 미사용.
 *   폴링 재호출 시 in-flight 응답이 여전히 도착할 수 있으므로 `mountedRef` 로
 *   unmount 후 setState 경고 + stale 응답을 모두 차단한다.
 *
 * 에러 정책 (T-06.2-27 mitigate):
 * - 훅은 raw Error 만 `error` state 로 노출. UI 레이어에서 고정 한글 문구로 렌더.
 * - 에러 발생 시 `data` 는 보존 (stale-but-visible — Scanner 와 동일).
 *
 * DoS 방어 (T-06.2-26 mitigate):
 * - `document.visibilityState === 'visible'` 체크로 백그라운드 탭 폴링 금지.
 * - visibilitychange 복귀 시 즉시 refetch — bfcache/탭 복귀 직후 신선도 보장.
 */

const POLL_INTERVAL_MS = 60_000; // 1분 — Scanner 동일

export interface UseWatchlistQueryResult {
  /** 관심종목 rows (added_at DESC). fetch 전/에러 후에도 이전 값 유지 가능 (stale-but-visible). */
  data: WatchlistRow[];
  /** 최초 fetch 중 여부 (mount → 첫 응답). */
  isLoading: boolean;
  /** 폴링/수동 refetch 중 여부 (최초 fetch 이후). */
  isRefreshing: boolean;
  /** 마지막 fetch 에러. 성공 시 null 로 리셋. */
  error: Error | null;
  /** MAX(quote.updatedAt) epoch ms. quote 가 모두 없거나 data 없으면 null. */
  lastUpdatedAt: number | null;
  /** 수동 refetch — 사용자 "새로고침" 트리거용. */
  refresh: () => Promise<void>;
}

export function useWatchlistQuery(): UseWatchlistQueryResult {
  const [data, setData] = useState<WatchlistRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const isInitialRef = useRef(true);

  const load = useCallback(async () => {
    const initial = isInitialRef.current;
    if (initial) setIsLoading(true);
    else setIsRefreshing(true);

    const supabase = createClient();
    const { data: rows, error: err } = await fetchWatchlist(supabase);
    if (!mountedRef.current) return;

    if (err) {
      setError(err);
      // data 는 유지 (stale-but-visible)
    } else if (rows) {
      setData(rows);
      setError(null);
      // MAX(quote.updatedAt) — RESEARCH §Pattern 10
      const maxMs = rows.reduce((max, row) => {
        const t = row.quote?.updatedAt
          ? new Date(row.quote.updatedAt).getTime()
          : 0;
        return t > max ? t : max;
      }, 0);
      setLastUpdatedAt(maxMs > 0 ? maxMs : null);
    }

    if (initial) {
      setIsLoading(false);
      isInitialRef.current = false;
    } else {
      setIsRefreshing(false);
    }
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
    data,
    isLoading,
    isRefreshing,
    error,
    lastUpdatedAt,
    refresh: load,
  };
}
