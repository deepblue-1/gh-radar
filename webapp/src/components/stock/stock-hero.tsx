'use client';

import { useRouter } from 'next/navigation';
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
 * 뒤로가기 버튼 (←): router.back() 으로 진입 경로 보존 (이전 페이지 = scanner 또는
 * watchlist 어느 쪽이든 정확). history 가 비어있는 직접 URL 진입은 /scanner fallback.
 * 이전에는 href="/" 였으나 page.tsx 가 /scanner 로 redirect 하여 watchlist 진입이
 * 무시되는 버그가 있었음.
 *
 * changeRate 스케일 주의: 서버는 정수 % (2.09 = 2.09%) 로 내려주고
 * `<Number format="percent">` 는 소수 (0.0325 = 3.25%) 를 기대하므로 /100 로 변환.
 */
export function StockHero({ stock }: StockHeroProps) {
  const priceValid = Number.isFinite(stock.price) && stock.price > 0;
  const changeRateDecimal = stock.changeRate / 100;
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/scanner');
    }
  };

  return (
    <section className="space-y-6" aria-label="종목 개요">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          aria-label="이전 페이지로 돌아가기"
          className="inline-flex items-center text-[length:var(--t-h2)] text-[var(--muted-fg)] hover:text-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-sm py-2 pr-1"
        >
          ←
        </button>
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
