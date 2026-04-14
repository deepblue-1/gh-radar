import Link from 'next/link';
import { memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Number } from '@/components/ui/number';
import { cn } from '@/lib/utils';
import type { StockWithProximity } from '@/lib/scanner-api';

export interface ScannerCardListProps {
  stocks: StockWithProximity[];
  isRefreshing?: boolean;
}

/**
 * 모바일 Card 리스트 (md:hidden). UI-SPEC §Wireframes §2.
 * 3줄 구조: 종목명+등락률 Badge / 코드·마켓 / 현재가+거래량.
 * 터치 타겟 44px 이상 확보 (padding 12 + 3줄 gap).
 */
function ScannerCardListBase({ stocks, isRefreshing }: ScannerCardListProps) {
  const items = useMemo(() => stocks, [stocks]);
  return (
    <ul
      className={cn(
        'md:hidden flex flex-col gap-3 list-none p-0 m-0',
        isRefreshing && 'opacity-90 transition-opacity',
      )}
    >
      {items.map((stock) => {
        const sign = stock.changeRate > 0 ? '+' : '';
        const changeVariant =
          stock.changeRate > 0 ? 'up' : stock.changeRate < 0 ? 'down' : 'flat';
        return (
          <li key={stock.code}>
            <Link
              href={`/stocks/${stock.code}`}
              aria-label={`${stock.name} 상세 보기`}
              className="flex flex-col gap-2 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-3 active:bg-[var(--muted)] transition-colors"
              style={{ minHeight: 88 }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[length:var(--t-base)] font-semibold text-[var(--fg)] truncate">
                  {stock.name}
                </span>
                <Badge variant={changeVariant}>
                  {sign}
                  {stock.changeRate.toFixed(2)}%
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                <span className="mono">{stock.code}</span>
                <Badge
                  variant={stock.market === 'KOSPI' ? 'secondary' : 'outline'}
                >
                  {stock.market}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-[length:var(--t-sm)]">
                <span className="mono text-[var(--fg)]">
                  <Number value={stock.price} format="price" />
                </span>
                <span className="mono text-[var(--muted-fg)]">
                  <Number value={stock.volume} format="volume" />
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export const ScannerCardList = memo(ScannerCardListBase);
