import { describe, expect, it } from 'vitest';

import {
  EXCHANGE_CHOICES_ALL,
  EXCHANGE_CHOICES_KRX_ONLY,
  exchangeChoicesOf,
} from '../exchange-choices';

const ISIN = 'KR7005930003';
const OTHER = 'KR7000660001';

describe('exchangeChoicesOf — 거래소 선택지 (quick-260923-pq2)', () => {
  it('모름(null · undefined) → 둘 다 · 안정 참조', () => {
    expect(exchangeChoicesOf(ISIN, 'KRX', null)).toEqual(['KRX', 'NXT']);
    expect(exchangeChoicesOf(ISIN, 'KRX', null)).toBe(EXCHANGE_CHOICES_ALL);
    expect(exchangeChoicesOf(ISIN, 'KRX', undefined)).toBe(EXCHANGE_CHOICES_ALL);
  });

  it('집합에 이 ISIN 이 있으면 둘 다', () => {
    expect(exchangeChoicesOf(ISIN, 'KRX', new Set([ISIN, OTHER]))).toBe(EXCHANGE_CHOICES_ALL);
  });

  it('집합에 없고 현재 KRX 면 KRX 하나', () => {
    const choices = exchangeChoicesOf(ISIN, 'KRX', new Set([OTHER]));
    expect(choices).toEqual(['KRX']);
    expect(choices).toBe(EXCHANGE_CHOICES_KRX_ONLY);
  });

  it('집합에 없어도 현재 NXT 면 둘 다 — 되돌아갈 수 있게', () => {
    expect(exchangeChoicesOf(ISIN, 'NXT', new Set([OTHER]))).toBe(EXCHANGE_CHOICES_ALL);
  });

  it('빈 ISIN 은 둘 다', () => {
    expect(exchangeChoicesOf('', 'KRX', new Set([OTHER]))).toBe(EXCHANGE_CHOICES_ALL);
  });

  it('빈 집합은 확정(모름 아님) — KRX 하나', () => {
    expect(exchangeChoicesOf(ISIN, 'KRX', new Set())).toBe(EXCHANGE_CHOICES_KRX_ONLY);
  });
});
