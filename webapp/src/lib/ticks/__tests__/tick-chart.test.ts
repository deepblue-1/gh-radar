import { describe, expect, it } from 'vitest';

import { dayStartNs } from '@gh-radar/shared';

import { TICK_FIXTURE_DATE, tickGridBytes } from '@/test-fixtures/tick-grid';

import {
  TICK_CHART,
  cursorXOf,
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
