import { describe, it, expect } from 'vitest';
import {
  parseScannerSearchParams,
  toScannerSearchParams,
  SCANNER_MIN_RATE,
  SCANNER_MAX_RATE,
  DEFAULT_SCANNER_STATE,
} from './scanner-query';

describe('parseScannerSearchParams', () => {
  it('빈 쿼리 → 기본값', () => {
    expect(parseScannerSearchParams(new URLSearchParams(''))).toEqual({
      min: 25,
      market: 'ALL',
    });
  });

  it('?min=25&market=ALL → {min:25, market:ALL}', () => {
    expect(
      parseScannerSearchParams(new URLSearchParams('min=25&market=ALL')),
    ).toEqual({ min: 25, market: 'ALL' });
  });

  it('min 경계값 9 → 25 fallback', () => {
    expect(parseScannerSearchParams(new URLSearchParams('min=9')).min).toBe(25);
  });

  it('min 경계값 10 → 10', () => {
    expect(parseScannerSearchParams(new URLSearchParams('min=10')).min).toBe(10);
  });

  it('min 경계값 29 → 29', () => {
    expect(parseScannerSearchParams(new URLSearchParams('min=29')).min).toBe(29);
  });

  it('min 경계값 30 → 25 fallback', () => {
    expect(parseScannerSearchParams(new URLSearchParams('min=30')).min).toBe(25);
  });

  it('min 소수 25.7 → 26 (round)', () => {
    expect(parseScannerSearchParams(new URLSearchParams('min=25.7')).min).toBe(
      26,
    );
  });

  it('min=abc → 25 fallback', () => {
    expect(parseScannerSearchParams(new URLSearchParams('min=abc')).min).toBe(
      25,
    );
  });

  it('min 빈 문자열 → 25', () => {
    expect(parseScannerSearchParams(new URLSearchParams('min=')).min).toBe(25);
  });

  it('market KOSPI / KOSDAQ / ALL 통과', () => {
    expect(parseScannerSearchParams(new URLSearchParams('market=KOSPI')).market).toBe('KOSPI');
    expect(parseScannerSearchParams(new URLSearchParams('market=KOSDAQ')).market).toBe('KOSDAQ');
    expect(parseScannerSearchParams(new URLSearchParams('market=ALL')).market).toBe('ALL');
  });

  it('market UNKNOWN / 소문자 / 공백 → ALL', () => {
    expect(parseScannerSearchParams(new URLSearchParams('market=UNKNOWN')).market).toBe('ALL');
    expect(parseScannerSearchParams(new URLSearchParams('market=kospi')).market).toBe('ALL');
    expect(parseScannerSearchParams(new URLSearchParams('market=')).market).toBe('ALL');
  });

  it('min=99&market=UNKNOWN → 기본값 복원', () => {
    expect(
      parseScannerSearchParams(new URLSearchParams('min=99&market=UNKNOWN')),
    ).toEqual({ min: 25, market: 'ALL' });
  });
});

describe('toScannerSearchParams', () => {
  it('기본값 {25, ALL} → 빈 문자열', () => {
    expect(toScannerSearchParams({ min: 25, market: 'ALL' })).toBe('');
  });

  it('{15, KOSDAQ} → ?min=15&market=KOSDAQ', () => {
    expect(toScannerSearchParams({ min: 15, market: 'KOSDAQ' })).toBe(
      '?min=15&market=KOSDAQ',
    );
  });

  it('{25, KOSPI} → ?market=KOSPI (min 은 기본값이라 생략)', () => {
    expect(toScannerSearchParams({ min: 25, market: 'KOSPI' })).toBe(
      '?market=KOSPI',
    );
  });

  it('{10, ALL} → ?min=10', () => {
    expect(toScannerSearchParams({ min: 10, market: 'ALL' })).toBe('?min=10');
  });
});

describe('상수 export', () => {
  it('SCANNER_MIN_RATE=10, SCANNER_MAX_RATE=29, DEFAULT={25,ALL}', () => {
    expect(SCANNER_MIN_RATE).toBe(10);
    expect(SCANNER_MAX_RATE).toBe(29);
    expect(DEFAULT_SCANNER_STATE).toEqual({ min: 25, market: 'ALL' });
  });
});
