import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { RelayQuote, RelayRateCrossItem } from '@gh-radar/shared';

/**
 * Phase 18 Plan 08 Task 1 — 돌파감지 스트립 + 「더보기」 7열 표 (TRADE-06 · D-07 / D-14 ~ D-18 · UI-SPEC E4).
 *
 * 여기서 잠그는 것:
 *   ① 빈 상태 = 「돌파 0」 + 빈 문구, 「신규」 필은 DOM 에 없다
 *   ② 76 새 행 = 30초 `--new-bg` + 「신규」 배지, 목록 전체 1초 tick 타이머 1개
 *   ③ 같은 종목의 76 재수신 = 자리 유지 · 값 갱신 · 돌파시각은 첫 등재값
 *   ④ 78 스냅샷 행 = 무음·무강조 + 「오늘 울린 종목」 기록
 *   ⑤ relay 배열 순서 그대로(정렬·필터 0회)
 *   ⑥ 칩/행 클릭 = `onAddCard` 1회, 카드 있는 종목은 `onFocusCard`
 *   ⑦ 「거래중」 표식 · ✕ 수동 삭제 · 이름 없는 행 · 거래소 문자열 부재
 *   ⑧ 현재가를 모르는 행은 지우지 않는다 · 「기록 → 재생」 순서
 */

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

/** 호출 순서 장부 — 「집합 기록 → 재생」을 순서로 단언한다. */
const calls: string[] = [];

vi.mock('@/lib/alert-tone', () => ({
  playBreakoutTone: vi.fn(() => {
    calls.push('play');
    return true;
  }),
}));

vi.mock('@/lib/breakout-list', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/breakout-list')>();
  return {
    ...actual,
    addSounded: vi.fn((isins: readonly string[], today?: string) => {
      calls.push(`record:${isins.join(',')}`);
      return actual.addSounded(isins, today);
    }),
  };
});

import { playBreakoutTone } from '@/lib/alert-tone';
import { addSounded, BREAKOUT_DISMISSED_KEY, HIGHLIGHT_MS } from '@/lib/breakout-list';
import { relayQuoteKey } from '@/lib/use-relay-socket';
import {
  BREAKOUT_EMPTY_TEXT,
  BreakoutStrip,
  breakoutDismissLabel,
  type BreakoutStripProps,
} from '../workbench/breakout-strip';

const T0 = Date.UTC(2026, 8, 22, 0, 41, 31);

function item(over: Partial<RelayRateCrossItem> = {}): RelayRateCrossItem {
  return {
    isin: 'KR7096530001',
    exchange: 'KRX',
    lastPrice: 12_100,
    changeRate: 21.0,
    thresholdPct: 20,
    basePrice: 10_000,
    exchangeTime: '094131000000',
    serverTime: '09:41:31',
    name: '씨젠',
    code: '096530',
    ...over,
  };
}

const A = item();
const B = item({ isin: 'KR7005930003', name: '삼성전자', code: '005930', exchangeTime: '094200000000', lastPrice: 12_500, changeRate: 25.0 });
const C = item({ isin: 'KR7000660001', name: 'SK하이닉스', code: '000660', exchangeTime: '094300000000' });

function quote(isin: string, p: number): RelayQuote {
  return { t: 'q', i: isin, x: 'KRX', snap: false, p, o: p, h: p, l: p } as unknown as RelayQuote;
}

function setPrice(isin: string, p: number) {
  const next = new Map(quotesMap);
  next.set(relayQuoteKey(isin, 'KRX'), quote(isin, p));
  quotesMap = next;
}

type Props = Partial<BreakoutStripProps>;

function setup(initial: Props = {}) {
  const onAddCard = vi.fn();
  const onFocusCard = vi.fn();
  const onDismiss = vi.fn();
  let props: BreakoutStripProps = {
    items: [],
    snapSeq: 1,
    cards: new Set(),
    onAddCard,
    onFocusCard,
    onDismiss,
    ...initial,
  };
  const utils = render(<BreakoutStrip {...props} />);
  const update = (next: Props) => {
    props = { ...props, ...next };
    utils.rerender(<BreakoutStrip {...props} />);
  };
  return { ...utils, update, onAddCard, onFocusCard, onDismiss };
}

function openTable() {
  fireEvent.click(document.querySelector('[data-slot="breakout-more"]') as HTMLButtonElement);
}

const chips = () => [...document.querySelectorAll<HTMLElement>('[data-slot="breakout-chip"]')];
const rowEls = () => [...document.querySelectorAll<HTMLElement>('[data-slot="breakout-row"]')];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(T0);
  window.localStorage.clear();
  quotesMap = new Map();
  calls.length = 0;
  vi.mocked(playBreakoutTone).mockClear();
  vi.mocked(addSounded).mockClear();
  subscribeMock.mockClear();
  unsubscribeMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BreakoutStrip — 빈 상태 (E4 empty/loading)', () => {
  it('행 0개면 「돌파 0」 + 빈 문구이고 「신규」 필은 DOM 에 없다', () => {
    setup();
    expect(screen.getByTestId('breakout-strip-label')).toHaveTextContent('돌파 0');
    expect(screen.getByText(BREAKOUT_EMPTY_TEXT)).toBeInTheDocument();
    expect(document.querySelector('[data-slot="breakout-new-pill"]')).toBeNull();
  });
});

describe('BreakoutStrip — 76 신규 강조 (D-18)', () => {
  it('76 으로 들어온 새 행은 30초 동안 --new-bg + 「신규」 배지이고, 30초 뒤 기본으로 돌아간다', () => {
    const { update } = setup({ items: [] });
    update({ items: [A] });

    const chip = chips()[0]!;
    expect(chip).toHaveAttribute('data-new', 'true');
    expect(chip.className).toContain('bg-[var(--new-bg)]');
    expect(within(chip).getByText('신규')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="breakout-new-pill"]')).toHaveTextContent('신규 1');

    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_MS - 1_000);
    });
    expect(chips()[0]).toHaveAttribute('data-new', 'true');

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(chips()[0]).not.toHaveAttribute('data-new');
    expect(chips()[0]!.className).not.toContain('bg-[var(--new-bg)]');
    expect(within(chips()[0]!).queryByText('신규')).toBeNull();
    expect(document.querySelector('[data-slot="breakout-new-pill"]')).toBeNull();
  });

  it('강조 타이머는 행 수와 무관하게 목록 전체에 1개이고, 강조 행이 없어지면 멈춘다', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { update } = setup({ items: [] });
    expect(setIntervalSpy).not.toHaveBeenCalled();

    update({ items: [A] });
    update({ items: [A, B] });
    update({ items: [A, B, C] });
    expect(document.querySelectorAll('[data-slot="breakout-chip"][data-new="true"]')).toHaveLength(3);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_MS + 2_000);
    });
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('BreakoutStrip — 76 재수신 (D-14)', () => {
  it('같은 종목에 76 이 다시 오면 자리를 지키고 값만 갱신하며 돌파시각은 첫 등재값이다', () => {
    const { update } = setup({ items: [A, B] });
    const A2 = { ...A, lastPrice: 12_300, changeRate: 23.0, exchangeTime: '095000000000' };
    update({ items: [A2, B] });

    openTable();
    const rows = rowEls();
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('씨젠')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('12,300')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('+23.00%')).toBeInTheDocument();
    // 돌파시각 = 첫 등재 09:41:31 (재수신 09:50:00 이 아니다)
    expect(within(rows[0]!).getAllByText('09:41:31').length).toBeGreaterThan(0);
    expect(within(rows[0]!).queryByText('09:50:00')).toBeNull();
    expect(within(rows[1]!).getByText('삼성전자')).toBeInTheDocument();
  });
});

describe('BreakoutStrip — 78 스냅샷 (D-17)', () => {
  it('78 로 들어온 행은 무음·무강조이면서 「오늘 울린 종목」 에 기록된다', () => {
    const { update } = setup({ items: [], snapSeq: 1 });
    update({ items: [A, B], snapSeq: 2 });

    for (const chip of chips()) {
      expect(chip).not.toHaveAttribute('data-new');
      expect(chip.className).not.toContain('bg-[var(--new-bg)]');
    }
    expect(document.querySelector('[data-slot="breakout-new-badge"]')).toBeNull();
    expect(playBreakoutTone).not.toHaveBeenCalled();
    expect(addSounded).toHaveBeenCalledWith([A.isin, B.isin]);
    const stored = JSON.parse(window.localStorage.getItem('gh-radar:breakout-sounded') ?? '{}');
    expect(stored.ids).toEqual([A.isin, B.isin]);
  });

  it('마운트 시 이미 있던 목록도 무음·무강조다(첫 채움)', () => {
    setup({ items: [A] });
    expect(chips()[0]).not.toHaveAttribute('data-new');
    expect(playBreakoutTone).not.toHaveBeenCalled();
  });
});

describe('BreakoutStrip — 알림음 순서 (D-17)', () => {
  it('새 76 행은 「오늘 울린 종목」 에 먼저 기록한 다음 재생한다', () => {
    const { update } = setup({ items: [] });
    update({ items: [A] });
    expect(calls).toEqual([`record:${A.isin}`, 'play']);
  });

  it('이미 오늘 울린 종목은 다시 울리지 않는다(종목당 하루 1회)', () => {
    const { update } = setup({ items: [] });
    update({ items: [A] });
    calls.length = 0;
    // 다른 기기 탭이 아니라 같은 화면에서 한 번 빠졌다 다시 오는 경우
    update({ items: [] });
    update({ items: [{ ...A }] });
    expect(calls).toEqual([]);
    expect(playBreakoutTone).toHaveBeenCalledTimes(1);
  });
});

describe('BreakoutStrip — 순서 (D-14)', () => {
  it('relay 배열 순서를 그대로 그린다 — 칩과 표 모두', () => {
    setup({ items: [C, A, B] });
    expect(chips().map((c) => within(c).getByText(/.+/, { selector: '[data-slot="breakout-chip-name"]' }).textContent)).toEqual([
      'SK하이닉스',
      '씨젠',
      '삼성전자',
    ]);
    openTable();
    expect(rowEls().map((r) => r.querySelector('[data-slot="breakout-row-name"]')?.textContent)).toEqual([
      'SK하이닉스',
      '씨젠',
      '삼성전자',
    ]);
  });
});

describe('BreakoutStrip — 클릭 → 카드 (D-07)', () => {
  it('칩 클릭은 onAddCard(isin, name, code) 1회', () => {
    const { onAddCard, onFocusCard } = setup({ items: [A] });
    fireEvent.click(chips()[0]!);
    expect(onAddCard).toHaveBeenCalledTimes(1);
    expect(onAddCard).toHaveBeenCalledWith(A.isin, '씨젠', '096530');
    expect(onFocusCard).not.toHaveBeenCalled();
  });

  it('표의 행 클릭과 「거래 추가」 버튼도 onAddCard 1회씩이다', () => {
    const { onAddCard } = setup({ items: [A] });
    openTable();
    fireEvent.click(rowEls()[0]!);
    expect(onAddCard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '거래 추가' }));
    expect(onAddCard).toHaveBeenCalledTimes(2);
  });

  it('이미 카드가 있는 종목은 onFocusCard 가 불리고 onAddCard 는 불리지 않는다', () => {
    const { onAddCard, onFocusCard } = setup({ items: [A], cards: new Set([A.isin]) });
    fireEvent.click(chips()[0]!);
    openTable();
    fireEvent.click(rowEls()[0]!);
    expect(onFocusCard).toHaveBeenCalledTimes(2);
    expect(onFocusCard).toHaveBeenCalledWith(A.isin);
    expect(onAddCard).not.toHaveBeenCalled();
  });

  it('카드가 있는 종목은 「거래중」(점선 칩 · cursor-default) 이고 「거래 추가」 버튼이 없다', () => {
    setup({ items: [A, B], cards: new Set([A.isin]) });
    const chip = chips()[0]!;
    expect(chip).toHaveAttribute('data-trading', 'true');
    expect(chip.className).toContain('border-dashed');
    expect(chip.className).toContain('cursor-default');
    expect(within(chip).getByText('거래중')).toBeInTheDocument();

    openTable();
    const [rowA, rowB] = rowEls();
    expect(rowA).toHaveAttribute('data-trading', 'true');
    expect(within(rowA!).getByText('거래중')).toBeInTheDocument();
    expect(within(rowA!).queryByRole('button', { name: '거래 추가' })).toBeNull();
    expect(within(rowB!).getByRole('button', { name: '거래 추가' })).toBeInTheDocument();
  });
});

describe('BreakoutStrip — ✕ 수동 삭제 (D-18)', () => {
  it('✕ 는 UI-SPEC 원문 aria-label 이고 onDismiss 1회 + 그 행이 사라지고 기기 집합에 남는다', () => {
    const { onDismiss, onAddCard } = setup({ items: [A, B] });
    openTable();
    const btn = screen.getByRole('button', { name: '씨젠 돌파 목록에서 지우기 (이 기기만 · 오늘)' });
    expect(breakoutDismissLabel('씨젠')).toBe('씨젠 돌파 목록에서 지우기 (이 기기만 · 오늘)');
    fireEvent.click(btn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(A.isin);
    expect(onAddCard).not.toHaveBeenCalled();
    expect(rowEls()).toHaveLength(1);
    expect(screen.getByTestId('breakout-strip-label')).toHaveTextContent('돌파 1');
    const stored = JSON.parse(window.localStorage.getItem(BREAKOUT_DISMISSED_KEY) ?? '{}');
    expect(stored.ids).toEqual([A.isin]);
  });

  it('지운 종목은 그날 재돌파(새 76)에도 다시 나오지 않는다', () => {
    const { update } = setup({ items: [A] });
    openTable();
    fireEvent.click(screen.getByRole('button', { name: breakoutDismissLabel('씨젠') }));
    update({ items: [{ ...A, exchangeTime: '100000000000' }] });
    expect(rowEls()).toHaveLength(0);
    expect(chips()).toHaveLength(0);
  });
});

describe('BreakoutStrip — 이름 없는 행 (D-30)', () => {
  it('name/code 가 없으면 ISIN 을 그대로(코드 자리 없이) 보이고 onAddCard 에 이름·코드를 싣지 않는다', () => {
    const bare = item({ name: undefined, code: undefined });
    const { onAddCard } = setup({ items: [bare] });
    openTable();
    const row = rowEls()[0]!;
    const name = row.querySelector('[data-slot="breakout-row-name"]')!;
    expect(name.textContent).toBe(bare.isin);
    expect(name).toHaveAttribute('data-unnamed', 'true');
    expect(row.querySelector('[data-slot="breakout-row-code"]')).toBeNull();
    fireEvent.click(chips()[0]!);
    expect(onAddCard).toHaveBeenCalledWith(bare.isin, undefined, undefined);
  });
});

describe('BreakoutStrip — 거래소 미표시 (D-07)', () => {
  it('칩과 행 어디에도 KRX/NXT 문자열이 없다', () => {
    setup({ items: [A, B, item({ isin: 'KR7035720002', exchange: 'NXT', name: '카카오', code: '035720' })] });
    openTable();
    const root = document.querySelector('[data-slot="breakout"]')!;
    expect(root.textContent).not.toMatch(/KRX|NXT/);
    for (const el of root.querySelectorAll('[title]')) {
      expect(el.getAttribute('title')).not.toMatch(/KRX|NXT/);
    }
  });
});

describe('BreakoutStrip — 이탈 삭제 (D-16)', () => {
  it('현재가를 모르는 행은 지우지 않고 76 의 가격·등락률을 그대로 보인다', () => {
    const { update } = setup({ items: [A] });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    update({ items: [A], cards: new Set() });
    openTable();
    const row = rowEls()[0]!;
    expect(within(row).getByText('12,100')).toBeInTheDocument();
    expect(within(row).getByText('+21.00%')).toBeInTheDocument();
  });

  it('구독 현재가가 임계−2%p 아래이고 유예가 지나면 shouldRemoveBreakout 으로 지운다(대조군)', () => {
    setPrice(A.isin, 11_000); // 10% < 18%
    const { update } = setup({ items: [A, B] });
    // 추가 직후 3초 유예 안에서는 지우지 않는다(낡은 체결 한 건)
    expect(chips()).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(3_500);
    });
    setPrice(A.isin, 10_900);
    update({});
    expect(chips()).toHaveLength(1);
    expect(chips()[0]).toHaveTextContent('삼성전자');
  });

  it('구독 현재가는 표의 현재가·등락률로 보인다', () => {
    setPrice(A.isin, 12_600);
    setup({ items: [A] });
    openTable();
    const row = rowEls()[0]!;
    expect(within(row).getByText('12,600')).toBeInTheDocument();
    expect(within(row).getByText('+26.00%')).toBeInTheDocument();
  });
});
