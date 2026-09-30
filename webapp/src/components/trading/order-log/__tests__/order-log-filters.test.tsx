import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OrderLogFilters } from '../order-log-filters';
import { DEFAULT_ORDER_LOG_FILTERS } from '@/lib/order-log-feed';

/**
 * Phase 25-07 Task 2 — 필터줄 (UI-SPEC ②-1 · D-08 · 결정 1-A · R3 · R12).
 *
 * 칩 3개(종목 · 거래소 · 구분)는 `<label>` 로 감싼 네이티브 `<select>` · 「전체」 가 아닌 칩만 `data-on` ·
 * 건수 「{N}건」 · 창 분리 버튼(앱 셸에서는 없음).
 */

const STOCKS = [
  { value: 'KR7005930003', label: '○○전자' },
  { value: 'KR7000660001', label: '가나다' },
];

afterEach(() => {
  document.documentElement.classList.remove('native-app');
});

describe('OrderLogFilters', () => {
  it('칩 3개(종목 · 거래소 · 구분) + 건수 + 창 분리 — 순서 · 이름 · 옵션', () => {
    const { container } = render(
      <OrderLogFilters
        filters={DEFAULT_ORDER_LOG_FILTERS}
        onChange={vi.fn()}
        stockOptions={STOCKS}
        count={14}
        onPopout={vi.fn()}
      />,
    );
    const bar = container.querySelector('[data-slot="order-log-filters"]')!;
    const selects = within(bar as HTMLElement).getAllByRole('combobox');
    expect(selects.map((s) => s.getAttribute('aria-label'))).toEqual(['종목', '거래소', '구분']);
    // 칩 모양은 select 를 감싼 <label> — 클릭 영역이 칩 전체다.
    for (const s of selects) expect(s.closest('label')).not.toBeNull();
    expect(screen.getByRole('combobox', { name: '종목' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '거래소' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '구분' })).toBeInTheDocument();
    const stockOpts = within(screen.getByRole('combobox', { name: '종목' })).getAllByRole('option');
    expect(stockOpts.map((o) => o.textContent)).toEqual(['전체', '○○전자', '가나다']);
    const exOpts = within(screen.getByRole('combobox', { name: '거래소' })).getAllByRole('option');
    expect(exOpts.map((o) => o.textContent)).toEqual(['전체', 'KRX', 'NXT']);
    const kindOpts = within(screen.getByRole('combobox', { name: '구분' })).getAllByRole('option');
    expect(kindOpts.map((o) => o.textContent)).toEqual(['전체', '선매수', '추가매수', '후매수', '매도', '수동', 'VI', '시세']);
    expect(container.querySelector('[data-slot="order-log-count"]')?.textContent).toBe('14건');
    const pop = container.querySelector('[data-slot="order-log-popout"]')!;
    expect(pop.textContent).toBe('창 분리 ↗');
    expect(pop.getAttribute('aria-label')).toBe('주문로그 새 창으로 열기');
    expect(pop.className).toContain('native:hidden');
    // 어떤 칩도 기본이면 data-on 없음
    expect(container.querySelectorAll('[data-on]')).toHaveLength(0);
  });

  it('「전체」 아닌 칩만 data-on · 선택 변경 → onChange(병합된 필터)', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <OrderLogFilters
        filters={{ ...DEFAULT_ORDER_LOG_FILTERS, kind: 'market' }}
        onChange={onChange}
        stockOptions={STOCKS}
        count={2}
      />,
    );
    const on = container.querySelectorAll('[data-on]');
    expect(on).toHaveLength(1);
    expect(on[0]!.textContent).toContain('구분');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '거래소' }), 'NXT');
    expect(onChange).toHaveBeenCalledWith({ stock: 'all', ex: 'NXT', kind: 'market' });
  });

  it('창 분리 클릭 → onPopout 1회 · onPopout 없으면 버튼 없음', async () => {
    const onPopout = vi.fn();
    const { container, rerender } = render(
      <OrderLogFilters filters={DEFAULT_ORDER_LOG_FILTERS} onChange={vi.fn()} stockOptions={[]} count={0} onPopout={onPopout} />,
    );
    await userEvent.click(screen.getByRole('button', { name: '주문로그 새 창으로 열기' }));
    expect(onPopout).toHaveBeenCalledTimes(1);
    rerender(<OrderLogFilters filters={DEFAULT_ORDER_LOG_FILTERS} onChange={vi.fn()} stockOptions={[]} count={0} />);
    expect(container.querySelector('[data-slot="order-log-popout"]')).toBeNull();
  });

  it('이벤트 없는 날: 칩 3개 「전체」 하나씩(종목) · 건수 「0건」', () => {
    render(<OrderLogFilters filters={DEFAULT_ORDER_LOG_FILTERS} onChange={vi.fn()} stockOptions={[]} count={0} />);
    expect(within(screen.getByRole('combobox', { name: '종목' })).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '전체',
    ]);
    expect(screen.getByText('0건')).toBeInTheDocument();
  });

  it('앱 셸(html.native-app)이면 창 분리 버튼이 없다', () => {
    document.documentElement.classList.add('native-app');
    const { container } = render(
      <OrderLogFilters filters={DEFAULT_ORDER_LOG_FILTERS} onChange={vi.fn()} stockOptions={[]} count={0} onPopout={vi.fn()} />,
    );
    expect(container.querySelector('[data-slot="order-log-popout"]')).toBeNull();
  });
});
