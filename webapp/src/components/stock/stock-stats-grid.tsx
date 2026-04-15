import type { Stock } from '@gh-radar/shared';
import { Card } from '@/components/ui/card';
import {
  Number as NumberDisplay,
  type NumberFormat,
} from '@/components/ui/number';

interface StatCell {
  label: string;
  value: number;
  format: NumberFormat;
  /** true 면 value <= 0 또는 !Number.isFinite 시 em-dash (Pitfall 1 대응) */
  nullAsEmDash: boolean;
}

/**
 * StockStatsGrid — 8필드 Card grid (Phase 6 D4).
 * - grid-cols-2 md:grid-cols-3 (R3 권고: lg 4열 거절)
 * - em-dash 정책: 시가·고가·저가·시총·상한가·하한가 는 value<=0 일 때 `—`
 *   (서버 mapper 가 null 을 0 으로 강제하기 때문에 0 을 null 로 해석한다)
 * - 거래량·거래대금 은 0 정상값 → Number/formatTradeAmount 기본 동작 유지
 */
export function StockStatsGrid({ stock }: { stock: Stock }) {
  const cells: StatCell[] = [
    { label: '시가', value: stock.open, format: 'price', nullAsEmDash: true },
    { label: '고가', value: stock.high, format: 'price', nullAsEmDash: true },
    { label: '저가', value: stock.low, format: 'price', nullAsEmDash: true },
    {
      label: '거래량',
      value: stock.volume,
      format: 'volume',
      nullAsEmDash: false,
    },
    {
      label: '거래대금',
      value: stock.tradeAmount,
      format: 'trade-amount',
      nullAsEmDash: false,
    },
    {
      label: '시가총액',
      value: stock.marketCap,
      format: 'marketCap',
      nullAsEmDash: true,
    },
    {
      label: '상한가',
      value: stock.upperLimit,
      format: 'price',
      nullAsEmDash: true,
    },
    {
      label: '하한가',
      value: stock.lowerLimit,
      format: 'price',
      nullAsEmDash: true,
    },
  ];

  return (
    <div
      data-testid="stock-stats-grid"
      className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6"
    >
      {cells.map((c) => {
        const isNull =
          c.nullAsEmDash && (!Number.isFinite(c.value) || c.value <= 0);
        return (
          <Card key={c.label} className="p-4">
            <div className="space-y-2">
              <div className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
                {c.label}
              </div>
              <div className="text-[length:var(--t-sm)] font-semibold">
                {isNull ? (
                  <span className="mono text-[var(--muted-fg)]">—</span>
                ) : (
                  <NumberDisplay value={c.value} format={c.format} />
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
