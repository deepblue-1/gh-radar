import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StockStatsGrid } from '../stock-stats-grid';
import {
  FIXTURE_SAMSUNG,
  FIXTURE_NULL_PRICE,
} from '@/__tests__/fixtures/stocks';

describe('StockStatsGrid', () => {
  it('Test 4 — 8개 라벨 모두 노출', () => {
    render(<StockStatsGrid stock={FIXTURE_SAMSUNG} />);
    for (const label of [
      '시가',
      '고가',
      '저가',
      '거래량',
      '거래대금',
      '시가총액',
      '상한가',
      '하한가',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('Test 5 — FIXTURE_NULL_PRICE: 가격 계열 6개 필드가 em-dash', () => {
    render(<StockStatsGrid stock={FIXTURE_NULL_PRICE} />);
    // em-dash 는 6개 위치에 등장해야 한다 (시가·고가·저가·시총·상한가·하한가)
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBe(6);
  });

  it('Test 6 — volume=0 은 정상 Number 렌더 (em-dash 아님)', () => {
    const stock = { ...FIXTURE_SAMSUNG, volume: 0 };
    render(<StockStatsGrid stock={stock} />);
    // volume=0 → Intl.NumberFormat('ko-KR').format(0) === '0' (volume<1e4 경로)
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('Test 6b — tradeAmount=0 은 formatTradeAmount 기본동작 "-" (em-dash 아님)', () => {
    const stock = { ...FIXTURE_SAMSUNG, tradeAmount: 0 };
    render(<StockStatsGrid stock={stock} />);
    // formatTradeAmount(0) === '-' (hyphen, not em-dash)
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('Test 7 — grid container 가 grid-cols-2 md:grid-cols-3 클래스 보유', () => {
    render(<StockStatsGrid stock={FIXTURE_SAMSUNG} />);
    const grid = screen.getByTestId('stock-stats-grid');
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).toContain('md:grid-cols-3');
  });
});
