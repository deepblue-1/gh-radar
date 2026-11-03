import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { a3TimeMs, type TickOwnEvent, type TickOwnFill, type TickOwnResponse } from '@gh-radar/shared';

import { buildMsgRows } from '@/lib/ticks/msg-rows';
import { buildOwnModel, type OwnModel, type OwnSel } from '@/lib/ticks/own-model';
import { buildTickSession, type TickSession } from '@/lib/ticks/tick-session';
import { TICK_FIXTURE_DATE, TICK_FIXTURE_ISIN, tickGridBytes } from '@/test-fixtures/tick-grid';
import type { TickOrderMode } from '@/lib/ticks/use-tick-cursor';
import { a3Msg, b6Msg, inversionSession, synthNs, synthSession, SYNTH_DATE, SYNTH_ISIN } from '@/test-fixtures/tick-synth';

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
    // 팀 주문 꼬리 줄 — 직전 팀 간격 · 주문 전 매도비중(스케치 024 C · 025)
    expect(tail!.querySelector('[data-slot="tick-team-meta"]')!.textContent).toMatch(/^ · 그날 첫 팀 주문 · 주문 전 매도비중 총 (—|\d+%) · 1호 70%$/);
    // 1호 매도 열(스케치 025 A) — 모든 전문 행 · B6 행은 자기 값
    const l1 = (rec: number) => rowOf(container, rec)!.querySelector('[data-slot="tick-msg-l1"]')!.textContent;
    expect(l1(0)).toBe('70%'); // B6 100 — 283 ÷ (283 + 121)
    expect(l1(2)).toBe('70%'); // A3 101 — 거래소순 직전 B6 100 을 이어받음
    expect(l1(1)).toBe('33%'); // 닫는 B6 104 — 10 ÷ 30
    expect(l1(7)).toBe('33%'); // B9 — 보드 없는 행도 직전 보드 값
    expect(rowOf(container, 1)!.querySelector('[data-slot="tick-msg-l1"]')!.className).toContain('font-semibold');
    expect(rowOf(container, 2)!.querySelector('[data-slot="tick-msg-l1"]')!.className).not.toContain('font-semibold');
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

/**
 * Phase 38 Plan 04 — 주문 줄 · 짝 없음 줄 · 둘째 레일 · 줄 선택 · 대기(D-04 · D-05 · D-10 · D-12 · Pitfall 4).
 */
describe('TickMsgList — 우리 줄 · 둘째 레일(Phase 38-04)', () => {
  // rec 0 = A3 201(.100 · 1,064) · rec 1 = A3 211(.200 · 500) · rec 2 = B6(수신 3.0005s)
  const sess = synthSession([
    [100.5, a3Msg({ seq: 201, bs: '2', px: 16400, qty: 1064, time: '130000100000' })],
    [200.5, a3Msg({ seq: 211, bs: '1', px: 16400, qty: 500, time: '130000200000' })],
    [3000.5, b6Msg({ seq: 221, ask1: [16450, 10], bid1: [16400, 20] })],
  ]);
  const at = (ms: number) => Number(synthNs(ms) / 1_000_000n);
  const tA3 = (j: number) => a3TimeMs(sess.index, sess.a3, j);

  function ev(orderNo: string, gwMs: number): TickOwnEvent {
    return {
      gateway: 'KB120', seq: 1, gw_time_ms: gwMs, kind: 3, group: 7, account_no: '1234563801', order_no: orderNo,
      price: 16400, qty: 300, reason_code: '', cond_metric: 0, cond_threshold: 0, cond_actual: 0, ev_kind: 0, ev_price: 0,
      ev_qty_before: 0, ev_qty_after: 0, ev_trade_qty: 0, cum_volume: 0,
    };
  }
  function fl(orderNo: string, gwMs: number, px: number, qty: number, seq: number): TickOwnFill {
    return { gateway: 'KB120', seq, gw_time_ms: gwMs, account_no: '1234563801', order_no: orderNo, side: 'B', exec_price: px, exec_qty: qty };
  }
  function modelOf(fills: TickOwnFill[], events: TickOwnEvent[], live = false): OwnModel {
    return buildOwnModel(
      sess,
      { access: true, date: SYNTH_DATE, exchange: 'KRX', isin: SYNTH_ISIN, servers: ['KB120'], fills, events, orders: [] },
      { live },
    );
  }
  // 주문 O(.050 · 수동) → A3 201 에 300주 · 짝 없는 체결 N(.150 · 7주)
  const own = modelOf([fl('O', tA3(0) + 30, 16400, 300, 1), fl('N', at(150), 99_999, 7, 2)], [ev('O', at(50))]);

  /** 뷰어와 같은 선택 결선 — ownPick(줄 + rec) · 커서가 그 rec 일 때만 선택(파생). */
  function Viewerish({ model, spy }: { model: OwnModel | null; spy?: (sel: OwnSel, rec: number) => void }) {
    const [rec, setRec] = useState(-1);
    const [pick, setPick] = useState<{ sel: OwnSel; rec: number } | null>(null);
    return (
      <>
        <output data-testid="cursor">{rec}</output>
        <TickMsgList
          session={sess}
          cursorRec={rec}
          onSelect={setRec}
          mode="exchange"
          onMode={() => {}}
          own={model}
          ownSel={pick !== null && pick.rec === rec ? pick.sel : null}
          onOwnSelect={(sel, r) => {
            spy?.(sel, r);
            setPick({ sel, rec: r });
            setRec(r);
          }}
        />
      </>
    );
  }
  const orderLine = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-slot="tick-own-order"]');
  const nofillLine = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-slot="tick-own-nofill"]');
  const nodeOf = (el: Element | null) => el?.querySelector('[data-slot="tick-own-rail"]')?.getAttribute('data-node') ?? null;

  it('레일 칸 수 = 보이는 행 수 · ● 주문 줄 · ◆ 짝 A3 행 · ◇ 짝 없음 줄 · 주문 줄 문구', () => {
    const { container } = render(<Viewerish model={own} />);
    const options = container.querySelectorAll('[role="option"]');
    expect(options.length).toBe(5); // O · R201 · N · R211 · R221
    expect(container.querySelectorAll('[data-slot="tick-own-rail"]')).toHaveLength(options.length);
    expect(nodeOf(orderLine(container))).toBe('order');
    expect(nodeOf(rowOf(container, 0))).toBe('fill');
    expect(nodeOf(nofillLine(container))).toBe('nofill');
    expect(nodeOf(rowOf(container, 1))).toBeNull();
    expect(orderLine(container)!.textContent).toContain('● 주문 수동 매수 16,400 ×300 · 조건 없음 · 수동 주문 · KB120 ···3801 #O');
    expect(nofillLine(container)!.textContent).toContain('◆ 우리 체결 7주 · 짝 전문 없음');
    expect(nofillLine(container)!.getAttribute('data-pending')).toBeNull();
    // 머리 행에도 빈 레일 칸(열 수 맞춤) — 계좌 번호 전체는 어디에도 없다(D-02)
    expect(container.textContent).not.toContain('1234563801');
  });

  it('주문 줄 클릭 → onOwnSelect({order, id}, 다음 전문 rec) · 선택 표시 · ←/→ 같은 커서 이동이면 풀린다', () => {
    const calls: [OwnSel, number][] = [];
    const { container } = render(<Viewerish model={own} spy={(sel, r) => calls.push([sel, r])} />);
    fireEvent.click(orderLine(container)!);
    expect(calls).toEqual([[{ kind: 'order', id: 0 }, 0]]);
    expect(cursor()).toBe(0);
    expect(orderLine(container)!.getAttribute('aria-selected')).toBe('true');
    expect(orderLine(container)!.className).toContain('var(--mine)_18%');
    // 짝 없음 줄 클릭 = 그 줄(fill id) · 기준 전문 = 다음 A3 211
    fireEvent.click(nofillLine(container)!);
    expect(calls[1]).toEqual([{ kind: 'fill', id: 1 }, 1]);
    expect(orderLine(container)!.getAttribute('aria-selected')).toBe('false');
    expect(nofillLine(container)!.getAttribute('aria-selected')).toBe('true');
    // 다른 행으로 커서 → 선택 해제(파생)
    fireEvent.click(rowOf(container, 2)!);
    expect(nofillLine(container)!.getAttribute('aria-selected')).toBe('false');
  });

  it('당일 대기 — 마지막 수신 직전 체결은 「전문 아직 안 옴」 · ◇ 점선 테두리', () => {
    const live = modelOf([fl('P', at(2900), 99_999, 3, 1)], [], true);
    expect(live.fills[0]!.state).toBe('pending');
    const { container } = render(<Viewerish model={live} />);
    const line = nofillLine(container)!;
    expect(line.textContent).toContain('◆ 우리 체결 3주 · 전문 아직 안 옴');
    expect(line.getAttribute('data-pending')).toBe('1');
    expect(nodeOf(line)).toBe('nofill');
    expect(line.querySelector('[data-slot="tick-own-rail"] .border-dashed')).not.toBeNull();
  });

  it('own 없음 — 레일 칸은 있지만 마디 · 선 0 · 우리 줄 0', () => {
    const { container } = render(<Viewerish model={null} />);
    const options = container.querySelectorAll('[role="option"]');
    expect(container.querySelectorAll('[data-slot="tick-own-rail"]')).toHaveLength(options.length);
    expect(container.querySelector('[data-slot="tick-own-rail"][data-node]')).toBeNull();
    expect(container.querySelector('[data-slot="tick-own-rail"] *')).toBeNull();
    expect(orderLine(container)).toBeNull();
    expect(nofillLine(container)).toBeNull();
  });

  it('38-06 — 근거 B6 행 ○ 마디(data-node evidence) · 근거 행에 칩 없음', () => {
    // 호가 근거: 창 [g − 3000, g + 50] 안 B6 rec 2(매수1 16,400 ×20)
    const withEv = modelOf(
      [],
      [{ ...ev('E', at(3000)), ev_kind: 1, ev_price: 16400, ev_qty_after: 20 }],
    );
    expect(withEv.orders[0]!.evidenceRec).toBe(2);
    const { container } = render(<Viewerish model={withEv} />);
    const row = rowOf(container, 2)!;
    expect(nodeOf(row)).toBe('evidence');
    expect(row.textContent).not.toContain('주문 #');
    expect(orderLine(container)!.textContent).toContain('· 근거 호가 ↑ ·');
  });

  it('38-06 — rows prop 을 주면 목록이 스스로 만들지 않고 그것을 쓴다', () => {
    const plain = buildMsgRows(sess, 'exchange');
    const { container } = render(
      <TickMsgList session={sess} cursorRec={-1} onSelect={() => {}} mode="exchange" onMode={() => {}} own={own} rows={plain} />,
    );
    // own 이 있어도 넘긴 항목(우리 줄 없음)을 그린다
    expect(orderLine(container)).toBeNull();
    const shared = buildMsgRows(sess, 'exchange', own);
    const r2 = render(
      <TickMsgList session={sess} cursorRec={-1} onSelect={() => {}} mode="exchange" onMode={() => {}} own={own} rows={shared} />,
    );
    expect(orderLine(r2.container)).not.toBeNull();
    expect(r2.container.querySelectorAll('[role="option"]').length).toBe(shared.items.length);
  });

  it('모델만 바뀌면(증분 · own 재조회) 훑던 스크롤을 커서 행으로 끌어오지 않는다 · 순서 토글은 가운데로(IN-63)', () => {
    const big = buildTickSession(tickGridBytes(), { date: TICK_FIXTURE_DATE, ex: 'KRX', isin: TICK_FIXTURE_ISIN });
    const tops = new WeakMap<Element, number>();
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get(this: Element) {
        return tops.get(this) ?? 0;
      },
      set(this: Element, v: number) {
        tops.set(this, v);
      },
    });
    try {
      const rec = big.exOrder[6_000]!;
      const props = { session: big, cursorRec: rec, onSelect: () => {}, onMode: () => {} };
      const v = render(<TickMsgList {...props} mode="exchange" rows={buildMsgRows(big, 'exchange')} />);
      const el = v.container.querySelector<HTMLElement>('[data-slot="tick-msg-scroll"]')!;
      expect(el.scrollTop).toBeGreaterThan(0); // 처음 = 가운데
      el.scrollTop = 0; // 사용자가 맨 위로 훑었다
      v.rerender(<TickMsgList {...props} mode="exchange" rows={buildMsgRows(big, 'exchange')} />);
      expect(el.scrollTop).toBe(0);
      v.rerender(<TickMsgList {...props} mode="recv" rows={buildMsgRows(big, 'recv')} />);
      expect(el.scrollTop).toBeGreaterThan(0); // 순서 토글 = 가운데
    } finally {
      if (desc) Object.defineProperty(Element.prototype, 'scrollTop', desc);
    }
  });
});
