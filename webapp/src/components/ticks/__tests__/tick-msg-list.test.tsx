import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { a3TimeMs, type TickOwnFill, type TickOwnResponse } from '@gh-radar/shared';

import { buildOwnModel, type OwnModel } from '@/lib/ticks/own-model';
import type { TickSession } from '@/lib/ticks/tick-session';
import type { TickOrderMode } from '@/lib/ticks/use-tick-cursor';
import { a3Msg, inversionSession, synthSession, SYNTH_DATE, SYNTH_ISIN } from '@/test-fixtures/tick-synth';

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

/**
 * Phase 38 Plan 01 — 우리 체결 칩(D-04 · D-15). 세션 A3 열 + `GET /api/ticks/own` 응답 → `buildOwnModel`(shared
 * `matchOwnFills`) → 전문 목록 A3 행 민트 바탕(`data-own="1"`) + 「n/m」 칩 · 추정 칩. own 이 없으면 지금과 같은 DOM.
 */
describe('TickMsgList — 우리 체결 칩(Phase 38)', () => {
  // rec 0~2 = A3 세 행(체결 시각 13:00:00.100 · .200 · .300)
  const ownSession = synthSession([
    [100.5, a3Msg({ seq: 201, bs: '2', px: 16400, qty: 1064, time: '130000100000' })],
    [200.5, a3Msg({ seq: 202, bs: '2', px: 16400, qty: 500, time: '130000200000' })],
    [300.5, a3Msg({ seq: 203, bs: '1', px: 16450, qty: 10, time: '130000300000' })],
  ]);

  function fill(seq: number, gwMs: number, px: number, qty: number): TickOwnFill {
    return {
      gateway: 'KB120',
      seq,
      gw_time_ms: gwMs,
      account_no: '1234563801',
      order_no: `00003801${seq}`,
      side: 'B',
      exec_price: px,
      exec_qty: qty,
    };
  }
  function ownOf(fills: TickOwnFill[]): TickOwnResponse {
    return {
      access: true,
      date: SYNTH_DATE,
      exchange: 'KRX',
      isin: SYNTH_ISIN,
      servers: ['KB120', 'KYOBO119'],
      fills,
      events: [],
      orders: [],
    };
  }
  const tA3 = (sess: TickSession, j: number) => a3TimeMs(sess.index, sess.a3, j);

  function render1(sess: TickSession, own: OwnModel | null) {
    return render(
      <TickMsgList session={sess} cursorRec={-1} onSelect={() => {}} mode="exchange" onMode={() => {}} own={own} />,
    );
  }
  const chipOf = (c: HTMLElement, rec: number) =>
    rowOf(c, rec)?.querySelector('[data-slot="tick-own-chip"]')?.textContent ?? null;

  it('부분 체결 「300/1,064」 · 전량 「500」 · 짝 없는 A3 칩 없음 · data-own 2행', () => {
    const own = buildOwnModel(
      ownSession,
      ownOf([fill(1, tA3(ownSession, 0) + 30, 16400, 300), fill(2, tA3(ownSession, 1) + 10, 16400, 500)]),
    );
    const { container } = render1(ownSession, own);
    expect(chipOf(container, 0)).toBe('300/1,064');
    expect(chipOf(container, 1)).toBe('500');
    expect(chipOf(container, 2)).toBeNull();
    expect(container.querySelectorAll('[data-own="1"]')).toHaveLength(2);
    expect(rowOf(container, 0)?.getAttribute('data-own')).toBe('1');
    expect(container.querySelector('[data-slot="tick-own-est"]')).toBeNull();
    // 계좌 · 주문번호 글자는 행에 없다(D-02)
    expect(container.textContent).not.toContain('1234563801');
  });

  it('own null — 칩 · data-own 0(지금과 같은 DOM)', () => {
    const { container } = render1(ownSession, null);
    expect(container.querySelector('[data-slot="tick-own-chip"]')).toBeNull();
    expect(container.querySelector('[data-own]')).toBeNull();
  });

  it('같은 가격 · 같은 수량 A3 둘이 gw 기준 15ms · 10ms — 가까운 쪽에 붙고 점선 「추정」 칩', () => {
    const sess = synthSession([
      [100.5, a3Msg({ seq: 301, bs: '2', px: 16400, qty: 100, time: '130000100000' })],
      [105.5, a3Msg({ seq: 302, bs: '1', px: 16400, qty: 100, time: '130000105000' })],
    ]);
    const own = buildOwnModel(sess, ownOf([fill(1, tA3(sess, 0) + 15, 16400, 100)]));
    expect(own.fills[0]!.est).toBe(true);
    const { container } = render1(sess, own);
    expect(chipOf(container, 0)).toBeNull();
    expect(chipOf(container, 1)).toBe('100');
    expect(rowOf(container, 1)?.querySelector('[data-slot="tick-own-est"]')?.textContent).toBe('추정');
  });
});
