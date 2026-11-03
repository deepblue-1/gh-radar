import { describe, expect, it } from 'vitest';

import {
  a3TimeMs,
  conditionTextOf,
  type TickOwnEvent,
  type TickOwnFill,
  type TickOwnOrder,
  type TickOwnResponse,
} from '@gh-radar/shared';

import { a3Msg, b6Msg, synthNs, synthSession, SYNTH_DATE, SYNTH_ISIN } from '@/test-fixtures/tick-synth';

import { buildOwnModel, ownOrderLineText, OWN_PENDING_GRACE_MS, type OwnOrderView } from '../own-model';

/**
 * Phase 38 Plan 04 Task 1 — 우리 주문 묶기 · 주문 시각 슬롯 · 짝 없음/대기 · 주문 줄 문구(D-05 · D-12 · D-13 · Pitfall 4).
 *
 * 깨지면: 주문 줄이 엉뚱한 시각 자리에 서거나 · 체결만 있는 주문에 가짜 주문 줄이 생기거나 · 당일 막 들어온 체결이
 * 「짝 전문 없음」 으로 확정되거나 · 주문 줄 문구가 25 D-09 문구 정본과 갈린다.
 */

// rec 0~2 = A3(체결 13:00:00.100 · .200 · .300) · rec 3 = B6(수신 .4005) · rec 4 = B6(수신 3.0005s)
const session = synthSession([
  [100.5, a3Msg({ seq: 201, bs: '2', px: 16400, qty: 1064, time: '130000100000' })],
  [200.5, a3Msg({ seq: 202, bs: '1', px: 16400, qty: 500, time: '130000200000' })],
  [300.5, a3Msg({ seq: 203, bs: '2', px: 16450, qty: 10, time: '130000300000' })],
  [400.5, b6Msg({ seq: 204, ask1: [16450, 10], bid1: [16400, 20] })],
  [3000.5, b6Msg({ seq: 205, ask1: [16450, 10], bid1: [16400, 20] })],
]);

/** 13:00:00.000 + ms → epoch ms. */
const at = (ms: number) => Number(synthNs(ms) / 1_000_000n);
const tA3 = (j: number) => a3TimeMs(session.index, session.a3, j);

function fill(orderNo: string, gwMs: number, px: number, qty: number, side = 'B', seq = 1): TickOwnFill {
  return { gateway: 'KB120', seq, gw_time_ms: gwMs, account_no: '1234563801', order_no: orderNo, side, exec_price: px, exec_qty: qty };
}

function event(orderNo: string, gwMs: number, over: Partial<TickOwnEvent> = {}): TickOwnEvent {
  return {
    gateway: 'KB120',
    seq: 1,
    gw_time_ms: gwMs,
    kind: 3,
    group: 1,
    account_no: '1234563801',
    order_no: orderNo,
    price: 16400,
    qty: 300,
    reason_code: 'PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)',
    cond_metric: 1,
    cond_threshold: 50_000,
    cond_actual: 38_200,
    ev_kind: 1,
    ev_price: 16400,
    ev_qty_before: 52_100,
    ev_qty_after: 38_200,
    ev_trade_qty: 0,
    cum_volume: 0,
    ...over,
  };
}

function aux(orderNo: string, createdMs: number, over: Partial<TickOwnOrder> = {}): TickOwnOrder {
  return {
    gateway: 'KB120',
    account_no: '1234563801',
    order_no: orderNo,
    side: 'S',
    price: 16400,
    qty: 500,
    origin: 'manual',
    created_ms: createdMs,
    ...over,
  };
}

function ownOf(p: { fills?: TickOwnFill[]; events?: TickOwnEvent[]; orders?: TickOwnOrder[] }): TickOwnResponse {
  return {
    access: true,
    date: SYNTH_DATE,
    exchange: 'KRX',
    isin: SYNTH_ISIN,
    servers: ['KB120', 'KYOBO119'],
    fills: p.fills ?? [],
    events: p.events ?? [],
    orders: p.orders ?? [],
  };
}

const byKey = (orders: OwnOrderView[], no: string) => orders.find((o) => o.orderNo === no)!;

describe('buildOwnModel — 주문 묶기 · 주문 시각 · 슬롯(38-04)', () => {
  const own = ownOf({
    events: [event('E1', at(50)), event('E1', at(60), { seq: 2 }), event('U4', at(350), { kind: 6, group: 4 })],
    orders: [aux('A2', at(150)), aux('E1', at(10))],
    fills: [
      fill('E1', tA3(0) + 30, 16400, 300),
      fill('A2', tA3(1) + 10, 16400, 500, 'S', 2),
      fill('F3', tA3(2) + 5, 16450, 10, 'B', 3),
      fill('N5', at(120), 99_999, 1, 'B', 4),
    ],
  });
  const m = buildOwnModel(session, own);

  it('이벤트 있는 주문 — 가장 이른 이벤트 시각 · 값 · strategyEventSide · 보조 행 origin 은 곁들임', () => {
    const o = byKey(m.orders, 'E1');
    expect(o.key).toBe('KB120|E1');
    expect(o.source).toBe('event');
    expect(o.gwMs).toBe(at(50));
    expect([o.side, o.px, o.qty]).toEqual(['buy', 16400, 300]);
    expect(o.event?.seq).toBe(1);
    expect(o.origin).toBe('manual');
    expect(o.fills.map((i) => m.fills[i]!.rec)).toEqual([0]);
    // 13:00:00.050 이후 첫 전문 = rec 0(수신 .1005) → 슬롯 0
    expect(m.slotOfOrder[o.id]).toBe(0);
  });

  it('보조 주문만 — created_ms · side S → 매도 · 체결 짝 rec 1 · 슬롯 1', () => {
    const o = byKey(m.orders, 'A2');
    expect(o.source).toBe('order');
    expect([o.gwMs, o.side, o.px, o.qty, o.origin]).toEqual([at(150), 'sell', 16400, 500, 'manual']);
    expect(m.fills[o.fills[0]!]!.rec).toBe(1);
    expect(m.slotOfOrder[o.id]).toBe(1);
  });

  it('체결만 — 주문 줄 없음(gwMs null · 슬롯 −1) · 방향은 체결 side', () => {
    const o = byKey(m.orders, 'F3');
    expect([o.source, o.gwMs, o.px, o.qty, o.side]).toEqual(['fill', null, null, null, 'buy']);
    expect(m.slotOfOrder[o.id]).toBe(-1);
    expect(m.fills[o.fills[0]!]!.state).toBe('matched');
  });

  it('미체결 주문 — 주문 줄만(체결 0) · 슬롯 = 그 시각 이후 첫 전문(rec 3)', () => {
    const o = byKey(m.orders, 'U4');
    expect(o.fills).toEqual([]);
    expect([o.source, o.side]).toEqual(['event', 'sell']);
    expect(m.slotOfOrder[o.id]).toBe(3);
  });

  it('짝 없음 — 과거(live 없음)는 확정 nofill · 슬롯 = 체결 시각 이후 첫 전문 · 짝 있는 체결은 슬롯 −1', () => {
    const f = m.fills.find((x) => x.orderNo === 'N5')!;
    expect([f.a3j, f.rec, f.state]).toEqual([-1, -1, 'nofill']);
    expect(m.slotOfFill[f.id]).toBe(1);
    expect(m.orders[f.order]!.orderNo).toBe('N5');
    for (const x of m.fills) if (x.state === 'matched') expect(m.slotOfFill[x.id]).toBe(-1);
  });

  it('주문 순서 = 주문 시각(시각 없으면 첫 체결 시각) · 체결은 주문 id 를 안다 · 누락 0', () => {
    expect(m.orders.map((o) => o.orderNo)).toEqual(['E1', 'N5', 'A2', 'F3', 'U4']);
    expect(m.orders.map((o) => o.id)).toEqual([0, 1, 2, 3, 4]);
    const covered = m.orders.flatMap((o) => o.fills).sort((a, b) => a - b);
    expect(covered).toEqual(m.fills.map((f) => f.id));
    for (const f of m.fills) expect(m.orders[f.order]!.fills).toContain(f.id);
  });
});

describe('buildOwnModel — 당일 대기(Pitfall 4 · OWN_PENDING_GRACE_MS)', () => {
  // 마지막 수신 = 13:00:03.0005 → 3,000ms. 짝 없는 체결 둘: .120(1,320 ≤ 3,000 → 확정) · 2.500(3,700 > 3,000 → 대기)
  const own = ownOf({ fills: [fill('N1', at(120), 99_999, 1, 'B', 1), fill('N2', at(2500), 99_999, 2, 'B', 2)] });

  it('상수 = 짝 창 +200 + 여유 1,000', () => {
    expect(OWN_PENDING_GRACE_MS).toBe(1200);
  });

  it('live — 마지막 수신 직전 체결은 pending · 오래된 것은 nofill · 둘 다 슬롯은 있다', () => {
    const m = buildOwnModel(session, own, { live: true });
    expect(m.fills.map((f) => f.state)).toEqual(['nofill', 'pending']);
    expect(Array.from(m.slotOfFill)).toEqual([1, 4]);
  });

  it('과거(live false · 생략) — 대기 0', () => {
    expect(buildOwnModel(session, own, { live: false }).fills.map((f) => f.state)).toEqual(['nofill', 'nofill']);
    expect(buildOwnModel(session, own).fills.every((f) => f.state !== 'pending')).toBe(true);
  });
});

describe('ownOrderLineText — 주문 줄 문구(D-05 · 25 D-09 문구 정본)', () => {
  const lineOf = (p: Parameters<typeof ownOf>[0], no: string) => {
    const m = buildOwnModel(session, ownOf(p));
    return ownOrderLineText(byKey(m.orders, no));
  };

  it('수동(group 7 · cond 0) — 「조건 없음 · 수동 주문」 · 게이트웨이 ···끝4 #주문번호', () => {
    const line = lineOf(
      { events: [event('00012', at(50), { group: 7, cond_metric: 0, cond_threshold: 0, cond_actual: 0, reason_code: '', ev_kind: 0 })] },
      '00012',
    );
    expect(line).toBe('● 주문 수동 매수 16,400 ×300 · 조건 없음 · 수동 주문 · KB120 ···3801 #00012');
  });

  it('조건 있음 — conditionTextOf 와 같은 조각(문장 새로 짓지 않음)', () => {
    const e = event('00013', at(50));
    const cond = conditionTextOf({
      condMetric: e.cond_metric,
      condThreshold: e.cond_threshold,
      condActual: e.cond_actual,
      reasonCode: e.reason_code,
      group: e.group,
      kind: e.kind,
      price: e.price,
    });
    expect(cond).toBe('조건 매도잔량≤8.2억(50,000주) / 실측 6.3억(38,200주)');
    expect(lineOf({ events: [e] }, '00013')).toBe(`● 주문 선매수 매수 16,400 ×300 · ${cond} · KB120 ···3801 #00013`);
  });

  it('보조 주문만 — manual → 구분 수동 · 「조건 없음 · 수동 주문」 · limit_chaser 는 구분 · 출처 생략', () => {
    expect(lineOf({ orders: [aux('A1', at(50))], fills: [fill('A1', tA3(1) + 10, 16400, 500, 'S')] }, 'A1')).toBe(
      '● 주문 수동 매도 16,400 ×500 · 조건 없음 · 수동 주문 · KB120 ···3801 #A1',
    );
    expect(
      lineOf(
        { orders: [aux('A2', at(50), { origin: 'limit_chaser', side: 'B', price: null })], fills: [fill('A2', tA3(1) + 10, 16400, 500)] },
        'A2',
      ),
    ).toBe('● 주문 매수 ×500 · 조건 없음 · KB120 ···3801 #A2');
  });
});
