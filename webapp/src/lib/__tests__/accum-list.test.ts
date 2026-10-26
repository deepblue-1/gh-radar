import { describe, it, expect, beforeEach } from 'vitest';

import type { AccumReportResponse, AccumReportRow, AccumSignal, StrategyEventRow } from '@gh-radar/shared';

/**
 * quick-261018-rfy — 작업대 「매집」 패널 순수 함수 (D-01 · D-02).
 *
 * 잠그는 것:
 *  - latestAccumByIsin: 같은 isin 여러 행 → gwTimeMs 큰 것 → 같으면 gateway 사전순 앞 → 같으면 seq 큰 것
 *  - sortAccum: 매집중 · 매도중(1·2)은 dayNetKrw 큰 순(null 은 수 뒤) → netKrw 큰 순 → isin · 청산(3)은 뒤에서 gwTimeMs 작은 순
 *    (먼저 청산한 순 · gh-trade 동형) — quick-261026-01h 당일 축
 *  - prevDayNetOf(resp, todayYmd): 최신 보고서가 오늘 전이면 그날 pos_day 차 · 오늘이면 prev_pos_day 차 · 결측 isin 없음 ·
 *    access false · date null · 미래 날짜 → 빈 Map(quick-261026-01h)
 *  - isListedAccum(sig, closed): 활성 전부 · 청산은 종료 사유 1 · 매집 종료(4)는 그날 청산 행이 있는 isin 만(06:00 기동 정합 · 만료 제외)
 *  - closedRowsOf: 자르기 뒤 queueCase 4 · cancelReason 1 행 — isin 별 최신 1건(매집 종료 행의 값 · 시각 정본)
 *  - accumDismissKey = 활성 `${isin}|${cycle}` · 청산 `…|end`(같은 cycle 재등장) · ✕ 집합은 날짜 키(오늘)로 저장 · 다른 날은 빈 집합
 *  - advanceAccumMeta: 직전 커밋이 filled 전이면 새 키 무강조, filled 뒤 새 키(새 isin · 같은 isin 새 cycle)는
 *    now + HIGHLIGHT_MS 까지 강조 · 이미 본 키는 직전 값 유지 · state 3 은 강조하지 않음
 */

import {
  ACCUM_DISMISSED_KEY,
  accumDismissKey,
  addAccumDismissed,
  advanceAccumMeta,
  closedRowsOf,
  isAccumDismissed,
  isListedAccum,
  latestAccumByIsin,
  readAccumDismissed,
  restoreCutByGateway,
  prevDayNetOf,
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
    nxtBuyKrw: 0,
    nxtSellKrw: 0,
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
    dayBuyKrw: null,
    daySellKrw: null,
    dayNetKrw: null,
    dayAvgPx: null,
    dayNetQty: null,
    dayLoPx: null,
    dayHiPx: null,
    thRecentPieces: null,
    thRecentSec: null,
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
  it('state 1·2 는 netKrw 큰 순 · state 3 은 뒤에서 gwTimeMs 작은 순(먼저 청산한 순)', () => {
    const out = sortAccum([
      sig({ isin: 'E1', state: 3, gwTimeMs: 1_000, netKrw: 9e9 }),
      sig({ isin: 'A1', state: 1, netKrw: 1e8 }),
      sig({ isin: 'S1', state: 2, netKrw: 5e8 }),
      sig({ isin: 'E2', state: 3, gwTimeMs: 3_000, netKrw: -1 }),
      sig({ isin: 'A2', state: 1, netKrw: 3e8 }),
    ]);
    expect(out.map((s) => s.isin)).toEqual(['S1', 'A2', 'A1', 'E1', 'E2']);
  });

  it('입력 배열을 바꾸지 않는다', () => {
    const input = [sig({ isin: 'A', netKrw: 1 }), sig({ isin: 'B', netKrw: 2 })];
    sortAccum(input);
    expect(input.map((s) => s.isin)).toEqual(['A', 'B']);
  });

  it('quick-261026-01h — 활성 행은 dayNetKrw 큰 순(−0.6억 이 +2.4억 뒤) · null 은 수 뒤 · 같거나 둘 다 null 이면 netKrw → isin · 청산은 그대로', () => {
    const out = sortAccum([
      sig({ isin: 'N1', netKrw: 9e9, dayNetKrw: null }),
      sig({ isin: 'D2', netKrw: 1e8, dayNetKrw: -60_000_000 }),
      sig({ isin: 'E1', state: 3, gwTimeMs: 2_000, dayNetKrw: 5e9 }),
      sig({ isin: 'D1', netKrw: 1e8, dayNetKrw: 240_000_000 }),
      sig({ isin: 'N2', netKrw: 9e9, dayNetKrw: null }),
      sig({ isin: 'N0', netKrw: 3e9, dayNetKrw: null }),
      sig({ isin: 'T2', state: 2, netKrw: 5e8, dayNetKrw: 100_000_000 }),
      sig({ isin: 'T1', netKrw: 2e8, dayNetKrw: 100_000_000 }),
      sig({ isin: 'E0', state: 3, gwTimeMs: 1_000, dayNetKrw: null }),
    ]);
    expect(out.map((s) => s.isin)).toEqual(['D1', 'T2', 'T1', 'D2', 'N1', 'N2', 'N0', 'E0', 'E1']);
  });
});

describe('prevDayNetOf — 이월 행 전날 순매수(quick-261026-01h)', () => {
  const ar = (over: Partial<AccumReportRow>): AccumReportRow => ({ isin: 'A', ...over }) as AccumReportRow;
  const resp = (date: string | null, rows: AccumReportRow[]): AccumReportResponse => ({
    access: true,
    dates: date === null ? [] : [date],
    date,
    rows,
  });

  it('최신 보고서가 오늘 전이면 그날 행의 pos_day_buy − pos_day_sell · 하나라도 결측 · null 이면 그 isin 없음', () => {
    const m = prevDayNetOf(
      resp('20261023', [
        ar({ isin: 'A', pos_day_buy_krw: 984_000_000, pos_day_sell_krw: 674_000_000, prev_pos_day_buy_krw: 1, prev_pos_day_sell_krw: 0 }),
        ar({ isin: 'B', pos_day_buy_krw: 0, pos_day_sell_krw: 60_000_000 }),
        ar({ isin: 'C', pos_day_buy_krw: null, pos_day_sell_krw: 1 }),
        ar({ isin: 'D', pos_day_buy_krw: 5 }),
      ]),
      '20261026',
    );
    expect([...m.entries()]).toEqual([
      ['A', 310_000_000],
      ['B', -60_000_000],
    ]);
  });

  it('최신 보고서가 오늘(21:00 적재 뒤)이면 prev_pos_day_buy − prev_pos_day_sell · 같은 결측 규칙', () => {
    const m = prevDayNetOf(
      resp('20261026', [
        ar({ isin: 'A', pos_day_buy_krw: 9e9, pos_day_sell_krw: 0, prev_pos_day_buy_krw: 984_000_000, prev_pos_day_sell_krw: 674_000_000 }),
        ar({ isin: 'B', pos_day_buy_krw: 1, pos_day_sell_krw: 0, prev_pos_day_buy_krw: null, prev_pos_day_sell_krw: null }),
        ar({ isin: 'C', pos_day_buy_krw: 1, pos_day_sell_krw: 0 }),
      ]),
      '20261026',
    );
    expect([...m.entries()]).toEqual([['A', 310_000_000]]);
  });

  it('access false · date null · rows [] · 미래 날짜 → 빈 Map', () => {
    expect(prevDayNetOf({ access: false }, '20261026').size).toBe(0);
    expect(prevDayNetOf(resp(null, []), '20261026').size).toBe(0);
    expect(prevDayNetOf(resp('20261023', []), '20261026').size).toBe(0);
    expect(
      prevDayNetOf(resp('20261027', [ar({ isin: 'A', pos_day_buy_krw: 1, pos_day_sell_krw: 0 })]), '20261026').size,
    ).toBe(0);
  });
});

describe('isListedAccum', () => {
  const none = new Set<string>();
  const mine = new Set(['KR7000020008']);
  const other = new Set(['KR7000040006']);

  it('활성(1 · 2)은 전부 · 청산(3)은 종료 사유 1 — 그날 청산 행 집합과 무관', () => {
    expect(isListedAccum(sig({ state: 1 }), none)).toBe(true);
    expect(isListedAccum(sig({ state: 2 }), none)).toBe(true);
    expect(isListedAccum(sig({ state: 3, endReason: 1 }), none)).toBe(true);
  });

  it('종료 사유 2 기동 정합 · 3 이월 만료는 뺀다 — 그날 청산 행이 있어도', () => {
    expect(isListedAccum(sig({ state: 3, endReason: 2 }), mine)).toBe(false);
    expect(isListedAccum(sig({ state: 3, endReason: 3 }), mine)).toBe(false);
    expect(isListedAccum(sig({ state: 3, endReason: 2 }), none)).toBe(false);
  });

  it('매집 종료(4)는 그날 청산 행이 있는 isin 만 — 없거나 다른 isin 만 있으면 뺀다', () => {
    expect(isListedAccum(sig({ state: 3, endReason: 4 }), mine)).toBe(true);
    expect(isListedAccum(sig({ state: 3, endReason: 4 }), none)).toBe(false);
    expect(isListedAccum(sig({ state: 3, endReason: 4 }), other)).toBe(false);
  });

  it('두 번째 인자는 has(isin) 만 본다 — closedRowsOf 의 Map 도 그대로 받는다', () => {
    const closed = closedRowsOf([row({ isin: 'KR7000020008', queueCase: 4, cancelReason: 1 })]);
    expect(isListedAccum(sig({ state: 3, endReason: 4 }), closed)).toBe(true);
  });
});

describe("closedRowsOf — 그날 청산 행(②')", () => {
  it('queueCase 4 · cancelReason 1 행만 — 매집 종료(4) · 기동 정합(2) 종료 행 · 행 종류 1 은 아니다', () => {
    const out = closedRowsOf([
      row({ isin: 'A', seq: 1, queueCase: 4, cancelReason: 1 }),
      row({ isin: 'B', seq: 2, queueCase: 4, cancelReason: 4 }),
      row({ isin: 'C', seq: 3, queueCase: 4, cancelReason: 2 }),
      row({ isin: 'D', seq: 4, queueCase: 1, cancelReason: 0 }),
    ]);
    expect([...out.keys()]).toEqual(['A']);
  });

  it('isin 별 최신 청산 행 1건 — 같은 사이클 청산 · 재등장 · 다시 청산이면 뒤 청산', () => {
    const first = row({ isin: 'A', seq: 1, gwTimeMs: 1_000, queueCase: 4, cancelReason: 1 });
    const again = row({ isin: 'A', seq: 3, gwTimeMs: 3_000, queueCase: 4, cancelReason: 1 });
    const out = closedRowsOf([again, row({ isin: 'A', seq: 2, gwTimeMs: 2_000, queueCase: 1 }), first]);
    expect(out.get('A')).toBe(again);
  });

  it('같은 게이트웨이의 최근 복원 묶음(queueCase 3) 시작보다 이른 청산 행은 세지 않는다', () => {
    const out = closedRowsOf([
      row({ isin: 'A', seq: 1, gwTimeMs: 1_000, queueCase: 4, cancelReason: 1 }),
      row({ isin: 'C', seq: 2, gwTimeMs: 2_000, queueCase: 3 }),
      row({ isin: 'B', seq: 3, gwTimeMs: 3_000, queueCase: 4, cancelReason: 1 }),
    ]);
    expect([...out.keys()]).toEqual(['B']);
  });

  it('빈 입력 → 빈 Map', () => {
    expect(closedRowsOf([]).size).toBe(0);
  });
});

describe('✕ 숨김 — 사이클 단위 · 오늘', () => {
  it('accumDismissKey = 활성 isin|cycle · 청산 isin|cycle|end', () => {
    expect(accumDismissKey(sig({ isin: 'KR7000020008', cycle: 3 }))).toBe('KR7000020008|3');
    expect(accumDismissKey(sig({ isin: 'KR7000020008', cycle: 3, state: 2 }))).toBe('KR7000020008|3');
    expect(accumDismissKey(sig({ isin: 'KR7000020008', cycle: 3, state: 3, endReason: 1 }))).toBe('KR7000020008|3|end');
    // 매집 종료(4)도 state 3 — 청산 행과 같은 키라 청산 행에서 숨긴 것은 매집 종료 뒤에도 숨김이다.
    expect(accumDismissKey(sig({ isin: 'KR7000020008', cycle: 2, state: 3, endReason: 4 }))).toBe('KR7000020008|2|end');
  });

  it('isAccumDismissed — 활성 때 숨긴 사이클은 청산 · 재등장에도 숨김 · 청산 행에서 숨긴 것은 같은 사이클 재등장이면 다시 보임', () => {
    const live = sig({ isin: 'A', cycle: 2 });
    const ended = sig({ isin: 'A', cycle: 2, state: 3, endReason: 1 });
    const fromLive = new Set([accumDismissKey(live)]);
    expect(isAccumDismissed(fromLive, live)).toBe(true);
    expect(isAccumDismissed(fromLive, ended)).toBe(true);
    const fromEnded = new Set([accumDismissKey(ended)]);
    expect(isAccumDismissed(fromEnded, ended)).toBe(true);
    expect(isAccumDismissed(fromEnded, live)).toBe(false);
    expect(isAccumDismissed(fromLive, sig({ isin: 'A', cycle: 3 }))).toBe(false);
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
    expect(meta.get('C|1|end')).toBeNull();
  });

  it('같은 cycle 재등장(활성 → 청산 → 활성)은 다시 강조', () => {
    const live = advanceAccumMeta(new Map([['A|1', null]]), [sig({ isin: 'A', cycle: 1 })], NOW, true);
    const ended = advanceAccumMeta(live, [sig({ isin: 'A', cycle: 1, state: 3, endReason: 1 })], NOW + 1_000, true);
    expect(ended.get('A|1|end')).toBeNull();
    expect(ended.has('A|1')).toBe(false);
    const back = advanceAccumMeta(ended, [sig({ isin: 'A', cycle: 1 })], NOW + 2_000, true);
    expect(back.get('A|1')).toBe(NOW + 2_000 + HIGHLIGHT_MS);
  });
});
