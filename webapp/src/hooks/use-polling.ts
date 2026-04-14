'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 범용 폴링 훅 (Phase 5 SCAN-07 · T-5-03).
 *
 * - mount 즉시 fetcher 1회 호출 후 `intervalMs` 간격 자동 재호출
 * - `key` 변경 시: in-flight 요청 abort → 타이머 리셋 → 즉시 재요청
 * - unmount 시 interval clear + in-flight abort
 * - 에러 stale-but-visible: data 는 보존하고 error 만 갱신. 다음 성공 시 error 클리어
 * - `refresh()`: 타이머 유지한 채 즉시 1회 호출, 연속 호출 시 이전 요청 abort
 * - stale closure 방지: fetcher 는 `useRef` 에 저장 후 타이머 콜백에서 `ref.current` 사용
 */
export interface UsePollingOptions {
  /** 폴링 간격 (ms). 60_000 = 60초 (Scanner 기본) */
  intervalMs: number;
  /** 변경 시 in-flight abort + 타이머 리셋 + 즉시 재요청 */
  key: string;
}

export interface UsePollingResult<T> {
  data: T | undefined;
  error: Error | undefined;
  lastUpdatedAt: number | undefined;
  refresh: () => Promise<void>;
  isRefreshing: boolean;
  isInitialLoading: boolean;
}

export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  { intervalMs, key }: UsePollingOptions,
): UsePollingResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  // Phase 05.2 D-17: lastUpdatedAt 은 더 이상 client clock 으로 갱신하지 않는다.
  // UsePollingResult 타입 호환을 위해 상수로 유지 (실제 값은 scanner-client 가
  // fetcher 결과의 X-Last-Updated-At 헤더에서 직접 추출하여 ScannerFilters 로 전달).
  const lastUpdatedAt: number | undefined = undefined;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // stale closure 방지 — 최신 fetcher 를 ref 로 유지
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const controllerRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const runFetch = useCallback(async (): Promise<void> => {
    // 이전 in-flight abort (T-5-03 — 연타 방지)
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsRefreshing(true);
    try {
      const result = await fetcherRef.current(controller.signal);
      if (controller.signal.aborted || !mountedRef.current) return;
      setData(result);
      setError(undefined);
      // Phase 05.2 D-17: lastUpdatedAt 소스는 더 이상 client clock 아님.
      // scanner-client 가 fetcher 결과(서버 X-Last-Updated-At 헤더)에서 직접 추출.
    } catch (err) {
      if (controller.signal.aborted || !mountedRef.current) return;
      // AbortError 는 abort 처리 분기에서 걸러짐 — 그 외만 error 채움
      setError(err instanceof Error ? err : new Error(String(err)));
      // data 유지 (stale-but-visible)
    } finally {
      if (controllerRef.current === controller && mountedRef.current) {
        setIsRefreshing(false);
        setIsInitialLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // key 변경 시 initial loading 플래그는 유지하지 않음 — data 는 보존, 새 key 요청 중임을 isRefreshing 으로 표현
    void runFetch();
    intervalRef.current = setInterval(() => {
      void runFetch();
    }, intervalMs);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      controllerRef.current?.abort();
    };
    // key 가 바뀌면 effect 재실행 (타이머 재설정 + 즉시 재요청)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intervalMs]);

  const refresh = useCallback(async (): Promise<void> => {
    await runFetch();
  }, [runFetch]);

  return {
    data,
    error,
    lastUpdatedAt,
    refresh,
    isRefreshing,
    isInitialLoading,
  };
}
