'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { HomeSnapshotResponse } from '@gh-radar/shared';

import { fetchHome, type FetchHomeParams } from '@/lib/home-api';

/**
 * Phase 13 Plan 04 — useHomeQuery.
 *
 * 읽기 전용 홈 급등 테마 fetch 훅 (HOME-01). useThemesQuery/useWatchlistQuery 의
 * stale-but-visible + mountedRef 패턴 계승. 다만 **폴링 없음** — 홈은 시점별(:30)
 * 이력 조망 화면이라 사용자 탐색(date/slot 전환)이 fetch 트리거. 파라미터가 바뀌면
 * 재조회한다.
 *
 * 에러 정책 (scanner-error / T-13-09):
 * - 훅은 raw Error 만 `error` state 로 노출. UI 레이어가 고정 한글 문구로 렌더
 *   (error.message 미노출). console.error 는 훅에서 분리 로깅.
 * - 에러 발생 시 이전 data 는 보존 (stale-but-visible).
 *
 * mountedRef + AbortController: 파라미터 변경/unmount 시 in-flight 응답의 setState 를
 * 차단한다. 각 load 는 자체 AbortController 로 이전 요청을 취소한다.
 */

export interface UseHomeQueryResult {
  /** 홈 스냅샷 응답 { snapshot, index }. fetch 전/에러 후 이전 값 유지(stale-but-visible). */
  data: HomeSnapshotResponse | null;
  /** 최초 fetch 중 여부 (mount → 첫 응답). */
  isLoading: boolean;
  /** 파라미터 전환/수동 refetch 중 여부 (최초 fetch 이후). */
  isRefreshing: boolean;
  /** 마지막 fetch 에러. 성공 시 null 로 리셋. */
  error: Error | null;
  /** 수동 refetch — 에러 카드 "다시 불러오기" 트리거용. */
  refresh: () => Promise<void>;
}

/**
 * @param params date/capturedAt (미지정 시 최신 스냅샷). 값이 바뀌면 자동 재조회.
 */
export function useHomeQuery(params: FetchHomeParams = {}): UseHomeQueryResult {
  const { date, capturedAt } = params;

  const [data, setData] = useState<HomeSnapshotResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  const isInitialRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    // 이전 in-flight 요청 취소 (파라미터 빠른 전환 레이스 방지).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const initial = isInitialRef.current;
    if (initial) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const result = await fetchHome({ date, capturedAt }, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted) return;
      // T-13-09: 내부 메시지는 console 에만, UI 는 고정 문구.
      console.error('[home] 스냅샷 조회 실패', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      // data 는 유지 (stale-but-visible)
    } finally {
      if (!mountedRef.current || controller.signal.aborted) return;
      if (initial) {
        setIsLoading(false);
        isInitialRef.current = false;
      } else {
        setIsRefreshing(false);
      }
    }
  }, [date, capturedAt]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [load]);

  return { data, isLoading, isRefreshing, error, refresh: load };
}
