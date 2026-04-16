import { memo, useMemo } from 'react';

import { InfoStockCard } from '@/components/stock/info-stock-card';
import { WatchlistToggle } from '@/components/watchlist/watchlist-toggle';
import { cn } from '@/lib/utils';
import type { StockWithProximity } from '@/lib/scanner-api';

export interface ScannerCardListProps {
  stocks: StockWithProximity[];
  isRefreshing?: boolean;
}

/**
 * Scanner 모바일/태블릿 카드 리스트 (`<lg` 전용 — Phase 06.2 D-23.1 breakpoint 통일).
 *
 * Phase 06.2 Plan 05 D-23.1: Scanner/Watchlist 가 동일한 `InfoStockCard` 패밀리 공유.
 * 이 컴포넌트는 데이터 소스 (Scanner API) 와 렌더러 (InfoStockCard) 를 잇는 얇은 래퍼다.
 *
 * ⭐ 토글 wire-up 은 Plan 07 에서 `showWatchlistToggle` + `watchlistToggleSlot` prop
 * 경유로 주입된다. Plan 05 단독 렌더 시에는 토글 없이 카드만 노출한다 (InfoStockCard
 * 기본값).
 *
 * 기존 `ScannerCardListProps` 인터페이스는 보존 — scanner-client 는 변경 없음.
 */
function ScannerCardListBase({ stocks, isRefreshing }: ScannerCardListProps) {
  const items = useMemo(() => stocks, [stocks]);
  return (
    <ul
      className={cn(
        'lg:hidden m-0 flex list-none flex-col gap-2 p-0',
        isRefreshing && 'opacity-90 transition-opacity',
      )}
    >
      {items.map((stock) => (
        <li key={stock.code}>
          <InfoStockCard
            stock={stock}
            showWatchlistToggle
            watchlistToggleSlot={<WatchlistToggle stockCode={stock.code} stockName={stock.name} />}
          />
        </li>
      ))}
    </ul>
  );
}

export const ScannerCardList = memo(ScannerCardListBase);
