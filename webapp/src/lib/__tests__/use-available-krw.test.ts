import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { RelayAccountState, RelayQuote, RelayUnfilled } from '@gh-radar/shared';

/**
 * Phase 36 D-11 — `useAvailableKrw` · `holdingQuotePrice`(작업대에서 옮김).
 *
 * 스텁 경계는 `useRelayContext()` 하나 — 계좌 상태(66/67) · 시세 맵만 케이스가 바꾼다.
 */

const relayMock = vi.hoisted(() => ({
  accountStates: new Map() as Map<string, unknown>,
  quotes: new Map() as Map<string, unknown>,
}));
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({
      ...actual.EMPTY_RELAY_VALUE,
      accountStates: relayMock.accountStates,
      quotes: relayMock.quotes,
    }),
  };
});

import { holdingQuotePrice, useAvailableKrw } from '../use-available-krw';

const X = 'KR7005930003';
const ACC = '12345678-01';

const q = (isin: string, x: 'KRX' | 'NXT', p: number) =>
  [`${isin}|${x}`, { t: 'q', i: isin, x, snap: true, p, o: p, h: p, l: p }] as const;
const quotes = (...entries: ReturnType<typeof q>[]) =>
  new Map(entries) as unknown as ReadonlyMap<string, RelayQuote>;

function unf(over: Partial<RelayUnfilled> = {}): RelayUnfilled {
  return {
    orderNo: '0001',
    orgOrderNo: '',
    isin: X,
    side: 'B',
    price: 0,
    orderQty: 10,
    filledQty: 0,
    unfilledQty: 10,
    exchange: 'KRX',
    orderTime: '093012',
    queuedStatus: '',
    pendingStatus: '',
    board: '',
    pendingCancelSent: false,
    name: '삼성전자',
    code: '005930',
    ...over,
  };
}

function acct(over: Partial<RelayAccountState> = {}): RelayAccountState {
  return { t: 'acct', a: ACC, snap: true, hold: [], unf: [], rm: [], st: '', ...over };
}

beforeEach(() => {
  relayMock.accountStates = new Map();
  relayMock.quotes = new Map();
});

describe('holdingQuotePrice — KRX → NXT 한 벌 (D-11 · GC-IN-04)', () => {
  it('KRX 가 있으면 KRX 우선', () => {
    expect(holdingQuotePrice(quotes(q(X, 'KRX', 100), q(X, 'NXT', 110)), X)).toBe(100);
  });
  it('KRX 0 이면 NXT 로 폴백', () => {
    expect(holdingQuotePrice(quotes(q(X, 'KRX', 0), q(X, 'NXT', 110)), X)).toBe(110);
  });
  it('둘 다 없으면 undefined', () => {
    expect(holdingQuotePrice(quotes(), X)).toBeUndefined();
  });
});

describe('useAvailableKrw — relay 계좌 상태 + 시세 → availableKrwOf (D-11)', () => {
  it('시장가(price 0) 매수 미체결은 현재가(KRX → NXT)로 센다', () => {
    relayMock.accountStates = new Map([
      [ACC, acct({ budgetKrw: 20_000_000, unf: [unf({ price: 0, unfilledQty: 10 })] })],
    ]);
    relayMock.quotes = new Map(quotes(q(X, 'NXT', 70_000)));
    const { result } = renderHook(() => useAvailableKrw(ACC));
    expect(result.current).toBe(20_000_000 - 10 * 70_000);
  });

  it('현재가가 없으면 시장가 매수 미체결은 0 으로 센다(상한가 금지)', () => {
    relayMock.accountStates = new Map([
      [ACC, acct({ budgetKrw: 20_000_000, unf: [unf({ price: 0, unfilledQty: 10 })] })],
    ]);
    const { result } = renderHook(() => useAvailableKrw(ACC));
    expect(result.current).toBe(20_000_000);
  });

  it('잔고는 매입가(평단 × 수량)로 뺀다 · 매도 미체결은 빼지 않는다', () => {
    relayMock.accountStates = new Map([
      [
        ACC,
        acct({
          budgetKrw: 20_000_000,
          hold: [{ isin: X, qty: 100, sellableQty: 100, avgPrice: 76_600 }],
          unf: [unf({ side: 'S', price: 80_000, unfilledQty: 50 })],
        }),
      ],
    ]);
    const { result } = renderHook(() => useAvailableKrw(ACC));
    expect(result.current).toBe(20_000_000 - 7_660_000);
  });

  it('예수금 미설정 · 계좌 상태 미수신 · 계좌 "" → null', () => {
    relayMock.accountStates = new Map([[ACC, acct()]]);
    expect(renderHook(() => useAvailableKrw(ACC)).result.current).toBeNull();
    expect(renderHook(() => useAvailableKrw('99999999-01')).result.current).toBeNull();
    expect(renderHook(() => useAvailableKrw('')).result.current).toBeNull();
  });

  it('시세가 바뀌면 다시 계산한다(1초 타이머 없음 — 렌더 계산)', () => {
    relayMock.accountStates = new Map([
      [ACC, acct({ budgetKrw: 20_000_000, unf: [unf({ price: 0, unfilledQty: 10 })] })],
    ]);
    relayMock.quotes = new Map(quotes(q(X, 'KRX', 70_000)));
    const { result, rerender } = renderHook(() => useAvailableKrw(ACC));
    expect(result.current).toBe(19_300_000);
    relayMock.quotes = new Map(quotes(q(X, 'KRX', 80_000)));
    rerender();
    expect(result.current).toBe(19_200_000);
  });
});
