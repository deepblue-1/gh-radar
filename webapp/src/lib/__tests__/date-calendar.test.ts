import { describe, expect, it } from 'vitest';

import { monthCellsOf, shiftYm, ymRangeOf } from '../date-calendar';

/** 날짜 알약 달력(스케치 021 A) — 깨지면 요일 칸이 밀리거나 달 이동이 연 경계에서 틀린다. */
describe('date-calendar', () => {
  it('monthCellsOf — 2026-11 은 일요일 시작(빈칸 0) · 30일', () => {
    const c = monthCellsOf('202611');
    expect(c[0]).toBe('20261101');
    expect(c).toHaveLength(30);
  });

  it('monthCellsOf — 2026-10 은 목요일 시작(빈칸 4) · 31일 · 2월 윤년', () => {
    const c = monthCellsOf('202610');
    expect(c.slice(0, 5)).toEqual([null, null, null, null, '20261001']);
    expect(c[c.length - 1]).toBe('20261031');
    expect(monthCellsOf('202802').filter((x) => x !== null)).toHaveLength(29);
  });

  it('shiftYm — 연 경계', () => {
    expect(shiftYm('202612', 1)).toBe('202701');
    expect(shiftYm('202601', -1)).toBe('202512');
    expect(shiftYm('202611', -14)).toBe('202509');
  });

  it('ymRangeOf — 순서와 무관한 최소 · 최대 달 · 빈 목록 null', () => {
    expect(ymRangeOf(['20261103', '20260803', '20261030'])).toEqual({ min: '202608', max: '202611' });
    expect(ymRangeOf([])).toBeNull();
  });
});
