import { describe, it, expect } from 'vitest';

import type { StrategyEventRow } from '@gh-radar/shared';

import {
  DEFAULT_ORDER_LOG_FILTERS,
  ORDER_LOG_KIND_FILTERS,
  applyOrderLogFilters,
  inScope,
  kstWeekdayShort,
  matchesKind,
  mergeStrategyEvents,
  orderLogQueryString,
  parseOrderLogQuery,
  shiftKstDate,
  stockOptions,
} from '../order-log-feed';
import {
  FIXTURE_ACCOUNT_NO,
  FIXTURE_TRADE_DATE,
  STRATEGY_BRANCH_ROWS,
  STRATEGY_DAY_BY_NAME,
  STRATEGY_DAY_ROWS,
} from '@/test-fixtures/strategy-day';

/**
 * Phase 25-07 Task 1 — 주문로그 피드 순수 함수 (D-07 오늘 경계 · D-08 구분 축 · 결정 1-A 범위 · R3 쿼리).
 */

const exposed = STRATEGY_DAY_BY_NAME.exposed!;
const buy12451 = STRATEGY_DAY_BY_NAME.buy12451!;
const queued12451 = STRATEGY_DAY_BY_NAME.queued12451!;
const OTHER_ISIN = 'KR7000660001';
const OTHER_ACCOUNT = '9999999901';

const row = (base: StrategyEventRow, over: Partial<StrategyEventRow>): StrategyEventRow => ({ ...base, ...over });

describe('mergeStrategyEvents — 복원 + 푸시 (D-07)', () => {
  it('복원 2 + 푸시 3(중복 1 · 어제 1) → 3행 오름차순 · 어제 행 제외 · 중복 1회', () => {
    const yesterday = row(queued12451, { seq: 900, tradeDate: '2026-09-28' });
    const merged = mergeStrategyEvents([buy12451, exposed], [buy12451, queued12451, yesterday], FIXTURE_TRADE_DATE);
    expect(merged.map((r) => r.seq)).toEqual([exposed.seq, buy12451.seq, queued12451.seq]);
  });

  it('복원 행은 거르지 않는다 — 서버가 이미 그날로 걸렀다', () => {
    const merged = mergeStrategyEvents([exposed], [], '2026-09-30');
    expect(merged).toEqual([exposed]);
  });
});

describe('inScope — 공용 패널 범위 (결정 1-A)', () => {
  it('다른 계좌의 주문 이벤트는 밖 · 시세 이벤트는 어느 계좌에도 안', () => {
    expect(inScope(buy12451, { accountNo: OTHER_ACCOUNT })).toBe(false);
    expect(inScope(buy12451, { accountNo: FIXTURE_ACCOUNT_NO })).toBe(true);
    expect(inScope(exposed, { accountNo: OTHER_ACCOUNT })).toBe(true);
  });

  it('종목 · 거래소 범위(카드 탭)는 시세 이벤트에도 걸린다', () => {
    expect(inScope(exposed, { accountNo: FIXTURE_ACCOUNT_NO, isin: OTHER_ISIN })).toBe(false);
    expect(inScope(exposed, { accountNo: FIXTURE_ACCOUNT_NO, exchange: 'NXT' })).toBe(false);
    expect(inScope(buy12451, { accountNo: FIXTURE_ACCOUNT_NO, isin: buy12451.isin, exchange: 'KRX' })).toBe(true);
  });

  it('계좌 없음(null)이면 주문 이벤트 0 · 시세 이벤트만', () => {
    expect(inScope(buy12451, { accountNo: null })).toBe(false);
    expect(inScope(exposed, { accountNo: null })).toBe(true);
  });
});

describe('matchesKind — 구분 필터 group 축 (D-08)', () => {
  const byGroup = (group: number) => row(buy12451, { group, seq: 500 + group });

  it('pre/add/post = group 1/2/3 주문 이벤트 · sell = group 4·5·6 · market = kind 1·2 · all = 전부', () => {
    expect(matchesKind(byGroup(1), 'pre')).toBe(true);
    expect(matchesKind(byGroup(2), 'pre')).toBe(false);
    expect(matchesKind(byGroup(2), 'add')).toBe(true);
    expect(matchesKind(byGroup(3), 'post')).toBe(true);
    for (const g of [4, 5, 6]) expect(matchesKind(byGroup(g), 'sell')).toBe(true);
    expect(matchesKind(byGroup(3), 'sell')).toBe(false);
    expect(matchesKind(exposed, 'market')).toBe(true);
    expect(matchesKind(STRATEGY_DAY_BY_NAME.entered1!, 'market')).toBe(true);
    expect(matchesKind(buy12451, 'market')).toBe(false);
    expect(matchesKind(exposed, 'pre')).toBe(false);
    for (const r of [exposed, buy12451, byGroup(5)]) expect(matchesKind(r, 'all')).toBe(true);
  });

  it('모르는 group(0) 주문 이벤트는 all 에만', () => {
    const unknown = byGroup(0);
    expect(matchesKind(unknown, 'all')).toBe(true);
    for (const k of ['pre', 'add', 'post', 'sell', 'manual', 'vi', 'market'] as const) expect(matchesKind(unknown, k)).toBe(false);
  });

  it('수동 7 = manual · VI 8 = vi — 다른 칩에는 없다', () => {
    expect(matchesKind(byGroup(7), 'manual')).toBe(true);
    expect(matchesKind(byGroup(8), 'vi')).toBe(true);
    expect(matchesKind(byGroup(7), 'vi')).toBe(false);
    expect(matchesKind(byGroup(8), 'manual')).toBe(false);
    for (const g of [7, 8]) {
      const r = byGroup(g);
      expect(matchesKind(r, 'all')).toBe(true);
      for (const k of ['pre', 'add', 'post', 'sell', 'market'] as const) expect(matchesKind(r, k)).toBe(false);
    }
    for (const g of [1, 3, 6]) for (const k of ['manual', 'vi'] as const) expect(matchesKind(byGroup(g), k)).toBe(false);
  });

  it('구분 옵션 라벨 = 전체 · 선매수 · 추가매수 · 후매수 · 매도 · 수동 · VI · 시세', () => {
    expect(ORDER_LOG_KIND_FILTERS.map((o) => o.label)).toEqual(['전체', '선매수', '추가매수', '후매수', '매도', '수동', 'VI', '시세']);
    expect(ORDER_LOG_KIND_FILTERS.map((o) => o.value)).toEqual(['all', 'pre', 'add', 'post', 'sell', 'manual', 'vi', 'market']);
  });
});

describe('applyOrderLogFilters · stockOptions', () => {
  it('기본 필터는 전부 통과 · 구분 시세 → 시세 줄만 · 거래소 NXT → 0', () => {
    expect(applyOrderLogFilters(STRATEGY_DAY_ROWS, DEFAULT_ORDER_LOG_FILTERS)).toHaveLength(STRATEGY_DAY_ROWS.length);
    const market = applyOrderLogFilters(STRATEGY_DAY_ROWS, { ...DEFAULT_ORDER_LOG_FILTERS, kind: 'market' });
    expect(market.length).toBeGreaterThan(0);
    expect(market.every((r) => r.kind === 1 || r.kind === 2)).toBe(true);
    expect(applyOrderLogFilters(STRATEGY_DAY_ROWS, { ...DEFAULT_ORDER_LOG_FILTERS, ex: 'NXT' })).toHaveLength(0);
    expect(applyOrderLogFilters(STRATEGY_DAY_ROWS, { ...DEFAULT_ORDER_LOG_FILTERS, stock: OTHER_ISIN })).toHaveLength(0);
  });

  it('stockOptions 는 ISIN 중복 제거 · 표시 이름 가나다순', () => {
    const rows = [
      buy12451,
      row(exposed, { isin: OTHER_ISIN, seq: 800 }),
      row(queued12451, { isin: 'KR7035720002', seq: 801 }),
      queued12451,
    ];
    const names: Record<string, string> = {
      [buy12451.isin]: '하나전자',
      [OTHER_ISIN]: '가나다',
      KR7035720002: '나라',
    };
    const opts = stockOptions(rows, (r) => names[r.isin] ?? r.isin);
    expect(opts).toEqual([
      { value: OTHER_ISIN, label: '가나다' },
      { value: 'KR7035720002', label: '나라' },
      { value: buy12451.isin, label: '하나전자' },
    ]);
  });

  it('갈래 픽스처(모르는 kind 포함)도 필터가 던지지 않는다', () => {
    const rows = Object.values(STRATEGY_BRANCH_ROWS);
    for (const opt of ORDER_LOG_KIND_FILTERS) {
      expect(() => applyOrderLogFilters(rows, { ...DEFAULT_ORDER_LOG_FILTERS, kind: opt.value })).not.toThrow();
    }
  });
});

describe('창 분리 쿼리 (R3 · T-25-29 화이트리스트)', () => {
  it('미래 날짜 · 모르는 값은 전체/오늘로 교정 · all 은 별칭', () => {
    const parsed = parseOrderLogQuery(
      new URLSearchParams('account=1234567801&date=2099-01-01&ex=XYZ&kind=all&stock=bad'),
      '2026-09-29',
    );
    expect(parsed).toEqual({
      account: '1234567801',
      date: '2026-09-29',
      filters: { stock: 'all', ex: 'all', kind: 'all' },
      corrected: true,
    });
  });

  it('정상 값은 그대로 · 과거일 유지 · 교정 없음', () => {
    const parsed = parseOrderLogQuery(
      new URLSearchParams(`account=1234567801&date=2026-09-26&stock=${buy12451.isin}&ex=NXT&kind=sell`),
      '2026-09-29',
    );
    expect(parsed).toEqual({
      account: '1234567801',
      date: '2026-09-26',
      filters: { stock: buy12451.isin, ex: 'NXT', kind: 'sell' },
      corrected: false,
    });
  });

  it('없는 달력 날짜 · 형식 오류 계좌 → 오늘 · null (교정)', () => {
    const parsed = parseOrderLogQuery(new URLSearchParams('account=12%3B34&date=2026-02-30'), '2026-09-29');
    expect(parsed.account).toBeNull();
    expect(parsed.date).toBe('2026-09-29');
    expect(parsed.corrected).toBe(true);
  });

  it('빈 쿼리 → 계좌 null · 오늘 · 전체 · 교정 없음', () => {
    expect(parseOrderLogQuery(new URLSearchParams(''), '2026-09-29')).toEqual({
      account: null,
      date: '2026-09-29',
      filters: DEFAULT_ORDER_LOG_FILTERS,
      corrected: false,
    });
  });

  it('orderLogQueryString — 「전체」 · 오늘은 생략', () => {
    expect(
      orderLogQueryString(
        { account: '1234567801', date: '2026-09-29', filters: { stock: 'all', ex: 'KRX', kind: 'market' } },
        '2026-09-29',
      ),
    ).toBe('account=1234567801&ex=KRX&kind=market');
    expect(
      orderLogQueryString(
        { account: null, date: '2026-09-26', filters: { stock: buy12451.isin, ex: 'all', kind: 'all' } },
        '2026-09-29',
      ),
    ).toBe(`date=2026-09-26&stock=${buy12451.isin}`);
  });

  it('왕복 — 문자열 → 파싱 → 문자열이 같다', () => {
    const q = `account=1234567801&date=2026-09-26&stock=${buy12451.isin}&ex=NXT&kind=pre`;
    const parsed = parseOrderLogQuery(new URLSearchParams(q), '2026-09-29');
    expect(orderLogQueryString(parsed, '2026-09-29')).toBe(q);
  });
});

/* ── Phase 25-10 — 창 분리 날짜 헬퍼 (결정 5 · 달력 하루씩) ─────────────────── */

describe('shiftKstDate · kstWeekdayShort (25-10)', () => {
  it('달력 하루씩 — 월 · 연 · 윤일 경계', () => {
    expect(shiftKstDate('2026-09-29', -1)).toBe('2026-09-28');
    expect(shiftKstDate('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftKstDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftKstDate('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftKstDate('2026-09-26', 1)).toBe('2026-09-27'); // 주말도 한 칸
  });

  it('요일 = Intl ko-KR short · Asia/Seoul', () => {
    expect(kstWeekdayShort('2026-09-29')).toBe('화');
    expect(kstWeekdayShort('2026-09-27')).toBe('일');
    expect(kstWeekdayShort('2026-10-03')).toBe('토');
  });
});
