import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import {
  a3TimeMs,
  conditionTextOf,
  type TickOwnEvent,
  type TickOwnFill,
  type TickOwnResponse,
} from '@gh-radar/shared';

import { buildOwnModel } from '@/lib/ticks/own-model';
import { a3Msg, b6Msg, inversionSession, synthNs, synthSession, SYNTH_DATE, SYNTH_ISIN } from '@/test-fixtures/tick-synth';

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

/**
 * Phase 38 Plan 06 Task 2 — 「우리 주문」(D-07 ①~③ · D-10 · D-13). 합성 하루:
 *  rec 0 A3 .100(16,400 ×100 · cum 1,000) · rec 1 B6 .150(매도1 16,400 ×38,200) · rec 2 A3 .250(16,400 ×200 · cum 1,200) ·
 *  rec 3 A3 .260(16,400 ×300 · cum 1,500) · rec 4 A3 .300(16,450 ×50 · cum 1,550) · rec 5 B6 .400
 * 주문(id 순): 0 「B6」 호가 근거 rec 1 · 앵커 rec 0 · 체결 300 → rec 3(전량) · 1 「ES」 체결만 100 → rec 2(부분 100/200 · 추정 · 후보 3) ·
 *  2 「RG」 구간 근거 rec 2 … rec 4 · 체결 없음 · 3 「MN」 수동 · 짝 없는 체결 1주.
 * 깨지면: 카드에서 우리 주문을 못 찾거나 · 근거로 갔다가 돌아오지 못하거나 · 표 캡션이 켜진 서버와 갈린다.
 */
describe('TickOrderCard — 우리 주문(Phase 38)', () => {
  const es = synthSession([
    [100.5, a3Msg({ seq: 401, bs: '2', px: 16400, qty: 100, time: '130000100000', cumVolume: 1000 })],
    [150.5, b6Msg({ seq: 411, ask1: [16400, 38_200], bid1: [16350, 10] })],
    [250.5, a3Msg({ seq: 421, bs: '2', px: 16400, qty: 200, time: '130000250000', cumVolume: 1200 })],
    [260.5, a3Msg({ seq: 431, bs: '2', px: 16400, qty: 300, time: '130000260000', cumVolume: 1500 })],
    [300.5, a3Msg({ seq: 441, bs: '2', px: 16450, qty: 50, time: '130000300000', cumVolume: 1550 })],
    [400.5, b6Msg({ seq: 451, ask1: [16450, 10], bid1: [16400, 20] })],
  ]);
  const at = (ms: number) => Number(synthNs(ms) / 1_000_000n);
  const eA3 = (j: number) => a3TimeMs(es.index, es.a3, j);

  function ev(orderNo: string, gwMs: number, over: Partial<TickOwnEvent> = {}): TickOwnEvent {
    return {
      gateway: 'KB120', seq: 1, gw_time_ms: gwMs, kind: 3, group: 1, account_no: '1234563801', order_no: orderNo,
      price: 16400, qty: 300, reason_code: 'PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)', cond_metric: 1,
      cond_threshold: 50_000, cond_actual: 38_200, ev_kind: 0, ev_price: 0, ev_qty_before: 0, ev_qty_after: 0,
      ev_trade_qty: 0, cum_volume: 0, ...over,
    };
  }
  function fl(orderNo: string, gwMs: number, px: number, qty: number, seq: number): TickOwnFill {
    return { gateway: 'KB120', seq, gw_time_ms: gwMs, account_no: '1234563801', order_no: orderNo, side: 'B', exec_price: px, exec_qty: qty };
  }
  function ownOf(events: TickOwnEvent[], fills: TickOwnFill[]): TickOwnResponse {
    return { access: true, date: SYNTH_DATE, exchange: 'KRX', isin: SYNTH_ISIN, servers: ['KB120', 'KYOBO119'], fills, events, orders: [] };
  }
  const events = [
    ev('B6', at(200), { ev_kind: 1, ev_price: 16400, ev_qty_before: 52_100, ev_qty_after: 38_200, cum_volume: 1000 }),
    ev('RG', at(350), { ev_kind: 2, ev_price: 16400, ev_trade_qty: 999, ev_qty_before: 1000, ev_qty_after: 1550 }),
    ev('MN', at(380), { group: 7, cond_metric: 0, cond_threshold: 0, cond_actual: 0, reason_code: '' }),
  ];
  const fills = [
    fl('ES', eA3(1) + 3, 16400, 100, 1),
    fl('B6', eA3(2) + 5, 16400, 300, 2),
    fl('MN', at(390), 99_999, 1, 3),
  ];
  const own = buildOwnModel(es, ownOf(events, fills));

  function renderCard(cursorRec: number, extra: Partial<Parameters<typeof TickOrderCard>[0]> = {}) {
    const cb = { onJump: vi.fn(), onOwnJump: vi.fn(), onOwnBack: vi.fn(), onOwnOrder: vi.fn() };
    const r = render(<TickOrderCard session={es} cursorRec={cursorRec} own={own} {...cb} {...extra} />);
    return { ...r, cb };
  }
  const q = (root: ParentNode, slot: string) => root.querySelector(`[data-slot="${slot}"]`);
  const line = (sec: Element, k: string) => sec.querySelector(`[data-slot="tick-own-line"][data-k="${k}"]`);

  it('모델 전제 — 주문 순서 · 짝 · 추정 · 근거', () => {
    expect(own.orders.map((o) => o.orderNo)).toEqual(['B6', 'ES', 'RG', 'MN']);
    expect(own.fills.map((f) => [f.orderNo, f.rec, f.est, f.candidates, f.state])).toEqual([
      ['ES', 2, true, 3, 'matched'],
      ['B6', 3, false, 1, 'matched'],
      ['MN', -1, false, 0, 'nofill'],
    ]);
    expect([own.orders[0]!.evidenceRec, own.orders[0]!.anchorRec]).toEqual([1, 0]);
    expect([own.orders[2]!.evidenceFirstRec, own.orders[2]!.evidenceRec]).toEqual([2, 4]);
  });

  it('① 「우리 주문」 표 — 늘 표시 · 캡션 정확 · 열 · 시각순 · 「?」 · 근거 「—」 · 커서 주문 선택', () => {
    const { container } = renderCard(3);
    const table = q(container, 'tick-own-table')!;
    expect(q(table, 'tick-own-table-caption')!.textContent).toBe('이 날 4건 · 체결 3건 · 켜진 서버 KB120 · KYOBO119');
    const rows = Array.from(table.querySelectorAll('[data-slot="tick-own-table-row"]'));
    expect(rows.map((r) => r.getAttribute('data-order'))).toEqual(['0', '1', '2', '3']);
    const cells = (r: Element) => Array.from(r.querySelectorAll('td'), (td) => td.textContent);
    expect(cells(rows[0]!)).toEqual(['13:00:00', '선매수 매수', '300', '300', '호가']);
    expect(cells(rows[1]!)).toEqual(['13:00:00', '매수', '—', '100?', '—']);
    expect(cells(rows[2]!)).toEqual(['13:00:00', '선매수 매수', '300', '0', '체결 구간']);
    expect(cells(rows[3]!)).toEqual(['13:00:00', '수동 매수', '300', '1', '—']);
    expect(rows.map((r) => r.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
    // 표는 37 「최근 주문」 표 위
    const recent = q(container, 'tick-order-recent')!;
    expect(table.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('① 주문 0 이면 캡션만 · own 없으면 표 없음(Phase 37 그대로)', () => {
    const empty = buildOwnModel(es, ownOf([], []));
    const { container } = render(<TickOrderCard session={es} cursorRec={3} onJump={() => {}} own={empty} />);
    const table = q(container, 'tick-own-table')!;
    expect(q(table, 'tick-own-table-caption')!.textContent).toBe('이 날 0건 · 체결 0건 · 켜진 서버 KB120 · KYOBO119');
    expect(table.querySelector('table')).toBeNull();
    const none = render(<TickOrderCard session={es} cursorRec={3} onJump={() => {}} />);
    expect(q(none.container, 'tick-own-table')).toBeNull();
    expect(q(none.container, 'tick-own-section')).toBeNull();
  });

  it('② 표 행 클릭 = 첫 짝 체결 rec · 짝 체결 없으면 주문 줄 선택 · 근거 칸 = 근거 rec + 되돌아가기(행 클릭 안 탐)', () => {
    const { container, cb } = renderCard(5);
    const rows = container.querySelectorAll('[data-slot="tick-own-table-row"]');
    fireEvent.click(rows[0]!);
    expect(cb.onOwnJump).toHaveBeenLastCalledWith(3);
    fireEvent.click(rows[2]!);
    expect(cb.onOwnOrder).toHaveBeenLastCalledWith(2);
    fireEvent.click(rows[3]!);
    expect(cb.onOwnOrder).toHaveBeenLastCalledWith(3);
    cb.onOwnOrder.mockClear();
    cb.onOwnJump.mockClear();
    fireEvent.click(rows[2]!.querySelector('[data-slot="tick-own-jump"][data-to="evidence"]')!);
    expect(cb.onOwnJump).toHaveBeenCalledTimes(1);
    expect(cb.onOwnJump).toHaveBeenLastCalledWith(4);
    expect(cb.onOwnBack).toHaveBeenLastCalledWith(2);
    expect(cb.onOwnOrder).not.toHaveBeenCalled();
    // 근거 없는 행은 근거 칸이 버튼이 아니다
    expect(rows[1]!.querySelector('[data-slot="tick-own-jump"]')).toBeNull();
  });

  it('③ 근거 전문 행(우리 체결 아님) — 「이 전문을 보고 나간 주문 n건」 · 항목 클릭 = 그 주문 줄 선택 · 섹션 없음', () => {
    const { container, cb } = renderCard(4);
    const list = q(container, 'tick-own-evidence-orders')!;
    expect(list.textContent).toContain('이 전문을 보고 나간 주문 1건');
    const items = list.querySelectorAll('[data-slot="tick-own-evidence-order"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain('#RG');
    fireEvent.click(items[0]!);
    expect(cb.onOwnOrder).toHaveBeenLastCalledWith(2);
    expect(q(container, 'tick-own-section')).toBeNull();
    // 우리 체결 행이면 역참조 대신 섹션(rec 2 = ES 체결 · RG 구간 첫 행)
    const r2 = renderCard(2);
    expect(q(r2.container, 'tick-own-evidence-orders')).toBeNull();
    expect(q(r2.container, 'tick-own-section')!.getAttribute('data-order')).toBe('1');
  });

  it('④ 섹션 — 주문 · 조건 · 근거 · 직전 체결 · 체결(전량) · 보기 › = 되돌아가기 + 이동 · 꼬리말 없음', () => {
    const { container, cb } = renderCard(3);
    const sec = q(container, 'tick-own-section')!;
    expect(sec.getAttribute('data-order')).toBe('0');
    expect(sec.querySelector('h4')!.textContent).toBe('◆ 우리 주문 #B6KB120 · 계좌 ···3801');
    expect(line(sec, 'order')!.textContent).toBe('주문13:00:00.200 · 선매수 매수 16,400 ×300');
    const cond = conditionTextOf({
      condMetric: 1, condThreshold: 50_000, condActual: 38_200, reasonCode: events[0]!.reason_code, group: 1, kind: 3, price: 16400,
    });
    expect(line(sec, 'cond')!.textContent).toBe(`조건${cond}`);
    expect(line(sec, 'evidence')!.textContent).toBe('근거 호가13:00:00.150 · 호가(매도1잔량 52,100→38,200)보기 ›');
    expect(line(sec, 'anchor')!.textContent).toBe('직전 체결13:00:00.100 · 16,400 ×100보기 ›');
    expect(line(sec, 'fills')!.textContent).toBe('체결13:00:00.260 300 +5ms');
    expect(sec.querySelector('[data-slot="tick-own-foot"]')).toBeNull();
    fireEvent.click(line(sec, 'evidence')!.querySelector('button')!);
    expect(cb.onOwnBack).toHaveBeenLastCalledWith(0);
    expect(cb.onOwnJump).toHaveBeenLastCalledWith(1);
    fireEvent.click(line(sec, 'anchor')!.querySelector('button')!);
    expect(cb.onOwnJump).toHaveBeenLastCalledWith(0);
    expect(cb.onOwnBack).toHaveBeenCalledTimes(2);
  });

  it('⑤ 부분 · 추정 체결 — 「/ 전체 m」 · 「+dms」 · 「추정 · 동가 후보 k」 · 꼬리말 두 문구 · 조건 없음(수동 아님)', () => {
    const { container } = renderCard(2);
    const sec = q(container, 'tick-own-section')!;
    expect(line(sec, 'cond')!.textContent).toBe('조건없음 — 주문 시각 위치만');
    expect(line(sec, 'evidence')).toBeNull();
    expect(line(sec, 'anchor')).toBeNull();
    expect(line(sec, 'fills')!.textContent).toBe('체결13:00:00.250 100 / 전체 200 +3ms추정 · 동가 후보 3');
    const foot = Array.from(sec.querySelectorAll('[data-slot="tick-own-foot"]'), (f) => f.textContent);
    expect(foot).toEqual([
      '이 A3 200주 중 100주가 우리 체결이다(A3 = 공격 주문 × 가격 단 합산). 같은 가격 · 남은 수량 ≥ 체결 수량 · 시각차 [−200, +1500]ms 중 가장 가까운 A3.',
      '20ms 안에 같은 가격 후보 A3 가 3개 — 가장 가까운 것을 골랐지만 다른 쪽일 수 있다.',
    ]);
  });

  it('⑥ 우리 줄 선택(ownSel) — 수동 「없음 · 수동 주문 — 주문 시각 위치만」 · 짝 없음 · 대기 「전문 아직 안 옴」', () => {
    const { container } = renderCard(5, { ownSel: { kind: 'order', id: 3 } });
    const sec = q(container, 'tick-own-section')!;
    expect(sec.getAttribute('data-order')).toBe('3');
    expect(line(sec, 'cond')!.textContent).toBe('조건없음 · 수동 주문 — 주문 시각 위치만');
    expect(line(sec, 'fills')!.textContent).toBe('체결13:00:00.390 1 짝 전문 없음');
    // 당일 — 마지막 수신(.400) 직전 체결은 대기
    const live = buildOwnModel(es, ownOf(events, fills), { live: true });
    expect(live.fills[2]!.state).toBe('pending');
    const r = render(
      <TickOrderCard session={es} cursorRec={5} onJump={() => {}} own={live} ownSel={{ kind: 'fill', id: 2 }} />,
    );
    const s2 = q(r.container, 'tick-own-section')!;
    expect(s2.getAttribute('data-order')).toBe('3');
    expect(line(s2, 'fills')!.textContent).toBe('체결13:00:00.390 1 전문 아직 안 옴');
  });

  it('⑦ 커서가 우리 체결도 근거도 아니면 섹션 · 역참조 없음 · 표 선택 없음', () => {
    const { container } = renderCard(5);
    expect(q(container, 'tick-own-section')).toBeNull();
    expect(q(container, 'tick-own-evidence-orders')).toBeNull();
    const rows = Array.from(container.querySelectorAll('[data-slot="tick-own-table-row"]'));
    expect(rows.every((r) => r.getAttribute('aria-selected') === 'false')).toBe(true);
  });
});
