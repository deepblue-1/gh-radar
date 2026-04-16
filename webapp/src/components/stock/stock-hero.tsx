import type { Stock } from '@gh-radar/shared';
import { Badge } from '@/components/ui/badge';
import { Number as NumberDisplay } from '@/components/ui/number';
import { WatchlistToggle } from '@/components/watchlist/watchlist-toggle';

export interface StockHeroProps {
  stock: Stock;
}

/**
 * StockHero — Phase 6 D4 Hero 섹션 (UI-SPEC primary focal point).
 * - 종목명(Heading 24) · 코드 · 마켓배지
 * - 현재가(Display 30 → 모바일 24, 반응형 breakpoint)
 * - 등락액 + 등락률 (up/down/flat 색상)
 * - price <= 0 → em-dash (정지/폐지 종목)
 *
 * changeRate 스케일 주의: 서버는 정수 % (2.09 = 2.09%) 로 내려주고
 * `<Number format="percent">` 는 소수 (0.0325 = 3.25%) 를 기대하므로 /100 로 변환.
 */
export function StockHero({ stock }: StockHeroProps) {
  const priceValid = Number.isFinite(stock.price) && stock.price > 0;
  const changeRateDecimal = stock.changeRate / 100;

  return (
    <section className="space-y-6" aria-label="종목 개요">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[length:var(--t-h2)] font-semibold tracking-[-0.01em] text-[var(--fg)]">
          {stock.name}
        </h1>
        <span className="mono text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          {stock.code}
        </span>
        <Badge variant="outline">{stock.market}</Badge>
        <WatchlistToggle stockCode={stock.code} stockName={stock.name} />
      </div>

      <div className="flex flex-wrap items-baseline gap-3">
        {priceValid ? (
          <span
            data-testid="stock-hero-price"
            className="mono text-[length:var(--t-h2)] md:text-[length:var(--t-h1)] font-semibold text-[var(--fg)]"
          >
            <NumberDisplay value={stock.price} format="price" />
          </span>
        ) : (
          <span
            data-testid="stock-hero-price"
            className="mono text-[length:var(--t-h2)] md:text-[length:var(--t-h1)] font-semibold text-[var(--muted-fg)]"
          >
            —
          </span>
        )}
        <span className="text-[length:var(--t-sm)]">
          <NumberDisplay
            value={stock.changeAmount}
            format="price"
            showSign
            withColor
          />
        </span>
        <span className="text-[length:var(--t-sm)]">
          <NumberDisplay
            value={changeRateDecimal}
            format="percent"
            showSign
            withColor
          />
        </span>
      </div>
    </section>
  );
}
