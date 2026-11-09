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
 *  - closedTodayOf · listedAccumOf(quick-261109-tn6 · gh-trade AccumClosedTodayFromJournal 동형): 활성 전부 · 회색 행은 최신 행이
 *    row 4/6 · 사유 1/4/5 이고 같은 사이클이 오늘 발표된 뒤 종료한 종목만 · 「갱신」 시각 = 발표 상태에서 처음 내려간 종료 행 ·
 *    값 = 최신 행(row 6 하루 칸) · 회색 후보는 자르기 면제 · 옛 규칙 매집 종료(사유 4)는 청산 행 값 + 사유 4
 *  - 공용 픽스처 S(KB120 11/9 재현 — pgTAP dma_strategy_accum_signal 과 같은 시나리오) · RPC 축소 행 집합 동치
 *  - accumDismissKey = 활성 `${isin}|${cycle}` · 청산 `…|end`(같은 cycle 재등장) · ✕ 집합은 날짜 키(오늘)로 저장 · 다른 날은 빈 집합
 *  - advanceAccumMeta: 직전 커밋이 filled 전이면 새 키 무강조, filled 뒤 새 키(새 isin · 같은 isin 새 cycle)는
 *    now + HIGHLIGHT_MS 까지 강조 · 이미 본 키는 직전 값 유지 · state 3 은 강조하지 않음
 */

import {
  ACCUM_DISMISSED_KEY,
  accumDismissKey,
  addAccumDismissed,
  advanceAccumMeta,
  closedTodayOf,
  isAccumDismissed,
  isClosedTodayCandidate,
  latestAccumByIsin,
  listedAccumOf,
  readAccumDismissed,
  restoreCutByGateway,
  prevDayNetOf,
  sortAccum,
  ACCUM_FILTER_KEY,
  DEFAULT_ACCUM_FILTER,
  formatAccumFilterCell,
  parseAccumFilterCell,
  passesAccumFilter,
  readAccumFilter,
  roundRate2,
  writeAccumFilter,
  type AccumFilter,
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
    ruleVersion: 0,
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

/* ── ②' 목록 규칙 — 서버 저널 시드 동형(quick-261109-tn6) ─────────────────── */

const DAY = '2026-11-09';
const at = (hms: string) => Date.parse(`${DAY}T${hms}+09:00`);
const RULE2_MSG = 'since=20261109|reg=090000|recent=30/60|nxt=0/0|rule=2';

/** kind 16 전체 칸 행 — row 4 · 6 은 state 3. 하루 칸(snap 길이 3)은 dayBuy · daySell. */
function ev(o: {
  seq: number;
  t: string;
  isin: string;
  q: number;
  cyc: number;
  why?: number;
  rule2?: boolean;
  net?: number;
  dayBuy?: number;
  daySell?: number;
  gateway?: string;
}): StrategyEventRow {
  return {
    gateway: o.gateway ?? 'KB120',
    journalEpoch: 'ep-48',
    seq: o.seq,
    tradeDate: DAY,
    gwTimeMs: at(o.t),
    kind: 16,
    group: 0,
    exchange: 'KRX',
    isin: o.isin,
    stockCode: null,
    cumVolume: 0,
    accountNo: '',
    orderNo: '',
    price: 10_000,
    qty: o.q === 4 || o.q === 6 ? 3 : 1,
    orderCondition: '',
    reasonCode: '',
    condThreshold: o.net ?? 300_000_000,
    condActual: 0,
    condMetric: 0,
    evKind: 0,
    evPrice: 10_000,
    evQtyBefore: 0,
    evQtyAfter: 0,
    evTradeQty: 0,
    limitBidQty: 0,
    bid1Price: 0,
    bid1Qty: 0,
    acceptLatencyUs: 10_000,
    immediateFillQty: 0,
    queueCase: o.q,
    baseCum: 0,
    aheadQty: 0,
    expectedCum: o.cyc,
    errorVolume: 0,
    remainingVolume: 0,
    hasRemaining: false,
    cancelReason: o.why ?? 0,
    resultCode: 0,
    message: o.rule2 ? RULE2_MSG : '',
    entryRound: 0,
    snapQty: [9_000, 11_000, o.dayBuy ?? 500_000_000],
    snapCum: [200_000_000, 30, o.daySell ?? 100_000_000],
    askQtyAtLimit: 0,
    openAtLimit: false,
  } as StrategyEventRow;
}

/**
 * 공용 픽스처 S — 한 게이트웨이(KB120) · 하루(2026-11-09 KST). pgTAP dma_strategy_accum_signal.test.sql 과 같은 seq · 시나리오.
 * P 등록 → 재기동 → 기동 하루 판정 종료(사유 5) · R 재기동 복원 활성 · H 숨김 이월 뒤 즉시 종료(오늘 발표 없음) ·
 * Q 재기동 앞 오늘 청산 · D 재기동 앞 활성(재기동이 버림) · X 등록 상태 한 주문 ≤ 0(사유 1 → 사유 4 같은 ms) + row 6.
 */
const S: StrategyEventRow[] = [
  ev({ seq: 1, t: '09:00:00', isin: 'P', q: 1, cyc: 3 }),
  ev({ seq: 2, t: '15:00:00', isin: 'P', q: 1, cyc: 3 }),
  ev({ seq: 3, t: '21:15:00', isin: 'R', q: 3, cyc: 1 }),
  ev({ seq: 4, t: '21:16:00.100', isin: 'P', q: 4, cyc: 3, why: 5, rule2: true, dayBuy: 800_000_000, daySell: 700_000_000 }),
  ev({ seq: 5, t: '21:17:00', isin: 'P', q: 6, cyc: 3, why: 5, rule2: true, dayBuy: 900_000_000, daySell: 650_000_000 }),
  ev({ seq: 6, t: '10:30:00', isin: 'H', q: 4, cyc: 7, why: 4, rule2: true }),
  ev({ seq: 7, t: '09:30:00', isin: 'Q', q: 1, cyc: 2 }),
  ev({ seq: 8, t: '10:00:00', isin: 'Q', q: 4, cyc: 2, why: 1, rule2: true, dayBuy: 400_000_000 }),
  ev({ seq: 9, t: '10:01:00', isin: 'Q', q: 6, cyc: 2, why: 1, rule2: true, dayBuy: 450_000_000 }),
  ev({ seq: 10, t: '11:00:00', isin: 'D', q: 1, cyc: 1 }),
  ev({ seq: 11, t: '13:00:00', isin: 'X', q: 1, cyc: 4 }),
  ev({ seq: 12, t: '13:30:00', isin: 'X', q: 4, cyc: 4, why: 1, rule2: true, net: 100_000_000 }),
  ev({ seq: 13, t: '13:30:00', isin: 'X', q: 4, cyc: 4, why: 4, rule2: true, net: -10_000_000 }),
  ev({ seq: 14, t: '21:18:00', isin: 'X', q: 6, cyc: 4, why: 4, rule2: true, net: -10_000_000, dayBuy: 50_000_000, daySell: 300_000_000 }),
];
/** 복원 RPC(20261109500000)가 그날 KB120 에 내는 seq 집합 — pgTAP 과 같은 기대. */
const RPC_SEQS = [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14];

describe("isClosedTodayCandidate — 회색 후보 술어(RPC queue_case IN (4, 6) AND cancel_reason IN (1, 4, 5))", () => {
  it('row 4 · 6 이고 사유 1 · 4 · 5 만', () => {
    for (const q of [4, 6]) for (const c of [1, 4, 5]) expect(isClosedTodayCandidate({ queueCase: q, cancelReason: c })).toBe(true);
    expect(isClosedTodayCandidate({ queueCase: 4, cancelReason: 2 })).toBe(false);
    expect(isClosedTodayCandidate({ queueCase: 4, cancelReason: 3 })).toBe(false);
    expect(isClosedTodayCandidate({ queueCase: 1, cancelReason: 1 })).toBe(false);
    expect(isClosedTodayCandidate({ queueCase: 6, cancelReason: 0 })).toBe(false);
  });
});

describe("listedAccumOf — 공용 픽스처 S(KB120 11/9 기동 하루 판정 재현)", () => {
  const out = listedAccumOf(S);
  const by = new Map(out.map((s) => [s.isin, s]));

  it('R 활성 · P(사유 5) · Q(사유 1) · X(사유 4) 회색 · H(오늘 발표 없음) · D(자르기 앞 활성) 없음', () => {
    expect([...by.keys()].sort()).toEqual(['P', 'Q', 'R', 'X']);
    expect(by.get('R')).toMatchObject({ state: 1, row: 3 });
  });

  it('P — 복원 묶음 앞 발표여도 실린다 · 시각 = 첫 종료(seq4) · 값 · 하루 칸 = 최신 row 6(seq5)', () => {
    expect(by.get('P')).toMatchObject({ state: 3, endReason: 5, row: 6, ruleVersion: 2, gwTimeMs: at('21:16:00.100'), dayNetKrw: 250_000_000 });
  });

  it('Q — 재기동 앞 오늘 청산 · 시각 = seq8 · 값 = seq9(row 6)', () => {
    expect(by.get('Q')).toMatchObject({ state: 3, endReason: 1, row: 6, gwTimeMs: at('10:00:00'), dayBuyKrw: 450_000_000 });
  });

  it('X — 사유 1 → 사유 4 같은 ms · 시각 = seq12(첫 종료) · 값 · 하루 칸 = seq14 · 사유 4(새 규칙 즉시 종료)', () => {
    expect(by.get('X')).toMatchObject({
      state: 3,
      endReason: 4,
      row: 6,
      gwTimeMs: at('13:30:00'),
      netKrw: -10_000_000,
      dayNetKrw: -250_000_000,
    });
  });

  it('RPC 축소 행 집합 동치 — listedAccumOf(RPC 기대 seq 행만) = listedAccumOf(S 전체)', () => {
    const reduced = S.filter((r) => RPC_SEQS.includes(r.seq));
    expect(sortAccum(listedAccumOf(reduced))).toEqual(sortAccum(out));
  });

  it('sortAccum 순서 안정 — P · Q · X 뒤에 row 6 이 더 와도 회색 행 상대 순서 · gwTimeMs 그대로', () => {
    const before = sortAccum(out).filter((s) => s.state === 3);
    const more = [
      ...S,
      ev({ seq: 15, t: '21:19:00', isin: 'Q', q: 6, cyc: 2, why: 1, rule2: true, dayBuy: 999_000_000 }),
      ev({ seq: 16, t: '21:20:00', isin: 'P', q: 6, cyc: 3, why: 5, rule2: true, dayBuy: 1_000_000_000 }),
      ev({ seq: 17, t: '21:21:00', isin: 'X', q: 6, cyc: 4, why: 4, rule2: true }),
    ];
    const after = sortAccum(listedAccumOf(more)).filter((s) => s.state === 3);
    expect(after.map((s) => [s.isin, s.gwTimeMs])).toEqual(before.map((s) => [s.isin, s.gwTimeMs]));
    expect(after.map((s) => s.isin)).toEqual(['Q', 'X', 'P']);
    expect(after.find((s) => s.isin === 'Q')?.dayBuyKrw).toBe(999_000_000);
  });
});

describe("closedTodayOf · listedAccumOf — 경계 · 옛 규칙 회귀", () => {
  it('옛 규칙(rule 키 없음) row1 → row4 사유1 → row4 사유4(같은 ms) — 실림 · 값 · gwTimeMs = 사유1 행 · endReason 4', () => {
    const rows = [
      ev({ seq: 1, t: '09:30:00', isin: 'A', q: 1, cyc: 2 }),
      ev({ seq: 2, t: '09:50:00', isin: 'A', q: 4, cyc: 2, why: 1, net: 50_000_000 }),
      ev({ seq: 3, t: '09:50:00', isin: 'A', q: 4, cyc: 2, why: 4, net: -200_000_000 }),
    ];
    expect(closedTodayOf(rows).get('A')?.closeRow.seq).toBe(2);
    const [a] = listedAccumOf(rows);
    expect(a).toMatchObject({ state: 3, endReason: 4, netKrw: 50_000_000, gwTimeMs: at('09:50:00'), row: 4, ruleVersion: 0 });
  });

  it('옛 규칙 — 오늘 사유1 없이 row4 사유4 만이면 싣지 않는다(숨김 이월 뒤 매집 종료)', () => {
    expect(listedAccumOf([ev({ seq: 1, t: '09:40:00', isin: 'A', q: 4, cyc: 2, why: 4 })])).toEqual([]);
  });

  it('옛 규칙 — 다른 게이트웨이에만 사유1 이 있어도 싣지 않는다(훅이 한 게이트웨이 행만 넘긴다)', () => {
    const mine = [ev({ seq: 6, t: '09:46:00', isin: 'A', q: 4, cyc: 2, why: 4 })];
    const other = ev({ seq: 1, t: '09:45:00', isin: 'A', q: 4, cyc: 2, why: 1, gateway: 'KYOBO119' });
    expect(listedAccumOf(mine)).toEqual([]);
    expect([...closedTodayOf([other]).keys()]).toEqual(['A']); // 그 서버 행만 주면 그 서버에선 실린다
  });

  it('사유 2(기동 정합) · 3(이월 만료) 최신 행은 싣지 않는다 — 오늘 발표가 있어도', () => {
    for (const why of [2, 3]) {
      const rows = [
        ev({ seq: 1, t: '09:30:00', isin: 'A', q: 1, cyc: 2 }),
        ev({ seq: 2, t: '09:31:00', isin: 'A', q: 4, cyc: 2, why }),
      ];
      expect(listedAccumOf(rows)).toEqual([]);
    }
  });

  it('row 6 만 있고 오늘 종료 행이 없으면(06:00 전 자정 넘김) 싣지 않는다', () => {
    const rows = [
      ev({ seq: 1, t: '06:00:00', isin: 'A', q: 2, cyc: 2 }),
      ev({ seq: 2, t: '06:01:00', isin: 'A', q: 6, cyc: 2, why: 1, rule2: true }),
    ];
    expect(closedTodayOf(rows).size).toBe(0);
    expect(listedAccumOf(rows)).toEqual([]);
  });

  it('청산 → 같은 사이클 재등장(row 1) → 다시 청산이면 gwTimeMs = 뒤 청산 시각', () => {
    const rows = [
      ev({ seq: 1, t: '09:30:00', isin: 'A', q: 1, cyc: 2 }),
      ev({ seq: 2, t: '10:00:00', isin: 'A', q: 4, cyc: 2, why: 1, rule2: true }),
      ev({ seq: 3, t: '10:30:00', isin: 'A', q: 1, cyc: 2, rule2: true }),
      ev({ seq: 4, t: '11:00:00', isin: 'A', q: 4, cyc: 2, why: 1, rule2: true }),
      ev({ seq: 5, t: '11:01:00', isin: 'A', q: 6, cyc: 2, why: 1, rule2: true }),
    ];
    expect(listedAccumOf(rows)[0]).toMatchObject({ state: 3, endReason: 1, gwTimeMs: at('11:00:00'), row: 6 });
  });

  it('다른 사이클의 발표는 세지 않는다 — 새 사이클이 오늘 발표 없이 끝나면 싣지 않는다', () => {
    const rows = [
      ev({ seq: 1, t: '09:30:00', isin: 'A', q: 1, cyc: 1 }),
      ev({ seq: 2, t: '09:40:00', isin: 'A', q: 4, cyc: 1, why: 4, rule2: true }),
      ev({ seq: 3, t: '20:01:00', isin: 'A', q: 4, cyc: 2, why: 5, rule2: true }),
    ];
    expect(listedAccumOf(rows)).toEqual([]);
  });

  it('자르기 앞 오늘 청산 행도 회색 후보라 실린다(서버 저널 시드 동형 — 시드는 하루 저널 전체를 본다)', () => {
    const rows = [
      ev({ seq: 1, t: '09:30:00', isin: 'A', q: 1, cyc: 1 }),
      ev({ seq: 2, t: '10:00:00', isin: 'A', q: 4, cyc: 1, why: 1, rule2: true }),
      ev({ seq: 3, t: '21:15:00', isin: 'C', q: 3, cyc: 1 }),
      ev({ seq: 4, t: '11:00:00', isin: 'B', q: 1, cyc: 1 }), // 자르기 앞 활성 — 버린다
    ];
    expect(listedAccumOf(rows).map((s) => [s.isin, s.state]).sort()).toEqual([
      ['A', 3],
      ['C', 1],
    ]);
  });

  it('빈 입력 → 빈 결과', () => {
    expect(closedTodayOf([]).size).toBe(0);
    expect(listedAccumOf([])).toEqual([]);
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

describe('quick-261104-nxs ⑦ 필터 — 칸 파싱 · 정규화 · 판정 · 기억', () => {
  const NONE: AccumFilter = { rateMin: null, rateMax: null, dayMin: null, dayMax: null };

  it('parseAccumFilterCell — 공백 · 쉼표 · 지수 · 부호 허용, 빈 칸 · 문자 · NaN · Infinity · 여러 점 · 16진수 = null', () => {
    expect(parseAccumFilterCell('15')).toBe(15);
    expect(parseAccumFilterCell(' 1,000 ')).toBe(1000);
    expect(parseAccumFilterCell('1e3')).toBe(1000);
    expect(parseAccumFilterCell('-5')).toBe(-5);
    expect(parseAccumFilterCell('1.5')).toBe(1.5);
    for (const bad of ['', '   ', 'abc', 'NaN', 'Infinity', '1.2.3', '0x10', '1e999']) {
      expect(parseAccumFilterCell(bad)).toBeNull();
    }
  });

  it('formatAccumFilterCell — null → 빈 칸 · 수 → String', () => {
    expect(formatAccumFilterCell(null)).toBe('');
    expect(formatAccumFilterCell(15)).toBe('15');
    expect(formatAccumFilterCell(1.5)).toBe('1.5');
  });

  it('roundRate2 — 둘째 자리 0에서 먼 쪽 반올림', () => {
    expect(roundRate2(14.995)).toBeCloseTo(15, 10);
    expect(roundRate2(-14.996)).toBeCloseTo(-15, 10);
    expect(roundRate2(14.994)).toBeCloseTo(14.99, 10);
  });

  it('passesAccumFilter — 등락률 경계 포함 · 둘째 자리 반올림 비교', () => {
    const f: AccumFilter = { ...NONE, rateMin: 15 };
    expect(passesAccumFilter(f, 15, null)).toBe(true);
    expect(passesAccumFilter(f, 14.994, null)).toBe(false);
    expect(passesAccumFilter(f, 14.996, null)).toBe(true);
    const g: AccumFilter = { ...NONE, rateMax: 30 };
    expect(passesAccumFilter(g, 30.004, null)).toBe(true);
    expect(passesAccumFilter(g, 30.006, null)).toBe(false);
  });

  it('passesAccumFilter — 당일 순매수 null 은 0 · 억 → 원 반올림 · 경계 포함', () => {
    const f: AccumFilter = { ...NONE, dayMin: 1 };
    expect(passesAccumFilter(f, 20, null)).toBe(false);
    expect(passesAccumFilter(f, 20, 99_999_999)).toBe(false);
    expect(passesAccumFilter(f, 20, 100_000_000)).toBe(true);
    expect(passesAccumFilter({ ...NONE, dayMax: 0 }, 20, null)).toBe(true);
    expect(passesAccumFilter({ ...NONE, dayMax: 0.5 }, 20, 50_000_001)).toBe(false);
  });

  it('passesAccumFilter — 네 칸 모두 null 이면 무엇이든 통과 · 등락률 제한이 있는데 비유한수면 실패 · min > max 는 그대로(통과 없음)', () => {
    expect(passesAccumFilter(NONE, Number.NaN, null)).toBe(true);
    expect(passesAccumFilter(NONE, -50, -1e12)).toBe(true);
    expect(passesAccumFilter({ ...NONE, rateMin: 15 }, Number.NaN, 1e9)).toBe(false);
    expect(passesAccumFilter({ ...NONE, rateMax: 30 }, Number.POSITIVE_INFINITY, 1e9)).toBe(false);
    expect(passesAccumFilter({ ...NONE, rateMin: 20, rateMax: 10 }, 15, null)).toBe(false);
  });

  describe('readAccumFilter / writeAccumFilter', () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    it('저장 없음 · JSON 깨짐 · 객체 아님 → DEFAULT(등락률 최소 15 · 당일 순매수 최소 1)', () => {
      expect(DEFAULT_ACCUM_FILTER).toEqual({ rateMin: 15, rateMax: null, dayMin: 1, dayMax: null });
      expect(readAccumFilter()).toEqual(DEFAULT_ACCUM_FILTER);
      window.localStorage.setItem(ACCUM_FILTER_KEY, '{not json');
      expect(readAccumFilter()).toEqual(DEFAULT_ACCUM_FILTER);
      window.localStorage.setItem(ACCUM_FILTER_KEY, '42');
      expect(readAccumFilter()).toEqual(DEFAULT_ACCUM_FILTER);
      window.localStorage.setItem(ACCUM_FILTER_KEY, '[1,2]');
      expect(readAccumFilter()).toEqual(DEFAULT_ACCUM_FILTER);
    });

    it('저장된 null 은 null 그대로 · 수 아님(문자열 · 누락)은 그 칸만 기본값', () => {
      window.localStorage.setItem(ACCUM_FILTER_KEY, JSON.stringify({ rateMin: null, rateMax: 30, dayMin: 'x' }));
      expect(readAccumFilter()).toEqual({ rateMin: null, rateMax: 30, dayMin: 1, dayMax: null });
    });

    it('write → read 왕복', () => {
      const f: AccumFilter = { rateMin: 5, rateMax: 29.5, dayMin: null, dayMax: 10 };
      writeAccumFilter(f);
      expect(JSON.parse(window.localStorage.getItem(ACCUM_FILTER_KEY)!)).toEqual(f);
      expect(readAccumFilter()).toEqual(f);
    });
  });
});
