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

describe('TickAmountCard — 시총 대비 · 팀 비중 한 줄(스케치 022 ①)', () => {
  /** 팀 매수 3조각 984만 · 일반 50주 · 팀 매도 652만(tick-chart.test.tsx 와 같은 하루). */
  const t = synthSession([
    [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
    [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000', cumValue: 1_640_000 })],
    [1.1, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 200, time: '130000001100', cumValue: 4_920_000 })],
    [1.2, a3Msg({ seq: 103, bs: '2', px: 16400, qty: 300, time: '130000001200', cumValue: 9_840_000 })],
    [1.5, b6Msg({ seq: 104, ask1: [16450, 10], bid1: [16400, 20] })],
    [2, a3Msg({ seq: 105, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000002000', cumValue: 10_657_500 })],
    [2.5, b6Msg({ seq: 106, ask1: [16400, 1], bid1: [16350, 2] })],
    [5, a3Msg({ seq: 107, bs: '1', px: 16300, qty: 400, time: '130000005000', cumValue: 17_177_500 })],
    [5.5, b6Msg({ seq: 108, ask1: [16400, 1], bid1: [16300, 2] })],
  ]);
  const last = t.index.n - 1;
  const line = (c: HTMLElement) => c.querySelector('[data-slot="tick-amount-share"]')?.textContent;

  it('상장주식수 없음 → 팀 금액 · 비중 · 매수/매도만', () => {
    const { container } = render(<TickAmountCard session={t} cursorRec={last} />);
    expect(line(container)).toBe('팀 1,636만 95.2% (매수 984만 · 매도 652만)');
  });

  it('상장주식수 → 앞에 「시총 대비 n.n%」(누적 거래대금 ÷ 기준가 × 상장주식수)', () => {
    const { container } = render(<TickAmountCard session={t} cursorRec={last} listingShares={1_000} />);
    const pct = `${(Math.round((17_177_500 / (t.basePx! * 1_000)) * 1000) / 10).toFixed(1)}%`;
    expect(line(container)).toBe(`시총 대비 ${pct} · 팀 1,636만 95.2% (매수 984만 · 매도 652만)`);
  });

  it('팀 체결이 없는 세션 → 「팀 체결 없음」', () => {
    const plain = synthSession([
      [0, b6Msg({ seq: 1, ask1: [16400, 10], bid1: [16350, 10] })],
      [1, a3Msg({ seq: 2, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000001000' })],
      [2, b6Msg({ seq: 3, ask1: [16400, 10], bid1: [16350, 5] })],
    ]);
    expect(plain.team.fills).toHaveLength(0);
    const { container } = render(<TickAmountCard session={plain} cursorRec={2} />);
    expect(line(container)).toBe('팀 체결 없음');
  });
});
