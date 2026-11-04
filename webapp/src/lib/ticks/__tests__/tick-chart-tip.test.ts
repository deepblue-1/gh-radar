import { describe, expect, it } from 'vitest';

import { buildPnlPrefix, type TeamFill } from '@gh-radar/shared';

import type { PosNetPoint } from '@/lib/accum-chart';
import { SYNTH_DATE } from '@/test-fixtures/tick-synth';

import type { OwnFillView, OwnModel, OwnOrderView } from '../own-model';
import type { TeamModel } from '../team-model';
import {
  TEAM_BUCKETS,
  tickBoundsOf,
  tickPanelsOf,
  TICK_CHART,
  xOfTick,
  type OwnMark,
  type TickPanels,
  type TurnoverSeries,
} from '../tick-chart';
import {
  cumNetAt,
  nearestTickCircleOf,
  teamAvgAt,
  tickBandAt,
  tickCircleGroupOf,
  tickCirclesOf,
  tickGroupTableOf,
  tickHoverWithOwn,
  tickOrderHoverOf,
  tickOwnTipOf,
  type TickBandSource,
} from '../tick-chart-tip';

/**
 * 틱뷰어 차트 툴팁(2026-11-03 · 매집감지 상세 차트 툴팁 · 묶음 규칙 이식).
 *
 * 깨지면: 원 위에 마우스를 올려도 그 주문 · 근처 주문 합계가 안 나오거나, 5px 밖 원까지 묶이거나, 띠 값이 계단 · 막대와 어긋난다.
 */

const B = tickBoundsOf(SYNTH_DATE);
const T13 = B.T0 + 5 * 3_600_000;
const P: TickPanels = tickPanelsOf(TICK_CHART.desktop);

/** 팀 주문 4건 — 매수 1,000만 · 매수 505만(0.5초 뒤) · 매도 301.5만(옛 500만 문턱 아래 — 지금은 원으로 그린다) · 매도 2,040만(30초 뒤). 주문당 체결 1개. */
const ORDERS = [
  { t: 0, side: 'B', qty: 1000, px: 10_000, pieces: 3 },
  { t: 500, side: 'B', qty: 500, px: 10_100, pieces: 2 },
  { t: 1000, side: 'S', qty: 300, px: 10_050, pieces: 1 },
  { t: 30_000, side: 'S', qty: 2000, px: 10_200, pieces: 4 },
] as const;

function model(): TeamModel {
  const fills: TeamFill[] = ORDERS.map((o, i) => ({
    rec: i,
    tNs: BigInt(T13 + o.t) * 1_000_000n,
    bs: o.side === 'B' ? '2' : '1',
    px: o.px,
    qty: o.qty,
  }));
  const teamOrders = ORDERS.map((o, i) => ({
    order: { id: i, pieces: o.pieces } as TeamModel['teamOrders'][number]['order'],
    lastRec: i,
    tMs: T13 + o.t,
    px: o.px,
    val: o.px * o.qty,
    qty: o.qty,
    side: o.side,
  }));
  let buyV = 0;
  let sellV = 0;
  const dayStairs = teamOrders.map((o) => {
    if (o.side === 'B') buyV += o.val;
    else sellV += o.val;
    return { tMs: o.tMs, net: buyV - sellV, qty: 0, buy: buyV, sell: sellV };
  });
  const buy = new Float64Array(TEAM_BUCKETS);
  const sell = new Float64Array(TEAM_BUCKETS);
  for (const o of teamOrders) (o.side === 'B' ? buy : sell)[30]! += o.val;
  return {
    scope: 'accum',
    fills,
    fillMs: Float64Array.from(teamOrders.map((o) => o.tMs)),
    prefix: buildPnlPrefix(fills),
    runMaxNs: new BigInt64Array(0),
    teamOrders,
    dayStairs,
    buckets: { buy, sell },
  } as TeamModel;
}

/** 13:00:00 ~ 13:01:00 창 · 그림 영역 52 ~ 592 → 1초 = 9px. */
const view = { t0: T13, t1: T13 + 60_000 };
const x = xOfTick(view, 52, 592);
const y = () => 50;

describe('tick-chart-tip — 원 · 묶음', () => {
  it('tickCirclesOf — 팀 주문 전부(500만 미만 포함 · 2026-11-03) · 큰 원 먼저 · k = teamOrders 번호', () => {
    const c = tickCirclesOf(model(), view, x, y);
    expect(c.map((v) => v.k)).toEqual([3, 0, 1, 2]);
    expect(c[1]!.cx).toBeCloseTo(52, 6);
  });

  it('씨앗 = 세로선이 지나는 원 · 가격 판 밖이면 없음', () => {
    const c = tickCirclesOf(model(), view, x, y);
    expect(nearestTickCircleOf(c, 53, 50, P)?.k).toBe(0);
    expect(nearestTickCircleOf(c, 200, 50, P)).toBeNull();
    expect(nearestTickCircleOf(c, 53, P.y2a + 5, P)).toBeNull();
  });

  it('묶음 = 씨앗 가로 ± 5px(4.5px 떨어진 원 포함 · 270px 떨어진 원 제외) · hover = 표(줄 비움)', () => {
    const m = model();
    const c = tickCirclesOf(m, view, x, y);
    const seed = c.find((v) => v.k === 0)!;
    expect(tickCircleGroupOf(c, seed, view).map((v) => v.k)).toEqual([0, 1]);
    const h = tickOrderHoverOf(m, c, seed, view);
    expect(h.key).toBe('o0');
    expect(h.group?.map((v) => v.k)).toEqual([0, 1]);
    expect(h.lines).toEqual([]);
    expect(h.circle).toBe(seed);
    expect(h.table?.count).toBe(2);
  });
});

/**
 * 스케치 028 ② — 원 옆 작은 상자 = 주문마다 한 줄 표.
 * 깨지면: 묶음 합계 · 건수 · 가격 첫 → 끝이 원과 어긋나거나, 줄 순서가 시간순이 아니거나, 긴 묶음이 상자를 늘린다.
 */
describe('tickGroupTableOf — 팀 주문 묶음 표', () => {
  it('1분 창 · 씨앗 k0 — 2건 · 같은 초 한 시각 · 매수 2건 1,505만 · 가격 10,000 → 10,100(+1.00%) · 줄 2개', () => {
    const m = model();
    const c = tickCirclesOf(m, view, x, y);
    const seed = c.find((v) => v.k === 0)!;
    const t = tickGroupTableOf(m, seed, tickCircleGroupOf(c, seed, view));
    expect(t.count).toBe(2);
    expect(t.clock).toBe('13:00:00');
    expect(t.buy).toEqual({ n: 2, val: 15_050_000 });
    expect(t.sell).toEqual({ n: 0, val: 0 });
    expect(t.net).toBe(15_050_000);
    expect([t.px0, t.px1]).toEqual([10_000, 10_100]);
    expect(t.chgPct).toBeCloseTo(1, 9);
    expect(t.avgDiffPct).toBeNull();
    expect(t.rows).toEqual([
      { k: 0, clock: '13:00:00.000', side: 'B', val: 10_000_000, px: 10_000, qty: 1000, pieces: 3, seed: true },
      { k: 1, clock: '13:00:00.500', side: 'B', val: 5_050_000, px: 10_100, qty: 500, pieces: 2, seed: false },
    ]);
    expect(t.more).toBe(0);
  });

  it('혼자인 원(k3) — 1건 · 줄 1개 · 가격 첫 → 끝 없음 · 잔량 0 이하면 평단 대비 null', () => {
    const m = model();
    const c = tickCirclesOf(m, view, x, y);
    const seed = c.find((v) => v.k === 3)!;
    const h = tickOrderHoverOf(m, c, seed, view);
    expect(h.group).toBeUndefined();
    const t = h.table!;
    expect(t.count).toBe(1);
    expect(t.clock).toBe('13:00:30');
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({ k: 3, side: 'S', val: 20_400_000, pieces: 4, seed: true });
    expect([t.px0, t.px1, t.chgPct]).toEqual([null, null, null]);
    expect(t.avgDiffPct).toBeNull();
  });

  it('혼자인 매수 원(평단 있음) — 그 시각 평단 대비 %', () => {
    const m = model();
    const c = tickCirclesOf(m, view, x, y);
    const seed = c.find((v) => v.k === 0)!;
    const t = tickGroupTableOf(m, seed, [seed]);
    expect(t.avgDiffPct).toBeCloseTo(0, 9);
  });

  it('하루 전체 창 · 씨앗 k0 — 4건 「13:00:00 ~ 13:00:30」 · 매수 2건 1,505만 · 매도 2건 2,341.5만', () => {
    const m = model();
    const day = { t0: B.T0, t1: B.T2000 };
    const xd = xOfTick(day, 52, 592);
    const c = tickCirclesOf(m, day, xd, y);
    const seed = c.find((v) => v.k === 0)!;
    const t = tickGroupTableOf(m, seed, tickCircleGroupOf(c, seed, day));
    expect(t.count).toBe(4);
    expect(t.clock).toBe('13:00:00 ~ 13:00:30');
    expect(t.buy).toEqual({ n: 2, val: 15_050_000 });
    expect(t.sell).toEqual({ n: 2, val: 23_415_000 });
    expect(t.rows.map((r) => r.k)).toEqual([0, 1, 2, 3]);
    expect([t.px0, t.px1]).toEqual([10_000, 10_200]);
  });

  it('9건 이상 묶음 — 앞 7줄 + more = count − 7', () => {
    const m = model();
    const base = tickCirclesOf(m, view, x, y).find((v) => v.k === 0)!;
    const g = Array.from({ length: 10 }, (_, i) => ({ ...base, k: 100 + i, o: { ...base.o, tMs: T13 + i } }));
    const t = tickGroupTableOf(m, g[0]!, g);
    expect(t.count).toBe(10);
    expect(t.rows).toHaveLength(7);
    expect(t.more).toBe(3);
    const eight = tickGroupTableOf(m, g[0]!, g.slice(0, 8));
    expect([eight.rows.length, eight.more]).toEqual([8, 0]);
  });
});

describe('tick-chart-tip — 팀 평단', () => {
  it('teamAvgAt — 체결 전 null · 매수 둘 뒤 평단', () => {
    const m = model();
    expect(teamAvgAt(m, T13 - 1)).toBeNull();
    expect(teamAvgAt(m, T13 + 600)).toBeCloseTo(15_050_000 / 1500, 6);
  });
});

/**
 * 스케치 028 ① 고정 띠 B — 판별 툴팁을 대신하는 그 시각 네 칸 값.
 * 깨지면: 띠의 당일 팀 · 10분 · 누적 값이 순매수 계단 · 10분 막대 · 넷째 판과 어긋나거나, 누적이 끊긴 자리에 옛 값이 남는다.
 */
describe('cumNetAt — 누적(이월 포함) 끊김 규칙(옛 순매수 판 툴팁 「누적 —」)', () => {
  it('점이 없음 · 첫 점 전 → null · 점 안 → 그 점 net', () => {
    const open: PosNetPoint[] = [{ t: B.T0900, net: 1_000_000_000, cycle: 1, end: 0 }];
    expect(cumNetAt([], T13)).toBeNull();
    expect(cumNetAt(open, B.T0900 - 1)).toBeNull();
    expect(cumNetAt(open, B.T0900)).toBe(1_000_000_000);
    expect(cumNetAt(open, T13 + 10_000)).toBe(1_000_000_000);
  });

  it('끝난 조각(end ≠ 0) 뒤 · cycle 이 바뀌기 전 틈 → null(그 점 시각 자체는 값)', () => {
    const closed: PosNetPoint[] = [{ t: B.T0900, net: 1_000_000_000, cycle: 1, end: 1 }];
    expect(cumNetAt(closed, B.T0900)).toBe(1_000_000_000);
    expect(cumNetAt(closed, T13)).toBeNull();
    const cyc: PosNetPoint[] = [
      { t: B.T0900, net: 5, cycle: 1, end: 0 },
      { t: T13, net: 7, cycle: 2, end: 0 },
    ];
    expect(cumNetAt(cyc, T13 - 1)).toBeNull();
    expect(cumNetAt(cyc, T13)).toBe(7);
  });
});

describe('tickBandAt — 고정 띠 네 칸(가격 | 당일 팀 | 10분 | 누적)', () => {
  const f = (a: number[]) => Float64Array.from(a);
  const price = { n: 3, t: f([T13, T13 + 500, T13 + 1000]), px: f([10_000, 10_100, 10_050]) };
  const tv: TurnoverSeries = {
    n: 3,
    t: f([T13, T13 + 1000, T13 + 2000]),
    pos: Int32Array.from([1, 2, 3]),
    qty: f([100, 600, 1000]),
    val: f([1_000_000, 6_000_000, 10_000_000]),
    teamBuy: f([0, 5_000_000, 5_000_000]),
    teamSell: f([0, 0, 1_000_000]),
    share: f([0, 5 / 6, 0.6]),
  };
  const src = (over: Partial<TickBandSource> = {}): TickBandSource => ({
    team: model(),
    cum: [],
    price,
    turnover: tv,
    basePx: 9_500,
    mcap: null,
    T0: B.T0,
    ...over,
  });

  it('첫 체결 전 — 가격 · 거래대금 null · 당일 순/매수/매도 0 · 10분 칸 0', () => {
    const b = tickBandAt(src(), T13 - 1);
    expect(b.px).toBeNull();
    expect(b.chgPct).toBeNull();
    expect(b.avg).toBeNull();
    expect([b.dayNet, b.dayBuy, b.daySell]).toEqual([0, 0, 0]);
    expect([b.tv, b.vol, b.share, b.capRatio]).toEqual([null, null, null, null]);
    expect([b.slotBuy, b.slotSell]).toEqual([0, 0]);
    expect(b.slotLabel).toBe('12:50~13:00');
    expect(b.hasTeam).toBe(true);
    expect(b.hasCum).toBe(false);
  });

  it('13:00:00.600 — 당일 매수 1,505만 · 매도 0 · 팀 평단 = teamAvgAt · 10분 칸 = buckets[30] · 누적 = 그 시각 A3', () => {
    const m = model();
    const b = tickBandAt(src({ team: m }), T13 + 600);
    expect(b.clock).toBe('13:00:00');
    expect(b.px).toBe(10_100);
    expect(b.chgPct).toBeCloseTo(((10_100 - 9_500) / 9_500) * 100, 9);
    expect([b.dayBuy, b.daySell, b.dayNet]).toEqual([15_050_000, 0, 15_050_000]);
    expect(b.avg).toBe(teamAvgAt(m, T13 + 600));
    expect(b.avgDiffPct).toBeCloseTo(((10_100 - b.avg!) / b.avg!) * 100, 9);
    expect(b.slotLabel).toBe('13:00~13:10');
    expect([b.slotBuy, b.slotSell]).toEqual([m.buckets.buy[30], m.buckets.sell[30]]);
    expect([b.tv, b.vol, b.share]).toEqual([1_000_000, 100, 0]);
    expect(b.capRatio).toBeNull();
  });

  it('시총을 알면 capRatio = 거래대금 ÷ 시총 · 기준가 모르면 등락률 null · 누적 점 있으면 hasCum', () => {
    const cum: PosNetPoint[] = [{ t: B.T0900, net: 1_000_000_000, cycle: 1, end: 0 }];
    const b = tickBandAt(src({ mcap: 1_000_000_000, basePx: null, cum }), T13 + 5_000);
    expect(b.capRatio).toBeCloseTo(0.01, 9);
    expect(b.share).toBeCloseTo(0.6, 9);
    expect(b.chgPct).toBeNull();
    expect(b.hasCum).toBe(true);
    expect(b.cum).toBe(1_000_000_000);
    expect([b.dayBuy, b.daySell]).toEqual([15_050_000, 3_015_000]);
  });
});

/**
 * Phase 38 Plan 07 Task 2 — 우리 점 툴팁 줄 · 팀 묶음 합치기(D-08 · D-02 · D-16).
 * 깨지면: ◆ 위에 마우스를 올려도 우리 수량 · 계좌 끝 4 · 주문번호가 안 나오거나 · 계좌 전체 번호가 새거나(D-02) ·
 * 팀 원 툴팁 문구 · 순서가 바뀌거나(D-16) · 5px 밖 우리 점까지 팀 툴팁에 붙는다.
 */
describe('tickOwnTipOf · tickHoverWithOwn — 우리 체결 · 근거 줄(Phase 38-07)', () => {
  const ACCT = '1234563801';
  const fillV = (id: number, over: Partial<OwnFillView>): OwnFillView => ({
    id,
    key: `KB120|${id}`,
    gateway: 'KB120',
    accountNo: ACCT,
    orderNo: '7788',
    side: 'B',
    px: 10_000,
    qty: 100,
    gwMs: T13,
    a3j: 0,
    rec: 0,
    est: false,
    candidates: 1,
    dtMs: 0,
    total: 100,
    order: 0,
    state: 'matched',
    ...over,
  });
  const orderV = (id: number, orderNo: string, label: string | null): OwnOrderView =>
    ({ id, key: `KB120|${orderNo}`, gateway: 'KB120', accountNo: ACCT, orderNo, evidenceLabel: label }) as OwnOrderView;
  const own: Pick<OwnModel, 'fills' | 'orders'> = {
    fills: [
      fillV(0, { qty: 300, total: 1064 }),
      fillV(1, { qty: 50, total: 50, est: true, orderNo: '7790' }),
      fillV(2, { qty: 7, rec: -1, a3j: -1, total: 0, state: 'nofill', orderNo: '7791' }),
      fillV(3, { qty: 9, rec: -1, a3j: -1, total: 0, state: 'pending', orderNo: '7792', accountNo: '' }),
    ],
    orders: [orderV(0, 'A1', '호가'), orderV(1, 'A2', '호가'), orderV(2, 'R9', '체결 구간')],
  };
  const mark = (over: Partial<OwnMark>): OwnMark => ({
    kind: 'fill',
    tMs: T13,
    px: 10_000,
    cx: 200,
    cy: 50,
    rec: 0,
    fillIds: [],
    orderId: 0,
    orderIds: [0],
    ...over,
  });
  const dia = mark({ kind: 'est', fillIds: [0, 1] });
  const nofill = mark({ kind: 'nofill', cx: 300, rec: -1, fillIds: [2] });
  const pending = mark({ kind: 'nofill', cx: 400, rec: -1, fillIds: [3] });
  const ev = mark({ kind: 'ev', cx: 500, rec: 9, orderIds: [0, 1] });
  const evRange = mark({ kind: 'ev', cx: 600, rec: 12, orderId: 2, orderIds: [2] });
  const marks = [ev, evRange, nofill, pending, dia];

  it('◆ — 체결마다 「우리 체결 n주[ / 전체 m주 — 부분만] · 계좌 ···끝4 · 주문 #[ · 추정]」 · 계좌 전체 번호는 없다', () => {
    const t = tickOwnTipOf(marks, own, 200, 50, P)!;
    expect(t.lines).toEqual([
      '우리 체결 300주 / 전체 1,064주 · 계좌 ···3801 · 주문 #7788',
      '우리 체결 50주 · 계좌 ···3801 · 주문 #7790 · 추정',
    ]);
    expect(t.lines.join('')).not.toContain(ACCT);
    expect(t.mark).toBe(dia);
  });

  it('◇ — 「 · 짝 전문 없음」 · 대기면 「 · 전문 아직 안 옴」 · 계좌 모르면 계좌 조각 생략', () => {
    expect(tickOwnTipOf(marks, own, 300, 50, P)!.lines).toEqual(['우리 체결 7주 · 계좌 ···3801 · 주문 #7791 · 짝 전문 없음']);
    expect(tickOwnTipOf(marks, own, 400, 50, P)!.lines).toEqual(['우리 체결 9주 · 주문 #7792 · 전문 아직 안 옴']);
  });

  it('○ — 주문마다 「조건 근거 {종류} · 주문 #」 · 구간은 「체결 구간」', () => {
    expect(tickOwnTipOf(marks, own, 500, 50, P)!.lines).toEqual(['조건 근거 호가 · 주문 #A1', '조건 근거 호가 · 주문 #A2']);
    expect(tickOwnTipOf(marks, own, 600, 50, P)!.lines).toEqual(['조건 근거 체결 구간 · 주문 #R9']);
  });

  it('가로 R + 3px 밖 · 가격 판 밖 → null · 가로 안 여럿이면 세로로 가장 가까운 점', () => {
    expect(tickOwnTipOf(marks, own, 200 + 4 + 3 + 1, 50, P)).toBeNull();
    expect(tickOwnTipOf(marks, own, 200, P.y2a + 5, P)).toBeNull();
    const lower = mark({ kind: 'nofill', cx: 201, cy: 90, rec: -1, fillIds: [2] });
    expect(tickOwnTipOf([...marks, lower], own, 200, 85, P)!.mark).toBe(lower);
    expect(tickOwnTipOf([...marks, lower], own, 200, 52, P)!.mark).toBe(dia);
  });

  it('팀 툴팁이 뜨는 자리 — 씨앗 가로 ± 5px 안 우리 점 줄을 팀 줄 뒤에 덧붙인다(팀 줄 · 순서 불변) · 밖이면 팀 그대로', () => {
    const team = { key: 'o3', lines: ['팀 줄 1', '팀 줄 2'], circle: { k: 3, o: {} as never, cx: 196, cy: 20, r: 6 } };
    const merged = tickHoverWithOwn(team, marks, own, 196, 20, P)!;
    expect(merged.lines).toEqual([
      '팀 줄 1',
      '팀 줄 2',
      '우리 체결 300주 / 전체 1,064주 · 계좌 ···3801 · 주문 #7788',
      '우리 체결 50주 · 계좌 ···3801 · 주문 #7790 · 추정',
    ]);
    expect(merged.circle).toBe(team.circle);
    expect(merged.key.startsWith('o3')).toBe(true);
    expect(merged.key).toContain('own:');
    const far = { ...team, circle: { ...team.circle, cx: 190 } };
    expect(tickHoverWithOwn(far, marks, own, 190, 20, P)).toBe(far);
    expect(team.lines).toEqual(['팀 줄 1', '팀 줄 2']);
  });

  it('팀 툴팁이 없으면 우리 줄만(key own: 접두 · circle null) · 우리 점이 없으면 팀 그대로 · 둘 다 없으면 null', () => {
    const h = tickHoverWithOwn(null, marks, own, 500, 50, P)!;
    expect(h.key.startsWith('own:')).toBe(true);
    expect(h.circle).toBeNull();
    expect(h.lines).toEqual(['조건 근거 호가 · 주문 #A1', '조건 근거 호가 · 주문 #A2']);
    expect(tickHoverWithOwn(null, [], own, 500, 50, P)).toBeNull();
    expect(tickHoverWithOwn(null, marks, own, 50, 50, P)).toBeNull();
  });
});
