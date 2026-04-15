'use client';
import { useEffect, useRef, useState } from 'react';
import { searchStocks } from '@/lib/stock-api';
import type { Stock } from '@gh-radar/shared';

export interface UseDebouncedSearchResult {
  results: Stock[];
  loading: boolean;
  error: Error | undefined;
}

/**
 * useDebouncedSearch — 입력 후 `delayMs` 침묵 시 `searchStocks` 호출.
 * - 새 입력 발생 시 in-flight 요청을 AbortController 로 취소 (race condition 방지, Pitfall 3)
 * - query.trim().length === 0 이면 즉시 빈 결과 + 이전 요청 abort
 * - AbortError 는 사용자 에러로 노출하지 않음
 */
export function useDebouncedSearch(query: string, delayMs = 300): UseDebouncedSearchResult {
  const [results, setResults] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      setResults([]);
      setError(undefined);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setError(undefined);
      searchStocks(trimmed, controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return;
          setResults(data);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          // AbortError 는 사용자 에러로 노출하지 않음
          const name = (err as { name?: string } | null)?.name;
          if (name === 'AbortError') return;
          setError(err instanceof Error ? err : new Error(String(err)));
          setResults([]);
          setLoading(false);
        });
    }, delayMs);

    return () => clearTimeout(timer);
  }, [query, delayMs]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { results, loading, error };
}
