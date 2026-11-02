import { describe, expect, it } from 'vitest';

import { teamPnlOf, type TeamPnl } from '@gh-radar/shared';

import { tickFixtureBytes, tickFixtureJson, TICK_FIXTURE_DATE } from '@/test-fixtures/tick-grid';
import { a3Msg, b6Msg, synthSession } from '@/test-fixtures/tick-synth';

import { buildTeamModel, teamCirclesOf, teamKpiAt } from '../team-model';
import { buildTickSession } from '../tick-session';

/**
 * Phase 37 Plan 14 Task 2 — 팀 모델(D-10 · D-12 · D-13).
 *
 * 깨지면: 마지막 틱 팀 손익이 매집감지 export payload.pnl 과 달라지거나(골든) · 중간 틱에서 미래 체결이 섞이거나 ·
 * 차트 보라 계단 · 주문 원 · 10분 막대가 팀 주문과 어긋난다 · NXT 화면에서 팀이 사라진다.
 */

const PNL_KEYS = [
  'buy_val', 'buy_qty', 'sell_val', 'sell_qty', 'realized_val', 'realized_qty', 'unrealized_val', 'total_val', 'ret',
  'end_qty', 'end_cost_val', 'unknown_sell_qty', 'unknown_sell_val',
] as const;

function expectPnl(got: TeamPnl | null, want: TeamPnl): void {
  expect(got).not.toBeNull();
  expect(Object.keys(got!)).toEqual([...PNL_KEYS]);
  const { ret: gr, ...gi } = got!;
  const { ret: wr, ...wi } = want;
  expect(gi).toEqual(wi);
  expect(gr).toBeCloseTo(wr!, 15);
}

describe('천일고속 10/14 — 마지막 틱 KPI = shared teamPnlOf 전체값 = export payload.pnl(accum) 13키', () => {
  const golden = tickFixtureJson<{ accum: TeamPnl; last_px: { accum: number } }>('chunil-1014.pnl.json');
  const session = buildTickSession(tickFixtureBytes('chunil-1014-a3.ticks.zst'), { date: '20261014', ex: 'KRX' });
  const model = buildTeamModel(session);
  const lastRec = session.exOrder[session.exOrder.length - 1]!;

  it('마지막 틱 — 13키 골든 · 끝 잔량 3,406 · 실현 28,621,939 · 합계 31,782,350', () => {
    const kpi = teamKpiAt(model, session, lastRec);
    expect(kpi.k).toBe(model.prefix.n);
    expect(kpi.lastPx).toBe(golden.last_px.accum);
    expectPnl(kpi.pnl, golden.accum);
    expect(kpi.pnl!.end_qty).toBe(3406);
    // 화면 함수 = 골든 함수 그대로
    expectPnl(kpi.pnl, teamPnlOf(model.fills, golden.last_px.accum)!);
    expect(kpi.dayNetVal).toBe(golden.accum.buy_val - golden.accum.sell_val);
    expect(kpi.dayNetQty).toBe(golden.accum.buy_qty - golden.accum.sell_qty);
  });

  it('당일 계단 끝값 = 당일 순매수 · 10분 막대 72칸 합 = 매수 · 매도 금액', () => {
    const last = model.dayStairs[model.dayStairs.length - 1]!;
    expect(last.net).toBe(golden.accum.buy_val - golden.accum.sell_val);
    expect(model.buckets.buy.length).toBe(72);
    expect(model.buckets.sell.length).toBe(72);
    expect(model.buckets.buy.reduce((a, b) => a + b, 0)).toBe(golden.accum.buy_val);
    expect(model.buckets.sell.reduce((a, b) => a + b, 0)).toBe(golden.accum.sell_val);
    for (let i = 1; i < model.dayStairs.length; i++) {
      expect(model.dayStairs[i]!.tMs).toBeGreaterThanOrEqual(model.dayStairs[i - 1]!.tMs);
    }
  });

  it('중간 틱 KPI = 그 시각 이하 팀 체결만으로 계산한 teamPnlOf(미래 체결이 섞이지 않는다)', () => {
    const rec = session.exOrder[Math.floor(session.exOrder.length / 2)]!;
    const kpi = teamKpiAt(model, session, rec);
    expect(kpi.k).toBeGreaterThan(0);
    expect(kpi.k).toBeLessThan(model.prefix.n);
    const j = session.lastA3[session.exPos[rec]!]!;
    expect(kpi.lastPx).toBe(session.a3.px[j]);
    const cut = model.runMaxNs[j]!;
    const upTo = model.fills.filter((f) => f.tNs !== null && f.tNs <= cut);
    expect(upTo.length).toBe(kpi.k);
    expectPnl(kpi.pnl, teamPnlOf(upTo, kpi.lastPx!)!);
  });
});

describe('합성 — 팀 매수 SMP 3조각(984만) · 일반 1조각 · 팀 매도 0/0 단독(652만)', () => {
  const s = synthSession([
    [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
    [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
    [1.1, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 200, time: '130000001100' })],
    [1.2, a3Msg({ seq: 103, bs: '2', px: 16400, qty: 300, time: '130000001200' })],
    [1.5, b6Msg({ seq: 104, ask1: [16450, 10], bid1: [16400, 20] })],
    [2, a3Msg({ seq: 105, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000002000' })],
    [2.5, b6Msg({ seq: 106, ask1: [16400, 1], bid1: [16350, 2] })],
    [5, a3Msg({ seq: 107, bs: '1', px: 16300, qty: 400, time: '130000005000' })],
    [5.5, b6Msg({ seq: 108, ask1: [16400, 1], bid1: [16300, 2] })],
  ]);
  const model = buildTeamModel(s);
  const recOfSeq = (seq: number) => {
    for (let r = 0; r < s.index.n; r++) if (s.index.seq[r] === seq) return r;
    throw new Error(`seq ${seq} 없음`);
  };

  it('팀 주문 2건 · 팀 체결 4건(일반 체결 제외)', () => {
    expect(model.scope).toBe('accum');
    expect(model.teamOrders.map((o) => [o.side, o.val, o.qty, o.px])).toEqual([
      ['B', 600 * 16400, 600, 16400],
      ['S', 400 * 16300, 400, 16300],
    ]);
    expect(model.fills.map((f) => f.qty)).toEqual([100, 200, 300, 400]);
    expect(model.teamOrders[0]!.lastRec).toBe(recOfSeq(103));
  });

  it('당일 계단 = 주문 끝 시각 순 매수 +금액 · 매도 −금액(0 에서 시작하는 누적)', () => {
    expect(model.dayStairs.map((d) => d.net)).toEqual([9_840_000, 9_840_000 - 6_520_000]);
    expect(model.dayStairs.map((d) => d.qty)).toEqual([600, 200]);
  });

  it('10분 막대 — 13:00 칸(30) 에 매수 984만 · 매도 652만 · 나머지 0', () => {
    expect(model.buckets.buy[30]).toBe(9_840_000);
    expect(model.buckets.sell[30]).toBe(6_520_000);
    expect(model.buckets.buy.reduce((a, b) => a + b, 0)).toBe(9_840_000);
  });

  it('주문 원 — 500만 이상만 · 1천만 문턱이면 0개', () => {
    expect(teamCirclesOf(model).map((c) => c.lastRec)).toEqual([recOfSeq(103), recOfSeq(107)]);
    expect(teamCirclesOf(model, 10_000_000)).toEqual([]);
  });

  it('선택 틱 KPI — 매수 끝 조각에서 평단 16,400 · 순매수 984만/600주 · 매도 뒤 실현 −40만', () => {
    const a = teamKpiAt(model, s, recOfSeq(103));
    expect(a.k).toBe(3);
    expect(a.avgPx).toBe(16400);
    expect(a.dayNetVal).toBe(9_840_000);
    expect(a.dayNetQty).toBe(600);
    expect(a.pnl!.end_qty).toBe(600);
    const b = teamKpiAt(model, s, recOfSeq(108));
    expect(b.k).toBe(4);
    expect(b.lastPx).toBe(16300);
    expect(b.pnl!.realized_val).toBe(400 * (16300 - 16400));
    expect(b.pnl!.unrealized_val).toBe(200 * (16300 - 16400));
    expect(b.dayNetVal).toBe(9_840_000 - 6_520_000);
    // 첫 체결 전 = 손익 없음
    const z = teamKpiAt(model, s, recOfSeq(100));
    expect(z).toMatchObject({ k: 0, pnl: null, avgPx: null, dayNetVal: 0, lastPx: null });
  });
});

describe('NXT 컷 13시 — 런 규칙 팀(65건)으로 같은 레이어(D-13 · KRX 와 합산 안 함)', () => {
  const s = buildTickSession(tickFixtureBytes('cut1300-nxt.ticks.zst'), { date: TICK_FIXTURE_DATE, ex: 'NXT' });
  const model = buildTeamModel(s);

  it('팀 주문 = 세션 NXT 팀 주문 · 체결 = 그 조각 · 마지막 KPI = teamPnlOf 전체', () => {
    expect(model.scope).toBe('nxt');
    expect(model.teamOrders.length).toBe(s.orders.filter((o) => o.team).length);
    expect(model.teamOrders.length).toBe(65);
    const pieces = s.orders.filter((o) => o.team).reduce((a, o) => a + o.pieces, 0);
    expect(model.fills.length).toBe(pieces);
    const last = s.exOrder[s.exOrder.length - 1]!;
    const kpi = teamKpiAt(model, s, last);
    expect(kpi.k).toBe(model.prefix.n);
    expectPnl(kpi.pnl, teamPnlOf(model.fills, kpi.lastPx!)!);
  });
});
