import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { a3Msg, b6Msg, inversionSession, synthSession } from '@/test-fixtures/tick-synth';

import { TickOrderCard } from '../tick-order-card';

/**
 * Phase 37 Plan 13 Task 3 — 「이 주문」 카드: 주문 안/밖 · 역전 ↕ · 진행 중 · 최근 주문 10건(행 클릭 = 마지막 조각).
 * 합성 하루(inversionSession): 주문 0 = 팀 SMP 3조각(rec 2~4 · 닫는 B6 rec 1 이 9.0ms 먼저) · 주문 1 = 1조각 매도(rec 5 · B6 rec 6).
 */

const s = inversionSession();

describe('TickOrderCard', () => {
  it('주문 안(가운데 조각) — 모양 · 조각 · 단 · 수량 · 금액 · 지속 · seq · 닫는 B6 ↕', () => {
    const { container } = render(<TickOrderCard session={s} cursorRec={3} onJump={() => {}} />);
    const card = container.querySelector('[data-slot="tick-order-this"]')!;
    expect(card.getAttribute('data-order')).toBe('0');
    expect(card.textContent).toContain('팀 SMP');
    expect(card.textContent).toContain('매수');
    expect(card.textContent).toContain('3조각');
    expect(card.textContent).toContain('1단');
    expect(card.textContent).toContain('600');
    expect(card.textContent).toContain('984만');
    expect(card.textContent).toContain('264');
    expect(card.querySelector('[data-slot="tick-order-seq"]')!.textContent).toContain('seq 101~103 · 닫는 B6 104');
    expect(card.querySelector('[data-slot="tick-order-inv"]')!.textContent).toBe(
      '↕ 닫는 B6 가 마지막 조각보다 9.0ms 먼저 수신',
    );
    expect(container.querySelector('[data-slot="tick-order-open"]')).toBeNull();
    // 커서가 주문 가운데 — 최근 표 맨 위가 그 주문(선택 표시)
    const rows = container.querySelectorAll('[data-slot="tick-order-recent-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('닫는 B6 행도 그 주문 · 최근 주문 최신 먼저', () => {
    const { container } = render(<TickOrderCard session={s} cursorRec={6} onJump={() => {}} />);
    expect(container.querySelector('[data-slot="tick-order-this"]')!.getAttribute('data-order')).toBe('1');
    expect(container.querySelector('[data-slot="tick-order-this"]')!.textContent).toContain('매도');
    const ids = Array.from(container.querySelectorAll('[data-slot="tick-order-recent-row"]'), (r) =>
      r.getAttribute('data-order'),
    );
    expect(ids).toEqual(['1', '0']);
    expect(container.textContent).toContain('최근 주문 2건');
  });

  it('주문 밖 전문 — 「주문 밖 전문」 + 최근 표 · 행 클릭 = 그 주문 마지막 조각', () => {
    const onJump = vi.fn();
    const { container, getByText } = render(<TickOrderCard session={s} cursorRec={7} onJump={onJump} />);
    expect(getByText('주문 밖 전문')).toBeTruthy();
    const rows = container.querySelectorAll('[data-slot="tick-order-recent-row"]');
    fireEvent.click(rows[1]!);
    expect(onJump).toHaveBeenCalledWith(4);
    // 역전 주문은 조각 칸에 ↕
    expect(rows[1]!.textContent).toContain('↕');
  });

  it('진행 중 — 스트림 끝 열린 주문', () => {
    const open = synthSession([
      [0, b6Msg({ seq: 10, ask1: [1000, 1], bid1: [990, 1] })],
      [1, a3Msg({ seq: 11, bs: '2', px: 1000, qty: 5, a1: 1000, b1: 990 })],
      [2, a3Msg({ seq: 12, bs: '2', px: 1005, qty: 5, a1: 1005, b1: 1000 })],
    ]);
    const { container } = render(<TickOrderCard session={open} cursorRec={2} onJump={() => {}} />);
    expect(container.querySelector('[data-slot="tick-order-open"]')?.textContent).toBe('진행 중');
    expect(container.querySelector('[data-slot="tick-order-seq"]')!.textContent).toContain('닫는 B6 아직 없음');
  });

  it('최근 주문은 10건까지', () => {
    const msgs: [number, Uint8Array][] = [];
    for (let i = 0; i < 12; i++) {
      msgs.push([i * 2, a3Msg({ seq: 100 + i * 2, bs: '1', px: 1000, qty: 1, a1: 1005, b1: 1000 })]);
      msgs.push([i * 2 + 1, b6Msg({ seq: 101 + i * 2, ask1: [1005, 1], bid1: [1000, 1] })]);
    }
    const many = synthSession(msgs);
    const { container } = render(<TickOrderCard session={many} cursorRec={23} onJump={() => {}} />);
    expect(container.querySelectorAll('[data-slot="tick-order-recent-row"]')).toHaveLength(10);
    expect(container.textContent).toContain('최근 주문 10건');
  });
});
