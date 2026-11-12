/**
 * Phase 42 Plan 03 Task 1 — 봉 차트 이동평균(봉 단순 · 봉 지수 · 일 단순) 정의식 · 이름 · 검증 · 그릴 수 있는지 · 경로.
 *
 * 깨지면: 이동평균 선 값이 정의식과 다르거나, 모자라는데 그리거나, 장 쉬는 구간을 가로질러 잇는다.
 */

import { describe, expect, it } from 'vitest';

import {
  MA_GAP_BREAK_MS,
  MA_MAX_LINES,
  MA_N_MAX,
  MA_N_MIN,
  PREV_CLOSES_N,
  daySmaOf,
  emaOf,
  isValidMaSpec,
  maKeyOf,
  maNameOf,
  maPathOf,
  maStatusOf,
  maValuesOf,
  smaOf,
  type MaSpec,
} from '../candle-ma';

const MIN = 60_000;
/** 2026-10-30 08:00 KST(epoch ms). */
const T0 = Date.UTC(2026, 9, 29, 23, 0);
const at = (h: number, m: number) => T0 + ((h - 8) * 60 + m) * MIN;
/** x = 08:00 부터 분 수(1px = 1분) · y = 값 그대로. */
const xMin = (t: number) => (t - T0) / MIN;
const yId = (v: number) => v;

const f64 = (xs: number[]) => Float64Array.from(xs);
const expectNaN = (arr: Float64Array, from: number, to: number) => {
  for (let i = from; i < to; i++) expect(Number.isNaN(arr[i]!), `[${i}] 는 NaN 이어야`).toBe(true);
};

/** 의사 난수 종가(결정적) — 정의식 대조용. */
function closesOf(n: number): Float64Array {
  const out = new Float64Array(n);
  let s = 12345;
  let px = 10_000;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    px += ((s % 21) - 10) * 10;
    out[i] = px;
  }
  return out;
}

const bar = (n: number, kind: 'sma' | 'ema' = 'sma'): MaSpec => ({ base: 'bar', n, kind });
const day = (n: number): MaSpec => ({ base: 'day', n, kind: 'sma' });

describe('이동평균', () => {
  it('상수 — 기간 2 ~ 240 · 선 최대 6개 · 앞 거래일 종가 239개 · 끊김 30분', () => {
    expect(MA_N_MIN).toBe(2);
    expect(MA_N_MAX).toBe(240);
    expect(MA_MAX_LINES).toBe(6);
    expect(PREV_CLOSES_N).toBe(239);
    expect(MA_GAP_BREAK_MS).toBe(30 * MIN);
  });

  it('봉 단순 — smaOf([1,2,3,4,5], 3) = [NaN, NaN, 2, 3, 4]', () => {
    const v = smaOf(f64([1, 2, 3, 4, 5]), 3);
    expect(v.length).toBe(5);
    expectNaN(v, 0, 2);
    expect(v[2]).toBeCloseTo(2, 9);
    expect(v[3]).toBeCloseTo(3, 9);
    expect(v[4]).toBeCloseTo(4, 9);
  });

  it('봉 단순 — 봉 수가 기간보다 적으면 전부 NaN', () => {
    const v = smaOf(f64([1, 2, 3, 4]), 5);
    expect(v.length).toBe(4);
    expectNaN(v, 0, 4);
  });

  it('봉 단순 — 정의식(그 봉 포함 앞 N 봉 종가 평균 · N 번째 봉부터)과 같다', () => {
    const c = closesOf(300);
    for (const N of [2, 5, 20, 120]) {
      const v = smaOf(c, N);
      expectNaN(v, 0, N - 1);
      for (let i = N - 1; i < c.length; i++) {
        let s = 0;
        for (let k = i - N + 1; k <= i; k++) s += c[k]!;
        expect(v[i]).toBeCloseTo(s / N, 9);
      }
    }
  });

  it('봉 지수 — emaOf(c, 3): 앞 둘 NaN · [2] = 앞 3 평균 · 이후 α = 2 / 4', () => {
    const v = emaOf(f64([2, 4, 6, 10, 2]), 3);
    expectNaN(v, 0, 2);
    expect(v[2]).toBeCloseTo(4, 9);
    expect(v[3]).toBeCloseTo(0.5 * 10 + 0.5 * 4, 9);
    expect(v[4]).toBeCloseTo(0.5 * 2 + 0.5 * 7, 9);
  });

  it('봉 지수 — 정의식(α = 2 ÷ (N + 1) · 첫 값 = 처음 N 봉 단순 평균)과 같다 · 모자라면 전부 NaN', () => {
    const c = closesOf(200);
    for (const N of [2, 9, 60]) {
      const v = emaOf(c, N);
      const a = 2 / (N + 1);
      expectNaN(v, 0, N - 1);
      let e = 0;
      for (let k = 0; k < N; k++) e += c[k]!;
      e /= N;
      expect(v[N - 1]).toBeCloseTo(e, 9);
      for (let i = N; i < c.length; i++) {
        e = a * c[i]! + (1 - a) * e;
        expect(v[i]).toBeCloseTo(e, 9);
      }
    }
    expectNaN(emaOf(f64([1, 2]), 3), 0, 2);
  });

  it('일 단순 — (앞 N − 1 거래일 종가 합 + 그 봉 종가) ÷ N · 마지막 N − 1 개만 쓴다', () => {
    const c = f64([40, 50, 60]);
    const v = daySmaOf(c, [10, 20, 30], 3);
    expect(v[0]).toBeCloseTo((20 + 30 + 40) / 3, 9);
    expect(v[1]).toBeCloseTo((20 + 30 + 50) / 3, 9);
    expect(v[2]).toBeCloseTo((20 + 30 + 60) / 3, 9);
  });

  it('일 단순 — 앞 거래일 종가가 N − 1 개 미만이면 선 전체가 NaN', () => {
    const v = daySmaOf(f64([40, 50, 60]), [10], 3);
    expectNaN(v, 0, 3);
    // 정확히 N − 1 개면 그린다
    const w = daySmaOf(f64([40]), [10, 20], 3);
    expect(w[0]).toBeCloseTo((10 + 20 + 40) / 3, 9);
  });

  it('maValuesOf — 일 기준은 종가를 받는 중 · 실패 · 코드 없음이면 전부 NaN · 배열이면 daySma', () => {
    const c = f64([40, 50, 60]);
    for (const st of ['idle', 'loading', 'error', 'nocode'] as const) {
      expectNaN(maValuesOf(day(3), c, st), 0, 3);
    }
    const v = maValuesOf(day(3), c, [10, 20, 30]);
    expect(Array.from(v)).toEqual(Array.from(daySmaOf(c, [10, 20, 30], 3)));
  });

  it('maValuesOf — 봉 단순 · 지수는 앞 거래일 종가 상태와 무관', () => {
    const c = closesOf(40);
    const sma = Array.from(smaOf(c, 5));
    const ema = Array.from(emaOf(c, 5));
    for (const st of ['idle', 'loading', 'error', 'nocode', [1, 2, 3]] as const) {
      expect(Array.from(maValuesOf(bar(5), c, st))).toEqual(sma);
      expect(Array.from(maValuesOf(bar(5, 'ema'), c, st))).toEqual(ema);
    }
  });

  it('maNameOf — 「단순 5」 · 「지수 20」 · 「일 20」 · maKeyOf 가 기준 · 종류 · 기간마다 다르다', () => {
    expect(maNameOf(bar(5))).toBe('단순 5');
    expect(maNameOf(bar(20, 'ema'))).toBe('지수 20');
    expect(maNameOf(day(20))).toBe('일 20');
    const keys = [bar(20), bar(20, 'ema'), day(20), bar(21)].map(maKeyOf);
    expect(new Set(keys).size).toBe(4);
    expect(maKeyOf(bar(20))).toBe(maKeyOf({ base: 'bar', n: 20, kind: 'sma' }));
  });

  it('isValidMaSpec — 정수 · 2 ~ 240 · 일 + 지수 거부 · 모르는 값 거부', () => {
    expect(isValidMaSpec(bar(2))).toBe(true);
    expect(isValidMaSpec(bar(240, 'ema'))).toBe(true);
    expect(isValidMaSpec(day(240))).toBe(true);
    expect(isValidMaSpec(bar(1))).toBe(false);
    expect(isValidMaSpec(bar(241))).toBe(false);
    expect(isValidMaSpec(bar(2.5))).toBe(false);
    expect(isValidMaSpec({ base: 'day', n: 20, kind: 'ema' })).toBe(false);
    expect(isValidMaSpec({ base: 'week', n: 20, kind: 'sma' })).toBe(false);
    expect(isValidMaSpec({ base: 'bar', n: 20, kind: 'wma' })).toBe(false);
    expect(isValidMaSpec({ base: 'bar', n: '20', kind: 'sma' })).toBe(false);
    expect(isValidMaSpec(null)).toBe(false);
  });

  it('maStatusOf — 봉 기준: 봉 수 < 기간이면 short-bars', () => {
    expect(maStatusOf(bar(20), 19, 'idle')).toBe('short-bars');
    expect(maStatusOf(bar(20), 20, 'idle')).toBe('ok');
    expect(maStatusOf(bar(20, 'ema'), 19, [1, 2, 3])).toBe('short-bars');
  });

  it('maStatusOf — 일 기준: 종가 N − 1 개 미만 short-days · 받는 중 loading · 실패 error · 코드 없음 short-days', () => {
    const closes = (k: number) => Array.from({ length: k }, (_, i) => 100 + i);
    expect(maStatusOf(day(20), 300, closes(18))).toBe('short-days');
    expect(maStatusOf(day(20), 300, closes(19))).toBe('ok');
    expect(maStatusOf(day(20), 300, 'idle')).toBe('loading');
    expect(maStatusOf(day(20), 300, 'loading')).toBe('loading');
    expect(maStatusOf(day(20), 300, 'error')).toBe('error');
    expect(maStatusOf(day(20), 300, 'nocode')).toBe('short-days');
  });

  it('maPathOf — 1분봉 11:00 · 11:01 · 11:31: 11:01 과 11:31 사이를 끊는다(30분 · 한 단위보다 김) · x = 칸 가운데', () => {
    const t0 = f64([at(11, 0), at(11, 1), at(11, 31)]);
    const d = maPathOf(t0, MIN, f64([1, 2, 3]), xMin, yId);
    expect(d).toBe('M180.5,1.0L181.5,2.0M211.5,3.0');
  });

  it('maPathOf — 1분봉 29분 빈 칸은 잇는다', () => {
    const t0 = f64([at(11, 0), at(11, 29)]);
    expect(maPathOf(t0, MIN, f64([1, 2]), xMin, yId)).toBe('M180.5,1.0L209.5,2.0');
  });

  it('maPathOf — 30분봉 15:30 · 16:00 은 이웃 칸이라 잇는다 · 1분봉 15:30 · 16:00 은 끊는다', () => {
    const t0 = f64([at(15, 30), at(16, 0)]);
    expect(maPathOf(t0, 30 * MIN, f64([1, 2]), xMin, yId)).toBe('M465.0,1.0L495.0,2.0');
    expect(maPathOf(t0, MIN, f64([1, 2]), xMin, yId)).toBe('M450.5,1.0M480.5,2.0');
  });

  it('maPathOf — 값 없음(NaN)에서 끊고 그 칸은 건너뛴다', () => {
    const t0 = f64([at(9, 0), at(9, 1), at(9, 2), at(9, 3)]);
    const d = maPathOf(t0, MIN, f64([Number.NaN, 1, Number.NaN, 3]), xMin, yId);
    expect(d).toBe('M61.5,1.0M63.5,3.0');
    expect(maPathOf(t0, MIN, new Float64Array(4).fill(Number.NaN), xMin, yId)).toBe('');
  });
});
