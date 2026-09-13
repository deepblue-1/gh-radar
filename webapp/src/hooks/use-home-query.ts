'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  HomeSnapshotIndexEntry,
  HomeSnapshotResponse,
} from '@gh-radar/shared';

import { fetchHome, type FetchHomeParams } from '@/lib/home-api';
import { readQueryCache, writeQueryCache } from '@/lib/query-cache';

import { useAutoRefresh } from './use-auto-refresh';

/**
 * Phase 13 Plan 04 — useHomeQuery.
 *
 * 읽기 전용 홈 급등 테마 fetch 훅 (HOME-01). useThemesQuery/useWatchlistQuery 의
 * stale-but-visible + mountedRef 패턴 계승. 파라미터(date/slot)가 바뀌면 재조회한다.
 * autoRefresh(최신 보기)일 때만 30초 자동 갱신(useAutoRefresh — visibility + KST 창 게이트) —
 * 과거 슬롯 탐색 중에는 화면 점프 방지를 위해 폴링 금지. 폴링 갱신은 isInitialRef 가 이미
 * false 라 isRefreshing 경로를 타 스켈레톤이 뜨지 않는다(stale-but-visible).
 *
 * 증분 index: 응답의 대부분(≈175KB/191KB)이 네비게이션 index 1500건이라, 이미 가진 index 가
 * 있으면 `indexSince` 로 새 슬롯만 받아 앞에 붙인다. 워커의 과거 거래일 thinning 등 삭제는
 * 증분으로 반영되지 않으므로 INDEX_FULL_REFRESH_MS 마다 전체를 다시 받는다.
 *
 * 페이지 이동 캐시(lib/query-cache): 재방문 시 마지막 응답으로 즉시 그리고 백그라운드 재조회.
 *
 * 에러 정책 (scanner-error / T-13-09):
 * - 훅은 raw Error 만 `error` state 로 노출. UI 레이어가 고정 한글 문구로 렌더
 *   (error.message 미노출). console.error 는 훅에서 분리 로깅.
 * - 에러 발생 시 이전 data 는 보존 (stale-but-visible).
 *
 * mountedRef + AbortController: 파라미터 변경/unmount 시 in-flight 응답의 setState 를
 * 차단한다. 각 load 는 자체 AbortController 로 이전 요청을 취소한다.
 */

/** 서버 INDEX_LIMIT 와 같은 상한 — 증분 병합이 무한히 자라지 않게. */
const INDEX_LIMIT = 1500;
/** 증분만 이어 붙이다가 이 간격마다 전체 index 를 다시 받는다(삭제·thinning 반영). */
const INDEX_FULL_REFRESH_MS = 10 * 60_000;
const INDEX_CACHE_KEY = 'home:index';

interface IndexCache {
  entries: HomeSnapshotIndexEntry[];
  /** 마지막으로 전체 index 를 받은 시각 (ms) */
  fullAt: number;
}

function snapshotCacheKey({ date, capturedAt }: FetchHomeParams): string {
  return `home:snapshot:${capturedAt ?? date ?? 'latest'}`;
}

/** 새 슬롯(최신순)을 기존 index(최신순) 앞에 붙이고 capturedAt 중복을 제거한다. */
function mergeIndex(
  newer: HomeSnapshotIndexEntry[],
  older: HomeSnapshotIndexEntry[],
): HomeSnapshotIndexEntry[] {
  if (newer.length === 0) return older;
  const seen = new Set<string>();
  const out: HomeSnapshotIndexEntry[] = [];
  for (const e of [...newer, ...older]) {
    if (seen.has(e.capturedAt)) continue;
    seen.add(e.capturedAt);
    out.push(e);
    if (out.length === INDEX_LIMIT) break;
  }
  return out;
}

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

export interface UseHomeQueryOptions {
  /** true 면 30초 자동 갱신(최신 보기 전용). 기본 false. */
  autoRefresh?: boolean;
}

/**
 * @param params date/capturedAt (미지정 시 최신 스냅샷). 값이 바뀌면 자동 재조회.
 * @param options autoRefresh — 최신 보기에서만 true.
 */
export function useHomeQuery(
  params: FetchHomeParams = {},
  options: UseHomeQueryOptions = {},
): UseHomeQueryResult {
  const { date, capturedAt } = params;

  const [cached] = useState(() =>
    readQueryCache<HomeSnapshotResponse>(snapshotCacheKey({ date, capturedAt })),
  );
  const [data, setData] = useState<HomeSnapshotResponse | null>(cached ?? null);
  const [isLoading, setIsLoading] = useState(cached === undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  const isInitialRef = useRef(cached === undefined);
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
      const known = readQueryCache<IndexCache>(
        INDEX_CACHE_KEY,
        Number.POSITIVE_INFINITY,
      );
      const incremental =
        known !== undefined &&
        known.entries.length > 0 &&
        Date.now() - known.fullAt < INDEX_FULL_REFRESH_MS;

      const result = await fetchHome(
        incremental
          ? { date, capturedAt, indexSince: known.entries[0].capturedAt }
          : { date, capturedAt },
        controller.signal,
      );
      if (!mountedRef.current || controller.signal.aborted) return;

      const index = incremental
        ? mergeIndex(result.index, known.entries)
        : result.index;
      writeQueryCache<IndexCache>(INDEX_CACHE_KEY, {
        entries: index,
        fullAt: incremental ? known.fullAt : Date.now(),
      });
      const next: HomeSnapshotResponse = { snapshot: result.snapshot, index };
      writeQueryCache(snapshotCacheKey({ date, capturedAt }), next);

      setData(next);
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
    // 파라미터 전환 시 그 슬롯을 전에 본 적 있으면 응답을 기다리지 않고 바로 바꿔 그린다.
    const hit = readQueryCache<HomeSnapshotResponse>(
      snapshotCacheKey({ date, capturedAt }),
    );
    if (hit) setData(hit);
    void load();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
    // load 가 date/capturedAt 에 의존하므로 load 변화 = 파라미터 변화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useAutoRefresh(
    () => {
      void load();
    },
    { enabled: options.autoRefresh ?? false },
  );

  return { data, isLoading, isRefreshing, error, refresh: load };
}
