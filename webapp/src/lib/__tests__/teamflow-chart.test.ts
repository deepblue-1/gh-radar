import { describe, it, expect } from 'vitest';

/**
 * Phase 33 Plan 03 — 미니막대 기하 골든 (UI-SPEC T4 · Pitfall 8).
 *
 * viewBox 0 0 178 28 · 칸 18 · 사이 2 · 0선 y 14 · null 칸 = y 13.5 h 1 · 값 칸 h = max(1.5, |v| ÷ mx × 12) ·
 * mx = max(5천만 원, 행 |값| 최대) · + 는 0선 위(y = 14 − h) · − 는 아래(y = 14).
 */

import { CHART_FALLBACK_W, chartWidthOf, stripBarsOf } from '../teamflow-chart';
import { bandSlotsOf } from '../teamflow-report';
import { SMBEXCEL, teamflowRows } from '@/test-fixtures/teamflow-export';

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
