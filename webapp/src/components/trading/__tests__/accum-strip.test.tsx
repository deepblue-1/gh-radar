import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { AccumSignal } from '@gh-radar/shared';

/**
 * quick-261018-rfy D-01 — 작업대 「매집」 패널(돌파 패널 동형 · 목업 mockup-workbench.html 안 A).
 *
 * 잠그는 것:
 *   ① 칩 = 이름 · 팀 순매수(억 · 부호 색) · 상태 배지(매집중 --team · 매도중 --accum-sell) · 이월 D+n(carryDays > 0 만)
 *   ② 청산(state 3)은 칩에 없고 펼친 표에만 회색 · 행 title = 종료 사유 문구
 *   ③ 표 순서 = sortAccum · 열 접기(평단 · 구간 · 순수량 · 갱신 = colNarrow) · 보조 줄 · 코드 <700 숨김
 *   ④ 더보기 → 표 · panels pref accum 기억(다시 마운트해도 열림)
 *   ⑤ ✕ → 그 사이클 숨김(gh-radar:accum-dismissed 에 isin|cycle) · 같은 isin 새 사이클이면 다시 보임
 *   ⑥ 클릭 — 카드 없음 onAddCard(isin, 이름, 코드, 'KRX') · 카드 있음 점선 「거래중」 + onFocusCard · 이름 없음 ISIN 고정폭 · 이름 undefined
 *   ⑦ 첫 채움 무강조 · 그 뒤 새 isin → data-new + 「신규」 · 30초 뒤 해제
 *   ⑧ 활성 칩 0 → 빈 문구
 */

vi.mock('@/lib/stock-names', () => ({
  useStockNames: () => new Map<string, string>(),
}));

import { HIGHLIGHT_MS } from '@/lib/breakout-list';
import { ACCUM_DISMISSED_KEY } from '@/lib/accum-list';
import { readPanelsPref } from '@/lib/trading-layout';
import type { IsinLabel } from '@/lib/isin-labels';
import { ACCUM_EMPTY_TEXT, AccumStrip } from '../workbench/accum-strip';

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
    sinceDate: '2026-10-16',
    regTime: '10:15:23',
    thNetKrw: 100_000_000,
    thMinSame: 30,
    thMaxMcapKrw: 500_000_000_000,
    ...over,
  };
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
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AccumStrip — 칩 (안 A)', () => {
  it('① 이름 · +12.3억(up) · 매집중(--team) · 이월 0 이면 이월 배지 없음', () => {
    setup({ signals: [sig()] });
    expect(screen.getByText('매집')).toBeInTheDocument();
    expect(chips()).toHaveLength(1);
    const chip = chips()[0] as HTMLElement;
    expect(within(chip).getByText('천일고속')).toBeInTheDocument();
    const net = within(chip).getByText('+12.3억');
    expect(net.className).toContain('text-[var(--up)]');
    const badge = within(chip).getByText('매집중');
    expect(badge.className).toContain('--team');
    expect(within(chip).queryByText(/이월/)).toBeNull();
  });

  it('① 이월 D+2 배지(--accum-carry) · 매도중 배지(--accum-sell) · 음수 순매수는 down 색', () => {
    setup({
      signals: [
        sig({ carryDays: 2 }),
        sig({ isin: 'KR7000040006', state: 2, netKrw: -250_000_000, cycle: 1 }),
      ],
    });
    const [a, b] = Array.from(chips()) as HTMLElement[];
    const carry = within(a!).getByText('이월 D+2');
    expect(carry.className).toContain('--accum-carry');
    const sell = within(b!).getByText('매도중');
    expect(sell.className).toContain('--accum-sell');
    expect(within(b!).getByText('−2.5억').className).toContain('text-[var(--down)]');
  });

  it('② 청산 행은 칩에 없고 펼친 표에만 회색 · title = 사유(이월 탈락)', () => {
    setup({
      signals: [sig(), sig({ isin: 'KR7000060004', state: 3, endReason: 2, netKrw: -20_000_000 })],
    });
    expect(chips()).toHaveLength(1);
    expect(within(chips()[0] as HTMLElement).queryByText('금호전기')).toBeNull();
    openTable();
    expect(rows()).toHaveLength(2);
    const ended = Array.from(rows()).find((r) => r.textContent?.includes('금호전기')) as HTMLElement;
    expect(ended.className).toContain('text-[var(--muted-fg)]');
    expect(ended.getAttribute('title')).toBe('이월 탈락');
    expect(within(ended).getByText('청산')).toBeInTheDocument();
  });

  it('⑧ 활성 칩 0 이면 빈 문구 — 청산 행만 있어도', () => {
    setup({ signals: [sig({ state: 3, endReason: 1 })] });
    expect(screen.getByText(ACCUM_EMPTY_TEXT)).toBeInTheDocument();
    expect(ACCUM_EMPTY_TEXT).toBe('아직 팀 매집으로 등록된 종목이 없어요');
    expect(chips()).toHaveLength(0);
  });
});

describe('AccumStrip — 표', () => {
  it('③ 순서 = 매집중 · 매도중 netKrw 큰 순, 청산은 뒤', () => {
    setup({
      signals: [
        sig({ isin: 'KR7000060004', state: 3, endReason: 1, netKrw: 9e9 }),
        sig({ isin: 'KR7000020008', netKrw: 1e8 }),
        sig({ isin: 'KR7000040006', state: 2, netKrw: 5e8 }),
      ],
    });
    openTable();
    const names = Array.from(rows()).map((r) => r.querySelector('[data-slot="accum-row-name"]')?.textContent);
    expect(names).toEqual(['서산', '천일고속', '금호전기']);
    const chipNames = Array.from(chips()).map((c) => c.querySelector('[data-slot="accum-chip-name"]')?.textContent);
    expect(chipNames).toEqual(['서산', '천일고속']);
  });

  it('③ 평단 · 구간 · 순수량 · 갱신 열은 <700 숨김 · 보조 줄 「HH:MM:SS · 평단 N · lo~hi」 · 코드 <700 숨김', () => {
    setup({ signals: [sig()] });
    openTable();
    const row = rows()[0] as HTMLElement;
    for (const col of ['avg', 'band', 'qty', 'at']) {
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
    expect(sub.textContent).toBe('10:16:05 · 평단 10,120 · 9,900~10,300');
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
