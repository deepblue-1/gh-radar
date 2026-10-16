import { describe, it, expect } from 'vitest';

/**
 * Phase 33 Plan 03 — 미니막대 기하 골든 (UI-SPEC T4 · Pitfall 8).
 *
 * viewBox 0 0 178 28 · 칸 18 · 사이 2 · 0선 y 14 · null 칸 = y 13.5 h 1 · 값 칸 h = max(1.5, |v| ÷ mx × 12) ·
 * mx = max(5천만 원, 행 |값| 최대) · + 는 0선 위(y = 14 − h) · − 는 아래(y = 14).
 */

import type { TeamflowBand, TeamflowBucket } from '@gh-radar/shared';

import {
  CHART_FALLBACK_W,
  bandChartOf,
  bucketChartOf,
  chartWidthOf,
  firstLimitXOf,
  stripBarsOf,
  windowKeysOf,
  windowSlotsOf,
} from '../teamflow-chart';
import { bandSlotsOf, bucketSlotsOf } from '../teamflow-report';
import { CHEONIL, DONGYANG, HANSUN, SMBEXCEL, teamflowRows } from '@/test-fixtures/teamflow-export';

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

  it('측정 폭 < 232(판 반폭 − 여백이 음수) → 스케일 0 · 0 이 아닌 값은 최소 2 · 음수 폭 없음(IN-02)', () => {
    for (const w of [200, 228, 231]) {
      const g = bandChartOf([band('0~5%', -2e8), band('5~10%', 4e8), band('10~15%', 0)], w);
      expect(g.sc, String(w)).toBe(0);
      expect(g.rows.map((r) => r.barW)).toEqual([2, 2, 0]);
      expect(g.rows[0]!.barX).toBe(g.cx - 2);
    }
    expect(bandChartOf([band('0~5%', 4e8)], 240).sc).toBeGreaterThan(0);
  });

  it('스케일 하한 5천만 — 값이 전부 작으면 막대가 판 반폭을 채우지 않는다', () => {
    const g = bandChartOf([band('0~5%', 1e7)], 640);
    expect(g.rows[0]!.barW).toBeCloseTo((204 * 1e7) / 5e7, 9);
  });
});

/* ───────── 10분 흐름 차트 (33-06 · UI-SPEC T8 · D-13) ───────── */

const rowPayload = (isin: string) => teamflowRows().find((r) => r.isin === isin)!;
const SLOT640 = (640 - 76) / 39;
/** KST 시각 → epoch ms(2026-10-14). */
const kstMs = (h: number, m: number) => Date.UTC(2026, 9, 14, h - 9, m);

const bkt = (key: number, patch: Partial<TeamflowBucket> = {}): TeamflowBucket => ({
  key,
  start: `${String(Math.floor((key * 10) / 60)).padStart(2, '0')}:${String((key * 10) % 60).padStart(2, '0')}`,
  lo: 1,
  hi: 2,
  share: null,
  vol: 1,
  val: 1,
  buy_aggr: 1,
  sell_aggr: 1,
  team_buy: 0,
  team_sell: 0,
  net: 0,
  team_buy_val: 0,
  team_sell_val: 0,
  net_val: 0,
  ...patch,
});

describe('windowSlotsOf', () => {
  it('「HH:MM」 → floor(분 / 10) − 54 · 양끝 포함', () => {
    expect(windowSlotsOf({ start: '09:10', end: '09:59' })).toEqual([1, 5]);
    expect(windowSlotsOf({ start: '12:00', end: '12:09' })).toEqual([18, 18]);
    expect(windowSlotsOf({ start: '12:00', end: '12:19' })).toEqual([18, 19]);
  });

  it('null → null · 0~38 로 자른다', () => {
    expect(windowSlotsOf(null)).toBeNull();
    expect(windowSlotsOf({ start: '08:40', end: '15:39' })).toEqual([0, 38]);
  });

  it('창 전체가 축 밖이면 null(가장자리 칸 거짓 음영 없음) · 일부만 걸치면 걸친 칸까지 · key 93 은 슬롯 38(IN-03)', () => {
    expect(windowSlotsOf({ start: '08:20', end: '08:59' })).toBeNull();
    expect(windowSlotsOf({ start: '15:40', end: '15:59' })).toBeNull();
    expect(windowSlotsOf({ start: '08:40', end: '09:09' })).toEqual([0, 0]);
    expect(windowSlotsOf({ start: '15:30', end: '15:39' })).toEqual([38, 38]);
    expect(windowSlotsOf({ start: 'x', end: '09:09' })).toBeNull();
  });
});

describe('windowKeysOf', () => {
  it('「HH:MM」 → floor(분 / 10) · 축으로 자르지 않는다 · 오름차순', () => {
    expect(windowKeysOf({ start: '09:10', end: '09:59' })).toEqual([55, 59]);
    expect(windowKeysOf({ start: '08:20', end: '08:39' })).toEqual([50, 51]);
    expect(windowKeysOf({ start: '12:19', end: '12:00' })).toEqual([72, 73]);
    expect(windowKeysOf(null)).toBeNull();
  });
});

describe('bucketChartOf — 축 밖 창(IN-03)', () => {
  it('창이 09:00 이전 전체 → shade null', () => {
    const g = bucketChartOf(bucketSlotsOf([bkt(54), bkt(55)]), { start: '08:20', end: '08:39' }, null, 640);
    expect(g.shade).toBeNull();
  });
});

describe('firstLimitXOf (첫 상한가 세로선 — KST 분 정확 위치)', () => {
  it('천일고속 11:50:30 → x ≈ 286.57 · 라벨 오른쪽(start)', () => {
    const f = firstLimitXOf(rowPayload(CHEONIL).first_limit_ms, 640)!;
    expect(f.x).toBeCloseTo(286.57, 1);
    expect(f.anchor).toBe('start');
  });

  it('15:19 → x ≈ 588.09 · 라벨이 오른쪽 끝을 넘어 선 왼쪽(end)', () => {
    const f = firstLimitXOf(kstMs(15, 19), 640)!;
    expect(f.x).toBeCloseTo(40 + 37.9 * SLOT640, 6);
    expect(f.x).toBeCloseTo(588.09, 1);
    expect(f.anchor).toBe('end');
  });

  it('09:00 이전 → 왼쪽 축 끝 40 · 15:30 이후 → 오른쪽 축 끝 604 · null → null', () => {
    expect(firstLimitXOf(kstMs(8, 59), 640)!.x).toBe(40);
    expect(firstLimitXOf(kstMs(15, 31), 640)!.x).toBe(604);
    expect(firstLimitXOf(null, 640)).toBeNull();
  });
});

describe('bucketChartOf (39칸 고정축 · 높이 228)', () => {
  it('천일고속 640 — H 228 · slot 564/39 · barW slot − 2 · zero 78.4 · 막대 39 · rlo 0 · rhi 30 · y20 · 눈금 7', () => {
    const r = rowPayload(CHEONIL);
    const g = bucketChartOf(bucketSlotsOf(r.payload!.buckets), r.payload!.window, r.first_limit_ms, 640);
    expect(g.W).toBe(640);
    expect(g.H).toBe(228);
    expect(g.slot).toBeCloseTo(SLOT640, 9);
    expect(g.barW).toBeCloseTo(SLOT640 - 2, 9);
    expect(g.zero).toBeCloseTo(78.4, 9);
    expect(g.mx).toBe(922446500);
    expect(g.empty).toBe(false);
    expect(g.bars).toHaveLength(39);
    expect(g.hits).toHaveLength(39);
    expect(g.rates).toHaveLength(39);
    expect(g.rlo).toBe(0);
    expect(g.rhi).toBe(30);
    expect(g.y20).toBeCloseTo(208 - (20 / 30) * 56, 9);
    // 최대 |값| = 슬롯 17(11:50) −9.2억 → 아래로 dn = 136 − 78.4 − 4
    const b17 = g.bars.find((b) => b.i === 17)!;
    expect(b17.tone).toBe('down');
    expect(b17.y).toBeCloseTo(78.4, 9);
    expect(b17.h).toBeCloseTo(53.6, 9);
    expect(b17.x).toBeCloseTo(40 + 17 * SLOT640 + 1, 9);
    // 0 원 칸 = 최소 1.5 · flat
    const b38 = g.bars.find((b) => b.i === 38)!;
    expect(b38.h).toBe(1.5);
    expect(b38.tone).toBe('flat');
    // 눈금 9시~15시 = 슬롯 0 · 6 · … · 36 가운데
    expect(g.ticks.map((t) => t.label)).toEqual(['9시', '10시', '11시', '12시', '13시', '14시', '15시']);
    expect(g.ticks[0]!.x).toBeCloseTo(40 + 1 + (SLOT640 - 2) / 2, 9);
    expect(g.ticks[6]!.x).toBeCloseTo(40 + 36 * SLOT640 + 1 + (SLOT640 - 2) / 2, 9);
    // 음영 = window 12:00~12:09 → 슬롯 18 하나
    expect(g.shade!.x).toBeCloseTo(40 + 18 * SLOT640, 9);
    expect(g.shade!.w).toBeCloseTo(SLOT640 - 2 + 2, 9);
    // 첫 상한가 = 11:50
    expect(g.firstLimit!.label).toBe('첫 상한가 11:50');
    expect(g.firstLimit!.anchor).toBe('start');
    expect(g.firstLimit!.x).toBeCloseTo(286.57, 1);
  });

  it('한선엔지니어링 window 09:10~09:59 → 음영 x = 40 + slot · 폭 = 4·slot + barW + 2 · 미도달 = firstLimit null', () => {
    const r = rowPayload(HANSUN);
    const g = bucketChartOf(bucketSlotsOf(r.payload!.buckets), r.payload!.window, r.first_limit_ms, 640);
    expect(g.shade!.x).toBeCloseTo(40 + SLOT640, 9);
    expect(g.shade!.w).toBeCloseTo(4 * SLOT640 + (SLOT640 - 2) + 2, 9);
    expect(g.firstLimit).toBeNull();
  });

  it('비중 선 — 빈 칸 · share null 에서 끊긴다(구간 = 연속 덩어리) · 0.60 초과는 위끝 y = 8 · 0 은 판 바닥 136', () => {
    const slots = bucketSlotsOf([
      bkt(54, { share: 0.9 }),
      bkt(55, { share: 0 }),
      // 56 빈 칸
      bkt(57, { share: 0.3 }),
      bkt(58, { share: null }),
      bkt(59, { share: 0.6 }),
      bkt(60, { share: 0.15 }),
    ]);
    const g = bucketChartOf(slots, null, null, 640);
    expect(g.shareSegments.map((s) => s.length)).toEqual([2, 1, 2]);
    expect(g.shareSegments[0]![0]!.y).toBe(8);
    expect(g.shareSegments[0]![1]!.y).toBe(136);
    expect(g.shareSegments[1]![0]!.y).toBeCloseTo(136 - 64, 9);
    expect(g.shareSegments[2]![0]!.y).toBeCloseTo(8, 9);
    expect(g.shareSegments[0]![0]!.x).toBeCloseTo(40 + 1 + (SLOT640 - 2) / 2, 9);
    expect(g.shade).toBeNull();
  });

  it('동양고속 — share 거의 0 이어도 막대 39 · 비중 선 1구간(슬롯 38 share null 제외 38점) · 띠 유지', () => {
    const r = rowPayload(DONGYANG);
    const g = bucketChartOf(bucketSlotsOf(r.payload!.buckets), r.payload!.window, r.first_limit_ms, 640);
    expect(g.bars).toHaveLength(39);
    expect(g.rates).toHaveLength(39);
    expect(g.shareSegments.map((s) => s.length)).toEqual([38]);
    expect(g.shade!.x).toBeCloseTo(40 + 18 * SLOT640, 9);
    expect(g.firstLimit).toBeNull();
  });

  it('등락률 축 — rlo = min(0, lo 최소) · rhi = max(30, hi 최대) · 띠 h 최소 1.5', () => {
    const g = bucketChartOf(bucketSlotsOf([bkt(54, { lo: -5, hi: -5 }), bkt(55, { lo: 10, hi: 31 })]), null, null, 640);
    expect(g.rlo).toBe(-5);
    expect(g.rhi).toBe(31);
    expect(g.rates[0]!.h).toBe(1.5);
    const yr = (v: number) => 208 - ((v + 5) / 36) * 56;
    expect(g.rates[1]!.y).toBeCloseTo(yr(31), 9);
    expect(g.rates[1]!.h).toBeCloseTo(yr(10) - yr(31), 9);
  });

  it('39칸 전부 null → empty · 막대 · 띠 · 선 0 · 눈금 7 은 그대로 · 폭 0 → 640', () => {
    const g = bucketChartOf(bucketSlotsOf([]), null, null, 0);
    expect(g.W).toBe(640);
    expect(g.empty).toBe(true);
    expect(g.bars).toEqual([]);
    expect(g.rates).toEqual([]);
    expect(g.shareSegments).toEqual([]);
    expect(g.hits).toEqual([]);
    expect(g.ticks).toHaveLength(7);
    expect(g.mx).toBe(5e7);
  });

  it('net_val null 칸은 막대 없음(히트 · 띠는 남는다)', () => {
    const g = bucketChartOf(bucketSlotsOf([bkt(54, { net_val: null })]), null, null, 640);
    expect(g.bars).toEqual([]);
    expect(g.hits).toHaveLength(1);
    expect(g.rates).toHaveLength(1);
  });
});
