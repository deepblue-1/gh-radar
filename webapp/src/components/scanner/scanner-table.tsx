import Link from 'next/link';
import { memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Number } from '@/components/ui/number';
import { cn } from '@/lib/utils';
import type { StockWithProximity } from '@/lib/scanner-api';

export interface ScannerTableProps {
  stocks: StockWithProximity[];
  isRefreshing?: boolean;
}

/**
 * 데스크톱 Table 렌더러 (md:block). UI-SPEC §Wireframes §1 Variant C.
 * changeRate 는 정수 % 스케일(29.98=29.98%) — format="plain" precision=2 + 수동 `+`/`%`.
 */
function ScannerTableBase({ stocks, isRefreshing }: ScannerTableProps) {
  const rows = useMemo(() => stocks, [stocks]);
  return (
    <div
      className={cn(
        'hidden md:block overflow-hidden rounded-[var(--r)] border border-[var(--border)]',
        isRefreshing && 'opacity-90 transition-opacity',
      )}
    >
      <table className="w-full border-collapse">
        <thead className="bg-[var(--muted)]">
          <tr>
            <Th>종목명</Th>
            <Th>코드</Th>
            <Th>마켓</Th>
            <Th align="right">현재가</Th>
            <Th align="right">등락률</Th>
            <Th align="right">거래량</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((stock) => {
            const sign = stock.changeRate > 0 ? '+' : '';
            const color =
              stock.changeRate > 0
                ? 'text-[var(--up)]'
                : stock.changeRate < 0
                  ? 'text-[var(--down)]'
                  : 'text-[var(--flat)]';
            return (
              <tr
                key={stock.code}
                className="border-t border-[var(--border)] hover:bg-[color-mix(in_oklch,var(--muted)_60%,transparent)] transition-colors"
              >
                <td colSpan={6} className="p-0">
                  <Link
                    href={`/stocks/${stock.code}`}
                    aria-label={`${stock.name} 상세 보기`}
                    className="grid grid-cols-[1fr_100px_80px_120px_100px_140px] items-center gap-3 px-3 py-3 cursor-pointer"
                  >
                    <span className="text-[length:var(--t-base)] font-semibold text-[var(--fg)] truncate">
                      {stock.name}
                    </span>
                    <span className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                      {stock.code}
                    </span>
                    <span>
                      <Badge
                        variant={stock.market === 'KOSPI' ? 'secondary' : 'outline'}
                      >
                        {stock.market}
                      </Badge>
                    </span>
                    <span className="mono text-right text-[var(--fg)]">
                      <Number value={stock.price} format="price" />
                    </span>
                    <span className={cn('mono text-right font-semibold', color)}>
                      {sign}
                      {stock.changeRate.toFixed(2)}%
                    </span>
                    <span className="mono text-right text-[var(--fg)]">
                      <Number value={stock.volume} format="volume" />
                    </span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={cn(
        'text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)] uppercase tracking-wide px-3 py-2',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

export const ScannerTable = memo(ScannerTableBase);
