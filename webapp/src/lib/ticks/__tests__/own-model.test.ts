import { describe, expect, it } from 'vitest';

import {
  a3TimeMs,
  conditionTextOf,
  dayStartNs,
  type TickOwnEvent,
  type TickOwnFill,
  type TickOwnOrder,
  type TickOwnResponse,
} from '@gh-radar/shared';

import { a3Msg, b6Msg, synthNs, synthSession, SYNTH_DATE, SYNTH_ISIN } from '@/test-fixtures/tick-synth';

import {
  buildOwnModel,
  ownOrderLineText,
  ownSelKeyOf,
  resolveOwnSel,
  OWN_DAY_END_HHMM,
  OWN_DAY_END_SETTLE_MS,
  OWN_PENDING_GRACE_MS,
  OWN_SERVER_AS_OF_LAG_MS,
  type OwnOrderView,
} from '../own-model';

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

describe('buildOwnModel — 체결 순서 = RPC 응답 순서(R1 IN-01)', () => {
  it('같은 ms 의 다른 게이트웨이 체결은 응답(µs) 순서 그대로 남은 수량을 깎는다 · 다른 ms 는 gw 순으로 방어 정렬', () => {
    // A3 .100 ×10 하나 — 같은 .105 ms 에 KYOBO119(µs 가 앞) → KB120 순으로 응답. 이름순(KB120 먼저)으로 다시 정렬하지 않는다.
    const s = synthSession([[100.5, a3Msg({ seq: 801, bs: '2', px: 30000, qty: 10, time: '130000100000' })]]);
    const kyobo = { ...fill('KY', at(105), 30000, 10, 'B', 5), gateway: 'KYOBO119' };
    const kb = fill('KB', at(105), 30000, 10, 'B', 1);
    const m = buildOwnModel(s, ownOf({ fills: [kyobo, kb] }));
    expect(m.fills.map((f) => [f.gateway, f.state, f.rec])).toEqual([
      ['KYOBO119', 'matched', 0],
      ['KB120', 'nofill', -1],
    ]);
    // 다른 ms 가 뒤섞여 오면 gw 시각순으로(방어)
    const late = fill('LT', at(300), 30000, 10, 'B', 2);
    expect(buildOwnModel(s, ownOf({ fills: [late, kyobo, kb] })).fills.map((f) => f.orderNo)).toEqual(['KY', 'KB', 'LT']);
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

  it('live — 짝 창이 세션 끝을 넘는 체결은 같은 가격 A3 가 있어도 짝짓지 않고 대기 · 세션이 자라면 짝(WR-02)', () => {
    // 상한가 추격 — 같은 가격 A3 .100 이 있고, 우리 체결 .150 의 진짜 A3 는 아직 안 왔다(마지막 수신 .9005)
    const msgs: [number, Uint8Array][] = [
      [100.5, a3Msg({ seq: 301, bs: '2', px: 30000, qty: 10, time: '130000100000' })],
      [900.5, b6Msg({ seq: 302, ask1: [30000, 0], bid1: [30000, 900] })],
    ];
    const early = synthSession(msgs);
    const one = ownOf({ fills: [fill('UL', at(150), 30000, 10)] });
    const live = buildOwnModel(early, one, { live: true });
    expect(live.fills.map((f) => [f.state, f.a3j, f.rec, f.est, f.candidates])).toEqual([['pending', -1, -1, false, 0]]);
    expect(live.fillsOfRec.size).toBe(0);
    expect(Array.from(live.slotOfFill)).toEqual([1]);
    // 과거 격자는 그대로 짝(오라클 경로 불변)
    expect(buildOwnModel(early, one).fills.map((f) => [f.state, f.rec])).toEqual([['matched', 0]]);
    // 세션이 자라 창(gw + 1,200ms)을 넘기면 모델을 다시 만들 때 짝이 붙는다
    const grown = synthSession([...msgs, [1500.5, b6Msg({ seq: 303, ask1: [30000, 0], bid1: [30000, 900] })]]);
    expect(buildOwnModel(grown, one, { live: true }).fills.map((f) => [f.state, f.rec])).toEqual([['matched', 0]]);
  });

  // R2 WR-02 — 진짜 A3 가 이미 있으면(|dt| 작음) 그만큼 빨리 확정 · 장 끝 뒤에 받은 세션은 대기 없음
  const a3At100: [number, Uint8Array] = [100.5, a3Msg({ seq: 311, bs: '2', px: 30000, qty: 10, time: '130000100000' })];
  const b6At = (ms: number, seq: number): [number, Uint8Array] => [ms, b6Msg({ seq, ask1: [30000, 0], bid1: [30000, 900] })];
  const near = ownOf({ fills: [fill('NR', at(105), 30000, 10)] }); // dt = 5ms

  it('live — 짝 |dt| 가 작으면 g + |dt| + 20 + 1,000 에서 확정(짝 없음 기준 g + 1,200 보다 이르다) · 1ms 모자라면 대기', () => {
    // 닿는 거리 = min(5 + 20, 200) = 25 → 마지막 수신 ≥ .105 + 25 + 1,000 = 1.130 이면 더 가까운 A3 는 이미 왔어야 한다
    const done = buildOwnModel(synthSession([a3At100, b6At(1130.5, 312)]), near, { live: true });
    expect(done.fills.map((f) => [f.state, f.rec, f.dtMs])).toEqual([['matched', 0, 5]]);
    const short = buildOwnModel(synthSession([a3At100, b6At(1129.5, 312)]), near, { live: true });
    expect(short.fills.map((f) => [f.state, f.rec])).toEqual([['pending', -1]]);
  });

  it('live — 앞 체결이 대기면 뒤 체결도 대기(남은 수량 차감이 순서 의존 · 대기 체결의 잠정 차감은 버린다)', () => {
    // X .100 ×10 · Y .395 ×5 · 마지막 수신 1.500. h(.400 ×10)는 Y 가 모자라 X(dt 300 · 닿는 거리 200 → 1.600 > 1.500 대기) ·
    // i(.400 ×5)는 Y(dt 5 · 닿는 거리 25 → 1.425 ≤ 1.500)지만 h 뒤라 대기.
    const msgs: [number, Uint8Array][] = [
      a3At100,
      [395.5, a3Msg({ seq: 313, bs: '2', px: 30000, qty: 5, time: '130000395000' })],
      b6At(1500.5, 314),
    ];
    const hi = ownOf({ fills: [fill('H', at(400), 30000, 10, 'B', 1), fill('I', at(400), 30000, 5, 'B', 2)] });
    const s = synthSession(msgs);
    expect(buildOwnModel(s, hi).fills.map((f) => [f.state, f.rec])).toEqual([
      ['matched', 0],
      ['matched', 1],
    ]);
    expect(buildOwnModel(s, hi, { live: true }).fills.map((f) => f.state)).toEqual(['pending', 'pending']);
    const onlyI = ownOf({ fills: [fill('I', at(400), 30000, 5, 'B', 2)] });
    expect(buildOwnModel(s, onlyI, { live: true }).fills.map((f) => [f.state, f.rec])).toEqual([['matched', 1]]);
  });

  it('live — 장 끝(KRX 18:00 · NXT 20:00) + 5분 뒤에 받은 세션은 대기 없음 · 그 전 · ready 아님(null)은 대기', () => {
    // 리뷰 재현 — A3 .100 · 마지막 수신 B6 .400 · 우리 체결 .105(진짜 A3 는 .100). 세션이 더 자라지 않는 장 끝 뒤 화면.
    expect(OWN_DAY_END_HHMM).toEqual({ KRX: '1800', NXT: '2000' });
    expect(OWN_DAY_END_SETTLE_MS).toBe(300_000);
    const msgs: [number, Uint8Array][] = [a3At100, b6At(400.5, 312)];
    const krx = synthSession(msgs);
    const endOf = (hhmm: string) => Number(dayStartNs(SYNTH_DATE, hhmm) / 1_000_000n) + OWN_DAY_END_SETTLE_MS;
    const stateAt = (s: typeof krx, asOfMs: number | null) =>
      buildOwnModel(s, near, { live: true, asOfMs }).fills.map((f) => [f.state, f.rec]);
    expect(stateAt(krx, null)).toEqual([['pending', -1]]);
    expect(stateAt(krx, endOf('1800') - 1)).toEqual([['pending', -1]]);
    expect(stateAt(krx, endOf('1800'))).toEqual([['matched', 0]]);
    const nxt = synthSession(msgs, 'NXT');
    expect(stateAt(nxt, endOf('1800'))).toEqual([['pending', -1]]);
    expect(stateAt(nxt, endOf('2000'))).toEqual([['matched', 0]]);
    // 과거 격자(live 아님)는 asOfMs 와 무관하게 확정
    expect(buildOwnModel(krx, near, { asOfMs: null }).fills.map((f) => f.state)).toEqual(['matched']);
  });

  it('live — 한산한 종목: tickgw as-of − 2,000 이 g + 닿는 거리 + 1,000 에 닿으면 확정(호출자 예시 +2s 는 여유 0 기준 · 여유 2,000 이라 경계 g + 3,025) · 1ms 모자라면 대기', () => {
    expect(OWN_SERVER_AS_OF_LAG_MS).toBe(2000);
    // 리뷰 재현 — 진짜 A3 .100 이 이미 있고 마지막 수신은 B6 .400(+300ms 뿐). 우리 체결 .105 ×10(dt 5 · 닿는 거리 25)
    const quiet = synthSession([a3At100, b6At(400.5, 312)]);
    const edge = at(105 + 25 + 1000) + OWN_SERVER_AS_OF_LAG_MS; // = g + 3,025
    const stateAt = (serverAsOfMs: number | null | undefined) =>
      buildOwnModel(quiet, near, { live: true, serverAsOfMs }).fills.map((f) => [f.state, f.rec]);
    expect(stateAt(edge)).toEqual([['matched', 0]]);
    expect(buildOwnModel(quiet, near, { live: true, serverAsOfMs: edge }).fills[0]!.dtMs).toBe(5);
    expect(stateAt(edge - 1)).toEqual([['pending', -1]]);
    // 헤더 없음(옛 tickgw · server) · ready 아님 → 종전 판정(마지막 수신만)
    expect(stateAt(null)).toEqual([['pending', -1]]);
    expect(stateAt(undefined)).toEqual([['pending', -1]]);
  });

  it('live — as-of 가 마지막 수신보다 한참 이르면 max 가 마지막 수신을 고른다(퇴행 없음) · 과거 격자는 as-of 와 무관하게 확정', () => {
    const done = synthSession([a3At100, b6At(1130.5, 312)]);
    expect(buildOwnModel(done, near, { live: true, serverAsOfMs: at(0) }).fills.map((f) => [f.state, f.rec])).toEqual([
      ['matched', 0],
    ]);
    const quiet = synthSession([a3At100, b6At(400.5, 312)]);
    for (const serverAsOfMs of [null, at(0), at(10_000)]) {
      expect(buildOwnModel(quiet, near, { serverAsOfMs }).fills.map((f) => f.state)).toEqual(['matched']);
    }
  });
});

describe('buildOwnModel — 중복 A3(같은 보드 · seq 재수신) 거르기(WR-03)', () => {
  // rec 0 = A3 seq 501 · rec 1 = 같은 전문 재수신(duplicates 1) · rec 2 = B6
  const dup = synthSession([
    [100.5, a3Msg({ seq: 501, bs: '2', px: 30000, qty: 100, time: '130000100000', cumVolume: 900 })],
    [150.5, a3Msg({ seq: 501, bs: '2', px: 30000, qty: 100, time: '130000100000', cumVolume: 900 })],
    [3000.5, b6Msg({ seq: 502, ask1: [30000, 0], bid1: [30000, 900] })],
  ]);

  it('전제 — 둘째 수신이 duplicates', () => {
    expect(Array.from(dup.duplicates.slice(0, 3))).toEqual([0, 1, 0]);
  });

  it('짝 — 중복은 둘째 후보가 아니다(추정 아님) · 원본이 바닥나도 중복 행으로 넘어가지 않는다', () => {
    const m = buildOwnModel(
      dup,
      ownOf({ fills: [fill('D1', at(105), 30000, 100, 'B', 1), fill('D2', at(110), 30000, 100, 'B', 2)] }),
    );
    expect(m.fills.map((f) => [f.state, f.rec, f.est, f.candidates])).toEqual([
      ['matched', 0, false, 1],
      ['nofill', -1, false, 0],
    ]);
    expect([...m.fillsOfRec.keys()]).toEqual([0]);
  });

  it('근거 · 앵커 — 체결 단건 근거는 원본 하나(hits 1) · 앵커도 원본 행', () => {
    const m = buildOwnModel(
      dup,
      ownOf({
        events: [
          event('E9', at(200), { ev_kind: 2, ev_price: 30000, ev_trade_qty: 100, ev_qty_before: 800, ev_qty_after: 900 }),
          event('E8', at(210), { ev_kind: 0, cum_volume: 900 }),
        ],
      }),
    );
    const e9 = byKey(m.orders, 'E9');
    expect([e9.evidence.kind, e9.evidenceRec, e9.evidenceLabel]).toEqual(['a3', 0, '체결']);
    expect(byKey(m.orders, 'E8').anchorRec).toBe(0);
  });

  it('호가 근거 — 같은 B6 를 다시 받아도 근거는 원본 행(R2 WR-01 · 사본은 「중복」 칩 행)', () => {
    // rec 0 = B6 seq 700(.100) · rec 1 = 같은 전문 재수신(.140 · duplicates 1) · 이벤트 gw .150
    const b6dup = synthSession([
      [100.5, b6Msg({ seq: 700, ask1: [30000, 500], bid1: [29950, 10] })],
      [140.5, b6Msg({ seq: 700, ask1: [30000, 500], bid1: [29950, 10] })],
    ]);
    expect(Array.from(b6dup.duplicates.slice(0, 2))).toEqual([0, 1]);
    const m = buildOwnModel(
      b6dup,
      ownOf({ events: [event('BB', at(150), { ev_kind: 1, ev_price: 30000, ev_qty_after: 500 })] }),
    );
    const o = byKey(m.orders, 'BB');
    expect([o.evidence, o.evidenceRec]).toEqual([{ kind: 'b6', rec: 0 }, 0]);
    expect([...m.ordersOfEvidenceRec.keys()]).toEqual([0]);
  });
});

describe('고른 줄 안정 키 — ownSelKeyOf · resolveOwnSel(WR-04)', () => {
  // 처음 받은 own: 주문 E1(이벤트) · 짝 없는 체결 N5. 다시 받은 own: 다른 게이트웨이의 더 이른 주문 · 짝 없는 체결이 끼어
  // 주문 · 체결 id 가 하나씩 밀린다.
  const first = buildOwnModel(
    session,
    ownOf({ events: [event('E1', at(150))], fills: [fill('N5', at(160), 99_999, 1, 'B', 7)] }),
  );
  const again = buildOwnModel(
    session,
    ownOf({
      events: [event('E1', at(150)), event('K0', at(50), { gateway: 'KYOBO119' })],
      fills: [
        { ...fill('K0', at(60), 99_999, 2, 'B', 3), gateway: 'KYOBO119' },
        fill('N5', at(160), 99_999, 1, 'B', 7),
      ],
    }),
  );

  it('체결 키 = gateway|order_no|gw_time_ms|seq(journal_epoch 없음(옛 RPC) — 폴백) · 주문 키 = gateway|order_no', () => {
    const n5Key = `KB120|N5|${at(160)}|7`;
    expect(first.fills.map((f) => f.key)).toEqual([n5Key]);
    expect(ownSelKeyOf(first, { kind: 'order', id: byKey(first.orders, 'E1').id })).toEqual({ kind: 'order', key: 'KB120|E1' });
    expect(ownSelKeyOf(first, { kind: 'fill', id: 0 })).toEqual({ kind: 'fill', key: n5Key });
    expect(ownSelKeyOf(first, { kind: 'order', id: 99 })).toBeNull();
  });

  it('(R2 IN-01) 저널 초기화로 같은 gateway|seq 가 다시 쓰여도 체결 키는 갈리고 고른 체결로 푼다', () => {
    // 같은 KB120 · seq 7 — 초기화 앞(N5 .160) · 뒤(R1 .170) 두 체결(journal_epoch 없는 옛 응답)
    const two = buildOwnModel(
      session,
      ownOf({ fills: [fill('N5', at(160), 99_999, 1, 'B', 7), fill('R1', at(170), 99_999, 1, 'B', 7)] }),
    );
    expect(new Set(two.fills.map((f) => f.key)).size).toBe(2);
    const r1 = ownSelKeyOf(two, { kind: 'fill', id: two.fills.findIndex((f) => f.orderNo === 'R1') })!;
    expect(two.fills[resolveOwnSel(two, r1)!.id]!.orderNo).toBe('R1');
  });

  it('(R2 IN-01 후속) journal_epoch 가 있으면 체결 키 = 원천 PK gateway|journal_epoch|seq — epoch 만 달라도 갈리고 고른 체결로 푼다', () => {
    const ep = (f: TickOwnFill, journal_epoch: string): TickOwnFill => ({ ...f, journal_epoch });
    // 주문번호 · gw 시각과 무관하게 epoch · seq 로만 키가 정해진다
    const one = buildOwnModel(session, ownOf({ fills: [ep(fill('N5', at(160), 99_999, 1, 'B', 7), 'ep-a')] }));
    expect(one.fills[0]!.key).toBe('KB120|ep-a|7');
    // 같은 KB120 · seq 7 · 같은 주문번호 · 같은 gw 시각 — epoch 만 다르다(같은 날 저널 초기화)
    const a = ep(fill('N5', at(160), 99_999, 1, 'B', 7), 'ep-a');
    const b = ep(fill('N5', at(160), 99_999, 1, 'B', 7), 'ep-b');
    const two = buildOwnModel(session, ownOf({ fills: [a, b] }));
    expect(two.fills.map((f) => f.key).sort()).toEqual(['KB120|ep-a|7', 'KB120|ep-b|7']);
    const idB = two.fills.findIndex((f) => f.key === 'KB120|ep-b|7');
    const kB = ownSelKeyOf(two, { kind: 'fill', id: idB })!;
    expect(kB).toEqual({ kind: 'fill', key: 'KB120|ep-b|7' });
    expect(resolveOwnSel(two, kB)).toEqual({ kind: 'fill', id: idB });
    // 다른 체결이 앞에 끼어 id 가 밀린 응답에서도 같은 체결(ep-b)로 푼다
    const shifted = buildOwnModel(
      session,
      ownOf({ fills: [ep({ ...fill('K0', at(60), 99_999, 2, 'B', 3), gateway: 'KYOBO119' }, 'ep-k'), a, b] }),
    );
    const r = resolveOwnSel(shifted, kB)!;
    expect(r.kind).toBe('fill');
    expect(r.id).not.toBe(idB);
    expect(shifted.fills[r.id]!.key).toBe('KB120|ep-b|7');
  });

  it('id 가 밀려도 같은 주문 · 체결로 푼다 · 없어지면 null', () => {
    const e1 = ownSelKeyOf(first, { kind: 'order', id: byKey(first.orders, 'E1').id })!;
    const n5 = ownSelKeyOf(first, { kind: 'fill', id: first.fills.findIndex((f) => f.orderNo === 'N5') })!;
    const o = resolveOwnSel(again, e1)!;
    expect(again.orders[o.id]!.orderNo).toBe('E1');
    expect(o.id).not.toBe(byKey(first.orders, 'E1').id);
    const f = resolveOwnSel(again, n5)!;
    expect([f.kind, again.fills[f.id]!.orderNo]).toEqual(['fill', 'N5']);
    expect(f.id).not.toBe(first.fills.findIndex((x) => x.orderNo === 'N5'));
    expect(resolveOwnSel(buildOwnModel(session, ownOf({})), e1)).toBeNull();
  });

  it('체결 줄은 아직 줄(짝 없음 · 대기)일 때만 — 세션이 자라 짝이 붙으면 선택 없음', () => {
    const msgs: [number, Uint8Array][] = [
      [100.5, a3Msg({ seq: 601, bs: '2', px: 30000, qty: 10, time: '130000100000' })],
      [900.5, b6Msg({ seq: 602, ask1: [30000, 0], bid1: [30000, 900] })],
    ];
    const one = ownOf({ fills: [fill('P1', at(150), 30000, 10, 'B', 9)] });
    const pending = buildOwnModel(synthSession(msgs), one, { live: true });
    expect(pending.fills[0]!.state).toBe('pending');
    const k = ownSelKeyOf(pending, { kind: 'fill', id: 0 })!;
    expect(resolveOwnSel(pending, k)).toEqual({ kind: 'fill', id: 0 });
    const grown = synthSession([...msgs, [1500.5, b6Msg({ seq: 603, ask1: [30000, 0], bid1: [30000, 900] })]]);
    const matched = buildOwnModel(grown, one, { live: true });
    expect(matched.fills[0]!.state).toBe('matched');
    expect(resolveOwnSel(matched, k)).toBeNull();
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

/**
 * Phase 38 Plan 06 Task 1 — 근거 · 앵커(D-11 · D-13 · D-15 · SC-3 · RESEARCH Open Q3).
 *
 * 깨지면: 주문 줄 · 카드 「근거 … 보기 ›」 가 엉뚱한 전문으로 가거나 · 체결통보 주문이 근거를 잃거나 · 앵커가 근거 행과
 * 겹쳐 「직전 체결」 이 두 번 보인다.
 */
describe('buildOwnModel — 근거 · 앵커(38-06)', () => {
  // rec 0 A3 .100 cum 1,000 · rec 1 B6 .1505(매도1 16,400 ×38,200) · rec 2 A3 .250 cum 1,200(200주) ·
  // rec 3 A3 .260 cum 1,500(300주) · rec 4 A3 .300 cum 1,550(16,450 ×50) · rec 5 B6 .4005
  const es = synthSession([
    [100.5, a3Msg({ seq: 401, bs: '2', px: 16400, qty: 100, time: '130000100000', cumVolume: 1000 })],
    [150.5, b6Msg({ seq: 411, ask1: [16400, 38_200], bid1: [16350, 10] })],
    [250.5, a3Msg({ seq: 421, bs: '2', px: 16400, qty: 200, time: '130000250000', cumVolume: 1200 })],
    [260.5, a3Msg({ seq: 431, bs: '2', px: 16400, qty: 300, time: '130000260000', cumVolume: 1500 })],
    [300.5, a3Msg({ seq: 441, bs: '2', px: 16450, qty: 50, time: '130000300000', cumVolume: 1550 })],
    [400.5, b6Msg({ seq: 451, ask1: [16450, 10], bid1: [16400, 20] })],
  ]);
  const eA3 = (j: number) => a3TimeMs(es.index, es.a3, j);
  const evs = (no: string, gwMs: number, over: Partial<TickOwnEvent>) => event(no, gwMs, over);

  const own = ownOf({
    events: [
      // 호가 근거 — 창 [g − 3000, g + 50] 안 B6 rec 1 · 앵커 cum 1,000 → rec 0
      evs('B6', at(200), { ev_kind: 1, ev_price: 16400, ev_qty_after: 38_200, cum_volume: 1000 }),
      // 체결 근거 단건 — cum 1,200 ∧ 200주 ∧ 16,400 → rec 2 · 앵커도 rec 2 → 없음
      evs('S1', at(270), { ev_kind: 2, ev_price: 16400, ev_trade_qty: 200, ev_qty_before: 1000, ev_qty_after: 1200, cum_volume: 1200 }),
      // 주기매도 구간 — 단건 없음 · cum ∈ (1,000, 1,550] → rec 2 … rec 4(3건 · 550주) · 앵커 cum 1,500 → rec 3
      evs('RG', at(350), { ev_kind: 2, ev_price: 16400, ev_trade_qty: 999, ev_qty_before: 1000, ev_qty_after: 1550, cum_volume: 1500 }),
      // 체결통보 — 같은 게이트웨이 · 계좌의 이전 우리 체결(16,400 ×300 · P) 짝 A3 rec 3
      evs('N3', eA3(2) + 50, { ev_kind: 3, ev_price: 16400, ev_trade_qty: 300, cum_volume: 0 }),
      // 체결통보 — 다른 계좌면 잇지 않는다
      evs('NX', eA3(2) + 60, { ev_kind: 3, ev_price: 16400, ev_trade_qty: 300, account_no: '9999990000' }),
      // 체결통보 — 이전 우리 체결이 없으면(이벤트가 체결보다 앞) 근거 없음
      evs('NE', eA3(2) - 100, { ev_kind: 3, ev_price: 16400, ev_trade_qty: 300 }),
      // 근거 없음(수동 · ev_kind 0) — 앵커만
      evs('MN', at(380), { ev_kind: 0, group: 7, cond_metric: 0, reason_code: '', cum_volume: 1550 }),
    ],
    fills: [fill('P', eA3(2) + 5, 16400, 300)],
  });
  const m = buildOwnModel(es, own);
  const ofNo = (no: string) => byKey(m.orders, no);

  it('호가 근거 — b6 rec 1 · 라벨 「호가」 · 앵커 rec 0 · 줄 끝 「 · 근거 호가 ↑」(게이트웨이 앞)', () => {
    const o = ofNo('B6');
    expect(o.evidence).toEqual({ kind: 'b6', rec: 1 });
    expect([o.evidenceLabel, o.evidenceRec, o.evidenceFirstRec, o.anchorRec]).toEqual(['호가', 1, 1, 0]);
    expect(ownOrderLineText(o)).toBe(
      `● 주문 선매수 매수 16,400 ×300 · ${conditionTextOf({
        condMetric: 1,
        condThreshold: 50_000,
        condActual: 38_200,
        reasonCode: 'PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)',
        group: 1,
        kind: 3,
        price: 16400,
      })} · 근거 호가 ↑ · KB120 ···3801 #B6`,
    );
  });

  it('체결 근거 단건 — a3 rec 2 · 라벨 「체결」 · 앵커가 근거 행과 같으면 −1', () => {
    const o = ofNo('S1');
    expect(o.evidence).toEqual({ kind: 'a3', j: 1 });
    expect([o.evidenceLabel, o.evidenceRec, o.evidenceFirstRec, o.anchorRec]).toEqual(['체결', 2, 2, -1]);
  });

  it('주기매도 구간 — 첫 rec 2 · 끝 rec 4(= evidenceRec) · 3건 550주 · 라벨 「체결 구간」 · 앵커 rec 3', () => {
    const o = ofNo('RG');
    expect(o.evidence).toEqual({ kind: 'range', firstJ: 1, lastJ: 3, n: 3, qty: 550 });
    expect([o.evidenceLabel, o.evidenceRec, o.evidenceFirstRec, o.anchorRec]).toEqual(['체결 구간', 4, 2, 3]);
    expect(ownOrderLineText(o)).toContain(' · 근거 체결 구간 ↑ · KB120');
  });

  it('체결통보 — 같은 게이트웨이 · 계좌의 이전 우리 체결 짝 A3(rec 3) · 다른 계좌 · 이전 체결 없음은 근거 없음', () => {
    expect(m.fills[0]!.rec).toBe(3);
    const o = ofNo('N3');
    expect(o.evidence).toEqual({ kind: 'a3', j: 2 });
    expect([o.evidenceLabel, o.evidenceRec]).toEqual(['체결통보', 3]);
    for (const no of ['NX', 'NE']) {
      const x = ofNo(no);
      expect([x.evidence.kind, x.evidenceLabel, x.evidenceRec, x.evidenceFirstRec]).toEqual(['none', null, -1, -1]);
      expect(ownOrderLineText(x)).not.toContain('근거');
    }
  });

  it('근거 없음(ev_kind 0) — 앵커만 · 줄에 근거 조각 없음 · 이벤트 없는 주문은 전부 없음', () => {
    const o = ofNo('MN');
    expect([o.evidence.kind, o.evidenceRec, o.anchorRec]).toEqual(['none', -1, 4]);
    expect(ownOrderLineText(o)).toBe('● 주문 수동 매수 16,400 ×300 · 조건 없음 · 수동 주문 · KB120 ···3801 #MN');
    const p = ofNo('P');
    expect([p.evidence.kind, p.evidenceLabel, p.evidenceRec, p.anchorRec]).toEqual(['none', null, -1, -1]);
  });

  it('ordersOfEvidenceRec — 근거 rec · 구간 첫 rec 둘 다 키 · 주문 id 오름차순', () => {
    const id = (no: string) => ofNo(no).id;
    expect(m.ordersOfEvidenceRec.get(1)).toEqual([id('B6')]);
    expect(m.ordersOfEvidenceRec.get(2)).toEqual([id('S1'), id('RG')].sort((a, b) => a - b));
    expect(m.ordersOfEvidenceRec.get(4)).toEqual([id('RG')]);
    expect(m.ordersOfEvidenceRec.get(3)).toEqual([id('N3')]);
    expect(m.ordersOfEvidenceRec.has(0)).toBe(false);
  });

  it('이벤트가 없으면 근거 색인을 만들지 않는다(빈 맵)', () => {
    const only = buildOwnModel(es, ownOf({ fills: [fill('P', eA3(2) + 5, 16400, 300)] }));
    expect(only.ordersOfEvidenceRec.size).toBe(0);
  });
});
