import { describe, it, expect } from 'vitest';

import { fmtAmountC, fmtBytes, fmtQty, fmtRate, fmtRet, fmtSignedAmountC } from '../tick-format';

/** Phase 37 Plan 08 — 스케치 010 C 축약 경계 · 등락률 · 수량. */

describe('fmtAmountC', () => {
  it('1억 미만 = 만 단위 정수', () => {
    expect(fmtAmountC(30_000_000)).toBe('3,000만');
    expect(fmtAmountC(99_990_000)).toBe('9,999만');
    expect(fmtAmountC(4_640_000)).toBe('464만');
  });

  it('1억 경계 — 만 반올림이 1억에 닿으면 억', () => {
    expect(fmtAmountC(100_000_000)).toBe('1.00억');
    expect(fmtAmountC(99_995_000)).toBe('1.00억');
  });

  it('1억~100억 = 유효 3자리', () => {
    expect(fmtAmountC(796_000_000)).toBe('7.96억');
    expect(fmtAmountC(1_950_000_000)).toBe('19.5억');
    expect(fmtAmountC(9_990_000_000)).toBe('99.9억');
    expect(fmtAmountC(9_999_000_000)).toBe('100억');
  });

  it('100억 이상 = 억 정수 콤마', () => {
    expect(fmtAmountC(10_000_000_000)).toBe('100억');
    expect(fmtAmountC(132_600_000_000)).toBe('1,326억');
  });

  it('0 · 1만 미만 · 음수', () => {
    expect(fmtAmountC(0)).toBe('0');
    expect(fmtAmountC(4_000)).toBe('4,000원');
    expect(fmtAmountC(-796_000_000)).toBe('−7.96억');
    expect(fmtAmountC(-30_000_000)).toBe('−3,000만');
  });
});

describe('fmtRate', () => {
  it('부호 · 소수 1자리 · null', () => {
    expect(fmtRate(29.9)).toBe('+29.9%');
    expect(fmtRate(-0.94)).toBe('−0.9%');
    expect(fmtRate(0)).toBe('0.0%');
    expect(fmtRate(null)).toBe('—');
  });
});

describe('fmtRet — 팀 패널 · 봉 차트 값 띠 공용 팀 수익률(SC-4 · IN-05)', () => {
  it('소수 2자리 · 부호 · 반올림 경계 · 음의 0 · null · NaN', () => {
    expect(fmtRet(0.0118)).toBe('+1.18%');
    expect(fmtRet(-0.0118)).toBe('−1.18%');
    expect(fmtRet(0)).toBe('0.00%');
    // 0.005% 미만은 0 으로 반올림 — 음수 쪽도 「−0.00%」 가 아니라 「0.00%」
    expect(fmtRet(0.00004)).toBe('0.00%');
    expect(fmtRet(-0.00004)).toBe('0.00%');
    expect(fmtRet(-0)).toBe('0.00%');
    // 0.005% 는 0.01% 로 올라간다(Math.round — 양수 쪽 반 올림)
    expect(fmtRet(0.00005)).toBe('+0.01%');
    expect(fmtRet(null)).toBe('—');
    expect(fmtRet(undefined)).toBe('—');
    expect(fmtRet(Number.NaN)).toBe('—');
    expect(fmtRet(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('fmtQty · fmtBytes', () => {
  it('콤마 · KB/MB', () => {
    expect(fmtQty(1234567)).toBe('1,234,567');
    expect(fmtBytes(512 * 1024)).toBe('512.0KB');
    expect(fmtBytes(3.5 * 1024 * 1024)).toBe('3.5MB');
  });
});

describe('fmtSignedAmountC — 목록 팀 열 · 상세 팀 패널 부호 금액(quick 261103-j4d)', () => {
  it('모름 「—」 · 0 「0」', () => {
    expect(fmtSignedAmountC(null)).toBe('—');
    expect(fmtSignedAmountC(undefined)).toBe('—');
    expect(fmtSignedAmountC(Number.NaN)).toBe('—');
    expect(fmtSignedAmountC(0)).toBe('0');
  });
  it('양수 「+」 · 음수 「−」(U+2212)', () => {
    expect(fmtSignedAmountC(-312_000_000)).toBe('−3.12억');
    expect(fmtSignedAmountC(4_520_000_000)).toBe('+45.2억');
    expect(fmtSignedAmountC(89_000_000)).toBe('+8,900만');
    expect(fmtSignedAmountC(-21_500_000)).toBe('−2,150만');
    expect(fmtSignedAmountC(184_000_000)).toBe('+1.84억');
  });
});
