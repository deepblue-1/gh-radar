import Link from 'next/link';
import { memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Number } from '@/components/ui/number';
import { cn } from '@/lib/utils';
import type { StockWithProximity } from '@/lib/scanner-api';
import { WatchlistToggle } from '@/components/watchlist/watchlist-toggle';

export interface ScannerTableProps {
  stocks: StockWithProximity[];
  isRefreshing?: boolean;
}

/**
 * 데스크톱 Table 렌더러 (lg:block — Phase 06.2 D-23.1 breakpoint 통일). UI-SPEC §Wireframes §1 Variant C.
 * changeRate 는 정수 % 스케일(29.98=29.98%) — format="plain" precision=2 + 수동 `+`/`%`.
 *
 * Phase 06.2 Plan 07 Task 3.2 — Link 셀 단위 축소 (RESEARCH §Pattern 8):
 * 이전에는 행 전체를 `<Link role="row">` 로 감쌌으나, ⭐ Toggle 을 행 내부에 배치하면
 * `<button>` 이 `<a>` 안에 중첩되어 click 이벤트가 상세 페이지로 이동해 버린다.
 * 해결: 행을 `<div role="row">` 로 두고, 각 데이터 셀(6개)만 `<Link>` 로 감싼다.
 * 마지막 ⭐ 셀은 `<WatchlistToggle>` 단독으로 유지 — 토글 내부 stopPropagation 과 무관.
 */
const GRID_COLS =
  'grid grid-cols-[1fr_100px_80px_120px_100px_140px_44px] items-center gap-3 px-3';

function ScannerTableBase({ stocks, isRefreshing }: ScannerTableProps) {
  const rows = useMemo(() => stocks, [stocks]);
  return (
    <div
      role="table"
      className={cn(
        'hidden lg:block overflow-hidden rounded-[var(--r)] border border-[var(--border)]',
        isRefreshing && 'opacity-90 transition-opacity',
      )}
    >
      <div
        role="row"
        className={cn(
          GRID_COLS,
          'bg-[var(--muted)] py-2 text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)] uppercase tracking-wide',
        )}
      >
        <span>종목명</span>
        <span>코드</span>
        <span>마켓</span>
        <span className="text-right">현재가</span>
        <span className="text-right">등락률</span>
        <span className="text-right">거래대금</span>
        <span className="text-right" aria-label="관심종목">
          ⭐
        </span>
      </div>
      <div role="rowgroup">
        {rows.map((stock) => {
          const sign = stock.changeRate > 0 ? '+' : '';
          const color =
            stock.changeRate > 0
              ? 'text-[var(--up)]'
              : stock.changeRate < 0
                ? 'text-[var(--down)]'
                : 'text-[var(--flat)]';
          const href = `/stocks/${stock.code}`;
          const rowAriaLabel = `${stock.name} 상세 보기`;
          return (
            <div
              key={stock.code}
              role="row"
              className={cn(
                GRID_COLS,
                'py-3 border-t border-[var(--border)] hover:bg-[color-mix(in_oklch,var(--muted)_60%,transparent)] transition-colors',
              )}
            >
              <Link
                href={href}
                aria-label={rowAriaLabel}
                className="text-[length:var(--t-base)] font-semibold text-[var(--fg)] truncate hover:underline"
              >
                {stock.name}
              </Link>
              <Link
                href={href}
                tabIndex={-1}
                aria-hidden="true"
                className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]"
              >
                {stock.code}
              </Link>
              <Link href={href} tabIndex={-1} aria-hidden="true">
                <Badge variant={stock.market === 'KOSPI' ? 'secondary' : 'outline'}>
                  {stock.market}
                </Badge>
              </Link>
              <Link
                href={href}
                tabIndex={-1}
                aria-hidden="true"
                className="mono text-right text-[var(--fg)]"
              >
                <Number value={stock.price} format="price" />
              </Link>
              <Link
                href={href}
                tabIndex={-1}
                aria-hidden="true"
                className={cn('mono text-right font-semibold', color)}
              >
                {sign}
                {stock.changeRate.toFixed(2)}%
              </Link>
              <Link
                href={href}
                tabIndex={-1}
                aria-hidden="true"
                className="mono text-right text-[var(--fg)]"
              >
                <Number value={stock.tradeAmount} format="trade-amount" />
              </Link>
              <span className="text-right">
                <WatchlistToggle
                  stockCode={stock.code}
                  stockName={stock.name}
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ScannerTable = memo(ScannerTableBase);
