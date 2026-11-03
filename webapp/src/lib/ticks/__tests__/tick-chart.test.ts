import { describe, expect, it } from 'vitest';

import { buildPnlPrefix, dayStartNs, type TeamFill } from '@gh-radar/shared';

import { TICK_FIXTURE_DATE, tickFixtureBytes, tickGridBytes } from '@/test-fixtures/tick-grid';
import { SYNTH_DATE, inversionSession, r8Msg, synthSession } from '@/test-fixtures/tick-synth';

import {
  TEAM_BUCKETS,
  TICK_CHART,
  cumNetRangeOf,
  cumPointsOf,
  cursorXOf,
  dayNetRangeOf,
  lastRecvMsOf,
  teamAvgPathOf,
  teamBucketsOf,
  teamDayStairsOf,
  viBandsOf,
  yOfNet,
  decimatedIdxOf,
  priceSeriesOf,
  pricePathDecimated,
  tOfTick,
  tickBoundsOf,
  tickPanelsOf,
  tickPriceRangeOf,
  tickTicksOf,
  xOfTick,
  yOfTickPrice,
} from '../tick-chart';
import { buildTickSession } from '../tick-session';

/**
 * Phase 37 Plan 14 Task 1 — 틱 차트 기하(경계 · 눈금 · 열별 4점 솎음 · 커서 x).
 * 깨지면: 차트가 08:00 이 아닌 곳에서 시작하거나(경계) · 10초 창 눈금이 겹치거나(눈금) · 하루 전체에서 SVG 점이 수만 개가
 * 되거나(솎음 상한) · 급등 칸의 고가/저가가 선에서 사라지거나(4점 규칙) · 커서가 엉뚱한 x 에 선다.
 */

const M = 60_000;
const H = 3_600_000;
const B = tickBoundsOf(TICK_FIXTURE_DATE);

describe('tickBoundsOf · 판 치수', () => {
  it('08:00 = dayStartNs · 09:00 · 15:30 · 16:00 · 20:00 KST(ms)', () => {
    expect(B.T0).toBe(Number(dayStartNs(TICK_FIXTURE_DATE, '0800') / 1_000_000n));
    expect(B.T0900 - B.T0).toBe(H);
    expect(B.T1530 - B.T0).toBe(7.5 * H);
    expect(B.T1600 - B.T0).toBe(8 * H);
    expect(B.T2000 - B.T0).toBe(12 * H);
  });

  it('데스크톱 합 230 · 폰 165(스케치 019 D)', () => {
    expect(tickPanelsOf(TICK_CHART.desktop).H).toBe(230);
    expect(tickPanelsOf(TICK_CHART.phone).H).toBe(165);
    expect(TICK_CHART.desktop.H).toBe(230);
    expect(TICK_CHART.phone.H).toBe(165);
  });
});

describe('tickTicksOf — 1초 ~ 3시간 단계 · 라벨 폭', () => {
  it('하루 전체(12h · 그림 폭 540) → 1시간 이상 간격 · 정시 라벨 「H」', () => {
    const ticks = tickTicksOf({ t0: B.T0, t1: B.T2000 }, 540);
    expect(ticks.length).toBeGreaterThan(3);
    expect(ticks[0]!.t).toBe(B.T0);
    expect(ticks[0]!.label).toBe('8');
    const step = ticks[1]!.t - ticks[0]!.t;
    expect(step).toBeGreaterThanOrEqual(H);
    expect((step / (12 * H)) * 540).toBeGreaterThanOrEqual(36);
  });

  it('10초 창 → 초 간격 · 라벨 「HH:MM:SS」 · 라벨 간격 ≥ 60px(폭 540 = 5초 · 폭 900 = 1초)', () => {
    const t0 = B.T0 + 5 * H + 3_000;
    const narrow = tickTicksOf({ t0, t1: t0 + 10_000 }, 540);
    expect(narrow[1]!.t - narrow[0]!.t).toBe(5_000);
    expect(narrow[0]!.label).toBe('13:00:05');
    const wide = tickTicksOf({ t0, t1: t0 + 10_000 }, 900);
    expect(wide[1]!.t - wide[0]!.t).toBe(1_000);
    expect(wide[0]!.label).toBe('13:00:03');
  });

  it('1분 창 · 좁은 폭(250) → 15초 이상 간격(라벨 겹침 없음)', () => {
    const t0 = B.T0 + 5 * H;
    const ticks = tickTicksOf({ t0, t1: t0 + M }, 250);
    const step = ticks[1]!.t - ticks[0]!.t;
    expect((step / M) * 250).toBeGreaterThanOrEqual(60);
  });
});

describe('decimatedIdxOf — 열마다 첫 · 최소 · 최대 · 끝 4점', () => {
  // 한 열(폭 10px 창 · 1열 = 1초)에 점 6개: 100 → 90(최소) → 120(최대) → 105 → 110 → 101
  const t = Float64Array.from([0, 100, 200, 300, 400, 500, 1500, 2500]);
  const px = Float64Array.from([100, 90, 120, 105, 110, 101, 99, 98]);
  const s = { n: t.length, t, px };

  it('한 열 안 6점 → 첫(0) · 최소(1) · 최대(2) · 끝(5) 만 색인 순서로', () => {
    const idx = decimatedIdxOf(s, { t0: 0, t1: 10_000 }, 10);
    expect(idx.slice(0, 4)).toEqual([0, 1, 2, 5]);
    // 다음 열들은 한 점씩
    expect(idx.slice(4)).toEqual([6, 7]);
  });

  it('창 앞 · 뒤 한 점씩 더해 선이 경계까지 이어진다', () => {
    const idx = decimatedIdxOf(s, { t0: 1000, t1: 2000 }, 10);
    expect(idx).toEqual([5, 6, 7]);
  });

  it('최소 = 최대 = 첫 점이면 중복 없이 하나', () => {
    const one = { n: 1, t: Float64Array.from([50]), px: Float64Array.from([7]) };
    expect(decimatedIdxOf(one, { t0: 0, t1: 100 }, 10)).toEqual([0]);
  });
});

describe('컷 13시 KRX 세션 — 열 수 상한 · 가격 범위 · 커서 x', () => {
  const session = buildTickSession(tickGridBytes(), { date: TICK_FIXTURE_DATE, ex: 'KRX' });
  const series = priceSeriesOf(session);

  it('수신순 A3 계열 — 가격 0 제외 · 시각 오름차순 · 세션마다 한 번(같은 객체)', () => {
    expect(series.n).toBeGreaterThan(1000);
    for (let k = 1; k < series.n; k++) expect(series.t[k]!).toBeGreaterThanOrEqual(series.t[k - 1]!);
    for (let k = 0; k < series.n; k++) expect(series.px[k]!).toBeGreaterThan(0);
    expect(priceSeriesOf(session)).toBe(series);
  });

  it('하루 전체 창 · 그림 폭 300 → 경로 점 ≤ 4 × (300 + 2) · 3,000 체결보다 훨씬 적다', () => {
    const view = { t0: B.T0, t1: B.T2000 };
    const idx = decimatedIdxOf(series, view, 300);
    expect(idx.length).toBeLessThanOrEqual(4 * (300 + 2));
    const x = xOfTick(view, 52, 352);
    const range = tickPriceRangeOf(series, view);
    const y = yOfTickPrice(range, tickPanelsOf(TICK_CHART.desktop));
    const d = pricePathDecimated(session, view, x, y, 300);
    const pts = (d.match(/[ML]/g) ?? []).length;
    expect(pts).toBe(idx.length);
    expect(pts).toBeLessThan(series.n / 2);
    // 창 안 최고가 · 최저가가 경로에 있다(4점 규칙)
    let mx = 0;
    let mn = Infinity;
    for (let k = 0; k < series.n; k++) {
      mx = Math.max(mx, series.px[k]!);
      mn = Math.min(mn, series.px[k]!);
    }
    const kept = idx.map((i) => series.px[i]!);
    expect(kept).toContain(mx);
    expect(kept).toContain(mn);
    expect(range.min).toBe(mn);
    expect(range.max).toBe(mx);
  });

  it('체결 없는 창(08:00~08:10) → 가격 범위는 하루 전체 폴백 · 경로는 창 뒤 한 점만', () => {
    const view = { t0: B.T0, t1: B.T0 + 10 * M };
    const range = tickPriceRangeOf(series, view);
    expect(Number.isFinite(range.lo)).toBe(true);
    expect(decimatedIdxOf(series, view, 300)).toEqual([0]);
  });

  it('cursorXOf — 창 안이면 x · 창 밖 · null 이면 null · tOfTick 이 역', () => {
    const view = { t0: B.T0 + 5 * H, t1: B.T0 + 6 * H };
    const x = xOfTick(view, 52, 592);
    expect(cursorXOf(view, x, B.T0 + 5.5 * H)).toBeCloseTo(322, 6);
    expect(cursorXOf(view, x, B.T0 + 4 * H)).toBeNull();
    expect(cursorXOf(view, x, null)).toBeNull();
    expect(tOfTick(view, 52, 592)(322)).toBeCloseTo(B.T0 + 5.5 * H, 3);
  });
});

describe('팀 레이어 기하(Task 2) — 당일 계단 · 누적 점 · 10분 막대 72칸 · VI 띠 · 평단', () => {
  const P = tickPanelsOf(TICK_CHART.desktop);
  const view = { t0: B.T0, t1: B.T2000 };
  const x = xOfTick(view, 52, 592);

  it('teamDayStairsOf — 0 에서 시작(x = 08:00) · 주문마다 H·V · 끝 = max(마지막 계단, endMs) · 없으면 빈 문자열', () => {
    const model = { dayStairs: [{ tMs: B.T0 + 5 * H, net: 100, qty: 1 }, { tMs: B.T0 + 6 * H, net: -50, qty: -1 }] };
    const range = dayNetRangeOf(model);
    expect(range).toEqual({ min: -50, max: 100 });
    const y = yOfNet(range, P);
    const d = teamDayStairsOf(model, x, y, B.T0, B.T0 + 7 * H);
    expect(d).toBe(
      `M52.0,${y(0).toFixed(1)}H277.0V${y(100).toFixed(1)}H322.0V${y(-50).toFixed(1)}H367.0`,
    );
    expect(teamDayStairsOf({ dayStairs: [] }, x, y, B.T0, B.T2000)).toBe('');
  });

  it('yOfNet — 범위 0(팀 없음)이면 판 가운데 · 0 포함 범위는 판 안', () => {
    const flat = yOfNet({ min: 0, max: 0 }, P);
    expect(flat(0)).toBe(P.y2a + 3 + (P.y2b - P.y2a - 6) / 2);
    const y = yOfNet({ min: -10, max: 30 }, P);
    expect(y(30)).toBe(P.y2a + 3);
    expect(y(-10)).toBe(P.y2b - 3);
  });

  it('cumPointsOf — 당일 화면 · accum 없음 · 모양 어긋남 → [] · pos_net 있으면 점(0 포함 범위)', () => {
    const accum = { reg_time_ms: null, pos_net: { t_ms: [B.T0900], net_krw: [5e8], cycle: [1] } };
    expect(cumPointsOf(accum, true)).toEqual([]);
    expect(cumPointsOf(null, false)).toEqual([]);
    expect(cumPointsOf({ reg_time_ms: null, pos_net: 'x' }, false)).toEqual([]);
    const pts = cumPointsOf(accum, false);
    expect(pts).toEqual([{ t: B.T0900, net: 5e8, cycle: 1, end: 0 }]);
    expect(cumNetRangeOf(pts)).toEqual({ min: 0, max: 5e8 });
  });

  it('teamBucketsOf — 72칸 모델에서 값 있는 칸만 막대 쌍(매수 왼쪽 · 매도 오른쪽 · 바닥 = 판 아래선)', () => {
    const buy = new Float64Array(TEAM_BUCKETS);
    const sell = new Float64Array(TEAM_BUCKETS);
    buy[30] = 200;
    sell[30] = 100;
    sell[71] = 50;
    const bars = teamBucketsOf({ buckets: { buy, sell } }, view, x, B.T0, P);
    expect(TEAM_BUCKETS).toBe(72);
    expect(bars.map((b) => b.slot)).toEqual([30, 71]);
    expect(bars[0]!.buy!.y + bars[0]!.buy!.h).toBeCloseTo(P.y3b, 9);
    expect(bars[0]!.sell!.h).toBeCloseTo(bars[0]!.buy!.h / 2, 9);
    expect(bars[0]!.sell!.x).toBeGreaterThan(bars[0]!.buy!.x);
    expect(bars[1]!.buy).toBeNull();
  });

  it('천일 10/14 세션 — 모델 막대 72칸 · 막대 수 ≤ 72', () => {
    const s = buildTickSession(tickFixtureBytes('chunil-1014-a3.ticks.zst'), { date: '20261014', ex: 'KRX' });
    expect(s.team.buckets.buy.length).toBe(72);
    const b = tickBoundsOf('20261014');
    const bars = teamBucketsOf(s.team, { t0: b.T0, t1: b.T2000 }, xOfTick({ t0: b.T0, t1: b.T2000 }, 52, 592), b.T0, P);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.length).toBeLessThanOrEqual(72);
  });

  it('viBandsOf — 발동 ~ 해제 수신 · 해제 없으면 진행 중(끝 = 세션 마지막 수신)', () => {
    const closed = viBandsOf(inversionSession());
    expect(closed).toHaveLength(1);
    expect(closed[0]!.open).toBe(false);
    expect(closed[0]!.t1 - closed[0]!.t0).toBeCloseTo(1, 3); // 14ms → 15ms(ms double 해상도 ≈ 0.25µs)
    const s = synthSession([
      [0, r8Msg({ seq: 1, status: '1', triggerPx: 18040 })],
      [250, r8Msg({ seq: 2, status: '1', triggerPx: 18040 })],
    ]);
    const open = viBandsOf(s);
    expect(open).toHaveLength(1);
    expect(open[0]!.open).toBe(true);
    expect(open[0]!.t1).toBe(lastRecvMsOf(s));
    expect(open[0]!.t1 - open[0]!.t0).toBeCloseTo(250, 3);
    expect(SYNTH_DATE).toBe('20261016');
  });

  it('teamAvgPathOf — 잔량 > 0 동안 평단 계단 · 잔량 0 에서 끊김 · 열린 끝은 endMs 까지', () => {
    const T = 1_760_000_000_000_000_000n;
    const fills: TeamFill[] = [
      { rec: 0, tNs: T, bs: '2', px: 100, qty: 10 },
      { rec: 1, tNs: T + 1n, bs: '2', px: 200, qty: 10 },
      { rec: 2, tNs: T + 2n, bs: '1', px: 150, qty: 20 },
      { rec: 3, tNs: T + 3n, bs: '2', px: 120, qty: 5 },
    ];
    const prefix = buildPnlPrefix(fills);
    const fillMs = Float64Array.from([B.T0 + H, B.T0 + 2 * H, B.T0 + 3 * H, B.T0 + 4 * H]);
    const y = (v: number) => v;
    const d = teamAvgPathOf({ fills, prefix, fillMs }, x, y, { lo: 0, hi: 1000 }, B.T0 + 5 * H);
    // 08+1h 평단 100 → 08+2h 150 → 08+3h 잔량 0(끊김) → 08+4h 120 새 조각 → 끝 08+5h
    expect(d).toBe('M97.0,100.0H142.0V150.0H187.0M232.0,120.0H277.0');
    // 판 범위 밖 평단은 클램프
    const c = teamAvgPathOf({ fills, prefix, fillMs }, x, y, { lo: 0, hi: 120 }, B.T0 + 5 * H);
    expect(c).toContain('V120.0');
  });
});
