import { describe, expect, it } from 'vitest';

import { buildPnlPrefix, type TeamFill } from '@gh-radar/shared';

import type { PosNetPoint } from '@/lib/accum-chart';
import { SYNTH_DATE } from '@/test-fixtures/tick-synth';

import type { TeamModel } from '../team-model';
import {
  TEAM_BUCKETS,
  tickBoundsOf,
  tickPanelsOf,
  TICK_CHART,
  xOfTick,
  type TickPanels,
  type TurnoverSeries,
} from '../tick-chart';
import {
  nearestTickCircleOf,
  teamAvgAt,
  tickBucketTipAt,
  tickCircleGroupOf,
  tickCirclesOf,
  tickNetTipAt,
  tickOrderHoverOf,
  tickTurnoverTipAt,
} from '../tick-chart-tip';

/**
 * 틱뷰어 차트 툴팁(2026-11-03 · 매집감지 상세 차트 툴팁 · 묶음 규칙 이식).
 *
 * 깨지면: 원 위에 마우스를 올려도 그 주문 · 근처 주문 합계가 안 나오거나, 5px 밖 원까지 묶이거나, 순매수 · 10분 판 툴팁 값이
 * 계단 · 막대와 어긋난다.
 */

const B = tickBoundsOf(SYNTH_DATE);
const T13 = B.T0 + 5 * 3_600_000;
const P: TickPanels = tickPanelsOf(TICK_CHART.desktop);

/** 팀 주문 4건 — 매수 1,000만 · 매수 505만(0.5초 뒤) · 매도 301.5만(원 문턱 아래) · 매도 2,040만(30초 뒤). 주문당 체결 1개. */
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
  let net = 0;
  const dayStairs = teamOrders.map((o) => {
    net += o.side === 'B' ? o.val : -o.val;
    return { tMs: o.tMs, net, qty: 0 };
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
  it('tickCirclesOf — 500만 미만 제외 · 큰 원 먼저 · k = teamOrders 번호', () => {
    const c = tickCirclesOf(model(), view, x, y);
    expect(c.map((v) => v.k)).toEqual([3, 0, 1]);
    expect(c[1]!.cx).toBeCloseTo(52, 6);
  });

  it('씨앗 = 세로선이 지나는 원 · 가격 판 밖이면 없음', () => {
    const c = tickCirclesOf(model(), view, x, y);
    expect(nearestTickCircleOf(c, 53, 50, P)?.k).toBe(0);
    expect(nearestTickCircleOf(c, 200, 50, P)).toBeNull();
    expect(nearestTickCircleOf(c, 53, P.y2a + 5, P)).toBeNull();
  });

  it('묶음 = 씨앗 가로 ± 5px(4.5px 떨어진 원 포함 · 270px 떨어진 원 제외) · 3줄 합산', () => {
    const m = model();
    const c = tickCirclesOf(m, view, x, y);
    const seed = c.find((v) => v.k === 0)!;
    expect(tickCircleGroupOf(c, seed, view).map((v) => v.k)).toEqual([0, 1]);
    const h = tickOrderHoverOf(m, 9_500, c, seed, view);
    expect(h.key).toBe('o0');
    expect(h.group?.map((v) => v.k)).toEqual([0, 1]);
    expect(h.lines).toEqual([
      '13:00:00 팀 매수 1,000주 · 1,000만 @10,000 · 3조각 · 당일 순매수 +1,000만 · 등락률 +5.26% · 평단 대비 0.00%',
      '묶음 2건 13:00:00 · 팀 매수 2건 합계 1,505만 · 가격 10,000 → 10,100 (+1.00%)',
      '큰 주문 1,000만@10,000 · 505만@10,100',
    ]);
  });

  it('혼자인 원 = 2줄 · group 없음 · 기준가 없으면 등락률 · 잔량 0 이하면 평단 대비 생략', () => {
    const m = model();
    const c = tickCirclesOf(m, view, x, y);
    const h = tickOrderHoverOf(m, null, c, c.find((v) => v.k === 3)!, view);
    expect(h.group).toBeUndefined();
    expect(h.lines[0]).toBe('13:00:30 팀 매도 2,000주 · 2,040만 @10,200 · 4조각');
    expect(h.lines[1]).toBe('당일 순매수 −837만');
  });

  it('확대 전(하루 전체 창)이면 30초 떨어진 매도까지 묶이고 매수/매도를 나눠 합산한다', () => {
    const m = model();
    const day = { t0: B.T0, t1: B.T2000 };
    const xd = xOfTick(day, 52, 592);
    const c = tickCirclesOf(m, day, xd, y);
    const h = tickOrderHoverOf(m, null, c, c.find((v) => v.k === 0)!, day);
    expect(h.lines[1]).toBe(
      '묶음 3건 13:00:00 ~ 13:00:30 · 팀 매수 2건 1,505만 · 팀 매도 1건 2,040만 · 가격 10,000 → 10,200 (+2.00%)',
    );
    expect(h.lines[2]).toBe('큰 주문 매도 2,040만@10,200 · 매수 1,000만@10,000 · 매수 505만@10,100');
  });
});

describe('tick-chart-tip — 순매수 · 10분 판', () => {
  it('teamAvgAt — 체결 전 null · 매수 둘 뒤 평단', () => {
    const m = model();
    expect(teamAvgAt(m, T13 - 1)).toBeNull();
    expect(teamAvgAt(m, T13 + 600)).toBeCloseTo(15_050_000 / 1500, 6);
  });

  it('누적 없음 — 첫 주문 전 null · 그 뒤 「시각 · 당일 순매수 · 팀 평단」', () => {
    const m = model();
    expect(tickNetTipAt(m, [], T13 - 1)).toBeNull();
    const h = tickNetTipAt(m, [], T13 + 10_000)!;
    expect(h.key).toBe('c2');
    expect(h.lines).toEqual(['13:00:01 · 당일 순매수 +1,204만 · 팀 평단 10,033원']);
  });

  it('누적 있음 — 「누적 ±X(이월 포함)」 · 끝난 조각 뒤는 「누적 —」', () => {
    const m = model();
    const open: PosNetPoint[] = [{ t: B.T0900, net: 1_000_000_000, cycle: 1, end: 0 }];
    expect(tickNetTipAt(m, open, T13 - 1)!.lines[0]).toBe('09:00:00 · 당일 순매수 0 · 누적 +10.0억(이월 포함)');
    expect(tickNetTipAt(m, open, T13 + 10_000)!.lines[0]).toContain('누적 +10.0억(이월 포함)');
    const closed: PosNetPoint[] = [{ t: B.T0900, net: 1_000_000_000, cycle: 1, end: 1 }];
    expect(tickNetTipAt(m, closed, T13 + 10_000)!.lines[0]).toContain('누적 —');
  });

  it('10분 칸 — 「HH:MM~HH:MM · 팀 매수 / 매도 / 순」 · 빈 칸 · 범위 밖 null', () => {
    const m = model();
    expect(tickBucketTipAt(m, B.T0, T13 + 5_000)!.lines).toEqual([
      '13:00~13:10 · 팀 매수 1,505만 / 매도 2,342만 / 순 −837만',
    ]);
    expect(tickBucketTipAt(m, B.T0, T13 + 700_000)).toBeNull();
    expect(tickBucketTipAt(m, B.T0, B.T0 - 1)).toBeNull();
  });
});

describe('누적 판 툴팁 — 그 시각까지 거래량 · 거래대금(시총 대비) · 팀 비중', () => {
  const f = (a: number[]) => Float64Array.from(a);
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

  it('첫 체결 앞 → null · 팀 체결 전 → 「팀 체결 없음」', () => {
    expect(tickTurnoverTipAt(tv, T13 - 1, null)).toBeNull();
    expect(tickTurnoverTipAt(tv, T13 + 500, null)!.lines).toEqual(['13:00:00까지 · 거래량 100주 · 거래대금 100만', '팀 체결 없음']);
  });

  it('시총을 알면 시총 대비 · 팀 금액 · 비중 · 매수/매도 · key = 점 색인', () => {
    const h = tickTurnoverTipAt(tv, T13 + 5000, 1_000_000_000)!;
    expect(h.key).toBe('v2');
    expect(h.lines).toEqual([
      '13:00:02까지 · 거래량 1,000주 · 거래대금 1,000만(시총 대비 1.0%)',
      '팀 600만 60.0% · 매수 500만 · 매도 100만',
    ]);
  });
});
