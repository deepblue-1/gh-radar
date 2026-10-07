import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TRADING_ACCOUNT_KEY_PREFIX,
  pillAccountOf,
  readTradingAccount,
  writeTradingAccount,
} from '../trading-layout';

/**
 * 계좌칸 기억 (quick-261007-h76) — 저장 · 복원 · 선택 규칙.
 * 사용자 증상: 「트레이딩에서 계좌를 고르고 다른 페이지에 갔다 오면 자꾸 다른 계좌로 바뀌어 있다」.
 */

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const accs = (...nos: string[]) => nos.map((accountNo) => ({ accountNo }));

describe('pillAccountOf — 계좌칸 결정 규칙', () => {
  it('accounts 가 비면 current 그대로', () => {
    expect(pillAccountOf('', [], 'B')).toBe('');
    expect(pillAccountOf('A', [], 'B')).toBe('A');
  });

  it('saved 가 accounts 에 있으면 saved — current 가 다른 값이어도', () => {
    expect(pillAccountOf('', accs('A', 'B'), 'B')).toBe('B');
    expect(pillAccountOf('A', accs('A', 'B'), 'B')).toBe('B');
  });

  it('saved 가 없거나 accounts 에 없고 current="" 면 accounts[0]', () => {
    expect(pillAccountOf('', accs('A', 'B'), null)).toBe('A');
    expect(pillAccountOf('', accs('A', 'B'), 'Z')).toBe('A');
  });

  it('saved 가 없거나 accounts 에 없고 current≠"" 면 current(이미 고른 계좌를 덮지 않는다)', () => {
    expect(pillAccountOf('B', accs('A', 'B'), null)).toBe('B');
    expect(pillAccountOf('B', accs('A', 'B'), 'Z')).toBe('B');
  });
});

describe('readTradingAccount · writeTradingAccount — 사용자별 저장', () => {
  it('쓴 계좌를 같은 사용자만 읽는다 · 키는 gh-radar:trading-account:{userId}', () => {
    writeTradingAccount('u1', 'B');
    expect(readTradingAccount('u1')).toBe('B');
    expect(readTradingAccount('u2')).toBeNull();
    expect(TRADING_ACCOUNT_KEY_PREFIX).toBe('gh-radar:trading-account:');
    expect(window.localStorage.getItem('gh-radar:trading-account:u1')).not.toBeNull();
  });

  it('userId "" 이면 읽기 null · 쓰기 없음 / accountNo "" 도 쓰기 없음', () => {
    writeTradingAccount('', 'B');
    expect(window.localStorage.length).toBe(0);
    expect(readTradingAccount('')).toBeNull();
    writeTradingAccount('u1', '');
    expect(window.localStorage.length).toBe(0);
  });

  it('깨진 저장값은 null', () => {
    const key = 'gh-radar:trading-account:u1';
    const bad = [
      'not-json',
      JSON.stringify({ v: 2, accountNo: 'B' }),
      JSON.stringify({ v: 1, accountNo: 123 }),
      JSON.stringify({ v: 1, accountNo: '' }),
      JSON.stringify({ v: 1, accountNo: 'x'.repeat(33) }),
      'null',
    ];
    for (const raw of bad) {
      window.localStorage.setItem(key, raw);
      expect(readTradingAccount('u1')).toBeNull();
    }
    window.localStorage.setItem(key, JSON.stringify({ v: 1, accountNo: 'x'.repeat(32) }));
    expect(readTradingAccount('u1')).toBe('x'.repeat(32));
  });

  it('저장소가 throw 해도 읽기는 null · 쓰기는 조용히 지나간다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readTradingAccount('u1')).toBeNull();
    expect(() => writeTradingAccount('u1', 'B')).not.toThrow();
  });
});
