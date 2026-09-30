/**
 * Phase 25-06 — 잔량진행률 순수 함수 (`queue-progress.ts`).
 *
 * 웹은 진행률을 **계산하지 않는다**(D-12) — 서버 값을 클램프만 한다. 조인은 (계좌, 주문번호)
 * **문자열 동등**이고 재정규화하지 않는다(RESEARCH Pitfall 15 · gh-trade Q5).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RelayAccountState, RelayQueueProgressItem, RelayUnfilled } from '@gh-radar/shared';

import {
  findQueueProgress,
  progressGroupLabel,
  progressView,
  reportUnmatchedProgressOnce,
} from '../queue-progress';

const ISIN = 'KR7005930003';
const ACCOUNT = '1234567801';

function item(overrides: Partial<RelayQueueProgressItem> = {}): RelayQueueProgressItem {
  return {
    accountNo: ACCOUNT,
    orderNo: '12453',
    exchange: 'KRX',
    isin: ISIN,
    group: 3,
    expectedCum: 1_100_000,
    currentCum: 1_088_000,
    remainingVolume: 12_000,
    progressBp: 8800,
    firstFilled: false,
    ...overrides,
  };
}

function unf(orderNo: string): RelayUnfilled {
  return {
    orderNo,
    orgOrderNo: '',
    isin: ISIN,
    side: 'B',
    price: 12_350,
    orderQty: 300,
    filledQty: 0,
    unfilledQty: 300,
    exchange: 'KRX',
    orderTime: '094502',
    queuedStatus: '',
    pendingStatus: '',
    board: '',
    pendingCancelSent: false,
  };
}

function acct(a: string, orderNos: string[]): RelayAccountState {
  return { t: 'acct', a, snap: true, hold: [], unf: orderNos.map(unf), rm: [], st: '' };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('findQueueProgress — (계좌, 주문번호) 문자열 동등 조인', () => {
  const map = new Map([[`${ISIN}|KRX`, [item(), item({ orderNo: '12454', group: 1 })]]]);

  it('같은 종목 · 거래소 키에서 계좌 · 주문번호가 같은 항목을 찾는다', () => {
    expect(findQueueProgress(map, ACCOUNT, { isin: ISIN, exchange: 'KRX', orderNo: '12453' })).toEqual(item());
    expect(findQueueProgress(map, ACCOUNT, { isin: ISIN, exchange: 'KRX', orderNo: '12454' })?.group).toBe(1);
  });

  it('계좌 앞 0 이 다르면 null — 재정규화하지 않는다 (Pitfall 15)', () => {
    expect(findQueueProgress(map, `0${ACCOUNT}`, { isin: ISIN, exchange: 'KRX', orderNo: '12453' })).toBeNull();
    expect(findQueueProgress(map, ACCOUNT, { isin: ISIN, exchange: 'KRX', orderNo: '012453' })).toBeNull();
  });

  it('다른 거래소 · 없는 키 · 빈 Map 은 null', () => {
    expect(findQueueProgress(map, ACCOUNT, { isin: ISIN, exchange: 'NXT', orderNo: '12453' })).toBeNull();
    expect(findQueueProgress(new Map(), ACCOUNT, { isin: ISIN, exchange: 'KRX', orderNo: '12453' })).toBeNull();
  });
});

describe('progressView — D-12 클램프만 (웹 계산 없음)', () => {
  it('8800bp · 12,000주 → 88% · near 아님 · 값 텍스트', () => {
    expect(progressView({ remainingVolume: 12_000, progressBp: 8800, group: 3 })).toEqual({
      groupLabel: '후매수',
      remaining: 12000,
      pct: 88,
      near: false,
      full: false,
      firstFilled: false,
      valueText: '후매수 체결예상까지 12,000주 남음, 88%',
    });
  });

  it('9000bp → near (% ≥ 90 · up 색)', () => {
    expect(progressView({ remainingVolume: 5_000, progressBp: 9000, group: 3 })).toMatchObject({ pct: 90, near: true, full: false });
  });

  it('remaining −5 · bp 10050 → 0주 남음 · 100% · near · full', () => {
    expect(progressView({ remainingVolume: -5, progressBp: 10050, group: 1 })).toMatchObject({
      remaining: 0,
      pct: 100,
      near: true,
      full: true,
      valueText: '선매수 체결예상까지 0주 남음, 100%',
    });
  });

  it('remaining ≤ 0 이면 bp 가 낮아도 0주 남음 · 100% (D-12)', () => {
    expect(progressView({ remainingVolume: 0, progressBp: 4200, group: 1 })).toMatchObject({ remaining: 0, pct: 100, full: true });
  });

  it('bp ≥ 10000 이면 남은 수량이 있어도 0주 남음 · 100% (D-12)', () => {
    expect(progressView({ remainingVolume: 300, progressBp: 10000, group: 1 })).toMatchObject({ remaining: 0, pct: 100, full: true });
  });

  it('9999bp → 99% (floor) · −3bp → 0%', () => {
    expect(progressView({ remainingVolume: 1, progressBp: 9999, group: 3 }).pct).toBe(99);
    expect(progressView({ remainingVolume: 1, progressBp: -3, group: 3 }).pct).toBe(0);
  });

  it('group 0 → 「매수」(플래너 가정 A-P1) · 모르는 group 9 → 원문 「9」', () => {
    expect(progressView({ remainingVolume: 1, progressBp: 100, group: 0 }).groupLabel).toBe('매수');
    expect(progressView({ remainingVolume: 1, progressBp: 100, group: 9 }).groupLabel).toBe('9');
  });

  it('group 7 수동 · 8 VI (gh-trade 2026-09-30 말미 추가) → 값 텍스트 종류명 「수동」 · 「VI」', () => {
    expect(progressView({ remainingVolume: 1200, progressBp: 5000, group: 7 }).valueText).toBe(
      '수동 체결예상까지 1,200주 남음, 50%',
    );
    expect(progressView({ remainingVolume: 1200, progressBp: 5000, group: 8 }).valueText).toBe(
      'VI 체결예상까지 1,200주 남음, 50%',
    );
  });
});

describe('progressView — first_filled (quick-260930-fi4 · 서버가 첫 체결 순간 값으로 고정)', () => {
  it('firstFilled · bp 9650 · 4,000주 → 96% · near 아님 · full 아님 · 「체결 시작」', () => {
    expect(progressView({ group: 3, remainingVolume: 4000, progressBp: 9650, firstFilled: true })).toEqual({
      groupLabel: '후매수',
      remaining: 4000,
      pct: 96,
      near: false,
      full: false,
      firstFilled: true,
      valueText: '후매수 · 체결 시작, 96%',
    });
  });

  it('firstFilled · bp 10050 · remaining −5 → full 아님 · pct 100 · 여전히 체결 시작', () => {
    expect(progressView({ group: 3, remainingVolume: -5, progressBp: 10050, firstFilled: true })).toMatchObject({
      remaining: 0,
      pct: 100,
      near: false,
      full: false,
      firstFilled: true,
      valueText: '후매수 · 체결 시작, 100%',
    });
  });

  it('firstFilled 가 없으면(옛 relay) false — 기존 대기 결과 그대로', () => {
    const legacy = progressView({ group: 3, remainingVolume: 12_000, progressBp: 8800 });
    expect(legacy.firstFilled).toBe(false);
    expect(legacy).toMatchObject({ pct: 88, near: false, full: false, remaining: 12000 });
  });
});

describe('progressGroupLabel', () => {
  it('0 → 매수 · 1~3 표시명 · 모르는 값 원문', () => {
    expect(progressGroupLabel(0)).toBe('매수');
    expect(progressGroupLabel(1)).toBe('선매수');
    expect(progressGroupLabel(2)).toBe('추가매수');
    expect(progressGroupLabel(3)).toBe('후매수');
    expect(progressGroupLabel(9)).toBe('9');
  });

  it('7 → 수동 · 8 → VI (표시명 표 위임) · 0 은 옛 서버 호환으로 여전히 매수', () => {
    expect(progressGroupLabel(7)).toBe('수동');
    expect(progressGroupLabel(8)).toBe('VI');
    expect(progressGroupLabel(0)).toBe('매수');
    expect(progressGroupLabel(9)).toBe('9');
  });
});

describe('reportUnmatchedProgressOnce — 조인 실패 dev 로그 1회', () => {
  it('어떤 미체결 행과도 맞지 않는 키만 console.warn 1회 · 같은 키 두 번째 호출은 무음 · 계좌 원문 없음', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const map = new Map([[`${ISIN}|KRX`, [item({ orderNo: '70001' }), item({ orderNo: '70002' })]]]);
    const states = new Map([[ACCOUNT, acct(ACCOUNT, ['70001'])]]);

    reportUnmatchedProgressOnce(map, states);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls[0])).toContain('70002');
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain(ACCOUNT);

    reportUnmatchedProgressOnce(map, states);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('계좌가 다르면(앞 0) 맞지 않는 것으로 본다 — 재정규화 없음', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const map = new Map([[`${ISIN}|KRX`, [item({ accountNo: `0${ACCOUNT}`, orderNo: '70003' })]]]);
    reportUnmatchedProgressOnce(map, new Map([[ACCOUNT, acct(ACCOUNT, ['70003'])]]));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('모두 맞으면 무음', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const map = new Map([[`${ISIN}|KRX`, [item({ orderNo: '70004' })]]]);
    reportUnmatchedProgressOnce(map, new Map([[ACCOUNT, acct(ACCOUNT, ['70004'])]]));
    expect(warn).not.toHaveBeenCalled();
  });

  it('production 에서는 아무것도 하지 않는다', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const map = new Map([[`${ISIN}|KRX`, [item({ orderNo: '70005' })]]]);
    reportUnmatchedProgressOnce(map, new Map());
    expect(warn).not.toHaveBeenCalled();
  });
});
