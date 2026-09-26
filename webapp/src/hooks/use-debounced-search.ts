'use client';
import { useEffect, useRef, useState } from 'react';
import { searchStocks } from '@/lib/stock-api';
import type { Stock } from '@gh-radar/shared';

export interface UseDebouncedSearchResult {
  results: Stock[];
  loading: boolean;
  error: Error | undefined;
  /**
   * 지금 `results`/`error` 가 어느 검색어(trim)의 것인가 — 초기·빈 입력은 `''`(WR-05).
   * 디바운스 창에 이전 검색어의 늦은 응답이 도착해도 소비처가 「새 검색어의 결과」로 오판하지 않게
   * 응답 도착 시점의 입력이 아니라 **요청 시점의 검색어**를 싣는다.
   */
  resultsQuery: string;
}

/**
 * useDebouncedSearch — 입력 후 `delayMs` 침묵 시 `searchStocks` 호출.
 * - 새 입력 발생 시 in-flight 요청을 AbortController 로 취소 (race condition 방지, Pitfall 3)
 * - query.trim().length === 0 이면 즉시 빈 결과 + 이전 요청 abort
 * - AbortError 는 사용자 에러로 노출하지 않음
 * - `resultsQuery` = 결과가 속한 검색어(요청 시점 trimmed) — in-flight 취소는 다음 타이머 발화 때라
 *   그 사이 이전 검색어 응답이 도착할 수 있다(WR-05)
 */
export function useDebouncedSearch(query: string, delayMs = 300): UseDebouncedSearchResult {
  const [results, setResults] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [resultsQuery, setResultsQuery] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      setResults([]);
      setError(undefined);
      setResultsQuery('');
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
          setResultsQuery(trimmed);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          // AbortError 는 사용자 에러로 노출하지 않음
          const name = (err as { name?: string } | null)?.name;
          if (name === 'AbortError') return;
          setError(err instanceof Error ? err : new Error(String(err)));
          setResults([]);
          setResultsQuery(trimmed);
          setLoading(false);
        });
    }, delayMs);

    return () => clearTimeout(timer);
  }, [query, delayMs]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { results, loading, error, resultsQuery };
}
