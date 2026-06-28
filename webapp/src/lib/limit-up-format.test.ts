import { describe, it, expect } from 'vitest';
import {
  shouldShowWinRate,
  sparkBucketTone,
  fmtRet,
  fmtTurnover,
} from './limit-up-format';

describe('shouldShowWinRate (D-09 N≥3 게이팅 경계)', () => {
  it('resolvedEvents: 3 → true', () =>
    expect(shouldShowWinRate({ resolvedEvents: 3 })).toBe(true));
  it('resolvedEvents: 2 → false (경계 미만)', () =>
    expect(shouldShowWinRate({ resolvedEvents: 2 })).toBe(false));
  it('resolvedEvents: 0 → false', () =>
    expect(shouldShowWinRate({ resolvedEvents: 0 })).toBe(false));
  it('resolvedEvents: 10 → true (>= 3)', () =>
    expect(shouldShowWinRate({ resolvedEvents: 10 })).toBe(true));
});

describe('sparkBucketTone (5버킷 색 매핑 — BLOCKER 3 off-by-one 회귀 가드)', () => {
  // 버킷: [−10~−5, −5~0, 0~+5, +5~+10, +10%+]
  // index ≤ 1 만 음수(down), index ≥ 2 (0~+5% 이상)는 양수(up).
  it('sparkBucketTone(0) === "down"', () => expect(sparkBucketTone(0)).toBe('down'));
  it('sparkBucketTone(1) === "down"', () => expect(sparkBucketTone(1)).toBe('down'));
  it('sparkBucketTone(2) === "up" (0~+5% 는 양수 → up)', () =>
    expect(sparkBucketTone(2)).toBe('up'));
  it('sparkBucketTone(3) === "up"', () => expect(sparkBucketTone(3)).toBe('up'));
  it('sparkBucketTone(4) === "up"', () => expect(sparkBucketTone(4)).toBe('up'));
});

describe('fmtRet (방향 부호, null → em-dash)', () => {
  it('null → "—"', () => expect(fmtRet(null)).toBe('—'));
  it('0 → 보합 "0.0%"', () => expect(fmtRet(0)).toBe('0.0%'));
  it('2.8 → "+2.8%"', () => expect(fmtRet(2.8)).toBe('+2.8%'));
  it('-7.1 → "−7.1%" (Unicode 마이너스)', () => expect(fmtRet(-7.1)).toBe('−7.1%'));
});

describe('fmtTurnover (회전율, NULL → em-dash, D-07)', () => {
  it('null → "—"', () => expect(fmtTurnover(null)).toBe('—'));
  it('0.18 → "18%"', () => expect(fmtTurnover(0.18)).toBe('18%'));
  it('0 → "0%"', () => expect(fmtTurnover(0)).toBe('0%'));
});
