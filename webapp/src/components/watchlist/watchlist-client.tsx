'use client';

import { PageHeader } from '@/components/layout/page-header';
import { PAGE_WRAP } from '@/components/layout/page-layout';
import { InfoStockCard } from '@/components/stock/info-stock-card';
import { useWatchlistQuery } from '@/hooks/use-watchlist-query';
import { useNativeRefresh } from '@/lib/native/use-native-refresh';
import type { StockWithProximity } from '@/lib/scanner-api';
import type { WatchlistRow } from '@/lib/watchlist-api';

import { WatchlistEmpty } from './watchlist-empty';
import { WatchlistSkeleton } from './watchlist-skeleton';
import { WatchlistTable } from './watchlist-table';
import { WatchlistToggle } from './watchlist-toggle';

/**
 * WatchlistClient — Phase 06.2 Plan 06 Task 3.4.
 *
 * `/watchlist` 페이지의 메인 client wrapper.
 * - useWatchlistQuery (1분 폴링) 에서 data/error/lastUpdatedAt 구독
 * - `lg+` WatchlistTable / `<lg` InfoStockCard 분기 (Scanner duality 와 동형)
 * - 상태 분기: loading skeleton / error alert / empty state / Table + Card
 * - 페이지 헤더 우측에 "최근 갱신 HH:MM:SS KST" + LIVE 링 (Scanner 헤더와 동일 스타일)
 * - quick-260926-o2u: 공용 PageHeader(뒤로가기 — 검색 허브 하위) · 본문 900(PAGE_WRAP). 표·카드 리스트는 그대로.
 *
 * Plan 07 연결점:
 * - InfoStockCard 에 `showWatchlistToggle` + `watchlistToggleSlot` 주입은 이 컴포넌트가
 *   담당 (훅 결과로 만들어진 <WatchlistToggle /> 노드를 rowToStock 과 함께 전달).
 * - WatchlistTable 에는 `renderToggle` prop 으로 행별 토글 주입.
 * - 현재 Plan 06 에서는 토글 slot 을 주입하지 않고 기본 44px placeholder 만 렌더.
 */

const POLLING_DESC = '저장한 종목의 시세를 1분마다 갱신합니다';
const ERROR_MSG = '관심종목을 불러오지 못했습니다. 새로고침해주세요.';

/** InfoStockCard 는 StockWithProximity 를 받음 — WatchlistRow → 필요한 필드만 안전 매핑. */
function rowToStock(row: WatchlistRow): StockWithProximity {
  const q = row.quote;
  const price = q?.price ?? 0;
  return {
    code: row.stockCode,
    name: row.stock.name,
    market: row.stock.market,
    price,
    changeAmount: q?.changeAmount ?? 0,
    changeRate: q?.changeRate ?? 0,
    volume: 0,
    tradeAmount: q?.tradeAmount ?? 0,
    open: 0,
    high: 0,
    low: 0,
    marketCap: 0,
    upperLimit: 0,
    lowerLimit: 0,
    updatedAt: q?.updatedAt ?? row.addedAt,
    upperLimitProximity: 0,
  };
}

function formatKstTime(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toLocaleTimeString('ko-KR', { hour12: false });
}

export function WatchlistClient() {
  const { data, isLoading, isRefreshing, error, lastUpdatedAt, refresh } =
    useWatchlistQuery();
  // D-04 — 앱 당겨서 새로고침은 관심종목 목록만 다시 읽는다.
  useNativeRefresh(refresh);
  const fmtTime = formatKstTime(lastUpdatedAt);

  return (
    <section aria-label="관심종목" className={PAGE_WRAP}>
      <PageHeader
        title="관심종목"
        back
        description={POLLING_DESC}
        actions={
          <>
            <span
              className={
                isRefreshing
                  ? 'block size-2 rounded-full bg-[var(--up)] animate-ping'
                  : 'block size-2 rounded-full bg-[var(--flat)]'
              }
              aria-hidden="true"
            />
            <span className="mono tabular-nums">최근 갱신 {fmtTime} KST</span>
          </>
        }
      />

      {isLoading ? (
        <WatchlistSkeleton />
      ) : error ? (
        <div
          role="alert"
          className="rounded-[var(--r)] border border-[var(--destructive)]/40 bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] p-4 text-[length:var(--t-sm)] text-[var(--destructive)]"
        >
          {ERROR_MSG}
        </div>
      ) : data.length === 0 ? (
        <WatchlistEmpty />
      ) : (
        <>
          {/* lg+ Table */}
          <WatchlistTable
            rows={data}
            isRefreshing={isRefreshing}
            renderToggle={(row) => (
              <WatchlistToggle
                stockCode={row.stockCode}
                stockName={row.stock.name}
              />
            )}
          />
          {/* <lg InfoStockCard 리스트 */}
          <ul
            className={
              'lg:hidden m-0 flex list-none flex-col gap-2 p-0' +
              (isRefreshing ? ' opacity-90 transition-opacity' : '')
            }
          >
            {data.map((row) => (
              <li key={row.stockCode}>
                <InfoStockCard
                  stock={rowToStock(row)}
                  showWatchlistToggle
                  watchlistToggleSlot={<WatchlistToggle stockCode={row.stockCode} stockName={row.stock.name} />}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
