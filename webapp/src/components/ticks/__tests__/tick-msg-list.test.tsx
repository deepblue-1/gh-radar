import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import type { TickOrderMode } from '@/lib/ticks/use-tick-cursor';
import { inversionSession } from '@/test-fixtures/tick-synth';

import { TickMsgList } from '../tick-msg-list';

/**
 * Phase 37 Plan 13 Task 2 — 전문 목록 뒤집힘 표현 3(수신순 토글 · ↕ · 점선 거래소순 자리 · 다음 역전) · 기타 · 중복 행.
 */

const s = inversionSession();

// jsdom 은 배치가 없다 — 목록 스크롤 칸 높이만 600px 로 둔다(그 밖은 0).
let restore: PropertyDescriptor | undefined;
beforeAll(() => {
  restore = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('data-slot') === 'tick-msg-scroll' ? 600 : 0;
    },
  });
});
afterAll(() => {
  if (restore) Object.defineProperty(HTMLElement.prototype, 'clientHeight', restore);
});

function Harness({ initial = 0 }: { initial?: number }) {
  const [rec, setRec] = useState(initial);
  const [mode, setMode] = useState<TickOrderMode>('exchange');
  return (
    <>
      <output data-testid="cursor">{rec}</output>
      <TickMsgList session={s} cursorRec={rec} onSelect={setRec} mode={mode} onMode={setMode} />
    </>
  );
}

const rowOf = (c: HTMLElement, rec: number) =>
  c.querySelector<HTMLElement>(`[data-slot="tick-msg-row"][data-rec="${rec}"]`);
const cursor = () => Number(screen.getByTestId('cursor').textContent);

describe('TickMsgList — 뒤집힘 3', () => {
  it('거래소순(기본) — 먼저 온 B6 행 seq ↕ · 「↕ 수신은 9.0ms 먼저」 · 꼬리 줄 같은 말 · 점선 자리 없음', () => {
    const { container } = render(<Harness />);
    const b6 = rowOf(container, 1);
    expect(b6).not.toBeNull();
    expect(b6!.textContent).toContain('닫는 B6');
    expect(b6!.textContent).toContain('↕ 수신은 9.0ms 먼저');
    expect(b6!.querySelector('[data-slot="tick-msg-inv-mark"]')).not.toBeNull();
    const tail = container.querySelector('[data-slot="tick-msg-tail"]');
    expect(tail?.textContent).toContain('┗ 3조각 1단');
    expect(tail?.textContent).toContain('· 닫는 B6 ↕ 9.0ms 먼저');
    expect(container.querySelector('[data-slot="tick-msg-slot"]')).toBeNull();
  });

  it('수신순 토글 — 커서 rec 유지 · 점선 「⋯ 거래소순 자리」 줄 · 클릭 = 그 B6 선택', () => {
    const { container } = render(<Harness initial={4} />);
    fireEvent.click(screen.getByRole('button', { name: '수신순' }));
    expect(cursor()).toBe(4);
    expect(rowOf(container, 4)?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-slot="tick-msg"]')?.getAttribute('data-mode')).toBe('recv');
    const slot = container.querySelector<HTMLElement>('[data-slot="tick-msg-slot"]');
    expect(slot).not.toBeNull();
    expect(slot!.textContent).toContain('⋯ 거래소순 자리 — 이 B6 는 9.0ms 먼저 수신돼 위 4행에 있음');
    expect(rowOf(container, 1)!.textContent).toContain('↕ 9.0ms 먼저 수신');
    fireEvent.click(slot!);
    expect(cursor()).toBe(1);
  });

  it('「↕ 다음 역전」 — 커서 뒤 첫 역전 B6 로 · 더 없으면 비활성', () => {
    render(<Harness initial={0} />);
    const btn = screen.queryByRole('button', { name: '↕ 다음 역전' });
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    expect(cursor()).toBe(1);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('기타 · 중복 · R8 · B9 행 문구', () => {
    const { container } = render(<Harness initial={12} />);
    const raw = rowOf(container, 12);
    expect(raw?.getAttribute('data-tag')).toBe('기타');
    expect(raw?.textContent).toContain('기타 · A3 · 01S · 150B');
    expect(rowOf(container, 13)?.querySelector('[data-slot="tick-msg-dup"]')?.textContent).toBe('중복');
    expect(rowOf(container, 9)?.textContent).toContain('VI 발동(정적) 기준가 16,400');
    expect(rowOf(container, 7)?.textContent).toContain('거래원 매수1 교보 3,400');
  });

  it('행 클릭 = 그 틱 선택 · 꼬리 클릭 = 그 주문 마지막 조각', () => {
    const { container } = render(<Harness initial={0} />);
    fireEvent.click(rowOf(container, 5)!);
    expect(cursor()).toBe(5);
    fireEvent.click(container.querySelector('[data-slot="tick-msg-tail"]')!);
    expect(cursor()).toBe(4);
  });
});
