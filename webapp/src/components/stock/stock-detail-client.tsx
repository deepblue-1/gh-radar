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
import type { StockDetailResponse } from '@gh-radar/shared';
import { ApiClientError } from '@/lib/api';
import { useNativeRefresh } from '@/lib/native/use-native-refresh';
import { fetchStockDetail } from '@/lib/stock-api';
import { Button } from '@/components/ui/button';
import { useChat } from '@/components/chat/chat-provider';
import { StockHero } from './stock-hero';
import { StockStatsGrid } from './stock-stats-grid';
import { StockDetailSkeleton } from './stock-detail-skeleton';
import { StockDetailTabs } from './stock-detail-tabs';
import { StockNewsTabPanel } from './stock-news-tab-panel';
import { StockDailyChartSection } from './stock-daily-chart-section';
import { StockThemeChips } from '@/components/theme/theme-chips';
import { StockComovementSection } from './stock-comovement-section';
import { StockLimitUpSection } from './stock-limit-up-section';
import { isPickable } from '@/components/trading/workbench/stock-add-bar';
import { DetailBands } from './detail-bands';

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
 *
 * Phase 15 Plan 11 (D-02a · UI-SPEC T1/T7) — 탭 재구성. Phase 21 D-31 로 호가주문 탭을 지워 3탭(D-31)
 * (차트 · 종목정보 · 뉴스토론)이다 — 주문은 /trading 작업대 카드에서 하고, 여기서는 「트레이딩」 링크(D-30)로 간다.
 * 기존 섹션은 **내용을 전혀 바꾸지 않고** `StockDetailTabs` 패널로 재배치만 했다.
 * 히어로와 갱신시각·새로고침 행은 탭 밖 공통 영역에 남는다(T1).
 */
export function StockDetailClient({ code }: StockDetailClientProps) {
  const { setStockContext } = useChat();
  // 응답 계약은 `StockDetailResponse`(= Stock + upperLimitProximity + isin) — `isin` 은 매매 가능 판정
  // (`isPickable` · D-30 「트레이딩」 링크)이 읽는다.
  const [stock, setStock] = useState<StockDetailResponse | undefined>(undefined);
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
  // D-18 — 앱 당겨서 새로고침: 시세 재조회. `isRefreshing` → 차트 `refreshSignal` 로 차트·통계까지
  // 다시 읽힌다. 테마칩·상한가·동조 섹션은 범위 밖(마운트 때 읽은 캐시 유지) · 뉴스·토론은 각 섹션이
  // 자기 GET 을 등록한다.
  useNativeRefresh(load);

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

  // Phase 21 D-30 — 「트레이딩」(폰 CTA · 넓은 폭 알약)은 매매 가능 종목에서만. 판정은 작업대 종목 추가란과
  // 같은 한 곳(`isPickable` — KOSPI/KOSDAQ ∧ isin)이다 — 착지 쪽도 같은 함수로 다시 거른다(21-33 · T-21-93).
  const tradable = isPickable(stock);

  return (
    /*
      토스 B(260924-vj1) — `data-page-surface="plain"` 이면 globals.css `main:has(...)` 가 라이트 본문면을
      회색 `--surface` 대신 흰 `--bg` 로 되돌린다(종목상세 = 흰 바탕 + 회색 띠). 간격은 B 밀도:
      히어로 위아래 14/6px, 갱신시각 행 아래 10px, 그 아래 탭은 간격 0.
    */
    <div data-page-surface="plain">
      {/* T1 — 히어로와 갱신시각·새로고침 행은 탭 밖 공통 영역. 어느 탭에서도 보인다. */}
      <div className="pt-3.5 pb-1.5">
        <StockHero stock={stock} tradable={tradable} />
      </div>
      <div className="flex items-center justify-between gap-3 pb-2.5">
        {updatedAtLabel && (
          <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)] mono">
            {updatedAtLabel}
          </span>
        )}
        <Button
          onClick={() => void load()}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
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
        <p className="pb-2.5 text-[length:var(--t-caption)] text-[var(--destructive)]">
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
          tradable={tradable}
          chart={
            <DetailBands>
              <StockDailyChartSection
                code={stock.code}
                refreshSignal={isRefreshing}
              />
            </DetailBands>
          }
          info={
            /* 토스 B — 섹션마다 풀폭 평면 블록 + 12px `--band` 띠 (detail-bands.tsx) */
            <DetailBands>
              <StockStatsGrid stock={stock} />
              <StockThemeChips stockCode={stock.code} />
              <StockLimitUpSection stockCode={stock.code} />
              <StockComovementSection stockCode={stock.code} />
            </DetailBands>
          }
          news={
            /* Phase 21 D-29 — 요약(뉴스 · 토론 섹션) ↔ 탭 안 전체목록(`?view=`) */
            <StockNewsTabPanel code={stock.code} />
          }
        />
      </Suspense>
    </div>
  );
}
