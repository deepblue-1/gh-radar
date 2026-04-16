import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { InfoStockCard } from '../info-stock-card';
import type { StockWithProximity } from '@/lib/scanner-api';

/**
 * Phase 06.2 Plan 05 Task 2 — InfoStockCard 단위 테스트.
 *
 * 계약:
 * - 등락률 부호(> / < / === 0)에 따라 Sparkline direction + 색상 토큰이 확정된다
 * - 카드 전체 탭 영역은 `<Link href="/stocks/{code}">` 로 감싸여 상세 이동 가능
 * - 종목명은 truncate, 코드·마켓은 `.mono uppercase` 로 표시
 * - `showWatchlistToggle` prop 은 Plan 05 에서 slot 만 확보 (Plan 07 에서 주입)
 * - 접근성: `aria-label="{name} 상세 보기"`
 */

const baseStock: StockWithProximity = {
  code: '005930',
  name: '삼성전자',
  market: 'KOSPI',
  price: 72000,
  changeRate: 2.09,
  changeAmount: 1500,
  tradeAmount: 1_200_000_000_000,
  volume: 16_000_000,
  open: 71500,
  high: 72500,
  low: 71200,
  marketCap: 430_000_000_000_000,
  upperLimit: 93500,
  lowerLimit: 50500,
  updatedAt: '2026-04-16T09:00:00.000Z',
  upperLimitProximity: 0.92,
};

const downStock: StockWithProximity = {
  ...baseStock,
  code: '000660',
  name: 'SK하이닉스',
  changeRate: -1.23,
  changeAmount: -1500,
};

const flatStock: StockWithProximity = {
  ...baseStock,
  code: '035720',
  name: '카카오',
  changeRate: 0,
  changeAmount: 0,
};

describe('InfoStockCard', () => {
  it('renders an up-direction sparkline when changeRate > 0', () => {
    const { container } = render(<InfoStockCard stock={baseStock} />);
    const path = container.querySelector('svg path');
    // Sparkline up path 시작 — Task 1 계약 검증 (transitively 통합 여부)
    expect(path?.getAttribute('d')).toMatch(/^M0 20/);
    expect(path?.getAttribute('stroke')).toBe('var(--up)');
  });

  it('renders a down-direction sparkline when changeRate < 0', () => {
    const { container } = render(<InfoStockCard stock={downStock} />);
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('d')).toMatch(/^M0 4/);
    expect(path?.getAttribute('stroke')).toBe('var(--down)');
  });

  it('renders a flat-direction sparkline when changeRate === 0', () => {
    const { container } = render(<InfoStockCard stock={flatStock} />);
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('d')).toMatch(/^M0 12/);
    expect(path?.getAttribute('stroke')).toBe('var(--flat)');
  });

  it('wraps the card in a Link pointing at /stocks/{code}', () => {
    render(<InfoStockCard stock={baseStock} />);
    const link = screen.getByRole('link', { name: '삼성전자 상세 보기' });
    expect(link.getAttribute('href')).toBe('/stocks/005930');
  });

  it('applies truncate class to the stock name', () => {
    render(<InfoStockCard stock={baseStock} />);
    const name = screen.getByText('삼성전자');
    expect(name.className).toMatch(/truncate/);
  });

  it('applies the up/down/flat color class on the change-rate text', () => {
    const { rerender, container } = render(<InfoStockCard stock={baseStock} />);
    const hasUp = container.innerHTML.includes('text-[var(--up)]');
    expect(hasUp).toBe(true);

    rerender(<InfoStockCard stock={downStock} />);
    expect(container.innerHTML.includes('text-[var(--down)]')).toBe(true);

    rerender(<InfoStockCard stock={flatStock} />);
    expect(container.innerHTML.includes('text-[var(--flat)]')).toBe(true);
  });

  it('reserves a watchlist toggle slot only when showWatchlistToggle is true', () => {
    const { container: hidden } = render(<InfoStockCard stock={baseStock} />);
    // 기본: 토글 슬롯 미노출
    expect(hidden.querySelector('[data-slot="watchlist-toggle"]')).toBeNull();

    const { container: shown } = render(
      <InfoStockCard stock={baseStock} showWatchlistToggle />,
    );
    expect(shown.querySelector('[data-slot="watchlist-toggle"]')).not.toBeNull();
  });

  it('renders watchlistToggleSlot node inside the toggle slot when provided', () => {
    render(
      <InfoStockCard
        stock={baseStock}
        showWatchlistToggle
        watchlistToggleSlot={<span data-testid="toggle-node">★</span>}
      />,
    );
    expect(screen.getByTestId('toggle-node').textContent).toBe('★');
  });
});
