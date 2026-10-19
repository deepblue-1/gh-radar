import { describe, it, expect, beforeEach } from 'vitest';

import type { AccumSignal, StrategyEventRow } from '@gh-radar/shared';

/**
 * quick-261018-rfy — 작업대 「매집」 패널 순수 함수 (D-01 · D-02).
 *
 * 잠그는 것:
 *  - latestAccumByIsin: 같은 isin 여러 행 → gwTimeMs 큰 것 → 같으면 gateway 사전순 앞 → 같으면 seq 큰 것
 *  - sortAccum: 매집중 · 매도중(1·2)은 netKrw 큰 순 · 청산(3)은 뒤에서 gwTimeMs 큰 순
 *  - accumDismissKey = `${isin}|${cycle}` · ✕ 집합은 날짜 키(오늘)로 저장 · 다른 날은 빈 집합
 *  - advanceAccumMeta: 직전 커밋이 filled 전이면 새 키 무강조, filled 뒤 새 키(새 isin · 같은 isin 새 cycle)는
 *    now + HIGHLIGHT_MS 까지 강조 · 이미 본 키는 직전 값 유지 · state 3 은 강조하지 않음
 */

import {
  ACCUM_DISMISSED_KEY,
  accumDismissKey,
  addAccumDismissed,
  advanceAccumMeta,
  latestAccumByIsin,
  readAccumDismissed,
  restoreCutByGateway,
  sortAccum,
} from '../accum-list';
import { HIGHLIGHT_MS } from '../breakout-list';

type RowLite = Pick<StrategyEventRow, 'isin' | 'gwTimeMs' | 'gateway' | 'seq'>;

function row(over: Partial<StrategyEventRow>): StrategyEventRow {
  return { isin: 'KR7000020008', gwTimeMs: 1_000, gateway: 'KB120', seq: 1, ...over } as StrategyEventRow;
}

function sig(over: Partial<AccumSignal>): AccumSignal {
  return {
    isin: 'KR7000020008',
    exchange: 'KRX',
    stockCode: null,
    tradeDate: '2026-10-18',
    gateway: 'KB120',
    gwTimeMs: 1_000,
    state: 1,
    endReason: 0,
    cycle: 1,
    carryDays: 0,
    buyQty: 0,
    buyKrw: 0,
    sellQty: 0,
    sellKrw: 0,
    netQty: 0,
    netKrw: 0,
    avgPx: 0,
    loPx: 0,
    hiPx: 0,
    regPx: 0,
    peakNetKrw: 0,
    sellPhases: 0,
    maxSame: 0,
    mcapKrw: 0,
    ourExcludedQty: 0,
    lastPx: 0,
    rateBp: 0,
    row: 1,
    sellWarn: false,
    sellWarns: 0,
    sinceDate: null,
    regTime: null,
    thNetKrw: 0,
    thMinSame: 0,
    thMaxMcapKrw: null,
    ...over,
  };
}

const lite = (rows: readonly StrategyEventRow[]): RowLite[] =>
  rows.map((r) => ({ isin: r.isin, gwTimeMs: r.gwTimeMs, gateway: r.gateway, seq: r.seq }));

beforeEach(() => {
  window.localStorage.clear();
});

describe('latestAccumByIsin', () => {
  it('isin 별 1행 — gwTimeMs 큰 것', () => {
    const out = latestAccumByIsin([
      row({ isin: 'A', gwTimeMs: 1_000, seq: 1 }),
      row({ isin: 'A', gwTimeMs: 3_000, seq: 2 }),
      row({ isin: 'B', gwTimeMs: 2_000, seq: 3 }),
      row({ isin: 'A', gwTimeMs: 2_000, seq: 4 }),
    ]);
    expect(lite(out).sort((a, b) => (a.isin < b.isin ? -1 : 1))).toEqual([
      { isin: 'A', gwTimeMs: 3_000, gateway: 'KB120', seq: 2 },
      { isin: 'B', gwTimeMs: 2_000, gateway: 'KB120', seq: 3 },
    ]);
  });

  it('같은 gwTimeMs → gateway 사전순 앞 · 같은 gateway → seq 큰 것', () => {
    const [a] = latestAccumByIsin([
      row({ isin: 'A', gwTimeMs: 5_000, gateway: 'KYOBO119', seq: 9 }),
      row({ isin: 'A', gwTimeMs: 5_000, gateway: 'KB120', seq: 1 }),
    ]);
    expect(a?.gateway).toBe('KB120');
    const [b] = latestAccumByIsin([
      row({ isin: 'B', gwTimeMs: 5_000, gateway: 'KB120', seq: 3 }),
      row({ isin: 'B', gwTimeMs: 5_000, gateway: 'KB120', seq: 7 }),
    ]);
    expect(b?.seq).toBe(7);
  });

  it('빈 입력 → 빈 배열', () => {
    expect(latestAccumByIsin([])).toEqual([]);
  });
});

describe('restoreCutByGateway · latestAccumByIsin ⑤ — 복원 묶음 = 그 서버의 전체 목록', () => {
  const T2132 = 1_760_000_000_000;
  const T2316 = T2132 + 104 * 60_000;
  it('게이트웨이별 가장 최근 복원 묶음(queue_case 3 · 2분 창)의 시작 시각', () => {
    const rows = [
      row({ isin: 'X', gwTimeMs: T2132, queueCase: 3, seq: 1 }),
      row({ isin: 'Y', gwTimeMs: T2132 + 500, queueCase: 3, seq: 2 }),
      row({ isin: 'Y', gwTimeMs: T2316, queueCase: 3, seq: 3 }),
      row({ isin: 'Z', gwTimeMs: T2316 + 40_000, queueCase: 3, seq: 4 }),
      row({ isin: 'Z', gwTimeMs: T2316 + 60_000, queueCase: 2, seq: 5 }),
      row({ isin: 'X', gwTimeMs: T2132, queueCase: 3, seq: 1, gateway: 'KYOBO119' }),
    ];
    const cut = restoreCutByGateway(rows);
    expect(cut.get('KB120')).toBe(T2316);
    expect(cut.get('KYOBO119')).toBe(T2132);
  });
  it('복원 행이 없는 게이트웨이는 키가 없다', () => {
    expect(restoreCutByGateway([row({ isin: 'X', queueCase: 1 })]).size).toBe(0);
  });
  it('묶음 시작보다 오래된 행의 종목은 빠진다 — 2026-10-18 21:32 복원 46종목 시나리오', () => {
    const rows = [
      row({ isin: 'X', gwTimeMs: T2132, queueCase: 3, seq: 1 }), // 21:32 복원 — 23:16 묶음에 없음 → 사라진 종목
      row({ isin: 'X', gwTimeMs: T2132 + 60_000, queueCase: 2, seq: 2 }), // 21:33 첫 스냅샷도 묶음 전
      row({ isin: 'Y', gwTimeMs: T2132 + 500, queueCase: 3, seq: 3 }),
      row({ isin: 'Y', gwTimeMs: T2316, queueCase: 3, seq: 4 }), // 23:16 복원 묶음
      row({ isin: 'W', gwTimeMs: T2316 + 1_000, queueCase: 4, seq: 5 }), // 묶음 뒤 종료 행 — 남는다(state 3 표시)
      row({ isin: 'Z', gwTimeMs: T2316 + 60_000, queueCase: 2, seq: 6 }), // 23:17 첫 스냅샷
    ];
    expect(lite(latestAccumByIsin(rows)).map((r) => `${r.isin}:${r.seq}`)).toEqual(['Y:4', 'W:5', 'Z:6']);
  });
  it('복원 행이 하나도 없으면 자르지 않는다(기존 ① 그대로)', () => {
    const rows = [row({ isin: 'X', gwTimeMs: 1, seq: 1 }), row({ isin: 'X', gwTimeMs: 2, seq: 2 })];
    expect(lite(latestAccumByIsin(rows)).map((r) => r.seq)).toEqual([2]);
  });
  it('자르기는 게이트웨이별 — 한 서버에서 빠진 종목도 다른 서버의 묶음 뒤 행이 있으면 남는다', () => {
    const rows = [
      row({ isin: 'X', gwTimeMs: T2132, queueCase: 3, seq: 1 }),
      row({ isin: 'Y', gwTimeMs: T2316, queueCase: 3, seq: 2 }),
      row({ isin: 'X', gwTimeMs: T2316 + 5_000, queueCase: 1, seq: 7, gateway: 'KYOBO119' }),
    ];
    expect(lite(latestAccumByIsin(rows)).map((r) => `${r.gateway}:${r.isin}`).sort()).toEqual(['KB120:Y', 'KYOBO119:X']);
  });
});

describe('sortAccum', () => {
  it('state 1·2 는 netKrw 큰 순 · state 3 은 뒤에서 gwTimeMs 큰 순', () => {
    const out = sortAccum([
      sig({ isin: 'E1', state: 3, gwTimeMs: 1_000, netKrw: 9e9 }),
      sig({ isin: 'A1', state: 1, netKrw: 1e8 }),
      sig({ isin: 'S1', state: 2, netKrw: 5e8 }),
      sig({ isin: 'E2', state: 3, gwTimeMs: 3_000, netKrw: -1 }),
      sig({ isin: 'A2', state: 1, netKrw: 3e8 }),
    ]);
    expect(out.map((s) => s.isin)).toEqual(['S1', 'A2', 'A1', 'E2', 'E1']);
  });

  it('입력 배열을 바꾸지 않는다', () => {
    const input = [sig({ isin: 'A', netKrw: 1 }), sig({ isin: 'B', netKrw: 2 })];
    sortAccum(input);
    expect(input.map((s) => s.isin)).toEqual(['A', 'B']);
  });
});

describe('✕ 숨김 — 사이클 단위 · 오늘', () => {
  it('accumDismissKey = isin|cycle', () => {
    expect(accumDismissKey(sig({ isin: 'KR7000020008', cycle: 3 }))).toBe('KR7000020008|3');
  });

  it('addAccumDismissed → readAccumDismissed 로 같은 날 읽힌다 · 다른 날은 빈 집합', () => {
    const after = addAccumDismissed(['A|1'], '20261018');
    expect([...after]).toEqual(['A|1']);
    expect([...addAccumDismissed(['B|2'], '20261018')].sort()).toEqual(['A|1', 'B|2']);
    expect([...readAccumDismissed('20261018')].sort()).toEqual(['A|1', 'B|2']);
    expect(readAccumDismissed('20261019').size).toBe(0);
    expect(window.localStorage.getItem(ACCUM_DISMISSED_KEY)).toContain('20261018');
    expect(ACCUM_DISMISSED_KEY).toBe('gh-radar:accum-dismissed');
  });
});

describe('advanceAccumMeta — 신규 강조', () => {
  const NOW = 1_000_000;

  it('filled 전 커밋에서 온 새 키는 무강조로 기록', () => {
    const meta = advanceAccumMeta(new Map(), [sig({ isin: 'A', cycle: 1 })], NOW, false);
    expect(meta.get('A|1')).toBeNull();
  });

  it('filled 뒤 새 isin → now + HIGHLIGHT_MS · 이미 본 키는 직전 값 유지', () => {
    const prev = new Map<string, number | null>([['A|1', null]]);
    const meta = advanceAccumMeta(prev, [sig({ isin: 'A', cycle: 1 }), sig({ isin: 'B', cycle: 1 })], NOW, true);
    expect(meta.get('A|1')).toBeNull();
    expect(meta.get('B|1')).toBe(NOW + HIGHLIGHT_MS);
    const later = advanceAccumMeta(meta, [sig({ isin: 'A', cycle: 1 }), sig({ isin: 'B', cycle: 1 })], NOW + 5_000, true);
    expect(later.get('B|1')).toBe(NOW + HIGHLIGHT_MS);
  });

  it('같은 isin 새 cycle 은 새 키라 강조 · 옛 cycle 키는 빠진다', () => {
    const prev = new Map<string, number | null>([['A|1', null]]);
    const meta = advanceAccumMeta(prev, [sig({ isin: 'A', cycle: 2 })], NOW, true);
    expect(meta.get('A|2')).toBe(NOW + HIGHLIGHT_MS);
    expect(meta.has('A|1')).toBe(false);
  });

  it('state 3(청산) 새 키는 강조하지 않는다', () => {
    const meta = advanceAccumMeta(new Map(), [sig({ isin: 'C', cycle: 1, state: 3 })], NOW, true);
    expect(meta.get('C|1')).toBeNull();
  });
});
