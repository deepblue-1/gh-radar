'use client';

import { useCallback, useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { usePolling } from '@/hooks/use-polling';
import { fetchScannerStocks } from '@/lib/scanner-api';
import {
  parseScannerSearchParams,
  toScannerSearchParams,
  type ScannerState,
} from '@/lib/scanner-query';
import { ScannerCardList } from './scanner-card-list';
import { ScannerEmpty } from './scanner-empty';
import { ScannerError } from './scanner-error';
import { ScannerFilters } from './scanner-filters';
import { ScannerSkeleton } from './scanner-skeleton';
import { ScannerTable } from './scanner-table';

const POLL_INTERVAL_MS = 60_000;

/**
 * Scanner 최상위 배선 (Phase 5 전체 SCAN-01~07 오케스트레이션).
 * URL = 단일 진리원. usePolling 이 60s 자동 갱신 + refresh 제공.
 * stale-but-visible: data 와 error 를 동시에 렌더할 수 있다.
 */
export function ScannerClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const state = useMemo<ScannerState>(
    () => parseScannerSearchParams(searchParams),
    [searchParams],
  );
  const key = `${state.min}|${state.market}`;

  const fetcher = useCallback(
    (signal: AbortSignal) => fetchScannerStocks(state, signal),
    // key 가 바뀔 때만 fetcher identity 갱신
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.min, state.market],
  );

  const { data, error, refresh, isRefreshing, isInitialLoading } =
    usePolling(fetcher, { intervalMs: POLL_INTERVAL_MS, key });

  // Phase 05.2 D-17/D-18: 갱신시각 소스를 서버 X-Last-Updated-At 헤더로 교체.
  // data: { stocks, lastUpdatedAt: string | null } | undefined
  const stocks = data?.stocks ?? [];
  const iso = data?.lastUpdatedAt ?? null;
  const lastUpdatedAtMs = iso ? new Date(iso).getTime() : NaN;
  const lastUpdatedAt = Number.isFinite(lastUpdatedAtMs)
    ? lastUpdatedAtMs
    : undefined;

  const handleChange = useCallback(
    (next: ScannerState) => {
      const query = toScannerSearchParams(next);
      startTransition(() => {
        router.replace(`${pathname}${query}`, { scroll: false });
      });
    },
    [router, pathname],
  );

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  // 본문 분기
  const hasData = data !== undefined && stocks.length > 0;
  const isEmpty = data !== undefined && stocks.length === 0 && !error;
  const showInitialError = isInitialLoading && error !== undefined;

  let body: React.ReactNode;
  if (showInitialError && error) {
    // 초기 로딩 실패 — Skeleton 대신 에러 단독
    body = (
      <ScannerError
        error={error}
        onRetry={handleRefresh}
        retrying={isRefreshing}
      />
    );
  } else if (isInitialLoading) {
    body = <ScannerSkeleton />;
  } else if (isEmpty) {
    body = <ScannerEmpty />;
  } else {
    body = (
      <>
        <ScannerTable stocks={stocks} isRefreshing={isRefreshing} />
        <ScannerCardList stocks={stocks} isRefreshing={isRefreshing} />
      </>
    );
  }

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-[length:var(--t-2xl)] font-bold tracking-[-0.01em] text-[var(--fg)]">
          스캐너
        </h1>
        <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          상한가 근접 종목을 실시간으로 추적합니다. 등락률과 마켓을 조정해 리스트를
          좁혀보세요.
        </p>
      </header>

      <ScannerFilters
        state={state}
        onChange={handleChange}
        lastUpdatedAt={lastUpdatedAt}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {body}

      {/* stale-but-visible: 기존 data 가 있을 때 에러 카드 병기 */}
      {error && hasData && (
        <ScannerError
          error={error}
          onRetry={handleRefresh}
          retrying={isRefreshing}
        />
      )}
    </>
  );
}
