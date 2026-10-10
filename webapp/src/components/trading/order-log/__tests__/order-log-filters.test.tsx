import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OrderLogFilters, OrderLogLimitFeatureCheck } from '../order-log-filters';
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
        showLimitFeature={false}
        onShowLimitFeatureChange={vi.fn()}
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
    expect(kindOpts.map((o) => o.textContent)).toEqual(['전체', '선매수', '줄매수', '후매수', '매도', '자동매도', '수동', 'VI', '시세']);
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
        showLimitFeature={false}
        onShowLimitFeatureChange={vi.fn()}
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
      <OrderLogFilters showLimitFeature={false} onShowLimitFeatureChange={vi.fn()} filters={DEFAULT_ORDER_LOG_FILTERS} onChange={vi.fn()} stockOptions={[]} count={0} onPopout={onPopout} />,
    );
    await userEvent.click(screen.getByRole('button', { name: '주문로그 새 창으로 열기' }));
    expect(onPopout).toHaveBeenCalledTimes(1);
    rerender(<OrderLogFilters showLimitFeature={false} onShowLimitFeatureChange={vi.fn()} filters={DEFAULT_ORDER_LOG_FILTERS} onChange={vi.fn()} stockOptions={[]} count={0} />);
    expect(container.querySelector('[data-slot="order-log-popout"]')).toBeNull();
  });

  it('이벤트 없는 날: 칩 3개 「전체」 하나씩(종목) · 건수 「0건」', () => {
    render(<OrderLogFilters showLimitFeature={false} onShowLimitFeatureChange={vi.fn()} filters={DEFAULT_ORDER_LOG_FILTERS} onChange={vi.fn()} stockOptions={[]} count={0} />);
    expect(within(screen.getByRole('combobox', { name: '종목' })).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '전체',
    ]);
    expect(screen.getByText('0건')).toBeInTheDocument();
  });

  it('앱 셸(html.native-app)이면 창 분리 버튼이 없다', () => {
    document.documentElement.classList.add('native-app');
    const { container } = render(
      <OrderLogFilters showLimitFeature={false} onShowLimitFeatureChange={vi.fn()} filters={DEFAULT_ORDER_LOG_FILTERS} onChange={vi.fn()} stockOptions={[]} count={0} onPopout={vi.fn()} />,
    );
    expect(container.querySelector('[data-slot="order-log-popout"]')).toBeNull();
  });
});

describe('Phase 27 자동매도 필터 (D-14)', () => {
  it('구분 칩에 「자동매도」 가 「매도」 뒤에 있고 고르면 kind auto 를 낸다 · 켜지면 data-on', async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <OrderLogFilters showLimitFeature={false} onShowLimitFeatureChange={vi.fn()} filters={DEFAULT_ORDER_LOG_FILTERS} onChange={onChange} stockOptions={STOCKS} count={3} />,
    );
    const kind = screen.getByRole('combobox', { name: '구분' });
    const labels = within(kind).getAllByRole('option').map((o) => o.textContent);
    expect(labels.indexOf('자동매도')).toBe(labels.indexOf('매도') + 1);
    await userEvent.selectOptions(kind, '자동매도');
    expect(onChange).toHaveBeenCalledWith({ stock: 'all', ex: 'all', kind: 'auto' });
    rerender(
      <OrderLogFilters showLimitFeature={false} onShowLimitFeatureChange={vi.fn()} filters={{ ...DEFAULT_ORDER_LOG_FILTERS, kind: 'auto' }} onChange={onChange} stockOptions={STOCKS} count={3} />,
    );
    const on = container.querySelectorAll('[data-on]');
    expect(on).toHaveLength(1);
    expect(on[0]!.textContent).toContain('구분');
    expect((screen.getByRole('combobox', { name: '구분' }) as HTMLSelectElement).value).toBe('auto');
  });
});

describe('Phase 28 「상한가 특징」 체크 칩 (D-07 · UI-SPEC ②-1)', () => {
  it('OrderLogLimitFeatureCheck — 이름 「상한가 특징」 · 기본 꺼짐 · 클릭 → onChange(true) · Space → onChange', async () => {
    const onChange = vi.fn();
    const { container } = render(<OrderLogLimitFeatureCheck checked={false} onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: '상한가 특징' });
    expect(box).not.toBeChecked();
    const chip = container.querySelector('[data-slot="order-log-check-limit-feature"]')!;
    expect(chip.tagName).toBe('LABEL');
    expect(chip.hasAttribute('data-on')).toBe(false);
    expect(chip.className).toContain('border-[var(--border-subtle)]');
    expect(chip.className).toContain('whitespace-nowrap');
    expect(chip.textContent).toBe('상한가 특징'); // 화살표 ▾ 없음
    await userEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith(true);
    box.focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('켜짐 → data-on · Accent 자리 1(테두리 --primary · 면 --accent · 글자 --accent-fg) · 체크 색 --primary · 끄면 onChange(false)', async () => {
    const onChange = vi.fn();
    const { container } = render(<OrderLogLimitFeatureCheck checked onChange={onChange} />);
    const chip = container.querySelector('[data-slot="order-log-check-limit-feature"]')!;
    expect(chip.hasAttribute('data-on')).toBe(true);
    for (const c of ['border-[var(--primary)]', 'bg-[var(--accent)]', 'text-[var(--accent-fg)]']) expect(chip.className).toContain(c);
    const box = screen.getByRole('checkbox', { name: '상한가 특징' });
    expect(box).toBeChecked();
    expect(box.className).toContain('accent-[var(--primary)]');
    await userEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('필터줄 순서: 종목 · 거래소 · 구분 · 「상한가 특징」 · N건 — 토글은 onShowLimitFeatureChange', async () => {
    const onToggle = vi.fn();
    const { container } = render(
      <OrderLogFilters
        filters={DEFAULT_ORDER_LOG_FILTERS}
        onChange={vi.fn()}
        stockOptions={STOCKS}
        count={7}
        onPopout={vi.fn()}
        showLimitFeature={false}
        onShowLimitFeatureChange={onToggle}
      />,
    );
    const bar = container.querySelector('[data-slot="order-log-filters"]')!;
    const order = [...bar.children].map((el) => el.getAttribute('data-slot'));
    expect(order).toEqual([
      'order-log-chip',
      'order-log-chip',
      'order-log-chip',
      'order-log-check-limit-feature',
      'order-log-count',
      'order-log-popout',
    ]);
    expect(bar.className).toContain('flex-wrap');
    await userEvent.click(screen.getByRole('checkbox', { name: '상한가 특징' }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
