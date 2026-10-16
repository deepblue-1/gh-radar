import { describe, it, expect } from 'vitest';

/**
 * Phase 33 Plan 03 — 미니막대 기하 골든 (UI-SPEC T4 · Pitfall 8).
 *
 * viewBox 0 0 178 28 · 칸 18 · 사이 2 · 0선 y 14 · null 칸 = y 13.5 h 1 · 값 칸 h = max(1.5, |v| ÷ mx × 12) ·
 * mx = max(5천만 원, 행 |값| 최대) · + 는 0선 위(y = 14 − h) · − 는 아래(y = 14).
 */

import type { TeamflowBand } from '@gh-radar/shared';

import { CHART_FALLBACK_W, bandChartOf, chartWidthOf, stripBarsOf } from '../teamflow-chart';
import { bandSlotsOf } from '../teamflow-report';
import { CHEONIL, SMBEXCEL, teamflowRows } from '@/test-fixtures/teamflow-export';

const bandsOf = (isin: string) => teamflowRows().find((r) => r.isin === isin)!.payload!.bands;
const smSlots = () => bandSlotsOf(teamflowRows().find((r) => r.isin === SMBEXCEL)!.payload!.bands);

describe('chartWidthOf', () => {
  it('유한 양수면 그대로 · 0 · NaN · 음수면 640', () => {
    expect(CHART_FALLBACK_W).toBe(640);
    expect(chartWidthOf(0)).toBe(640);
    expect(chartWidthOf(Number.NaN)).toBe(640);
    expect(chartWidthOf(-5)).toBe(640);
    expect(chartWidthOf(358)).toBe(358);
  });
});

describe('stripBarsOf', () => {
  it('9개 · i번째 x = i × 20 · 폭 18', () => {
    const bars = stripBarsOf(smSlots());
    expect(bars).toHaveLength(9);
    bars.forEach((b, i) => {
      expect(b.x).toBe(i * 20);
      expect(b.w).toBe(18);
    });
  });

  it('에스엠벡셀 — 최대 칸(28%~상한 미만 +4.4억) h 12 · y 2 · up', () => {
    const b = stripBarsOf(smSlots())[7]!;
    expect(b.h).toBe(12);
    expect(b.y).toBe(2);
    expect(b.tone).toBe('up');
    expect(b.empty).toBe(false);
  });

  it('작은 값(0% 미만 +0.06억)은 최소 1.5 · 음수 칸은 0선 아래(y 14) · down', () => {
    const bars = stripBarsOf(smSlots());
    expect(bars[0]!.h).toBe(1.5);
    expect(bars[0]!.y).toBe(12.5);
    expect(bars[3]!.y).toBe(14);
    expect(bars[3]!.tone).toBe('down');
    expect(bars[3]!.h).toBeCloseTo((226281326 / 437702910) * 12, 6);
  });

  it('null 칸 = { y 13.5 · h 1 · empty } · 전부 null 이면 9개 모두 empty', () => {
    const slots = smSlots();
    slots[0] = null;
    expect(stripBarsOf(slots)[0]).toMatchObject({ x: 0, y: 13.5, w: 18, h: 1, empty: true });
    const all = stripBarsOf(Array<number | null>(9).fill(null));
    expect(all).toHaveLength(9);
    expect(all.every((b) => b.empty && b.h === 1 && b.y === 13.5)).toBe(true);
  });

  it('mx 하한 5천만 — 값이 전부 1천만 이하면 막대 ≤ 2.4 · 반올림 0 은 flat', () => {
    const bars = stripBarsOf([10_000_000, -4_000_000, null, null, null, null, null, null, null]);
    expect(bars[0]!.h).toBeCloseTo(2.4, 6);
    expect(bars[1]!.h).toBe(1.5);
    expect(bars[1]!.tone).toBe('flat');
    expect(bars.every((b) => b.h <= 2.4 + 1e-9)).toBe(true);
  });
});

/**
 * Phase 33 Plan 05 — 구간 가로 막대 기하 골든 (UI-SPEC T6 · D-12).
 *
 * 행 28 · 막대 16 · 라벨 칸 96 · 값 칸 120 · 위 8 · 각주 16 → H = 24 + 행 수 × 28 · 판 = W − 216 · cx = 96 + 판/2 ·
 * sc = (판/2 − 8) ÷ max(5천만, |net_val| 최대) · 「하루 합계」 제외 · 20% 점선 = 「20~25%」 행 위(첫 행이 아닐 때만).
 */
const band = (label: string, net_val: number | null): TeamflowBand => ({
  label,
  vol: 1000,
  val: null,
  buy_aggr: null,
  sell_aggr: null,
  team_buy: null,
  team_sell: null,
  net: null,
  team_buy_val: null,
  team_sell_val: null,
  net_val,
  share: 0.1,
});

describe('bandChartOf', () => {
  it('에스엠벡셀 640 — 행 9 · H 276 · cx 308 · 최대 막대(28%~상한 미만) 폭 204 · y = 8 + 28i · 20% 점선 y 148 · 마지막 = 상한가 가격', () => {
    const g = bandChartOf(bandsOf(SMBEXCEL), 640);
    expect(g.W).toBe(640);
    expect(g.rows).toHaveLength(9);
    expect(g.H).toBe(276);
    expect(g.cx).toBe(308);
    expect(g.rows[7]!.label).toBe('28%~상한 미만');
    expect(g.rows[7]!.net).toBe(437702910);
    expect(g.rows[7]!.barW).toBeCloseTo(204, 9);
    expect(g.rows[7]!.barX).toBe(308);
    expect(g.rows[7]!.tone).toBe('up');
    g.rows.forEach((r, i) => expect(r.y).toBe(8 + 28 * i));
    expect(g.rows[0]!.y).toBe(8);
    expect(g.y20).toBe(148);
    expect(g.rows[8]!.isLimit).toBe(true);
    expect(g.rows.slice(0, 8).every((r) => !r.isLimit)).toBe(true);
    expect(g.rows.some((r) => r.label === '하루 합계')).toBe(false);
  });

  it('천일고속 640 — 행 8(0% 미만 없음) · H 248 · 20% 점선 y 120', () => {
    const g = bandChartOf(bandsOf(CHEONIL), 640);
    expect(g.rows).toHaveLength(8);
    expect(g.rows[0]!.label).toBe('0~5%');
    expect(g.H).toBe(248);
    expect(g.y20).toBe(120);
  });

  it('「하루 합계」 만 = 행 0 · 「20~25%」 가 첫 행이면 점선 없음', () => {
    expect(bandChartOf([band('하루 합계', 1e8)], 640).rows).toEqual([]);
    expect(bandChartOf([band('20~25%', 1e8), band('25~28%', -1e8)], 640).y20).toBeNull();
    expect(bandChartOf([band('0~5%', 1e8), band('25~28%', -1e8)], 640).y20).toBeNull();
  });

  it('폭 0 = 폭 640(chartWidthOf 폴백)', () => {
    const bands = bandsOf(SMBEXCEL);
    expect(bandChartOf(bands, 0)).toEqual(bandChartOf(bands, 640));
  });

  it('음수 막대 barX = cx − barW · net_val null = 폭 0 · 0 이 아닌 작은 값 = 최소 2 · 0 = 폭 0', () => {
    const g = bandChartOf(
      [band('0~5%', -2e8), band('5~10%', null), band('10~15%', 1000), band('15~20%', 0), band('20~25%', 4e8)],
      640,
    );
    const [neg, nul, tiny, zero] = g.rows;
    expect(neg!.barX).toBeCloseTo(g.cx - neg!.barW, 9);
    expect(neg!.barW).toBeCloseTo(102, 9);
    expect(neg!.tone).toBe('down');
    expect(nul!.barW).toBe(0);
    expect(nul!.tone).toBe('flat');
    expect(tiny!.barW).toBe(2);
    expect(tiny!.barX).toBe(g.cx);
    expect(zero!.barW).toBe(0);
    expect(g.rows[1]!.barY).toBe(8 + 28 + 6);
  });

  it('스케일 하한 5천만 — 값이 전부 작으면 막대가 판 반폭을 채우지 않는다', () => {
    const g = bandChartOf([band('0~5%', 1e7)], 640);
    expect(g.rows[0]!.barW).toBeCloseTo((204 * 1e7) / 5e7, 9);
  });
});
