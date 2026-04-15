import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StockHero } from '../stock-hero';
import {
  FIXTURE_SAMSUNG,
  FIXTURE_NULL_PRICE,
} from '@/__tests__/fixtures/stocks';

describe('StockHero', () => {
  it('Test 1 — 삼성전자 픽스처: 종목명/코드/마켓배지/현재가/등락액/등락률 렌더', () => {
    render(<StockHero stock={FIXTURE_SAMSUNG} />);

    expect(screen.getByText('삼성전자')).toBeInTheDocument();
    expect(screen.getByText('005930')).toBeInTheDocument();
    expect(screen.getByText('KOSPI')).toBeInTheDocument();
    // 현재가 58,700
    expect(screen.getByText('58,700')).toBeInTheDocument();
    // 등락액 +1,200 (showSign)
    expect(screen.getByText('+1,200')).toBeInTheDocument();
    // 등락률 +2.09% (2.09 / 100 → 0.0209 → *100 → 2.09%)
    expect(screen.getByText('+2.09%')).toBeInTheDocument();
  });

  it('Test 2 — price=0 정지/폐지 종목: 현재가 em-dash, 등락 필드는 정상 렌더', () => {
    render(<StockHero stock={FIXTURE_NULL_PRICE} />);

    const priceEl = screen.getByTestId('stock-hero-price');
    expect(priceEl.textContent).toBe('—');
    // 등락액/등락률 은 em-dash 적용 안 됨 — 등락률 2.09% 그대로 노출
    expect(screen.getByText('+2.09%')).toBeInTheDocument();
    expect(screen.getByText('+1,200')).toBeInTheDocument();
  });

  it('Test 3 — Hero 현재가 요소에 반응형 타입 클래스 존재', () => {
    render(<StockHero stock={FIXTURE_SAMSUNG} />);
    const priceEl = screen.getByTestId('stock-hero-price');
    expect(priceEl.className).toContain('text-[length:var(--t-h2)]');
    expect(priceEl.className).toContain('md:text-[length:var(--t-h1)]');
  });
});
