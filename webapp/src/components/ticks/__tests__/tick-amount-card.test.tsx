import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { a3Msg, b6Msg, synthSession } from '@/test-fixtures/tick-synth';

import { TickAmountCard } from '../tick-amount-card';

/**
 * Phase 37 Plan 13 Task 3 — 「거래대금」 카드: 커서 이하 마지막 A3 의 cum_value · 체결가 · 등락률(기준가 최빈값) · 누적 거래량.
 */

const s = synthSession([
  [0, b6Msg({ seq: 1, ask1: [16400, 1], bid1: [16350, 1] })],
  [1, a3Msg({ seq: 2, bs: '2', px: 16400, qty: 10, pct: '2', chg: 1000, cumValue: 123_456_789, cumVolume: 7_890 })],
  [2, b6Msg({ seq: 3, ask1: [16450, 1], bid1: [16400, 1] })],
  [3, a3Msg({ seq: 4, bs: '1', px: 15300, qty: 10, pct: '5', chg: 100, cumValue: 130_000_000, cumVolume: 8_000 })],
]);

describe('TickAmountCard', () => {
  it('A3 앞 — 아직 체결 없음', () => {
    const { container } = render(<TickAmountCard session={s} cursorRec={0} />);
    expect(container.querySelector('[data-slot="tick-amount-empty"]')?.textContent).toBe('아직 체결 없음');
  });

  it('커서 이하 마지막 A3 — cum_value 축약 · 현재가 · 등락률(기준가 15,400) · 누적 거래량', () => {
    const { container } = render(<TickAmountCard session={s} cursorRec={2} />);
    expect(s.basePx).toBe(15_400);
    expect(container.querySelector('[data-slot="tick-amount-value"]')?.textContent).toBe('1.23억');
    expect(container.querySelector('[data-slot="tick-amount-px"]')?.textContent).toBe('16,400');
    expect(container.querySelector('[data-slot="tick-amount-rate"]')?.textContent).toBe('+6.5%');
    expect(container.querySelector('[data-slot="tick-amount-vol"]')?.textContent).toBe('7,890');
  });

  it('다음 A3 로 — 값이 따라 바뀐다 · 하락은 −', () => {
    const { container } = render(<TickAmountCard session={s} cursorRec={3} />);
    expect(container.querySelector('[data-slot="tick-amount-value"]')?.textContent).toBe('1.30억');
    expect(container.querySelector('[data-slot="tick-amount-rate"]')?.textContent).toBe('−0.6%');
    expect(container.querySelector('[data-slot="tick-amount-vol"]')?.textContent).toBe('8,000');
  });
});
