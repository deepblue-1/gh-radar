import { describe, expect, it } from 'vitest';

import {
  a3TimeMs,
  buildPnlPrefix,
  dayStartNs,
  type TeamFill,
  type TickOwnEvent,
  type TickOwnFill,
  type TickOwnResponse,
} from '@gh-radar/shared';

import { TICK_FIXTURE_DATE, tickFixtureBytes, tickGridBytes } from '@/test-fixtures/tick-grid';
import {
  SYNTH_DATE,
  SYNTH_ISIN,
  a3Msg,
  b6Msg,
  inversionSession,
  r8Msg,
  synthNs,
  synthSession,
} from '@/test-fixtures/tick-synth';

import { buildOwnModel } from '../own-model';
import {
  OWN_MARK_HIT_PAD,
  TEAM_BUCKETS,
  msOfNs,
  ownMarkAt,
  ownMarksOf,
  TICK_CHART,
  cumNetRangeOf,
  cumPointsOf,
  cursorXOf,
  dayNetRangeOf,
  lastRecvMsOf,
  marketCapOf,
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
  turnoverIdxAtPos,
  turnoverPathsOf,
  yOfShare,
  turnoverSeriesOf,
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

  it('데스크톱 합 307 · 폰 222(스케치 019 D + 022 넷째 판 + 028 ④ 순매수 판 70 / 50)', () => {
    expect(tickPanelsOf(TICK_CHART.desktop).H).toBe(307);
    expect(tickPanelsOf(TICK_CHART.phone).H).toBe(222);
    expect(TICK_CHART.desktop.H).toBe(307);
    expect(TICK_CHART.phone.H).toBe(222);
    const p = tickPanelsOf(TICK_CHART.desktop);
    expect([p.y1a, p.y1b, p.y2a, p.y2b, p.y3a, p.y3b, p.y4a, p.y4b]).toEqual([7, 111, 118, 188, 195, 235, 242, 292]);
    const ph = tickPanelsOf(TICK_CHART.phone);
    expect([ph.y1b, ph.y2a, ph.y2b, ph.y3a, ph.y3b, ph.y4a, ph.y4b]).toEqual([72, 79, 129, 136, 164, 171, 207]);
  });

  it('yOfShare — 0 = 넷째 판 아래선 · 위끝 = y4a + 3 · 넘는 값은 위끝(선 · 호버 점 한 벌)', () => {
    const p = tickPanelsOf(TICK_CHART.desktop);
    const yS = yOfShare(0.1, p);
    expect(yS(0)).toBe(p.y4b);
    expect(yS(0.1)).toBeCloseTo(p.y4a + 3, 9);
    expect(yS(0.5)).toBeCloseTo(p.y4a + 3, 9);
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
    const model = {
      dayStairs: [
        { tMs: B.T0 + 5 * H, net: 100, qty: 1, buy: 100, sell: 0 },
        { tMs: B.T0 + 6 * H, net: -50, qty: -1, buy: 100, sell: 150 },
      ],
    };
    // 범위 = 순매수 · 매수 누적 · 거울 매도 누적(−150) ∪ 0 — 세 선이 다 축 안(스케치 028 ④)
    const range = dayNetRangeOf(model);
    expect(range).toEqual({ min: -150, max: 100 });
    const y = yOfNet(range, P);
    const d = teamDayStairsOf(model, x, y, B.T0, B.T0 + 7 * H);
    expect(d).toBe(
      `M52.0,${y(0).toFixed(1)}H277.0V${y(100).toFixed(1)}H322.0V${y(-50).toFixed(1)}H367.0`,
    );
    // pick 생략 = net(위와 같은 문자열) · 매수 · 거울 매도 값 고르기
    expect(teamDayStairsOf(model, x, y, B.T0, B.T0 + 7 * H, (st) => st.net)).toBe(d);
    expect(teamDayStairsOf(model, x, y, B.T0, B.T0 + 7 * H, (st) => st.buy)).toBe(
      `M52.0,${y(0).toFixed(1)}H277.0V${y(100).toFixed(1)}H322.0V${y(100).toFixed(1)}H367.0`,
    );
    expect(teamDayStairsOf(model, x, y, B.T0, B.T0 + 7 * H, (st) => -st.sell)).toBe(
      `M52.0,${y(0).toFixed(1)}H277.0V${y(0).toFixed(1)}H322.0V${y(-150).toFixed(1)}H367.0`,
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

describe('넷째 판 — 누적 거래대금 · 누적 팀 비중(스케치 022 A)', () => {
  /** 팀 매수 3조각 984만 · 일반 50주 · 팀 매도 652만(tick-chart.test.tsx 와 같은 하루). */
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
  const BS = tickBoundsOf(SYNTH_DATE);

  it('turnoverSeriesOf — A3 하나마다 누적(수량 · 금액 · 팀 매수/매도) · 비중 = 팀 ÷ 금액 · 세션마다 한 번', () => {
    const tv = turnoverSeriesOf(s);
    expect(tv.n).toBe(5);
    expect(Array.from(tv.qty)).toEqual([100, 300, 600, 650, 1050]);
    expect(tv.val[4]).toBe(9_840_000 + 817_500 + 6_520_000);
    expect(tv.teamBuy[4]).toBe(9_840_000);
    expect(tv.teamSell[4]).toBe(6_520_000);
    expect(tv.teamSell[3]).toBe(0);
    expect(tv.share[2]).toBe(1);
    expect(tv.share[4]).toBeCloseTo(16_360_000 / 17_177_500, 12);
    expect(turnoverSeriesOf(s)).toBe(tv);
  });

  it('늦게 시작한 기록 — 시작값 = 첫 A3 거래소 누적 − 그 체결(카드 큰 숫자와 맞는다)', () => {
    const late = synthSession([
      [1, a3Msg({ seq: 9, bs: '2', px: 1000, qty: 10, time: '130000001000', cumValue: 5_010_000, cumVolume: 5_010 })],
      [2, a3Msg({ seq: 10, bs: '1', px: 1000, qty: 5, time: '130000002000', cumValue: 5_015_000, cumVolume: 5_015 })],
    ]);
    const tv = turnoverSeriesOf(late);
    expect(Array.from(tv.val)).toEqual([5_010_000, 5_015_000]);
    expect(Array.from(tv.qty)).toEqual([5_010, 5_015]);
  });

  it('turnoverIdxAtPos — 수신순 자리 이하 마지막 점(첫 A3 앞 B6 = −1)', () => {
    const tv = turnoverSeriesOf(s);
    expect(turnoverIdxAtPos(tv, 0)).toBe(-1);
    expect(turnoverIdxAtPos(tv, tv.pos[2]!)).toBe(2);
    expect(turnoverIdxAtPos(tv, tv.pos[2]! + 1)).toBe(2);
    expect(turnoverIdxAtPos(tv, 10_000)).toBe(4);
  });

  it('marketCapOf — 기준가 × 상장주식수 · 하나라도 없거나 0 이하면 null', () => {
    expect(marketCapOf(15_400, 1_000_000)).toBe(15_400_000_000);
    expect(marketCapOf(null, 1_000_000)).toBeNull();
    expect(marketCapOf(15_400, null)).toBeNull();
    expect(marketCapOf(15_400, undefined)).toBeNull();
    expect(marketCapOf(15_400, 0)).toBeNull();
  });

  it('turnoverPathsOf — 영역은 바닥에서 닫히고 · 비중 축 위끝은 5% 올림 · 창 거래대금 범위 = 창 시작 직전 ~ 창 끝', () => {
    const tv = turnoverSeriesOf(s);
    const p = tickPanelsOf(TICK_CHART.desktop);
    const full = { t0: BS.T0, t1: BS.T2000 };
    const x = xOfTick(full, 52, 588);
    const out = turnoverPathsOf(tv, full, x, p, 536, BS.T2000);
    expect(out.area.startsWith('M')).toBe(true);
    expect(out.area.endsWith(`V${p.y4b.toFixed(1)}Z`)).toBe(true);
    expect(out.share.startsWith('M')).toBe(true);
    expect(out.valLo).toBe(0);
    expect(out.valHi).toBe(tv.val[4]);
    expect(out.shareTop).toBe(1);
    // 셋째 체결 뒤부터 보는 창 — 아래끝 = 그 직전 누적
    const tail = turnoverPathsOf(tv, { t0: (tv.t[2]! + tv.t[3]!) / 2, t1: tv.t[4]! + 10_000 }, x, p, 536, BS.T2000);
    expect(tail.valLo).toBe(tv.val[2]);
    expect(tail.valHi).toBe(tv.val[4]);
  });

  it('팀 체결이 없으면 비중 선 없음 · A3 가 없으면 둘 다 빈 문자열', () => {
    const p = tickPanelsOf(TICK_CHART.desktop);
    const full = { t0: BS.T0, t1: BS.T2000 };
    const x = xOfTick(full, 52, 588);
    const plain = synthSession([
      [0, b6Msg({ seq: 1, ask1: [16400, 10], bid1: [16350, 10] })],
      [1, a3Msg({ seq: 2, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000001000' })],
      [2, b6Msg({ seq: 3, ask1: [16400, 10], bid1: [16350, 5] })],
    ]);
    expect(plain.team.fills).toHaveLength(0);
    const a = turnoverPathsOf(turnoverSeriesOf(plain), full, x, p, 536, BS.T2000);
    expect(a.area).not.toBe('');
    expect(a.share).toBe('');
    const none = synthSession([[0, b6Msg({ seq: 1, ask1: [1000, 1], bid1: [990, 1] })]]);
    expect(turnoverPathsOf(turnoverSeriesOf(none), full, x, p, 536, BS.T2000).area).toBe('');
  });
});

/**
 * Phase 38 Plan 07 Task 1 — 가격 판 우리 점(D-08 · D-11).
 * 깨지면: 같은 A3 에 붙은 우리 체결이 ◆ 여러 개로 겹치거나 · 추정이 채운 ◆ 로 보이거나 · 짝 없는 체결이 엉뚱한 시각에 서거나 ·
 * 근거 ○ 가 주문 시각(gw)에 서거나 · 구간 근거가 첫 A3 에 서거나 · ◆ 가 ○ 아래에 깔린다.
 */
describe('ownMarksOf — ◆ · ◇ · ○ (Phase 38-07)', () => {
  // rec 0 A3 .100 16,400 ×100 cum 1,000 · rec 1 B6 .1505(매도1 16,400 ×38,200) · rec 2 A3 .250 ×200 cum 1,200 ·
  // rec 3 A3 .260 ×300 cum 1,500 · rec 4 A3 .300 16,450 ×50 cum 1,550 · rec 5 B6 .4005
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
  const recvMs = (rec: number) => msOfNs(es.index.recvNs[rec]!);
  const fill = (orderNo: string, gwMs: number, px: number, qty: number, seq: number): TickOwnFill => ({
    gateway: 'KB120',
    seq,
    gw_time_ms: gwMs,
    account_no: '1234563801',
    order_no: orderNo,
    side: 'B',
    exec_price: px,
    exec_qty: qty,
  });
  const event = (orderNo: string, gwMs: number, over: Partial<TickOwnEvent>): TickOwnEvent => ({
    gateway: 'KB120',
    seq: 1,
    gw_time_ms: gwMs,
    kind: 3,
    group: 1,
    account_no: '1234563801',
    order_no: orderNo,
    price: 16400,
    qty: 300,
    reason_code: '',
    cond_metric: 0,
    cond_threshold: 0,
    cond_actual: 0,
    ev_kind: 0,
    ev_price: 0,
    ev_qty_before: 0,
    ev_qty_after: 0,
    ev_trade_qty: 0,
    cum_volume: 0,
    ...over,
  });
  const own: TickOwnResponse = {
    access: true,
    date: SYNTH_DATE,
    exchange: 'KRX',
    isin: SYNTH_ISIN,
    servers: ['KB120'],
    events: [
      // 호가 근거 둘(같은 B6 rec 1) — ○ 하나 · 주문 둘
      event('B6', at(200), { ev_kind: 1, ev_price: 16400, ev_qty_after: 38_200, cum_volume: 1000 }),
      event('B7', at(210), { ev_kind: 1, ev_price: 16400, ev_qty_after: 38_200, cum_volume: 1000 }),
      // 주기매도 구간 rec 2 … rec 4 → ○ 는 구간 끝 rec 4 하나
      event('RG', at(350), { ev_kind: 2, ev_price: 16400, ev_trade_qty: 999, ev_qty_before: 1000, ev_qty_after: 1550, cum_volume: 1500 }),
    ],
    // 16,450 은 rec 4 하나뿐 — 두 체결 모두 rec 4 짝(한 점) · 99,999 는 짝 없음
    fills: [fill('F', eA3(3) + 10, 16450, 20, 1), fill('F', eA3(3) + 20, 16450, 30, 2), fill('N', at(120), 99_999, 1, 3)],
    orders: [],
  };
  const m = buildOwnModel(es, own);
  const full = { t0: tickBoundsOf(SYNTH_DATE).T0, t1: tickBoundsOf(SYNTH_DATE).T2000 };
  const id = (v: number) => v;

  it('전제 — 두 체결 rec 4 짝 · 짝 없음 하나 · 근거 b6 rec 1 둘 · 구간 끝 rec 4', () => {
    expect(m.fills.map((f) => f.rec)).toEqual([-1, 4, 4]);
    expect(m.orders.filter((o) => o.evidenceRec >= 0).map((o) => [o.orderNo, o.evidenceRec])).toEqual([
      ['B6', 1],
      ['B7', 1],
      ['RG', 4],
    ]);
  });

  it('같은 A3 두 체결 = ◆ 한 점(fillIds 둘 · 그 A3 수신 시각 · A3 가격) · 짝 없음 = gw 시각 · 체결가 · rec −1', () => {
    const marks = ownMarksOf(m, es, full, id, id);
    const dia = marks.filter((k) => k.kind === 'fill');
    expect(dia).toHaveLength(1);
    expect(dia[0]).toMatchObject({ rec: 4, tMs: recvMs(4), px: 16450, cx: recvMs(4), cy: 16450 });
    expect(dia[0]!.fillIds).toEqual(m.fillsOfRec.get(4));
    const nf = marks.filter((k) => k.kind === 'nofill');
    expect(nf).toHaveLength(1);
    expect(nf[0]).toMatchObject({ rec: -1, tMs: at(120), px: 99_999, fillIds: [0] });
  });

  it('하나라도 추정이면 est', () => {
    const ids = m.fillsOfRec.get(4)!;
    const mixed = { ...m, fills: m.fills.map((f) => (f.id === ids[1] ? { ...f, est: true } : f)) };
    const marks = ownMarksOf(mixed, es, full, id, id);
    expect(marks.filter((k) => k.rec === 4 && k.kind !== 'ev').map((k) => k.kind)).toEqual(['est']);
  });

  it('근거 b6 = 그 B6 수신 시각 · ev_price · 같은 근거 주문 둘 = ○ 한 점(orderIds 둘) · 구간 = 끝 A3 하나', () => {
    const ev = ownMarksOf(m, es, full, id, id).filter((k) => k.kind === 'ev');
    expect(ev.map((k) => [k.rec, k.tMs, k.px])).toEqual([
      [1, recvMs(1), 16400],
      [4, recvMs(4), 16450],
    ]);
    const b6 = m.orders.filter((o) => o.evidenceRec === 1).map((o) => o.id);
    expect(ev[0]!.orderIds).toEqual(b6);
    expect(ev[0]!.orderId).toBe(b6[0]);
    expect(ev[1]!.orderIds).toEqual([m.orders.find((o) => o.orderNo === 'RG')!.id]);
    expect(ev[1]!.fillIds).toEqual([]);
  });

  it('그리기 순서 ○ → ◇ → ◆(◆ 가 위) · 창 ± 2% 밖 제외', () => {
    expect(ownMarksOf(m, es, full, id, id).map((k) => k.kind)).toEqual(['ev', 'ev', 'nofill', 'fill']);
    // rec 1(.1505) 둘레 ±10ms 창 — 짝 없음(.120) · rec 4(.3005) 는 밖
    const narrow = { t0: recvMs(1) - 10, t1: recvMs(1) + 10 };
    expect(ownMarksOf(m, es, narrow, id, id).map((k) => [k.kind, k.rec])).toEqual([['ev', 1]]);
  });

  it('ownMarkAt — 반지름 + 3px 안 가장 가까운 점 · 겹치면 위에 그린 ◆ · 밖이면 null', () => {
    const marks = ownMarksOf(m, es, full, id, id);
    const fillMark = marks.find((k) => k.kind === 'fill')!;
    expect(ownMarkAt(marks, fillMark.cx, fillMark.cy, 4)?.kind).toBe('fill');
    expect(ownMarkAt(marks, fillMark.cx + 4 + OWN_MARK_HIT_PAD + 1, fillMark.cy, 4)).toBeNull();
    const evMark = marks.find((k) => k.kind === 'ev' && k.rec === 1)!;
    expect(ownMarkAt(marks, evMark.cx + 2, evMark.cy, 4)).toBe(evMark);
  });
});
