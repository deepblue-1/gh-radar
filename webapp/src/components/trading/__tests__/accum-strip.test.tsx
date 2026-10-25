import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { AccumSignal, RelayQuote } from '@gh-radar/shared';

/**
 * quick-261018-rfy D-01 — 작업대 「매집」 패널(돌파 패널 동형 · 목업 mockup-workbench.html 안 A).
 *
 * 잠그는 것:
 *   ① 칩 = 이름 · 「당일」 · 당일 순매수(억 · 부호 색 — quick-261026-01h) · 상태 배지(매집중 --team · 매도중 --accum-sell) · 이월 D+n(carryDays > 0 만)
 *   ② 청산(state 3)은 칩에 없고 펼친 표에만 회색 · 행 title = 종료 사유 문구 · 패널은 받은 행을 거르지 않는다(목록 규칙은 훅 — accum-list ②')
 *   ③ 표 순서 = sortAccum · 열 접기(NXT 순매수 · 평단 · 구간 · 순수량 · 갱신 = colNarrow) · 보조 줄 · 코드 <700 숨김
 *   ④ 더보기 → 표 · panels pref accum 기억(다시 마운트해도 열림)
 *   ⑤ ✕ → 그 사이클 숨김(gh-radar:accum-dismissed 에 isin|cycle) · 같은 isin 새 사이클이면 다시 보임
 *   ⑥ 클릭 — 카드 없음 onAddCard(isin, 이름, 코드, 'KRX') · 카드 있음 점선 「거래중」 + onFocusCard · 이름 없음 ISIN 고정폭 · 이름 undefined
 *   ⑦ 첫 채움 무강조 · 그 뒤 새 isin → data-new + 「신규」 · 30초 뒤 해제
 *   ⑧ 활성 칩 0 → 빈 문구
 *   ⑨ 매도경보(quick-261019-j1w D-01) — 매집중 + sellWarn 일 때만 칩 · 표 상태 셀에 주황 채움 「매도경보」(「매집중」 뒤 · 이월 앞 ·
 *      accum-blink 깜빡임 · title 「이 사이클 경보 n회」) · 칩 title 끝 「 · 매도경보 n회」. 매도중 · 청산 · 경보 꺼짐은 없음
 *   ⑪ NXT 순매수(quick-261022-ozx) — 팀 순매수 다음 열 · nxtBuyKrw − nxtSellKrw · 같은 억 포맷 · 부호 색 · 0 「0.0억」 ·
 *      청산 무색 · <700 접힘 + 보조 줄 끝 · 머리 title 「KRX+NXT 합산」 · 칩 title 「팀 순매수(KRX+NXT) … · NXT 순매수 …」 ·
 *      칩 글자 무변경
 *   ⑫ 당일 축(quick-261026-01h · 스케치 018 B) — 4열 「당일 순매수」(첫 줄 dayNetKrw · null 「—」 --faint) + 둘째 줄 「누적 ±x.x억」 ·
 *      이월 행 + 전날 값(prevNet · 0 아님)이면 ≥700 둘째 줄 끝 「 · 전날 ±x.x억」 · <700 보조 줄 「전날 ±x.x억」 ·
 *      평단 · 수익률 · 구간 · 순수량 = 당일(dayAvgPx 0 · null 이면 「—」 · 누적 폴백 없음) · 칩 「당일」 + dayNetKrw · 정렬 dayNetKrw 큰 순
 *
 * 기존 ① · ③ · ⑪ 의 금액 · 평단 · 구간 단언은 당일 값(`daySig` — 누적과 같은 수를 당일 9필드에 얹은 새 서버 행)으로 같은 사실을 잠근다.
 */

vi.mock('@/lib/stock-names', () => ({
  useStockNames: () => new Map<string, string>(),
}));

// ① 시세 구독 — relay 컨텍스트의 quotes · subscribe 만 흉내 낸다(돌파 스트립 테스트와 같은 문법).
const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();
let quotesMap: Map<string, RelayQuote> = new Map();
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({
      ...actual.EMPTY_RELAY_VALUE,
      quotes: quotesMap,
      subscribe: subscribeMock,
      unsubscribe: unsubscribeMock,
    }),
  };
});

import { HIGHLIGHT_MS } from '@/lib/breakout-list';
import { ACCUM_DISMISSED_KEY } from '@/lib/accum-list';
import { readPanelsPref } from '@/lib/trading-layout';
import type { IsinLabel } from '@/lib/isin-labels';
import { ACCUM_EMPTY_TEXT, AccumStrip, liveRateOf, teamProfitOf } from '../workbench/accum-strip';
import { relayQuoteKey } from '@/lib/use-relay-socket';

const T = (hms: string) => Date.parse(`2026-10-18T${hms}+09:00`);

function sig(over: Partial<AccumSignal> = {}): AccumSignal {
  return {
    isin: 'KR7000020008',
    exchange: 'KRX',
    stockCode: '000020',
    tradeDate: '2026-10-18',
    gateway: 'KB120',
    gwTimeMs: T('10:16:05'),
    state: 1,
    endReason: 0,
    cycle: 1,
    carryDays: 0,
    buyQty: 150_000,
    buyKrw: 1_500_000_000,
    sellQty: 30_000,
    sellKrw: 270_000_000,
    netQty: 120_000,
    netKrw: 1_230_000_000,
    nxtBuyKrw: 0,
    nxtSellKrw: 0,
    avgPx: 10_120,
    loPx: 9_900,
    hiPx: 10_300,
    regPx: 9_980,
    peakNetKrw: 1_600_000_000,
    sellPhases: 0,
    maxSame: 45,
    mcapKrw: 321_000_000_000,
    ourExcludedQty: 0,
    lastPx: 10_450,
    rateBp: 512,
    row: 1,
    sellWarn: false,
    sellWarns: 0,
    sinceDate: '2026-10-16',
    regTime: '10:15:23',
    thNetKrw: 100_000_000,
    thMinSame: 30,
    thMaxMcapKrw: 500_000_000_000,
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

/** 새 서버 행 — 당일 축 9필드를 누적과 같은 수로 얹는다(기존 단언의 금액 · 평단 · 구간이 그대로 당일 값이 된다). */
function daySig(over: Partial<AccumSignal> = {}): AccumSignal {
  return sig({
    dayBuyKrw: 1_500_000_000,
    daySellKrw: 270_000_000,
    dayNetKrw: 1_230_000_000,
    dayAvgPx: 10_120,
    dayNetQty: 120_000,
    dayLoPx: 9_900,
    dayHiPx: 10_300,
    thRecentPieces: 30,
    thRecentSec: 60,
    ...over,
  });
}

const LABELS: ReadonlyMap<string, IsinLabel> = new Map([
  ['KR7000020008', { name: '천일고속', code: '000650' }],
  ['KR7000040006', { name: '서산', code: '079650' }],
  ['KR7000060004', { name: '금호전기', code: '001210' }],
  ['KR7000080002', { name: '대양금속', code: '009190' }],
]);

type Props = Parameters<typeof AccumStrip>[0];

function setup(over: Partial<Props> = {}) {
  const onAddCard = vi.fn();
  const onFocusCard = vi.fn();
  const props: Props = {
    signals: [],
    filled: true,
    cards: new Set<string>(),
    cardFeeds: new Set<string>(),
    gateway: 'KB120',
    labels: LABELS,
    onAddCard,
    onFocusCard,
    ...over,
  };
  const utils = render(<AccumStrip {...props} />);
  const rerender = (next: Partial<Props>) => utils.rerender(<AccumStrip {...props} {...next} />);
  return { ...utils, rerender, onAddCard, onFocusCard, props };
}

const chips = () => document.querySelectorAll('[data-slot="accum-chip"]');
const rows = () => document.querySelectorAll('[data-slot="accum-row"]');
const openTable = () => fireEvent.click(screen.getByRole('button', { name: '더보기' }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-18T10:20:00+09:00'));
  window.localStorage.clear();
  quotesMap = new Map();
  subscribeMock.mockClear();
  unsubscribeMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AccumStrip — 칩 (안 A)', () => {
  it('① 이름 · 「당일」 · +12.3억(up) · 매집중(--team) · 이월 0 이면 이월 배지 없음', () => {
    setup({ signals: [daySig()] });
    expect(screen.getByText('매집')).toBeInTheDocument();
    expect(chips()).toHaveLength(1);
    const chip = chips()[0] as HTMLElement;
    expect(within(chip).getByText('천일고속')).toBeInTheDocument();
    expect(chip.querySelector('[data-slot="accum-chip-day"]')?.textContent).toBe('당일');
    const net = within(chip).getByText('+12.3억');
    expect(net.className).toContain('text-[var(--up)]');
    const badge = within(chip).getByText('매집중');
    expect(badge.className).toContain('--team');
    expect(within(chip).queryByText(/이월/)).toBeNull();
  });

  it('① 이월 D+2 배지(--accum-carry) · 매도중 배지(--accum-sell) · 음수 순매수는 down 색', () => {
    setup({
      signals: [
        daySig({ carryDays: 2 }),
        daySig({ isin: 'KR7000040006', state: 2, dayNetKrw: -250_000_000, cycle: 1 }),
      ],
    });
    const [a, b] = Array.from(chips()) as HTMLElement[];
    const carry = within(a!).getByText('이월 D+2');
    expect(carry.className).toContain('--accum-carry');
    const sell = within(b!).getByText('매도중');
    expect(sell.className).toContain('--accum-sell');
    expect(within(b!).getByText('−2.5억').className).toContain('text-[var(--down)]');
  });

  it('② 청산 · 매집 종료 행은 칩에 없고 펼친 표에만 회색 · 배지 「청산」 · title = 종료 사유 문구 · 받은 행을 거르지 않는다', () => {
    setup({
      signals: [
        sig(),
        sig({ isin: 'KR7000060004', state: 3, endReason: 1, netKrw: -20_000_000 }),
        sig({ isin: 'KR7000040006', state: 3, endReason: 4 }),
      ],
    });
    expect(chips()).toHaveLength(1);
    expect(within(chips()[0] as HTMLElement).queryByText('금호전기')).toBeNull();
    expect(within(chips()[0] as HTMLElement).queryByText('서산')).toBeNull();
    openTable();
    expect(rows()).toHaveLength(3);
    const ended = Array.from(rows()).find((r) => r.textContent?.includes('금호전기')) as HTMLElement;
    const stopped = Array.from(rows()).find((r) => r.textContent?.includes('서산')) as HTMLElement;
    for (const r of [ended, stopped]) {
      expect(r.className).toContain('text-[var(--muted-fg)]');
      expect(within(r).getByText('청산')).toBeInTheDocument();
    }
    expect(ended.getAttribute('title')).toBe('청산 — 순매수 1억 미만(다시 1억 이상이면 같은 사이클로 재등장)');
    expect(stopped.getAttribute('title')).toBe('매집 종료 — 청산 뒤 순매수가 사이클 최고의 −30% 이하(최고 10억 → −3억)');
  });

  it('⑧ 활성 칩 0 이면 빈 문구 — 청산 행만 있어도', () => {
    setup({ signals: [sig({ state: 3, endReason: 1 })] });
    expect(screen.getByText(ACCUM_EMPTY_TEXT)).toBeInTheDocument();
    expect(ACCUM_EMPTY_TEXT).toBe('아직 팀 매집으로 등록된 종목이 없어요');
    expect(chips()).toHaveLength(0);
  });
});

describe('AccumStrip — 표', () => {
  it('③ 수익률(당일) = 현재가 ÷ 당일 평단 − 1 · 부호 색 · 모든 밴드 · 당일 평단이 없으면 「—」 · 청산 행은 회색', () => {
    setup({
      signals: [
        daySig(),
        daySig({ isin: 'KR7000040006', state: 2, dayAvgPx: 0, dayNetKrw: 1 }),
        daySig({ isin: 'KR7000060004', state: 3, endReason: 1, lastPx: 9_614, dayAvgPx: 10_120 }),
      ],
    });
    openTable();
    expect(screen.getByRole('columnheader', { name: '수익률(당일)' })).toBeInTheDocument();
    const [live, noAvg, ended] = Array.from(rows()).map((r) => r.querySelector('[data-col="profit"]') as HTMLElement);
    expect(live!.textContent).toBe('+3.26%'); // 10,450 ÷ 10,120 − 1
    expect(live!.className).toContain('text-[var(--up)]');
    expect(live!.className).not.toContain('hidden');
    expect(noAvg!.textContent).toBe('—');
    expect(noAvg!.className).toContain('text-[var(--faint)]');
    expect(ended!.textContent).toBe('-5.00%');
    expect(ended!.className).not.toContain('text-[var(--down)]');
    expect(teamProfitOf(0, 10_120)).toBeNull();
  });

  it('③ 순서 = 매집중 · 매도중 netKrw 큰 순, 청산은 뒤 · 청산끼리는 먼저 청산한 순', () => {
    setup({
      signals: [
        sig({ isin: 'KR7000060004', state: 3, endReason: 1, netKrw: 9e9, gwTimeMs: T('10:20:00') }),
        sig({ isin: 'KR7000020008', netKrw: 1e8 }),
        sig({ isin: 'KR7000080002', state: 3, endReason: 1, netKrw: 1, gwTimeMs: T('09:05:00') }),
        sig({ isin: 'KR7000040006', state: 2, netKrw: 5e8 }),
      ],
    });
    openTable();
    const names = Array.from(rows()).map((r) => r.querySelector('[data-slot="accum-row-name"]')?.textContent);
    expect(names).toEqual(['서산', '천일고속', '대양금속', '금호전기']);
    const chipNames = Array.from(chips()).map((c) => c.querySelector('[data-slot="accum-chip-name"]')?.textContent);
    expect(chipNames).toEqual(['서산', '천일고속']);
  });

  it('③ NXT 순매수 · 평단 · 구간 · 순수량 · 갱신 열은 <700 숨김 · 보조 줄 「HH:MM:SS · 평단 N · lo~hi · NXT ±x.x억」 · 코드 <700 숨김', () => {
    setup({ signals: [daySig()] });
    openTable();
    const row = rows()[0] as HTMLElement;
    for (const col of ['nxt', 'avg', 'band', 'qty', 'at']) {
      const cell = row.querySelector(`[data-col="${col}"]`) as HTMLElement;
      expect(cell, col).not.toBeNull();
      expect(cell.className).toContain('hidden');
      expect(cell.className).toContain('@min-[700px]/wb:table-cell');
    }
    expect(row.querySelector('[data-col="avg"]')?.textContent).toBe('10,120');
    expect(row.querySelector('[data-col="band"]')?.textContent).toBe('9,900~10,300');
    expect(row.querySelector('[data-col="qty"]')?.textContent).toBe('120,000');
    expect(row.querySelector('[data-col="at"]')?.textContent).toBe('10:16:05');
    const sub = row.querySelector('[data-slot="accum-row-subline"]') as HTMLElement;
    expect(sub.textContent).toBe('10:16:05 · 평단 10,120 · 9,900~10,300 · NXT 0.0억');
    expect(sub.className).toContain('@min-[700px]/wb:hidden');
    const code = row.querySelector('[data-slot="accum-row-code"]') as HTMLElement;
    expect(code.textContent).toBe('000020');
    expect(code.className).toContain('hidden');
    expect(code.className).toContain('@min-[700px]/wb:inline');
    // 현재가 · 등락률은 행 자체 값(시세 구독 없음).
    expect(within(row).getByText('10,450')).toBeInTheDocument();
    expect(within(row).getByText('+5.12%')).toBeInTheDocument();
    expect(within(row).getAllByText('+12.3억').length).toBeGreaterThan(0);
  });

  it('④ 더보기 → 표 열림 · panels pref accum true · 다시 마운트해도 열림 · 접기 → false', () => {
    const first = setup({ signals: [sig()] });
    expect(document.querySelector('[data-slot="accum-table"]')).toBeNull();
    openTable();
    expect(document.querySelector('[data-slot="accum-table"]')).not.toBeNull();
    expect(readPanelsPref().accum).toBe(true);
    first.unmount();
    setup({ signals: [sig()] });
    expect(document.querySelector('[data-slot="accum-table"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '접기' }));
    expect(readPanelsPref().accum).toBe(false);
  });

  it('행 0개면 펼쳐도 표가 없고 aria-controls 가 없다', () => {
    setup({ signals: [] });
    openTable();
    expect(document.querySelector('[data-slot="accum-table"]')).toBeNull();
    expect(screen.getByRole('button', { name: '접기' }).getAttribute('aria-controls')).toBeNull();
  });
});

describe('AccumStrip — ✕ · 클릭', () => {
  it('⑤ ✕ → 칩 · 행 사라짐 · isin|cycle 기록 · 같은 isin 새 사이클이면 다시 보임', () => {
    const { rerender } = setup({ signals: [sig({ cycle: 2 })] });
    openTable();
    fireEvent.click(screen.getByRole('button', { name: '천일고속 숨기기' }));
    expect(chips()).toHaveLength(0);
    expect(rows()).toHaveLength(0);
    expect(window.localStorage.getItem(ACCUM_DISMISSED_KEY)).toContain('KR7000020008|2');
    rerender({ signals: [sig({ cycle: 2, netKrw: 2e9 })] });
    expect(chips()).toHaveLength(0);
    rerender({ signals: [sig({ cycle: 3 })] });
    expect(chips()).toHaveLength(1);
  });

  it('⑤ 청산 행 ✕ → isin|cycle|end 기록 · 같은 사이클로 재등장하면 다시 보임', () => {
    const { rerender } = setup({ signals: [sig({ cycle: 2, state: 3, endReason: 1 })] });
    openTable();
    expect(rows()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '천일고속 숨기기' }));
    expect(rows()).toHaveLength(0);
    expect(window.localStorage.getItem(ACCUM_DISMISSED_KEY)).toContain('KR7000020008|2|end');
    rerender({ signals: [sig({ cycle: 2 })] });
    expect(chips()).toHaveLength(1);
  });

  it('⑥ 카드 없는 칩 클릭 → onAddCard(isin, 이름, 코드, KRX) · 행 「추가」 도 같다', () => {
    const { onAddCard } = setup({ signals: [sig()] });
    fireEvent.click(chips()[0] as HTMLElement);
    expect(onAddCard).toHaveBeenCalledWith('KR7000020008', '천일고속', '000020', 'KRX');
    openTable();
    fireEvent.click(within(rows()[0] as HTMLElement).getByRole('button', { name: '추가' }));
    expect(onAddCard).toHaveBeenCalledTimes(2);
  });

  it('⑥ 카드 있는 종목 → 점선 「거래중」 칩 · 클릭 시 onFocusCard(isin, KRX)', () => {
    const { onAddCard, onFocusCard } = setup({ signals: [sig()], cards: new Set(['KR7000020008']) });
    const chip = chips()[0] as HTMLElement;
    expect(chip.className).toContain('border-dashed');
    expect(within(chip).getByText('거래중')).toBeInTheDocument();
    fireEvent.click(chip);
    expect(onFocusCard).toHaveBeenCalledWith('KR7000020008', 'KRX');
    expect(onAddCard).not.toHaveBeenCalled();
  });

  it('⑥ 이름 모르는 행은 ISIN 고정폭 · onAddCard 이름 undefined', () => {
    const { onAddCard } = setup({ signals: [sig({ isin: 'KR7999990009', stockCode: null })] });
    const name = (chips()[0] as HTMLElement).querySelector('[data-slot="accum-chip-name"]') as HTMLElement;
    expect(name.textContent).toBe('KR7999990009');
    expect(name.className).toContain('mono');
    fireEvent.click(chips()[0] as HTMLElement);
    expect(onAddCard).toHaveBeenCalledWith('KR7999990009', undefined, undefined, 'KRX');
  });
});

describe('AccumStrip — 신규 강조', () => {
  it('⑦ filled 전 · filled 직후 첫 행은 무강조 · 그 뒤 새 isin → data-new + 「신규」 · 30초 뒤 해제', () => {
    const { rerender } = setup({ signals: [sig()], filled: false });
    expect(document.querySelector('[data-new="true"]')).toBeNull();
    rerender({ signals: [sig(), sig({ isin: 'KR7000040006' })], filled: true });
    expect(document.querySelector('[data-new="true"]')).toBeNull();
    rerender({
      signals: [sig(), sig({ isin: 'KR7000040006' }), sig({ isin: 'KR7000080002', netKrw: 5e9 })],
      filled: true,
    });
    const fresh = document.querySelectorAll('[data-slot="accum-chip"][data-new="true"]');
    expect(fresh).toHaveLength(1);
    expect(within(fresh[0] as HTMLElement).getByText('대양금속')).toBeInTheDocument();
    expect(within(fresh[0] as HTMLElement).getByText('신규')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_MS + 1_000);
    });
    expect(document.querySelector('[data-new="true"]')).toBeNull();
    expect(screen.queryByText('신규')).toBeNull();
  });
});

describe('AccumStrip — 매도경보 (D-01)', () => {
  const warns = () => document.querySelectorAll('[data-slot="accum-warn"]');

  function expectWarnBadge(scope: HTMLElement, n: number) {
    const warn = scope.querySelector('[data-slot="accum-warn"]') as HTMLElement;
    expect(warn).not.toBeNull();
    expect(warn.textContent).toBe('매도경보');
    expect(warn.className).toContain('--accum-sell');
    expect(warn.className).toContain('--accum-warn-fg');
    expect(warn.className).toContain('accum-blink');
    expect(warn.className).toContain('motion-reduce:animate-none');
    expect(warn.getAttribute('title')).toBe(`이 사이클 경보 ${n}회`);
    const state = scope.querySelector('[data-slot="accum-state"]') as HTMLElement;
    expect(state.textContent).toBe('매집중');
    expect(state.nextElementSibling).toBe(warn);
    expect(warn.nextElementSibling?.textContent).toBe('이월 D+2');
  }

  it('⑨ 칩 — 매집중 + 경보 → 「매집중」 뒤 · 이월 앞 주황 배지 · 칩 title 끝 「매도경보 2회」', () => {
    setup({ signals: [sig({ sellWarn: true, sellWarns: 2, carryDays: 2 })] });
    const chip = chips()[0] as HTMLElement;
    expectWarnBadge(chip, 2);
    expect(chip.getAttribute('title')).toMatch(/ · 매도경보 2회$/);
  });

  it('⑨ 표 — 같은 행 상태 셀에 같은 배지(「매집중」 뒤 · 이월 앞)', () => {
    setup({ signals: [sig({ sellWarn: true, sellWarns: 2, carryDays: 2 })] });
    openTable();
    expect(rows()).toHaveLength(1);
    expectWarnBadge(rows()[0] as HTMLElement, 2);
  });

  it('⑨ 매도중 · 청산 + sellWarn true → 칩 · 표 어디에도 없음', () => {
    setup({
      signals: [
        sig({ isin: 'KR7000040006', state: 2, sellWarn: true, sellWarns: 3 }),
        sig({ isin: 'KR7000060004', state: 3, endReason: 1, sellWarn: true, sellWarns: 1 }),
      ],
    });
    expect(warns()).toHaveLength(0);
    openTable();
    expect(rows()).toHaveLength(2);
    expect(warns()).toHaveLength(0);
  });

  it('⑨ 매집중 · sellWarn false · sellWarns 3 → 배지 없음 · 칩 title 에 「매도경보」 없음', () => {
    setup({ signals: [sig({ sellWarn: false, sellWarns: 3 })] });
    expect(warns()).toHaveLength(0);
    expect((chips()[0] as HTMLElement).getAttribute('title')).not.toContain('매도경보');
    openTable();
    expect(warns()).toHaveLength(0);
  });
});

describe('AccumStrip — NXT 순매수 (quick-261022-ozx)', () => {
  const nxtCell = (row: Element) => row.querySelector('[data-col="nxt"]') as HTMLElement;

  it('⑪ 「팀 순매수」 바로 다음 열 「NXT 순매수」 = nxtBuyKrw − nxtSellKrw · 같은 억 포맷 · 부호 색', () => {
    setup({ signals: [sig({ nxtBuyKrw: 80_000_000, nxtSellKrw: 30_000_000 })] });
    openTable();
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads.indexOf('NXT 순매수')).toBeGreaterThan(-1);
    expect(heads.indexOf('NXT 순매수')).toBe(heads.indexOf('당일 순매수') + 1);
    const cell = nxtCell(rows()[0]);
    expect(cell.textContent).toBe('+0.5억');
    expect(cell.className).toContain('text-[var(--up)]');
  });

  it('⑪ 0 → 「0.0억」 flat · 음수 → down · 청산 행은 부호 색 없음 · <700 접힘', () => {
    setup({
      signals: [
        sig({ netKrw: 3e9 }),
        sig({ isin: 'KR7000040006', netKrw: 2e9, nxtBuyKrw: 10_000_000, nxtSellKrw: 260_000_000 }),
        sig({ isin: 'KR7000060004', state: 3, endReason: 1, nxtBuyKrw: 80_000_000, nxtSellKrw: 30_000_000 }),
      ],
    });
    openTable();
    const [zero, neg, ended] = Array.from(rows()).map(nxtCell);
    expect(zero.textContent).toBe('0.0억');
    expect(zero.className).toContain('text-[var(--flat)]');
    expect(zero.className).toContain('hidden');
    expect(zero.className).toContain('@min-[700px]/wb:table-cell');
    expect(neg.textContent).toBe('−2.5억');
    expect(neg.className).toContain('text-[var(--down)]');
    expect(ended.textContent).toBe('+0.5억');
    expect(ended.className).not.toContain('text-[var(--up)]');
  });

  it('⑪ 머리 title — 「당일 순매수」 = 당일 · 누적(KRX+NXT) · 전날 뜻 · 「NXT 순매수」 = 팀 순매수에 포함', () => {
    setup({ signals: [sig()] });
    openTable();
    expect(screen.getByRole('columnheader', { name: '당일 순매수' }).getAttribute('title')).toBe(
      '당일 팀 매수 − 매도(06:00 또는 새 사이클부터 · 우리 체결 제외) · 아랫줄 누적 = 등록 이후 사이클 누적(KRX+NXT · 이월 포함) · 전날 = 이월 행의 전 거래일 순매수(KYOBO119 보고서)',
    );
    expect(screen.getByRole('columnheader', { name: 'NXT 순매수' }).getAttribute('title')).toContain('팀 순매수에 포함');
  });

  it('⑪ 칩 title 에 「누적(KRX+NXT) · NXT 순매수」 — 칩 보이는 글자에는 NXT 없음', () => {
    setup({ signals: [daySig({ nxtBuyKrw: 80_000_000, nxtSellKrw: 30_000_000 })] });
    const chip = chips()[0] as HTMLElement;
    expect(chip.getAttribute('title')).toContain(
      '당일 순매수 +12.3억 · 누적 +12.3억(KRX+NXT) · NXT 순매수 +0.5억 · 평단(당일) 10,120',
    );
    expect(within(chip).queryByText(/NXT/)).toBeNull();
    expect(chip.textContent).not.toContain('NXT');
  });

  it('⑪ 폰 보조 줄 끝 「 · NXT +0.5억」', () => {
    setup({ signals: [daySig({ nxtBuyKrw: 80_000_000, nxtSellKrw: 30_000_000 })] });
    openTable();
    const sub = rows()[0].querySelector('[data-slot="accum-row-subline"]') as HTMLElement;
    expect(sub.textContent).toBe('10:16:05 · 평단 10,120 · 9,900~10,300 · NXT +0.5억');
  });
});

describe('AccumStrip — ⑫ 당일 축 (quick-261026-01h · 스케치 018 B)', () => {
  const PREV = new Map([['KR7000020008', 310_000_000]]);
  const cell = (row: Element, col: string) => row.querySelector(`[data-col="${col}"]`) as HTMLElement;
  const dayNet = (row: Element) => row.querySelector('[data-slot="accum-day-net"]') as HTMLElement;
  const netSub = (row: Element) => row.querySelector('[data-slot="accum-net-sub"]') as HTMLElement;
  const subline = (row: Element) => row.querySelector('[data-slot="accum-row-subline"]') as HTMLElement;
  /** 천일고속 — 3일째 이월 · 오늘 +2.4억(누적 +18.6억). */
  const carry = (over: Partial<AccumSignal> = {}) =>
    daySig({
      dayNetKrw: 240_000_000,
      netKrw: 1_862_000_000,
      dayAvgPx: 14_280,
      dayLoPx: 14_050,
      dayHiPx: 14_500,
      dayNetQty: 16_880,
      carryDays: 3,
      ...over,
    });

  it('머리 — 4열 「당일 순매수」 · 6~9열 「평단(당일)」 「수익률(당일)」 「매집 구간(당일)」 「순수량(당일)」 · 12열 그대로', () => {
    setup({ signals: [sig()] });
    openTable();
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toHaveLength(12);
    expect(heads.slice(3, 9)).toEqual([
      '당일 순매수',
      'NXT 순매수',
      '평단(당일)',
      '수익률(당일)',
      '매집 구간(당일)',
      '순수량(당일)',
    ]);
  });

  it('새 서버 이월 행 + 전날 → 첫 줄 당일(up) · 둘째 줄 「누적 · 전날」(전날 ≥700 만) · 당일 평단 · 구간 · 순수량 · 보조 줄 전날', () => {
    setup({ signals: [carry()], prevNet: PREV });
    openTable();
    const row = rows()[0] as HTMLElement;
    expect(dayNet(row).textContent).toBe('+2.4억');
    expect(dayNet(row).className).toContain('text-[var(--up)]');
    expect(netSub(row).textContent).toBe('누적 +18.6억 · 전날 +3.1억');
    const prev = row.querySelector('[data-slot="accum-prev-net"]') as HTMLElement;
    expect(prev.className).toContain('hidden');
    expect(prev.className).toContain('@min-[700px]/wb:inline');
    expect(cell(row, 'avg').textContent).toBe('14,280');
    expect(cell(row, 'band').textContent).toBe('14,050~14,500');
    expect(cell(row, 'qty').textContent).toBe('16,880');
    expect(subline(row).textContent).toBe('10:16:05 · 평단 14,280 · 14,050~14,500 · 전날 +3.1억 · NXT 0.0억');
  });

  it('당일 매도만(dayAvgPx 0) → 첫 줄 −0.6억(down) · 평단 · 수익률 · 구간 · 순수량 「—」 · 보조 줄 「평단 — · —」', () => {
    setup({
      signals: [
        daySig({ dayNetKrw: -60_000_000, dayAvgPx: 0, dayLoPx: 0, dayHiPx: 0, dayNetQty: -40_000, netKrw: 984_000_000, carryDays: 5 }),
      ],
    });
    openTable();
    const row = rows()[0] as HTMLElement;
    expect(dayNet(row).textContent).toBe('−0.6억');
    expect(dayNet(row).className).toContain('text-[var(--down)]');
    expect(netSub(row).textContent).toBe('누적 +9.8억');
    for (const col of ['avg', 'profit', 'band', 'qty']) {
      expect(cell(row, col).textContent, col).toBe('—');
      expect(cell(row, col).className, col).toContain('text-[var(--faint)]');
    }
    expect(subline(row).textContent).toBe('10:16:05 · 평단 — · — · NXT 0.0억');
  });

  it('옛 행(당일 9필드 null) → 첫 줄 「—」 --faint · 둘째 줄 「누적 +12.3억」 · 평단 · 수익률 · 구간 · 순수량 「—」 · 칩 값 「—」(누적 폴백 없음)', () => {
    setup({ signals: [sig()] });
    const chipNet = (chips()[0] as HTMLElement).querySelector('[data-slot="accum-chip-net"]') as HTMLElement;
    expect(chipNet.textContent).toBe('—');
    expect(chipNet.className).toContain('text-[var(--faint)]');
    openTable();
    const row = rows()[0] as HTMLElement;
    expect(dayNet(row).textContent).toBe('—');
    expect(dayNet(row).className).toContain('text-[var(--faint)]');
    expect(netSub(row).textContent).toBe('누적 +12.3억');
    for (const col of ['avg', 'profit', 'band', 'qty']) expect(cell(row, col).textContent, col).toBe('—');
  });

  it('전날 조건 — 이월 아님 · 전날 값 없음 · 전날 0 이면 둘째 줄 · 보조 줄 어디에도 「전날」 없음', () => {
    setup({
      signals: [
        carry({ carryDays: 0 }),
        carry({ isin: 'KR7000040006', dayNetKrw: 100_000_000 }),
        carry({ isin: 'KR7000060004', dayNetKrw: 50_000_000 }),
      ],
      prevNet: new Map([
        ['KR7000020008', 310_000_000],
        ['KR7000060004', 0],
      ]),
    });
    openTable();
    expect(rows()).toHaveLength(3);
    for (const row of Array.from(rows())) {
      expect(row.querySelector('[data-slot="accum-prev-net"]')).toBeNull();
      expect(netSub(row).textContent).not.toContain('전날');
      expect(subline(row).textContent).not.toContain('전날');
    }
  });

  it('칩 — 이름 · 「당일」 · dayNetKrw(부호 색) · 배지 · title 「… 당일 순매수 · 누적(KRX+NXT) · 전날 · NXT · 평단(당일) · 구간(당일) · 갱신」', () => {
    setup({ signals: [carry()], prevNet: PREV });
    const chip = chips()[0] as HTMLElement;
    const parts = Array.from(chip.children).map((c) => c.textContent);
    expect(parts.slice(0, 4)).toEqual(['천일고속', '당일', '+2.4억', '매집중']);
    expect((chip.querySelector('[data-slot="accum-chip-net"]') as HTMLElement).className).toContain('text-[var(--up)]');
    expect(chip.getAttribute('title')).toBe(
      '천일고속 000020 · 당일 순매수 +2.4억 · 누적 +18.6억(KRX+NXT) · 전날 +3.1억 · NXT 순매수 0.0억 · 평단(당일) 14,280 · 구간(당일) 14,050~14,500 · 갱신 10:16:05',
    );
  });

  it('칩 title — 당일 매수 없음이면 평단 · 구간 「—」 · 전날 없으면 그 조각 없음', () => {
    setup({ signals: [daySig({ dayNetKrw: -60_000_000, dayAvgPx: 0, dayLoPx: 0, dayHiPx: 0, netKrw: 984_000_000 })] });
    expect((chips()[0] as HTMLElement).getAttribute('title')).toBe(
      '천일고속 000020 · 당일 순매수 −0.6억 · 누적 +9.8억(KRX+NXT) · NXT 순매수 0.0억 · 평단(당일) — · 구간(당일) — · 갱신 10:16:05',
    );
  });

  it('순서 — 활성 행은 dayNetKrw 큰 순(누적과 갈려도) · null 은 뒤 · 청산은 그 뒤', () => {
    setup({
      signals: [
        daySig({ isin: 'KR7000020008', netKrw: 9e9, dayNetKrw: -60_000_000 }),
        sig({ isin: 'KR7000080002', netKrw: 9e9 }),
        daySig({ isin: 'KR7000040006', netKrw: 1e8, dayNetKrw: 240_000_000 }),
        daySig({ isin: 'KR7000060004', state: 3, endReason: 1, dayNetKrw: 9e9 }),
      ],
    });
    openTable();
    const names = Array.from(rows()).map((r) => r.querySelector('[data-slot="accum-row-name"]')?.textContent);
    expect(names).toEqual(['서산', '천일고속', '대양금속', '금호전기']);
    const chipNames = Array.from(chips()).map((c) => c.querySelector('[data-slot="accum-chip-name"]')?.textContent);
    expect(chipNames).toEqual(['서산', '천일고속', '대양금속']);
  });

  it('청산 행 — 첫 줄 부호 색 없음(회색)', () => {
    setup({ signals: [daySig({ state: 3, endReason: 1, dayNetKrw: 240_000_000 })] });
    openTable();
    const row = rows()[0] as HTMLElement;
    expect(dayNet(row).textContent).toBe('+2.4억');
    expect(dayNet(row).className).not.toContain('text-[var(--up)]');
  });
});

describe('⑩ 시세 구독 · 서버 기준 (2026-10-19)', () => {
  it('활성 행은 price level 로 구독하고, 시세가 오면 표의 현재가 · 등락률이 행 값 대신 시세로 — 청산 행은 구독 안 함 · 행 값 고정', () => {
    const live = sig({ isin: 'KR7000020008', lastPx: 10_450, rateBp: 512 }); // 기준가 ≈ 9,941
    const ended = sig({ isin: 'KR7000060004', state: 3, endReason: 1, lastPx: 2_210, rateBp: 300 });
    const { rerender } = setup({ signals: [live, ended] });
    expect(subscribeMock).toHaveBeenCalledWith('KR7000020008', 'KRX', 'price');
    expect(subscribeMock).not.toHaveBeenCalledWith('KR7000060004', expect.anything(), expect.anything());
    openTable();
    // 시세 전 = 행 값
    expect(within(rows()[0] as HTMLElement).getByText('10,450')).toBeInTheDocument();
    quotesMap = new Map([[relayQuoteKey('KR7000020008', 'KRX'), { t: 'q', i: 'KR7000020008', x: 'KRX', snap: false, p: 10_950 } as unknown as RelayQuote]]);
    rerender({ signals: [live, ended] });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const first = rows()[0] as HTMLElement;
    expect(within(first).getByText('10,950')).toBeInTheDocument();
    expect(within(first).getByText(`${liveRateOf(live, 10_950) > 0 ? '+' : ''}${liveRateOf(live, 10_950).toFixed(2)}%`)).toBeInTheDocument();
    // 청산 행은 행 값 그대로
    expect(within(rows()[1] as HTMLElement).getByText('2,210')).toBeInTheDocument();
  });

  it('liveRateOf — 기준가로 다시 센다 · 시세가 행 값과 같거나 기준가를 모르면 행 등락률', () => {
    const s1 = sig({ lastPx: 10_450, rateBp: 512 });
    expect(liveRateOf(s1, 10_450)).toBeCloseTo(5.12, 5);
    expect(liveRateOf(s1, 10_950)).toBeCloseTo(((10_950 - 9_941) * 100) / 9_941, 5);
    expect(liveRateOf(sig({ lastPx: 0, rateBp: 0 }), 100)).toBe(0);
  });

  it('게이트웨이 라벨 — gateway 가 있으면 「매집」 옆에 작게 · null 이면 없음', () => {
    const { rerender } = setup({ signals: [sig()], gateway: 'KYOBO119' });
    expect(document.querySelector('[data-slot="accum-gateway"]')?.textContent).toBe('KYOBO119');
    rerender({ gateway: null });
    expect(document.querySelector('[data-slot="accum-gateway"]')).toBeNull();
  });
});
