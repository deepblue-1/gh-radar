import { describe, expect, it } from 'vitest';
import type { RelayLimitChaser } from '@gh-radar/shared';

/**
 * Phase 24 Plan 04 Task 2 — 상따 필드 스펙의 **표시 순수 함수** (D-03 · D-09 · D-10 · D-11 · R5 · CR-01).
 *
 * 잠그는 것:
 *   ① 매수 카드 4장 순서(스케치 009 D) · 모든 값 행 id 유일
 *   ② `lcValueTextOf` — 의미어 「무제한」「1주」「없음」 · 금액 0 「—」 · 후매수 「최대」 D-11 문구
 *   ③ `lcSummaryOf` — 요약 항목 · 순서 · 꺼진 kv(UI-SPEC §3 · R5)
 *   ④ `lcRowA11yNameOf` — 접근성 이름 접두(UI-SPEC 「접근성 이름 접두」 표 · D-09)
 *   ⑤ `lcRangeIssue` — 반등 0~100 + 「후매수 ON 이면 1~100」(relay zod `.superRefine` 동형 · T-24-17)
 *
 * 행 · 요약 · 시트 「지금 ○○」 · 접근성 이름이 **같은 함수**에서 받는다 — 판정 지점이 둘이면 행과 요약이
 * 다른 말을 한다(UI-SPEC §4).
 */

import { defaultLimitChaserForm, type LimitChaserFormValues } from '@/lib/limit-chaser';
import { LC_BUY3_ECHO_DEFAULTS } from '@/test-fixtures/limit-chaser';
import {
  LC_BUY_GROUPS,
  LC_SELL_GROUPS,
  LC_SWITCH_LABEL,
  lcNavigableRows,
  lcRangeIssue,
  lcRowA11yNameOf,
  lcRowById,
  lcRowDimOf,
  lcRowOfField,
  lcSummaryOf,
  lcValueTextOf,
  POST_BUY_UNLOCK_SR_TEXT,
  type LcGroupSpec,
  type LcRowSpec,
} from '../lc-fields';

const values = (over: Partial<LimitChaserFormValues> = {}): LimitChaserFormValues => ({
  ...defaultLimitChaserForm(),
  buyOrderPrice: 13_000,
  buyWatchPrice: 13_000,
  buyOrderAmount: 4000,
  buyWatchQty: 10_000,
  buyMinTradeQty: 30_000,
  sweepMinTickCount: 3,
  sweepWatchPrice: 12_990,
  extraBuyOrderAmount: 4000,
  extraBuyMinQty: 50_000,
  extraBuyMaxQty: 0,
  postBuyOrderAmount: 4000,
  postBuyReentry: 3,
  postBuyFloorQty: 100_000,
  postBuyReboundPct: 30,
  ...over,
});

/** 에코 — 테스트가 쓰는 런타임 필드만 의미가 있다. */
const srv = (over: Partial<RelayLimitChaser> = {}): RelayLimitChaser =>
  ({ ...LC_BUY3_ECHO_DEFAULTS, buyOrderAmount: 4000, ...over }) as RelayLimitChaser;

const valueRow = (id: string) => {
  const hit = lcRowById(id)!;
  return { group: hit.group, row: hit.row as Extract<LcRowSpec, { kind: 'value' | 'checkValue' }> };
};

describe('① 매수 카드 4장 스펙 (스케치 009 D · ROADMAP ⑤)', () => {
  it('LC_BUY_GROUPS slot 순서 = buy → pre-buy → extra-buy → post-buy · 매도 쪽 = sell → cancel (quick-261001-gjk 한 카드)', () => {
    expect(LC_BUY_GROUPS.map((g) => g.slot)).toEqual(['buy', 'pre-buy', 'extra-buy', 'post-buy']);
    expect(LC_SELL_GROUPS.map((g) => g.slot)).toEqual(['sell', 'cancel', 'auto-sell']);
  });

  it('세 그룹 카드 + 자동매도만 접힌다 — 공통 카드 · 매도주문 · 매수취소는 접기 없음 (Phase 27 D-01)', () => {
    const collapsible = [...LC_BUY_GROUPS, ...LC_SELL_GROUPS].filter((g) => g.collapsible).map((g) => g.slot);
    expect(collapsible).toEqual(['pre-buy', 'extra-buy', 'post-buy', 'auto-sell']);
  });

  it('모든 값 · 체크 id 가 유일하다', () => {
    const ids: string[] = [];
    for (const g of [...LC_BUY_GROUPS, ...LC_SELL_GROUPS] as LcGroupSpec[]) {
      for (const r of g.rows) {
        if (r.kind === 'value' || r.kind === 'checkValue' || r.kind === 'choice') ids.push(r.id);
        if (r.kind === 'checkValue' || r.kind === 'check') ids.push(r.checkId);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('② lcValueTextOf — 의미어 · 「—」 · 후매수 「최대」 (D-03 · D-10 · D-11)', () => {
  it('추가매수 최대 0 → 「무제한」 · 최소 0 → 「1주」 · 후매수 최소 잔량 0 → 「없음」', () => {
    expect(lcValueTextOf('extraBuyMaxQty', values({ extraBuyMaxQty: 0 }), null)).toBe('무제한');
    expect(lcValueTextOf('extraBuyMinQty', values({ extraBuyMinQty: 0 }), null)).toBe('1주');
    expect(lcValueTextOf('postBuyFloorQty', values({ postBuyFloorQty: 0 }), null)).toBe('없음');
  });

  it('값이 있으면 의미어를 쓰지 않는다(null = 기본 포맷)', () => {
    expect(lcValueTextOf('extraBuyMaxQty', values({ extraBuyMaxQty: 500_000 }), null)).toBeNull();
    expect(lcValueTextOf('extraBuyMinQty', values({ extraBuyMinQty: 50_000 }), null)).toBeNull();
    expect(lcValueTextOf('postBuyFloorQty', values({ postBuyFloorQty: 100_000 }), null)).toBeNull();
  });

  it('추가매수 · 후매수 금액 0 → 「—」(D-03)', () => {
    expect(lcValueTextOf('extraBuyOrderAmount', values({ extraBuyOrderAmount: 0 }), null)).toBe('—');
    expect(lcValueTextOf('postBuyOrderAmount', values({ postBuyOrderAmount: 0 }), null)).toBe('—');
    expect(lcValueTextOf('extraBuyOrderAmount', values(), null)).toBeNull();
  });

  it('후매수 최대 — 단계 0 「3회」 · 단계 1 「3회 · 남은 2회」 · 소진 「3회 · 남은 0회」 · 에코 없음 = 설정값', () => {
    expect(lcValueTextOf('postBuyReentry', values(), srv({ postBuyPhase: 0, postBuyReentryLeft: 0 }))).toBe('3회');
    expect(lcValueTextOf('postBuyReentry', values(), srv({ postBuyPhase: 1, postBuyReentryLeft: 2 }))).toBe(
      '3회 · 남은 2회',
    );
    expect(lcValueTextOf('postBuyReentry', values(), srv({ postBuyPhase: 3, postBuyReentryLeft: 0 }))).toBe(
      '3회 · 남은 0회',
    );
    expect(lcValueTextOf('postBuyReentry', values(), null)).toBe('3회');
  });

  it('그 밖 값 필드 → null', () => {
    expect(lcValueTextOf('buyOrderPrice', values(), null)).toBeNull();
    expect(lcValueTextOf('sweepMinTickCount', values(), null)).toBeNull();
    expect(lcValueTextOf('postBuyReboundPct', values(), null)).toBeNull();
  });
});

describe('③ lcSummaryOf — 요약 항목 · 순서 · 꺼진 kv (UI-SPEC §3 · R5)', () => {
  it('선매수 = 금액 → 매도잔량 → 체결량(OFF 「꺼짐」) → 한방(OFF 「꺼짐」)', () => {
    expect(lcSummaryOf('pre-buy', values(), srv())).toEqual([
      { key: '금액', value: '4,000만원', off: false },
      { key: '매도잔량', value: '10,000주', off: false },
      { key: '체결량', value: '꺼짐', off: true },
      { key: '한방', value: '꺼짐', off: true },
    ]);
  });

  it('선매수 체크 ON — 체결량 「30,000주」 · 한방 「3건 @12,990원」', () => {
    const items = lcSummaryOf('pre-buy', values({ buyTradeQtyEnabled: true, sweepEnabled: true }), srv());
    expect(items[2]).toEqual({ key: '체결량', value: '30,000주', off: false });
    expect(items[3]).toEqual({ key: '한방', value: '3건 @12,990원', off: false });
  });

  it('선매수 금액을 서버가 모르면(D-04a) 「—」 꺼진 kv', () => {
    expect(lcSummaryOf('pre-buy', values(), srv(), true)[0]).toEqual({ key: '금액', value: '—', off: true });
  });

  it('추가매수 = 금액 → 최소 → 최대 — 의미어는 꺼진 kv 가 아니다', () => {
    expect(lcSummaryOf('extra-buy', values({ extraBuyMinQty: 0 }), srv())).toEqual([
      { key: '금액', value: '4,000만원', off: false },
      { key: '최소', value: '1주', off: false },
      { key: '최대', value: '무제한', off: false },
    ]);
    expect(lcSummaryOf('extra-buy', values({ extraBuyOrderAmount: 0 }), srv())[0]).toEqual({
      key: '금액',
      value: '—',
      off: true,
    });
  });

  it('추가매수 버스트 해제(quick-261003-rc4 P-3) — OFF 면 종전 3항목 그대로 · ON 이면 4번째 kv 「버스트 해제 · 켬」', () => {
    expect(lcSummaryOf('extra-buy', values({ extraBuyBurstRelease: false }), srv())).toHaveLength(3);
    const on = lcSummaryOf('extra-buy', values({ extraBuyBurstRelease: true }), srv());
    expect(on).toHaveLength(4);
    expect(on.slice(0, 3)).toEqual(lcSummaryOf('extra-buy', values(), srv()));
    expect(on[3]).toEqual({ key: '버스트 해제', value: '켬', off: false });
  });

  it('추가매수 카드 마지막 행 = 체크 「버스트 해제」 · id lc-extra-buy-burst-release · 독립 축 아님(P-2)', () => {
    const g = LC_BUY_GROUPS.find((x) => x.slot === 'extra-buy')!;
    expect(g.rows.at(-1)).toEqual({
      kind: 'check',
      check: 'extraBuyBurstRelease',
      checkId: 'lc-extra-buy-burst-release',
      label: '버스트 해제',
    });
  });

  it('후매수 = 금액 → 최대 → 최소 → 반등 → 발동잔량(0 「—」 꺼짐 · 값 있으면 정상)', () => {
    expect(lcSummaryOf('post-buy', values(), srv({ postBuyPhase: 1, postBuyReentryLeft: 2 }))).toEqual([
      { key: '금액', value: '4,000만원', off: false },
      { key: '최대', value: '3회 · 남은 2회', off: false },
      { key: '최소', value: '100,000주', off: false },
      { key: '반등', value: '30%', off: false },
      { key: '발동잔량', value: '—', off: true },
    ]);
    const hot = lcSummaryOf('post-buy', values({ postBuyFloorQty: 0 }), srv({ postBuyPhase: 2, postBuyTriggerQty: 330_000 }));
    expect(hot[2]).toEqual({ key: '최소', value: '없음', off: false });
    expect(hot[4]).toEqual({ key: '발동잔량', value: '330,000주', off: false });
  });

  it('후매수 발동잔량 0 · 해제선 > 0 → 해제선을 꺼진 kv 색 + sr 「잠금 해제선」 (quick-261002-fim)', () => {
    expect(lcSummaryOf('post-buy', values(), srv({ postBuyPhase: 1, postBuyUnlockQty: 264_000 }))[4]).toEqual({
      key: '발동잔량',
      value: '264,000주',
      off: true,
      sr: POST_BUY_UNLOCK_SR_TEXT,
    });
    expect(POST_BUY_UNLOCK_SR_TEXT).toBe('잠금 해제선');
  });

  it('후매수 발동잔량 · 해제선이 둘 다 오면 발동잔량이 우선 — sr 키 없음 (quick-261002-fim)', () => {
    expect(
      lcSummaryOf('post-buy', values(), srv({ postBuyPhase: 1, postBuyTriggerQty: 330_000, postBuyUnlockQty: 264_000 }))[4],
    ).toEqual({ key: '발동잔량', value: '330,000주', off: false });
  });

  it('접기 없는 카드는 요약이 없다', () => {
    expect(lcSummaryOf('buy', values(), srv())).toEqual([]);
    expect(lcSummaryOf('sell', values(), srv())).toEqual([]);
  });
});

describe('④ lcRowA11yNameOf — 접근성 이름 접두 (D-09 · UI-SPEC 접근성 이름 접두 표)', () => {
  it.each([
    ['lc-buy-order-price', '13,000원', '매수 주문가격 13,000원'],
    ['lc-buy-watch-price', '13,000원', '매수 비교가격 13,000원'],
    ['lc-sell-order-price', '13,000원', '매도 주문가격 13,000원'],
    ['lc-sell-watch-price', '13,000원', '매도 비교가격 13,000원'],
    ['lc-sell-watch-qty', '10주', '매도 매수잔량 10주'],
    ['lc-cancel-watch-qty', '10주', '취소 매수잔량 10주'],
    ['lc-buy-order-amount', '4,000만원', '선매수 금액 4,000만원'],
    ['lc-extra-buy-max-qty', '무제한', '추가매수 최대 잔량 무제한'],
    ['lc-post-buy-reentry', '3회 · 남은 2회', '후매수 최대 3회 · 남은 2회'],
    ['lc-sweep-tick', '3건', '선매수 한방 3건'],
  ])('%s + 「%s」 → 「%s」', (id, text, name) => {
    const { group, row } = valueRow(id);
    expect(lcRowA11yNameOf(group, row, text)).toBe(name);
  });

  it('금액 「—」 → 「{그룹} 금액 미입력」', () => {
    const { group, row } = valueRow('lc-extra-buy-amount');
    expect(lcRowA11yNameOf(group, row, '—')).toBe('추가매수 금액 미입력');
  });
});

describe('⑤ 라벨 개명 · 시트 제목 (D-09 · R14 · UI-SPEC 시트 제목 표)', () => {
  it.each([
    ['lc-buy-order-price', '주문가격', '주문가격'],
    ['lc-buy-watch-price', '비교가격', '비교가격'],
    ['lc-buy-order-amount', '금액', '선매수 금액'],
    ['lc-buy-watch-qty', '매도잔량', '선매수 매도잔량'],
    ['lc-buy-min-trade-qty', '체결량', '선매수 체결량'],
    ['lc-sweep-tick', '한방', '한방 건수'],
    ['lc-sweep-watch-price', '한방가격', '한방가격'],
    ['lc-extra-buy-min-qty', '최소 잔량', '추가매수 최소 잔량'],
    ['lc-post-buy-reentry', '최대', '후매수 최대 횟수'],
    ['lc-post-buy-rebound', '반등', '후매수 반등'],
    ['lc-sell-order-price', '주문가격', '주문가격'],
    ['lc-sell-watch-qty', '매수잔량', '매수잔량'],
    ['lc-cancel-watch-qty', '매수잔량', '매수잔량'],
  ])('%s — 라벨 「%s」 · 시트 제목 「%s」', (id, label, title) => {
    const { row } = valueRow(id);
    expect(row.label).toBe(label);
    expect(row.sheetTitle ?? row.label).toBe(title);
  });
});

describe('⑥ lcRangeIssue — 반등 0~100 + 「후매수 ON 이면 1~100」 (T-24-17 · relay zod 동형)', () => {
  it('반등 0 ∧ 후매수 OFF → null — 레거시 에코 반등 0 이 다른 확정을 막지 않는다', () => {
    expect(lcRangeIssue(values({ postBuyReboundPct: 0, postBuyEnabled: false }))).toBeNull();
  });

  it('반등 0 ∧ 후매수 ON → 「반등 · …」', () => {
    expect(lcRangeIssue(values({ postBuyReboundPct: 0, postBuyEnabled: true }))).toMatch(/^반등 · /);
  });

  it('반등 101 → 「반등 · …」 · 최대 256 → 「최대 · …」 · 한방 256 → 「한방 · …」', () => {
    expect(lcRangeIssue(values({ postBuyReboundPct: 101 }))).toMatch(/^반등 · /);
    expect(lcRangeIssue(values({ postBuyReentry: 256 }))).toMatch(/^최대 · /);
    expect(lcRangeIssue(values({ sweepMinTickCount: 256 }))).toBe('한방 · 최대 255건까지 입력할 수 있어요');
  });

  it('최대 0 은 유효하다(0 = 사지 않음, D-30)', () => {
    expect(lcRangeIssue(values({ postBuyReentry: 0 }))).toBeNull();
  });
});

describe('Phase 27 자동매도 그룹 — 스펙 · 의미어 · 요약 · 조건 범위 (D-01 · D-02 · Pitfall 5)', () => {
  const autoSell = () => LC_SELL_GROUPS.find((g) => g.slot === 'auto-sell')!;

  it('매도 pane 세 번째 카드 「자동매도」 — 접기 · 자기 게이트 · 자기 흐림 게이트(매도주문과 독립)', () => {
    expect(LC_SELL_GROUPS.map((g) => g.slot)).toEqual(['sell', 'cancel', 'auto-sell']);
    const g = autoSell();
    expect(g.title).toBe('자동매도');
    expect(g.gate).toBe('autoSellEnabled');
    expect(g.dimGate).toBe('autoSellEnabled');
    expect(g.statusKey).toBe('autoSell');
    expect(g.collapsible).toBe(true);
    expect(LC_SWITCH_LABEL.autoSellEnabled).toBe('자동매도 켜기');
  });

  it('행 순서 = 시작조건 · 비율 · 방법(choice) · 누적 매도 · 기준 — choice 옵션은 와이어 3 · 1 · 2', () => {
    const rows = autoSell().rows;
    expect(rows.map((r) => r.kind)).toEqual(['value', 'value', 'choice', 'derived', 'derived']);
    expect(rows.map((r) => ('label' in r ? r.label : ''))).toEqual(['시작조건', '비율', '방법', '누적 매도', '기준']);
    const choice = rows[2] as Extract<LcRowSpec, { kind: 'choice' }>;
    expect(choice.field).toBe('autoSellMethod');
    expect(choice.options).toEqual([
      { value: 3, label: '양쪽' },
      { value: 1, label: '매도1호가' },
      { value: 2, label: '매수1호가' },
    ]);
  });

  it('choice 행은 Tab 연속 편집 대상이 아니다 — 값 행 두 개만', () => {
    expect(lcNavigableRows('auto-sell').map((r) => r.field)).toEqual(['autoSellStartCond', 'autoSellRatioPct']);
  });

  it('시작조건 0 = 「이탈 후 다음 체결」 · 그 밖은 의미어 없음(기본 「N%」)', () => {
    expect(lcValueTextOf('autoSellStartCond', values({ autoSellStartCond: 0 }), null)).toBe('이탈 후 다음 체결');
    expect(lcValueTextOf('autoSellStartCond', values({ autoSellStartCond: 2 }), null)).toBeNull();
  });

  it('요약 — 시작조건 · 비율 · 방법 · 누적(hot) · 기준', () => {
    const items = lcSummaryOf(
      'auto-sell',
      values({ autoSellStartCond: 2, autoSellRatioPct: 10, autoSellMethod: 3 }),
      srv({ autoSellSoldQty: 6000, autoSellState: 3, autoSellBasis: 1, autoSellBasisPrice: 13_000 }),
    );
    expect(items).toEqual([
      { key: '시작조건', value: '2%', off: false },
      { key: '비율', value: '10%', off: false },
      { key: '방법', value: '양쪽', off: false },
      { key: '누적', value: '6,000주', off: false, hot: true },
      { key: '기준', value: '상한가 13,000원', off: false },
    ]);
  });

  it('요약 — 누적 0 「—」(off) · 상태 0 또는 기준 0 → 기준 「—」 · 방법 0 → 「—」 · 시작조건 0 의미어', () => {
    const v = values({ autoSellStartCond: 0, autoSellRatioPct: 10, autoSellMethod: 0 });
    const off = lcSummaryOf('auto-sell', v, srv({ autoSellState: 0, autoSellBasis: 1, autoSellBasisPrice: 13_000 }));
    expect(off).toEqual([
      { key: '시작조건', value: '이탈 후 다음 체결', off: false },
      { key: '비율', value: '10%', off: false },
      { key: '방법', value: '—', off: true },
      { key: '누적', value: '—', off: true },
      { key: '기준', value: '—', off: true },
    ]);
    const noBasis = lcSummaryOf('auto-sell', v, srv({ autoSellState: 2, autoSellBasis: 0, autoSellBasisPrice: 13_000 }));
    expect(noBasis[4]).toEqual({ key: '기준', value: '—', off: true });
    const buyBasis = lcSummaryOf('auto-sell', v, srv({ autoSellState: 2, autoSellBasis: 2, autoSellBasisPrice: 12_500 }));
    expect(buyBasis[4]).toEqual({ key: '기준', value: '매수가 12,500원', off: false });
    // 에코 없음(미등록)
    expect(lcSummaryOf('auto-sell', v, null).slice(3)).toEqual([
      { key: '누적', value: '—', off: true },
      { key: '기준', value: '—', off: true },
    ]);
  });

  it('lcRangeIssue — 자동매도 켠 cfg 만 비율 1~50 · 방법 1~3 · 시작조건은 늘 0~9 (Pitfall 5 · 9-2)', () => {
    expect(lcRangeIssue(values({ autoSellEnabled: true, autoSellRatioPct: 0 }))).toMatch(/^비율 · /);
    expect(lcRangeIssue(values({ autoSellEnabled: true, autoSellRatioPct: 51 }))).toMatch(/^비율 · /);
    expect(lcRangeIssue(values({ autoSellEnabled: true, autoSellRatioPct: 10, autoSellMethod: 0 }))).toMatch(/^방법 · /);
    expect(lcRangeIssue(values({ autoSellEnabled: true, autoSellRatioPct: 10, autoSellMethod: 4 }))).toMatch(/^방법 · /);
    expect(lcRangeIssue(values({ autoSellEnabled: true, autoSellRatioPct: 50, autoSellMethod: 2 }))).toBeNull();
    // 꺼진 옛 에코의 0 · 0 은 다른 카드 확정을 막지 않는다
    expect(lcRangeIssue(values({ autoSellEnabled: false, autoSellRatioPct: 0, autoSellMethod: 0 }))).toBeNull();
    // 시작조건은 게이트와 무관
    expect(lcRangeIssue(values({ autoSellEnabled: false, autoSellStartCond: 10 }))).toMatch(/^시작조건 · /);
    expect(lcRangeIssue(values({ autoSellEnabled: false, autoSellStartCond: 9 }))).toBeNull();
  });

  it('행 흐림 — 입력 행 3개는 자동매도 게이트만 · 매도주문 OFF 와 무관 · 읽기 전용 2행은 흐리지 않는다', () => {
    const g = autoSell();
    const [start, ratio, method, sold, basis] = g.rows;
    const off = values({ autoSellEnabled: false, sellEnabled: true });
    expect([start, ratio, method].map((r) => lcRowDimOf(g, r!, off))).toEqual([true, true, true]);
    expect([sold, basis].map((r) => lcRowDimOf(g, r!, off))).toEqual([false, false]);
    const on = values({ autoSellEnabled: true, sellEnabled: false });
    expect(g.rows.map((r) => lcRowDimOf(g, r, on))).toEqual([false, false, false, false, false]);
  });

  it('choice 행도 id · 필드로 찾는다 — 접힌 카드 자동 펼침(행 실패)이 쓴다', () => {
    expect(lcRowById('lc-auto-sell-method')?.group.slot).toBe('auto-sell');
    expect(lcRowOfField('autoSellMethod')).toMatchObject({ isCheck: false, group: { slot: 'auto-sell' } });
  });
});
