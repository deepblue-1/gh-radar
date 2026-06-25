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

  it('Test 7 — 유효 스케일이면 스펙트럼 바 + 상·하한가 노출 (B3)', () => {
    render(<StockStatsGrid stock={FIXTURE_SAMSUNG} />);
    // B3: grid 가 아니라 스펙트럼 바로 렌더
    expect(screen.getByTestId('price-spectrum')).toBeInTheDocument();
    expect(screen.getByText('상한가')).toBeInTheDocument();
    expect(screen.getByText('하한가')).toBeInTheDocument();
    // 상·하한가 값 (74,750 / 40,250) 이 노출
    expect(screen.getByText('74,750')).toBeInTheDocument();
    expect(screen.getByText('40,250')).toBeInTheDocument();
  });

  it('Test 7b — 스케일 무효(상·하한가=0)면 폴백 grid 로 분기', () => {
    render(<StockStatsGrid stock={FIXTURE_NULL_PRICE} />);
    const grid = screen.getByTestId('stock-stats-grid');
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).toContain('md:grid-cols-3');
  });
});
