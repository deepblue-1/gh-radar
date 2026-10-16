import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ME_ACCOUNT_KEY_PREFIX,
  TRADING_ACCOUNT_KEY_PREFIX,
  meAccountChoicesOf,
  meAccountOf,
  pillAccountOf,
  readMeAccount,
  readTradingAccount,
  writeMeAccount,
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

/**
 * Phase 32 D-20 — /me 계좌 칩 기억. 작업대 계좌칸 키와 따로 둔 사용자별 · 기기별 키이고,
 * 기본 선택 순서 = 이 화면 기억값 → 작업대 기억 계좌 → 이미 고른 값 → 첫 칩.
 */
describe('P32 /me 계좌 기억 (D-20)', () => {
  const choices = (...nos: string[]) => nos.map((accountNo) => ({ accountNo }));

  it('read/write 왕복 · 키는 gh-radar:me-account:{userId} · 값은 { v: 1, accountNo }', () => {
    writeMeAccount('u1', 'B');
    expect(readMeAccount('u1')).toBe('B');
    expect(readMeAccount('u2')).toBeNull();
    expect(ME_ACCOUNT_KEY_PREFIX).toBe('gh-radar:me-account:');
    expect(JSON.parse(window.localStorage.getItem('gh-radar:me-account:u1') ?? 'null')).toEqual({
      v: 1,
      accountNo: 'B',
    });
  });

  it('깨진 JSON · v≠1 · 33자 · 빈 값은 null(32자는 통과)', () => {
    const key = 'gh-radar:me-account:u1';
    for (const raw of [
      'not-json',
      JSON.stringify({ v: 2, accountNo: 'B' }),
      JSON.stringify({ v: 1, accountNo: 7 }),
      JSON.stringify({ v: 1, accountNo: '' }),
      JSON.stringify({ v: 1, accountNo: 'x'.repeat(33) }),
      'null',
    ]) {
      window.localStorage.setItem(key, raw);
      expect(readMeAccount('u1')).toBeNull();
    }
    window.localStorage.setItem(key, JSON.stringify({ v: 1, accountNo: 'x'.repeat(32) }));
    expect(readMeAccount('u1')).toBe('x'.repeat(32));
  });

  it('userId "" 는 읽기 null · 쓰기 없음 / accountNo "" 도 쓰기 없음', () => {
    writeMeAccount('', 'B');
    writeMeAccount('u1', '');
    expect(window.localStorage.length).toBe(0);
    expect(readMeAccount('')).toBeNull();
  });

  it('저장소가 throw 해도 읽기는 null · 쓰기는 조용히 지나간다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readMeAccount('u1')).toBeNull();
    expect(() => writeMeAccount('u1', 'B')).not.toThrow();
  });

  it('작업대 키와 독립 — 한쪽을 써도 다른 쪽은 null', () => {
    writeMeAccount('u1', 'B');
    expect(readTradingAccount('u1')).toBeNull();
    window.localStorage.clear();
    writeTradingAccount('u1', 'A');
    expect(readMeAccount('u1')).toBeNull();
  });

  it('meAccountChoicesOf — accounts[] 순 그대로 · 상품명 · 서버키 · 뒤에 행 계좌(처음 본 순)', () => {
    const accounts = [
      { accountNo: 'A', name: '위탁종합', serverKey: 'KB120' },
      { accountNo: 'B', name: '위탁CMA' },
    ];
    expect(meAccountChoicesOf(accounts, ['Z', 'B', 'Y', 'Z'])).toEqual([
      { accountNo: 'A', name: '위탁종합', serverKey: 'KB120' },
      { accountNo: 'B', name: '위탁CMA' },
      { accountNo: 'Z', name: '' },
      { accountNo: 'Y', name: '' },
    ]);
  });

  it('meAccountChoicesOf — 중복 제거 · 빈 문자열 버림', () => {
    expect(meAccountChoicesOf([{ accountNo: 'A', name: '' }], ['', 'A', '', 'B', 'B'])).toEqual([
      { accountNo: 'A', name: '' },
      { accountNo: 'B', name: '' },
    ]);
    expect(meAccountChoicesOf([], [])).toEqual([]);
  });

  it('meAccountOf — 빈 목록이면 current 그대로', () => {
    expect(meAccountOf([], 'B', 'A', '')).toBe('');
    expect(meAccountOf([], 'B', 'A', 'C')).toBe('C');
  });

  it('meAccountOf — 이 화면 기억값이 목록 안이면 그것(작업대 기억 · current 보다 먼저)', () => {
    expect(meAccountOf(choices('A', 'B', 'C'), 'B', 'C', 'A')).toBe('B');
  });

  it('meAccountOf — 화면 기억값이 없거나 목록 밖이면 작업대 기억 계좌', () => {
    expect(meAccountOf(choices('A', 'B', 'C'), null, 'C', 'A')).toBe('C');
    expect(meAccountOf(choices('A', 'B', 'C'), 'Z', 'C', '')).toBe('C');
  });

  it('meAccountOf — 둘 다 목록 밖이면 이미 고른 값 유지', () => {
    expect(meAccountOf(choices('A', 'B'), 'Z', 'Y', 'B')).toBe('B');
  });

  it('meAccountOf — 아무것도 없으면 첫 칩', () => {
    expect(meAccountOf(choices('A', 'B'), null, null, '')).toBe('A');
  });

  it('meAccountOf — 기억값이 목록 밖이 되면 첫 칩으로 떨어진다(알림 없음)', () => {
    // 고른 B 가 목록에서 사라졌다 — current 도 B 라 목록 밖이다.
    expect(meAccountOf(choices('A', 'C'), 'B', null, 'B')).toBe('A');
  });

  it('meAccountOf — 기억값이 나중 프레임에 도착하면 그 칩으로 올라간다', () => {
    expect(meAccountOf(choices('A'), 'B', null, '')).toBe('A');
    expect(meAccountOf(choices('A', 'B'), 'B', null, 'A')).toBe('B');
  });
});
