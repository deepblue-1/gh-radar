'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { notFound } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import type { Stock } from '@gh-radar/shared';
import { ApiClientError } from '@/lib/api';
import { fetchStockDetail } from '@/lib/stock-api';
import { Button } from '@/components/ui/button';
import { useChat } from '@/components/chat/chat-provider';
import { StockHero } from './stock-hero';
import { StockStatsGrid } from './stock-stats-grid';
import { StockDetailSkeleton } from './stock-detail-skeleton';
import { StockDetailTabs } from './stock-detail-tabs';
import { StockNewsSection } from './stock-news-section';
import { StockDiscussionSection } from './stock-discussion-section';
import { StockDailyChartSection } from './stock-daily-chart-section';
import { StockThemeChips } from '@/components/theme/theme-chips';
import { StockComovementSection } from './stock-comovement-section';
import { StockLimitUpSection } from './stock-limit-up-section';

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
 * StockOrderbookPlaceholder — Phase 15 Plan 11 자리표시자.
 *
 * 15-13 이 이 자리를 `StockOrderbookSection`(실시간 호가 10단 · 체결 테이프 · 주문 패널)
 * 으로 교체한다. UI-SPEC C1 에 따라 `호가주문` 탭은 **항상 렌더**되며, 데이터가 없다고
 * 섹션 자체를 숨기지 않는다 — 탭이 비어 보이는 것보다 준비 중 안내가 정직하다.
 */
function StockOrderbookPlaceholder() {
  return (
    <div
      data-testid="stock-orderbook-placeholder"
      className="card-shadow rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-6)] text-center text-[length:var(--t-sm)] text-[var(--muted-fg)]"
    >
      실시간 호가는 준비 중이에요
    </div>
  );
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
 *
 * Phase 15 Plan 11 (D-02a · UI-SPEC T1/T7) — 4탭 재구성.
 * 기존 7개 섹션은 **내용을 전혀 바꾸지 않고** `StockDetailTabs` 패널로 재배치만 했다.
 * 히어로와 갱신시각·새로고침 행은 탭 밖 공통 영역에 남는다(T1).
 */
export function StockDetailClient({ code }: StockDetailClientProps) {
  const { setStockContext } = useChat();
  const [stock, setStock] = useState<Stock | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  // 재배치 중 보존 (Phase 06 Plan 06 E2E 발견): async useEffect 내부에서 직접 notFound() 를
  // throw 하면 Next 15 not-found boundary 가 잡지 못하고 스켈레톤에서 멈춘다. state 플래그로
  // 승격한 뒤 렌더 경로에서 notFound() 를 호출하여 boundary 에 정상 전달한다.
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

  // 재배치 중 보존 — D-03 종목명 발행 채널. FAB 라벨("{종목명} 분석")과 챗 시트 자동
  // 이어가기가 이 값을 소비한다. usePathname 은 code 만 주므로 이미 fetch 한 stock.name 을
  // 재사용해 provider 로 발행하고, 상세 페이지 이탈(언마운트) 시 null 로 해제해 일반 대화로
  // 되돌린다. 탭 전환은 이 컴포넌트를 언마운트하지 않으므로 컨텍스트가 유지된다.
  useEffect(() => {
    if (!stock) return;
    setStockContext({ code: stock.code, name: stock.name });
    return () => setStockContext(null);
  }, [stock, setStockContext]);

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

  // 재배치 중 보존 — 초기 로딩 스켈레톤 경로 ①
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

  // 재배치 중 보존 — 초기 로딩 스켈레톤 경로 ②
  if (!stock) return <StockDetailSkeleton />;

  return (
    <div className="space-y-6">
      {/* T1 — 히어로와 갱신시각·새로고침 행은 탭 밖 공통 영역. 어느 탭에서도 보인다. */}
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
      {/*
        갱신 실패 안내는 새로고침 버튼과 같은 공통 영역에 둔다. 재배치 전에는 종목정보
        섹션들 사이에 있었지만, 이제 그 자리는 `종목정보` 탭 안이라 다른 탭에서 새로고침에
        실패하면 사용자가 실패 사실을 볼 수 없게 된다.
      */}
      {error && (
        <p className="text-[length:var(--t-caption)] text-[var(--destructive)]">
          최근 갱신 실패: {error.message}
        </p>
      )}
      {/*
        StockDetailTabs 가 `useSearchParams` 를 쓰므로 Next 15 는 Suspense 경계를 요구한다
        (없으면 프리렌더 단계에서 빌드가 실패한다). fallback 은 초기 로딩과 같은 스켈레톤.
      */}
      <Suspense fallback={<StockDetailSkeleton />}>
        <StockDetailTabs
          code={stock.code}
          chart={
            <StockDailyChartSection
              code={stock.code}
              refreshSignal={isRefreshing}
            />
          }
          orderbook={<StockOrderbookPlaceholder />}
          info={
            <div className="space-y-8">
              <StockStatsGrid stock={stock} />
              <StockThemeChips stockCode={stock.code} />
              <StockLimitUpSection stockCode={stock.code} />
              <StockComovementSection stockCode={stock.code} />
            </div>
          }
          news={
            <div className="space-y-6">
              <StockNewsSection stockCode={stock.code} />
              <StockDiscussionSection stockCode={stock.code} />
            </div>
          }
        />
      </Suspense>
    </div>
  );
}
