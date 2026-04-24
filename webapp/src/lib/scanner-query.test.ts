import { describe, it, expect } from 'vitest';
import {
  parseScannerSearchParams,
  toScannerSearchParams,
  DEFAULT_SCANNER_STATE,
} from './scanner-query';

describe('parseScannerSearchParams', () => {
  it('빈 쿼리 → 기본값', () => {
    expect(parseScannerSearchParams(new URLSearchParams(''))).toEqual({
      market: 'ALL',
    });
  });

  it('?market=ALL → {market:ALL}', () => {
    expect(
      parseScannerSearchParams(new URLSearchParams('market=ALL')),
    ).toEqual({ market: 'ALL' });
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

  it('legacy min 쿼리는 무시된다 (market 만 파싱)', () => {
    expect(
      parseScannerSearchParams(new URLSearchParams('min=25&market=KOSDAQ')),
    ).toEqual({ market: 'KOSDAQ' });
  });
});

describe('toScannerSearchParams', () => {
  it('기본값 {ALL} → 빈 문자열', () => {
    expect(toScannerSearchParams({ market: 'ALL' })).toBe('');
  });

  it('{KOSDAQ} → ?market=KOSDAQ', () => {
    expect(toScannerSearchParams({ market: 'KOSDAQ' })).toBe(
      '?market=KOSDAQ',
    );
  });

  it('{KOSPI} → ?market=KOSPI', () => {
    expect(toScannerSearchParams({ market: 'KOSPI' })).toBe(
      '?market=KOSPI',
    );
  });
});

describe('상수 export', () => {
  it('DEFAULT_SCANNER_STATE={market:ALL}', () => {
    expect(DEFAULT_SCANNER_STATE).toEqual({ market: 'ALL' });
  });
});
