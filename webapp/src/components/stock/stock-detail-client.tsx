'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notFound } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import type { Stock } from '@gh-radar/shared';
import { ApiClientError } from '@/lib/api';
import { fetchStockDetail } from '@/lib/stock-api';
import { Button } from '@/components/ui/button';
import { StockHero } from './stock-hero';
import { StockStatsGrid } from './stock-stats-grid';
import { ComingSoonCard } from './coming-soon-card';
import { StockDetailSkeleton } from './stock-detail-skeleton';

const KST_TIME_FMT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export interface StockDetailClientProps {
  code: string;
}

/**
 * StockDetailClient — Phase 6 상세 페이지 fetch + refresh 오케스트레이션.
 * - mount 시 fetchStockDetail 호출
 * - 수동 refresh 버튼 (자동 폴링 없음 — D5)
 * - 404 → notFound() → app/stocks/[code]/not-found.tsx (Pitfall 5 대응:
 *   error.tsx 가 not-found 를 가로채지 않도록 명시적 분기)
 * - 기타 에러 → 인라인 에러 카드 + 재시도 (error state 유지,
 *   기존 stock 이 있다면 stale-but-visible)
 * - AbortController 로 이전 요청 취소 + unmount cleanup
 */
export function StockDetailClient({ code }: StockDetailClientProps) {
  const [stock, setStock] = useState<Stock | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  // Phase 06 Plan 06 E2E 발견: async useEffect 내부에서 직접 notFound() 를 throw 하면
  // Next 15 not-found boundary 가 잡지 못하고 스켈레톤에서 멈춘다. state 플래그로 승격한 뒤
  // 렌더 경로에서 notFound() 를 호출하여 boundary 에 정상 전달한다.
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsRefreshing(true);
    try {
      const data = await fetchStockDetail(code, controller.signal);
      if (controller.signal.aborted) return;
      setStock(data);
      setError(undefined);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      if (err instanceof ApiClientError && err.status === 404) {
        setNotFoundFlag(true);
        return;
      }
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!controller.signal.aborted) {
        setIsRefreshing(false);
        setIsInitialLoading(false);
      }
    }
  }, [code]);

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  const updatedAtLabel = useMemo(() => {
    if (!stock) return null;
    const d = new Date(stock.updatedAt);
    return Number.isFinite(d.getTime())
      ? `갱신 ${KST_TIME_FMT.format(d)} KST`
      : null;
  }, [stock]);

  if (notFoundFlag) {
    // 렌더 경로에서 호출 — Next 15 not-found boundary 로 전달된다
    notFound();
  }

  if (isInitialLoading && !stock) return <StockDetailSkeleton />;

  if (!stock && error) {
    return (
      <section className="space-y-4" role="alert">
        <h2 className="text-[length:var(--t-h2)] font-semibold">
          데이터를 불러오지 못했습니다
        </h2>
        <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          {error.message}
        </p>
        <Button onClick={() => void load()}>다시 시도</Button>
      </section>
    );
  }

  if (!stock) return <StockDetailSkeleton />;

  return (
    <div className="space-y-8">
      <StockHero stock={stock} />
      <div className="flex items-center justify-between gap-3">
        {updatedAtLabel && (
          <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)] mono">
            {updatedAtLabel}
          </span>
        )}
        <Button
          onClick={() => void load()}
          disabled={isRefreshing}
          variant="outline"
          aria-label="새로고침"
          aria-busy={isRefreshing}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          새로고침
        </Button>
      </div>
      <StockStatsGrid stock={stock} />
      {error && (
        <p className="text-[length:var(--t-caption)] text-[var(--destructive)]">
          최근 갱신 실패: {error.message}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <ComingSoonCard
          title="관련 뉴스"
          body="Phase 7 로드맵에서 제공됩니다."
        />
        <ComingSoonCard
          title="종목토론방"
          body="Phase 8 로드맵에서 제공됩니다."
        />
      </div>
    </div>
  );
}
