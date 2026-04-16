import Link from 'next/link';
import { memo, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Number as NumberDisplay } from '@/components/ui/number';
import { cn } from '@/lib/utils';
import type { WatchlistRow } from '@/lib/watchlist-api';

/**
 * WatchlistTable — UI-SPEC §4.2.
 *
 * `lg+` Desktop Table (7컬럼):
 *   종목명 / 코드 / 마켓 / 현재가 / 등락률 / 거래대금 / [⭐해제]
 *
 * Scanner Table 과 동일한 grid 패턴이되, ⭐ 해제 44px 컬럼이 추가됨.
 * ⭐ 토글 실제 wire-up 은 Plan 07 — 이 plan 은 `renderToggle` prop slot 만 확보.
 * renderToggle 미제공 시 44px 자리는 빈 div 로 예약 (레이아웃 안정).
 *
 * 행 tap 영역: 종목명 셀만 `<Link>` — Scanner Table 처럼 전체 행 링크로 두면 Plan 07
 * ⭐ Toggle 이 중첩 클릭을 유발한다 (UI-SPEC §5 배치 규칙 #2). 이 Plan 에서도 처음부터
 * 셀 단위 Link 구조로 구축해 Plan 07 에서 추가 수정이 필요 없도록 한다.
 */

export interface WatchlistTableProps {
  rows: WatchlistRow[];
  isRefreshing?: boolean;
  /** Plan 07 에서 <WatchlistToggle /> 을 행별로 주입. */
  renderToggle?: (row: WatchlistRow) => ReactNode;
}

const GRID_COLS =
  'grid grid-cols-[1fr_100px_80px_120px_100px_140px_44px] items-center gap-3 px-3';

function WatchlistTableBase({
  rows,
  isRefreshing,
  renderToggle,
}: WatchlistTableProps) {
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
        <span className="text-right" aria-label="관심종목 해제">
          ⭐
        </span>
      </div>
      <div role="rowgroup">
        {rows.map((row) => {
          const quote = row.quote;
          const changeRate = quote?.changeRate ?? 0;
          const sign = changeRate > 0 ? '+' : '';
          const color =
            changeRate > 0
              ? 'text-[var(--up)]'
              : changeRate < 0
                ? 'text-[var(--down)]'
                : 'text-[var(--flat)]';
          return (
            <div
              key={row.stockCode}
              role="row"
              className={cn(
                GRID_COLS,
                'border-t border-[var(--border)] py-3 text-[length:var(--t-sm)] hover:bg-[color-mix(in_oklch,var(--muted)_60%,transparent)] transition-colors',
              )}
            >
              <Link
                href={`/stocks/${row.stockCode}`}
                aria-label={`${row.stock.name} 상세 보기`}
                className="truncate text-[length:var(--t-base)] font-semibold text-[var(--fg)] hover:underline"
              >
                {row.stock.name}
              </Link>
              <span className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                {row.stockCode}
              </span>
              <span>
                <Badge
                  variant={row.stock.market === 'KOSPI' ? 'secondary' : 'outline'}
                >
                  {row.stock.market}
                </Badge>
              </span>
              <span className="mono text-right text-[var(--fg)]">
                {quote ? (
                  <NumberDisplay value={quote.price} format="price" />
                ) : (
                  <span className="text-[var(--muted-fg)]">—</span>
                )}
              </span>
              <span
                className={cn('mono text-right font-semibold', color)}
              >
                {quote ? `${sign}${changeRate.toFixed(2)}%` : '—'}
              </span>
              <span className="mono text-right text-[var(--fg)]">
                {quote ? (
                  <NumberDisplay value={quote.tradeAmount} format="trade-amount" />
                ) : (
                  <span className="text-[var(--muted-fg)]">—</span>
                )}
              </span>
              <span className="text-right">
                {renderToggle ? (
                  renderToggle(row)
                ) : (
                  <div className="size-9" aria-hidden="true" />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const WatchlistTable = memo(WatchlistTableBase);
