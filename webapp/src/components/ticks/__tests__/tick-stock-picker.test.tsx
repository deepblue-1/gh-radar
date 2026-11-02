import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { StockDetailResponse } from '@gh-radar/shared';

/**
 * Phase 37 Plan 08 Task 2 — 머리 종목 검색 피커(D-16) — 제안 행 상태 칩 3종 · isin 없는 종목 흐림 · 늦은 응답 무시(WR-05) ·
 * 클릭/Enter = onSelect.
 */

let mockSearch: { results: StockDetailResponse[]; resultsQuery: string } = { results: [], resultsQuery: '' };
vi.mock('@/hooks/use-debounced-search', () => ({
  useDebouncedSearch: () => ({ ...mockSearch, loading: false, error: undefined }),
}));

import { TickStockPicker } from '../tick-stock-picker';

function stock(code: string, name: string, isin: string | null): StockDetailResponse {
  return {
    code,
    name,
    market: 'KOSDAQ',
    price: 0,
    changeAmount: 0,
    changeRate: 0,
    volume: 0,
    tradeAmount: 0,
    open: 0,
    high: 0,
    low: 0,
    marketCap: 0,
    upperLimit: 0,
    lowerLimit: 0,
    updatedAt: '',
    upperLimitProximity: 0,
    isin,
  };
}

const HANSUN = stock('101360', '한선엔지니어링', 'KR7101360006');
const HANSUN_M = stock('233240', '한선물산', 'KR7233240001');
const NO_ISIN = stock('999999', '한선ETN', null);

function renderPicker(over: Partial<Parameters<typeof TickStockPicker>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <TickStockPicker
      date="20261030"
      ex="KRX"
      gridIsins={new Set(['KR7101360006'])}
      isToday={false}
      etaS={{ KRX: 240, NXT: 90 }}
      onSelect={onSelect}
      {...over}
    />,
  );
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '한선' } });
  return { onSelect, input };
}

describe('TickStockPicker', () => {
  beforeEach(() => {
    mockSearch = { results: [HANSUN, HANSUN_M, NO_ISIN], resultsQuery: '한선' };
  });

  it('칩 — 격자 있음 · 변환 필요 · 약 N분(거래소 eta 올림)', () => {
    renderPicker();
    const opts = screen.getAllByRole('option');
    expect(opts[0]).toHaveTextContent('한선엔지니어링');
    expect(opts[0]).toHaveTextContent('격자 있음');
    expect(opts[1]).toHaveTextContent('변환 필요 · 약 4분');
  });

  it('NXT 는 그 거래소 eta 로 · 오늘이면 「오늘 · 라이브」', () => {
    renderPicker({ ex: 'NXT', gridIsins: new Set() });
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('변환 필요 · 약 2분');
  });

  it('오늘이면 모두 「오늘 · 라이브」', () => {
    renderPicker({ isToday: true });
    const opts = screen.getAllByRole('option');
    expect(opts[0]).toHaveTextContent('오늘 · 라이브');
    expect(opts[1]).toHaveTextContent('오늘 · 라이브');
  });

  it('isin 없는 종목은 흐리고 고를 수 없다', () => {
    const { onSelect } = renderPicker();
    const noIsin = screen.getAllByRole('option')[2]!;
    expect(noIsin).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(noIsin);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('클릭 = onSelect({isin, code, name})', () => {
    const { onSelect } = renderPicker();
    fireEvent.click(screen.getAllByRole('option')[1]!);
    expect(onSelect).toHaveBeenCalledWith({ isin: 'KR7233240001', code: '233240', name: '한선물산' });
  });

  it('Enter = 첫(선택된) 제안 고르기', () => {
    const { onSelect, input } = renderPicker();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith({ isin: 'KR7101360006', code: '101360', name: '한선엔지니어링' });
  });

  it('늦은 응답(다른 검색어 결과)은 보이지 않는다', () => {
    mockSearch = { results: [HANSUN], resultsQuery: '한' };
    renderPicker();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});
