import { describe, expect, it } from 'vitest';
import type { RelayAccountState, RelayHolding, RelayUnfilled } from '@gh-radar/shared';

import { cardAccountSliceOf, cardHoldingOf, cardUnfilledOf } from '../card/card-account-slice';

/**
 * quick-260923-onn — 카드별 계좌 슬라이스 순수 함수.
 *
 * 접힌 헤더 요약 칩 · 카드 탭 배지 · 카드 탭 본문이 **같은 이 파생값**을 읽는다(두 진실 금지).
 * 필터 규칙은 작업대 `cardForUnfilled` 와 같다 — 같은 ISIN ∧ 행의 거래소. 계좌 축은 호출부가
 * `accountStates.get(accountNo)` 로 이미 골랐다.
 */

const ACCOUNT = '37728502101';
const ISIN_A = 'KR7086520004';
const ISIN_B = 'KR7247540008';

function unf(orderNo: string, isin: string, exchange: 'KRX' | 'NXT' = 'KRX'): RelayUnfilled {
  return {
    orderNo,
    orgOrderNo: '',
    isin,
    side: 'B',
    price: 1000,
    orderQty: 10,
    filledQty: 0,
    unfilledQty: 10,
    exchange,
    orderTime: '090000',
    queuedStatus: '',
    pendingStatus: '',
    board: '',
    pendingCancelSent: false,
  } as RelayUnfilled;
}

function hold(isin: string, qty: number): RelayHolding {
  return { isin, qty, sellableQty: qty, avgPrice: 1000 };
}

const ROWS: RelayUnfilled[] = [
  unf('1', ISIN_A, 'KRX'),
  unf('2', ISIN_A, 'NXT'),
  unf('3', ISIN_B, 'KRX'),
  unf('4', ISIN_A, 'KRX'),
];

describe('cardUnfilledOf', () => {
  it('같은 ISIN ∧ 같은 거래소만 입력 순서대로', () => {
    expect(cardUnfilledOf(ROWS, ISIN_A, 'KRX').map((r) => r.orderNo)).toEqual(['1', '4']);
    expect(cardUnfilledOf(ROWS, ISIN_A, 'NXT').map((r) => r.orderNo)).toEqual(['2']);
    expect(cardUnfilledOf(ROWS, 'KR0000000000', 'KRX')).toEqual([]);
  });
});

describe('cardHoldingOf', () => {
  it('일치 행 1개 · 톰스톤(qty 0)과 없음은 null', () => {
    const h = hold(ISIN_A, 100);
    expect(cardHoldingOf([hold(ISIN_B, 5), h], ISIN_A)).toBe(h);
    expect(cardHoldingOf([hold(ISIN_A, 0)], ISIN_A)).toBeNull();
    expect(cardHoldingOf([hold(ISIN_B, 5)], ISIN_A)).toBeNull();
  });
});

describe('cardAccountSliceOf', () => {
  it('account 가 null 이면 빈 슬라이스', () => {
    expect(cardAccountSliceOf(null, ISIN_A, 'KRX')).toEqual({ account: null, unfilled: [], holding: null });
  });

  it('잘린 unf/hold 를 담은 새 account · 나머지 필드는 원본 · 입력 불변', () => {
    const h = hold(ISIN_A, 100);
    const account: RelayAccountState = {
      t: 'acct',
      a: ACCOUNT,
      snap: true,
      hold: [hold(ISIN_B, 5), h],
      unf: ROWS,
      rm: [],
      st: '10:00:00',
    };
    const slice = cardAccountSliceOf(account, ISIN_A, 'KRX');
    expect(slice.unfilled.map((r) => r.orderNo)).toEqual(['1', '4']);
    expect(slice.holding).toBe(h);
    expect(slice.account).not.toBe(account);
    expect(slice.account?.unf).toEqual(slice.unfilled);
    expect(slice.account?.hold).toEqual([h]);
    expect(slice.account?.t).toBe('acct');
    expect(slice.account?.a).toBe(ACCOUNT);
    expect(slice.account?.snap).toBe(true);
    expect(slice.account?.rm).toBe(account.rm);
    expect(slice.account?.st).toBe('10:00:00');
    expect(account.unf).toHaveLength(4);
    expect(account.hold).toHaveLength(2);

    const none = cardAccountSliceOf(account, ISIN_B, 'NXT');
    expect(none.unfilled).toEqual([]);
    expect(none.holding).toEqual(hold(ISIN_B, 5));
    expect(cardAccountSliceOf({ ...account, hold: [] }, ISIN_A, 'KRX').account?.hold).toEqual([]);
  });
});
