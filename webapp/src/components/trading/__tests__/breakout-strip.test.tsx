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
 *   ⑨ 행의 발화 거래소 피드 — 가격·이탈은 그 피드만 · 전환 시 옛 피드 해제 + 새 피드 구독 ·
 *      카드 제외는 (ISIN, 거래소) (quick-260926-rcc)
 *   ⑩ 이탈로 지운 행 — 구독 해제 · 새 above 구간이면 새 행(강조 · 새 돌파시각 · 유예 재시작 · 무음) ·
 *      같은 구간 재전송은 되살리지 않음 · 새 비무음 행 신호 `onRowsAdded` (quick-260926-s5v)
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
import { BREAKOUT_PRICE_THROTTLE_MS, breakoutFeedKey } from '@/lib/use-breakout-quotes';
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

type X = 'KRX' | 'NXT';

function quote(isin: string, p: number, x: X = 'KRX'): RelayQuote {
  return { t: 'q', i: isin, x, snap: false, p, o: p, h: p, l: p } as unknown as RelayQuote;
}

function setPrice(isin: string, p: number, x: X = 'KRX') {
  const next = new Map(quotesMap);
  next.set(relayQuoteKey(isin, x), quote(isin, p, x));
  quotesMap = next;
}

type Props = Partial<BreakoutStripProps>;

function setup(initial: Props = {}) {
  const onAddCard = vi.fn();
  const onFocusCard = vi.fn();
  const onDismiss = vi.fn();
  const onRowsAdded = vi.fn();
  let props: BreakoutStripProps = {
    items: [],
    snapSeq: 1,
    cards: new Set(),
    cardFeeds: new Set(),
    onAddCard,
    onFocusCard,
    onDismiss,
    onRowsAdded,
    ...initial,
  };
  const utils = render(<BreakoutStrip {...props} />);
  const update = (next: Props) => {
    props = { ...props, ...next };
    utils.rerender(<BreakoutStrip {...props} />);
  };
  return { ...utils, update, onAddCard, onFocusCard, onDismiss, onRowsAdded };
}

function openTable() {
  fireEvent.click(document.querySelector('[data-slot="breakout-more"]') as HTMLButtonElement);
}

const chips = () => [...document.querySelectorAll<HTMLElement>('[data-slot="breakout-chip"]')];
const rowEls = () => [...document.querySelectorAll<HTMLElement>('[data-slot="breakout-row"]')];
/** 30초 강조 중인 칩 — 신규 개수는 라벨 필이 아니라 칩이 말한다. */
const newChips = () => [...document.querySelectorAll<HTMLElement>('[data-slot="breakout-chip"][data-new="true"]')];

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
  it('행 0개면 라벨 「돌파」 + 빈 문구이고 칩·「신규」 필은 DOM 에 없다', () => {
    setup();
    expect(screen.getByTestId('breakout-strip-label').textContent).toBe('돌파');
    expect(screen.getByText(BREAKOUT_EMPTY_TEXT)).toBeInTheDocument();
    expect(chips()).toHaveLength(0);
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
    expect(newChips()).toHaveLength(1);
    expect(document.querySelector('[data-slot="breakout-new-pill"]')).toBeNull();

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
    expect(newChips()).toHaveLength(0);
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
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
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
  it('칩 클릭은 onAddCard(isin, name, code, 행의 발화 거래소) 1회', () => {
    const { onAddCard, onFocusCard } = setup({ items: [A] });
    fireEvent.click(chips()[0]!);
    expect(onAddCard).toHaveBeenCalledTimes(1);
    expect(onAddCard).toHaveBeenCalledWith(A.isin, '씨젠', '096530', 'KRX');
    expect(onFocusCard).not.toHaveBeenCalled();
  });

  it('NXT 로 발화한 행은 넷째 인자가 NXT 다 — 작업대가 그 거래소로 카드를 연다 (quick-260926-s5v)', () => {
    const { onAddCard } = setup({ items: [{ ...A, exchange: 'NXT' }] });
    fireEvent.click(chips()[0]!);
    openTable();
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    expect(onAddCard).toHaveBeenCalledTimes(2);
    expect(onAddCard).toHaveBeenNthCalledWith(1, A.isin, '씨젠', '096530', 'NXT');
    expect(onAddCard).toHaveBeenNthCalledWith(2, A.isin, '씨젠', '096530', 'NXT');
  });

  it('표의 행 클릭과 「거래 추가」 버튼도 onAddCard 1회씩이다', () => {
    const { onAddCard } = setup({ items: [A] });
    openTable();
    fireEvent.click(rowEls()[0]!);
    expect(onAddCard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    expect(onAddCard).toHaveBeenCalledTimes(2);
  });

  it('이미 카드가 있는 종목은 onFocusCard 가 불리고 onAddCard 는 불리지 않는다', () => {
    const { onAddCard, onFocusCard } = setup({ items: [A], cards: new Set([A.isin]) });
    fireEvent.click(chips()[0]!);
    openTable();
    fireEvent.click(rowEls()[0]!);
    expect(onFocusCard).toHaveBeenCalledTimes(2);
    expect(onFocusCard).toHaveBeenCalledWith(A.isin, 'KRX');
    expect(onAddCard).not.toHaveBeenCalled();
  });

  it('카드가 있는 종목의 NXT 행은 onFocusCard(isin, NXT) — 작업대가 발화 거래소로 맞춘다 (quick-260926-s5v)', () => {
    const { onAddCard, onFocusCard } = setup({ items: [{ ...A, exchange: 'NXT' }], cards: new Set([A.isin]) });
    fireEvent.click(chips()[0]!);
    expect(onFocusCard).toHaveBeenCalledTimes(1);
    expect(onFocusCard).toHaveBeenCalledWith(A.isin, 'NXT');
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
    expect(within(rowA!).queryByRole('button', { name: '추가' })).toBeNull();
    expect(within(rowB!).getByRole('button', { name: '추가' })).toBeInTheDocument();
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
    expect(chips()).toHaveLength(1);
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
    expect(onAddCard).toHaveBeenCalledWith(bare.isin, undefined, undefined, 'KRX');
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
    // 가격 갱신은 ≤5Hz 로 묶인다(quick-260923-elb 2a) — 창이 닫힌 뒤 판정한다.
    act(() => {
      vi.advanceTimersByTime(BREAKOUT_PRICE_THROTTLE_MS);
    });
    expect(chips()).toHaveLength(1);
    expect(chips()[0]).toHaveTextContent('삼성전자');
  });

  it('현재가·등락률은 초당 5회로 묶이고 창이 닫히면 마지막 값이 반드시 도착한다 (quick-260923-elb 2a)', () => {
    setPrice(A.isin, 12_600);
    const { update } = setup({ items: [A] });
    openTable();

    setPrice(A.isin, 12_800);
    update({});
    act(() => {
      vi.advanceTimersByTime(BREAKOUT_PRICE_THROTTLE_MS - 1);
    });
    expect(within(rowEls()[0]!).getByText('12,600')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const row = rowEls()[0]!;
    expect(within(row).getByText('12,800')).toBeInTheDocument();
    expect(within(row).getByText('+28.00%')).toBeInTheDocument();
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

describe('BreakoutStrip — 행의 발화 거래소 피드 (quick-260926-rcc)', () => {
  const ANXT = { ...A, exchange: 'NXT' as const };

  it('NXT 로 발화한 행은 NXT 시세로 보이고 같은 종목의 KRX 시세(전일 종가 등)로 지워지지 않는다', () => {
    setPrice(A.isin, 9_000, 'KRX'); // −10% — KRX 로 판정하면 유예 뒤 지워진다
    setPrice(A.isin, 12_600, 'NXT');
    const { update } = setup({ items: [ANXT] });
    expect(subscribeMock).toHaveBeenCalledWith(A.isin, 'NXT', 'price');
    expect(subscribeMock).not.toHaveBeenCalledWith(A.isin, 'KRX', 'price');

    act(() => {
      vi.advanceTimersByTime(3_500);
    });
    update({});
    act(() => {
      vi.advanceTimersByTime(BREAKOUT_PRICE_THROTTLE_MS);
    });
    expect(chips()).toHaveLength(1);
    openTable();
    const row = rowEls()[0]!;
    expect(within(row).getByText('12,600')).toBeInTheDocument();
    expect(within(row).getByText('+26.00%')).toBeInTheDocument();
  });

  it('발화 거래소가 KRX → NXT 로 바뀌면 행은 1개 그대로 · 옛 피드 해제 + 새 피드 구독 · 유예가 다시 흐르고 돌파시각은 첫 등재값이다', () => {
    setPrice(A.isin, 12_600, 'KRX');
    setPrice(A.isin, 11_000, 'NXT'); // 새 피드의 낡은 값(임계−2%p 아래)
    const { update } = setup({ items: [A] });
    // KRX 피드로 무장시킨다(등재 뒤 임계 이상 관측).
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    update({});

    const A2 = { ...ANXT, lastPrice: 12_700, changeRate: 27.0, exchangeTime: '095000000000' };
    update({ items: [A2] });
    act(() => {
      vi.advanceTimersByTime(BREAKOUT_PRICE_THROTTLE_MS);
    });
    update({});

    expect(chips()).toHaveLength(1);
    expect(subscribeMock).toHaveBeenCalledWith(A.isin, 'NXT', 'price');
    expect(unsubscribeMock).toHaveBeenCalledWith(A.isin, 'KRX', 'price');
    // 전환 직후 3초 유예 안 — 새 피드의 낡은 값으로 지우지 않는다(무장은 전환 때 풀렸다).
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    update({});
    expect(chips()).toHaveLength(1);

    openTable();
    const row = rowEls()[0]!;
    expect(within(row).getAllByText('09:41:31').length).toBeGreaterThan(0);
    expect(within(row).queryByText('09:50:00')).toBeNull();
  });

  it('카드 구독 제외는 (ISIN, 거래소) 단위다 — KRX 카드가 열린 종목의 NXT 행은 NXT 를 구독하고 「거래중」 이다', () => {
    setup({
      items: [ANXT],
      cards: new Set([A.isin]),
      cardFeeds: new Set([breakoutFeedKey({ isin: A.isin, exchange: 'KRX' })]),
    });
    expect(subscribeMock).toHaveBeenCalledWith(A.isin, 'NXT', 'price');
    const chip = chips()[0]!;
    expect(chip).toHaveAttribute('data-trading', 'true');
    expect(within(chip).getByText('거래중')).toBeInTheDocument();
  });
});

describe('BreakoutStrip — 이탈 뒤 재돌파 = 새 행 (quick-260926-s5v)', () => {
  /** 새 above 구간 — 돌파시각이 바뀐 76 원소(gh-trade 재돌파). */
  const A_NEW = { ...A, lastPrice: 12_400, changeRate: 24.0, exchangeTime: '100500000000' };

  /** A 를 76 으로 올린 뒤(비무음 · 소리 1회) 유예가 지나고 구독 가격이 임계−2%p 아래라 지운다. */
  function mountAndRemoveA() {
    setPrice(A.isin, 11_000); // 10% < 18%
    const view = setup({ items: [] });
    view.update({ items: [A] });
    expect(chips()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(3_500);
    });
    setPrice(A.isin, 10_900);
    view.update({});
    act(() => {
      vi.advanceTimersByTime(BREAKOUT_PRICE_THROTTLE_MS);
    });
    expect(chips()).toHaveLength(0);
    return view;
  }

  it('S-R1 새 구간 76 → 새 행: 「신규」 강조 · 돌파시각 = 새 원소 · 소리 없음(하루 1회) · 유예 재시작', () => {
    const { update } = mountAndRemoveA();
    expect(playBreakoutTone).toHaveBeenCalledTimes(1);
    expect(addSounded).toHaveBeenCalledTimes(1);

    update({ items: [A_NEW] });
    expect(chips()).toHaveLength(1);
    expect(chips()[0]).toHaveAttribute('data-new', 'true');
    expect(within(chips()[0]!).getByText('신규')).toBeInTheDocument();
    openTable();
    const row = rowEls()[0]!;
    expect(within(row).getAllByText('10:05:00').length).toBeGreaterThan(0);
    expect(within(row).queryByText('09:41:31')).toBeNull();
    expect(playBreakoutTone).toHaveBeenCalledTimes(1);
    expect(addSounded).toHaveBeenCalledTimes(1);

    // 전역 시세 맵의 낡은 낮은 값이 남아 있어도 유예 안에서는 지우지 않는다.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    update({});
    act(() => {
      vi.advanceTimersByTime(BREAKOUT_PRICE_THROTTLE_MS);
    });
    expect(chips()).toHaveLength(1);
  });

  it('S-R2 지우면 그 피드 구독을 풀고, 새 구간으로 되살아나면 다시 구독한다', () => {
    subscribeMock.mockClear();
    const { update } = mountAndRemoveA();
    expect(unsubscribeMock).toHaveBeenCalledWith(A.isin, 'KRX', 'price');
    const subs = subscribeMock.mock.calls.length;

    update({ items: [A_NEW] });
    expect(subscribeMock.mock.calls.length).toBe(subs + 1);
    expect(subscribeMock).toHaveBeenLastCalledWith(A.isin, 'KRX', 'price');
  });

  it('S-R3 같은 구간 재전송(재접속 78 — 돌파시각·거래소가 같은 새 객체)은 되살리지 않고 재구독도 없다', () => {
    const { update, onRowsAdded } = mountAndRemoveA();
    const subs = subscribeMock.mock.calls.length;
    onRowsAdded.mockClear();

    update({ items: [{ ...A }], snapSeq: 2 });
    expect(chips()).toHaveLength(0);
    expect(subscribeMock.mock.calls.length).toBe(subs);

    update({ items: [{ ...A }] }); // 같은 구간의 새 객체(76 모양)도 마찬가지
    expect(chips()).toHaveLength(0);
    expect(onRowsAdded).not.toHaveBeenCalled();
  });

  it('S-R4 새 구간이 78 로 오면 무음·무강조 새 행이다', () => {
    const { update, onRowsAdded } = mountAndRemoveA();
    onRowsAdded.mockClear();

    update({ items: [A_NEW], snapSeq: 2 });
    expect(chips()).toHaveLength(1);
    expect(chips()[0]).not.toHaveAttribute('data-new');
    expect(playBreakoutTone).toHaveBeenCalledTimes(1);
    expect(onRowsAdded).not.toHaveBeenCalled();
  });

  it('S-R5 ✕ 로 지운 종목은 구독 후보가 아니다 — 그 피드 구독을 푼다', () => {
    setup({ items: [A, B] });
    expect(subscribeMock).toHaveBeenCalledWith(A.isin, 'KRX', 'price');
    openTable();
    fireEvent.click(screen.getByRole('button', { name: breakoutDismissLabel('씨젠') }));
    expect(unsubscribeMock).toHaveBeenCalledWith(A.isin, 'KRX', 'price');
    expect(unsubscribeMock).not.toHaveBeenCalledWith(B.isin, 'KRX', 'price');
  });

  it('S-A1 새 행 신호 — 첫 채움은 없고, 76 새 종목은 그 행만 1회', () => {
    const { update, onRowsAdded } = setup({ items: [A] });
    expect(onRowsAdded).not.toHaveBeenCalled();
    update({ items: [B, A] });
    expect(onRowsAdded).toHaveBeenCalledTimes(1);
    expect(onRowsAdded.mock.calls[0]![0].map((r: RelayRateCrossItem) => r.isin)).toEqual([B.isin]);
  });

  it('S-A2 78 새 종목 · 보이는 행의 재알림 76 · 발화 거래소만 바뀐 76 은 새 행 신호가 없다', () => {
    const { update, onRowsAdded } = setup({ items: [A] });
    update({ items: [C, A], snapSeq: 2 }); // 78
    const A2 = { ...A, lastPrice: 12_300, changeRate: 23.0, exchangeTime: '095000000000' };
    update({ items: [A2, C] }); // 보이는 행 재알림(D-14)
    update({ items: [{ ...A2, exchange: 'NXT' as const, exchangeTime: '095500000000' }, C] }); // rcc 전환
    expect(chips()).toHaveLength(2);
    expect(onRowsAdded).not.toHaveBeenCalled();
  });

  it('S-A3 이탈 뒤 새 구간 76 은 1회 · ✕ 로 지운 종목의 재돌파는 신호가 없다', () => {
    const { update, onRowsAdded } = mountAndRemoveA();
    expect(onRowsAdded).toHaveBeenCalledTimes(1); // 처음 76 등재
    update({ items: [A_NEW] });
    expect(onRowsAdded).toHaveBeenCalledTimes(2);
    expect(onRowsAdded.mock.calls[1]![0].map((r: RelayRateCrossItem) => r.isin)).toEqual([A.isin]);

    openTable();
    fireEvent.click(screen.getByRole('button', { name: breakoutDismissLabel('씨젠') }));
    update({ items: [] });
    update({ items: [{ ...A_NEW, exchangeTime: '110000000000' }] });
    expect(chips()).toHaveLength(0);
    expect(onRowsAdded).toHaveBeenCalledTimes(2);
  });
});

/* ── Task 3 — E4 상태 커버리지 마감 ─────────────────────────────────── */

describe('BreakoutStrip — E4 loading: 78 전에도 빈 상태를 그리고 위장하지 않는다', () => {
  it('스피너·스켈레톤·「불러오는 중」 이 없다 — 빈 문구가 사실 그대로다', () => {
    setup({ items: [], snapSeq: 0 });
    const root = document.querySelector('[data-slot="breakout"]')!;
    expect(root.querySelector('[role="progressbar"], [role="status"], [aria-busy="true"]')).toBeNull();
    expect(root.querySelector('[class*="animate-"], [class*="skeleton"], [data-slot="skeleton"]')).toBeNull();
    expect(root.textContent).not.toMatch(/불러오는|로딩|loading/i);
    expect(screen.getByText(BREAKOUT_EMPTY_TEXT)).toBeInTheDocument();
  });

  it('행 0개 펼침 → 펼친 영역이 없다(스트립 줄 빈 문구가 이미 말한다) · 더보기에 aria-controls 가 없다', () => {
    setup({ items: [] });
    openTable();
    const more = document.querySelector('[data-slot="breakout-more"]')!;
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('[data-slot="breakout-table"]')).toBeNull();
    expect(screen.getAllByText(BREAKOUT_EMPTY_TEXT)).toHaveLength(1);
    expect(more).not.toHaveAttribute('aria-controls');
  });

  it('행이 있고 펼쳤을 때만 aria-controls 가 표 id 를 가리킨다', () => {
    setup({ items: [A] });
    const more = document.querySelector('[data-slot="breakout-more"]')!;
    expect(more).not.toHaveAttribute('aria-controls');
    openTable();
    const table = document.querySelector('[data-slot="breakout-table"]')!;
    expect(more.getAttribute('aria-controls')).toBe(table.id);
  });

  it('인증 직후 78 이 오면 전량 교체된 그대로 그린다(무음)', () => {
    const { update } = setup({ items: [], snapSeq: 0 });
    update({ items: [B, A], snapSeq: 1 });
    expect(chips()).toHaveLength(2);
    expect(screen.queryByText(BREAKOUT_EMPTY_TEXT)).toBeNull();
    expect(playBreakoutTone).not.toHaveBeenCalled();
  });
});

describe('BreakoutStrip — E4 zero-one-many · 라벨 「돌파」', () => {
  it('신규 0 이면 「신규」 글자가 어디에도 없다 · 펼친 표에 머리줄·요약·「접기 ▴」 가 없다', () => {
    setup({ items: [A, B] }); // 첫 채움 = 무음·무강조 → 신규 0
    expect(screen.getByTestId('breakout-strip-label').textContent).toBe('돌파');
    expect(chips()).toHaveLength(2);
    expect(newChips()).toHaveLength(0);
    expect(screen.queryByText(/^신규/)).toBeNull();
    openTable();
    const table = document.querySelector('[data-slot="breakout-table"]') as HTMLElement;
    expect(table.querySelector('[data-slot="breakout-rows"]')).not.toBeNull();
    expect(rowEls()).toHaveLength(2);
    expect(document.querySelector('[data-slot="breakout-table-summary"]')).toBeNull();
    expect(table.textContent).not.toContain('임계 20% · 최신 위');
    expect(within(table).queryByRole('button', { name: '접기 ▴' })).toBeNull();
    // 토글은 스트립 줄 버튼 하나다
    fireEvent.click(screen.getByRole('button', { name: '접기' }));
    expect(document.querySelector('[data-slot="breakout-table"]')).toBeNull();
  });

  it('1개와 여러 개는 같은 문법이다 — 라벨은 「돌파」 그대로, 개수는 칩이 말한다', () => {
    const { update } = setup({ items: [A] });
    expect(screen.getByTestId('breakout-strip-label').textContent).toBe('돌파');
    expect(chips()).toHaveLength(1);
    update({ items: [A, B, C] });
    expect(screen.getByTestId('breakout-strip-label').textContent).toBe('돌파');
    expect(chips()).toHaveLength(3);
    expect(newChips()).toHaveLength(2);
    expect(document.querySelector('[data-slot="breakout-new-pill"]')).toBeNull();
  });
});

describe('BreakoutStrip — E4 populated: 「신규」 는 색 + 배지 텍스트로 말한다', () => {
  it('신규 칩·행은 --new-bg 와 「신규」 텍스트를 함께 갖고, 신규 행의 「거래 추가」 는 --primary 채움이다', () => {
    const { update } = setup({ items: [A] });
    update({ items: [A, B] });
    const newChip = chips()[1]!;
    expect(newChip.className).toContain('bg-[var(--new-bg)]');
    expect(within(newChip).getByText('신규')).toBeInTheDocument();
    // 기본(비신규) 칩은 색도 텍스트도 없다
    expect(chips()[0]!.className).not.toContain('bg-[var(--new-bg)]');
    expect(within(chips()[0]!).queryByText('신규')).toBeNull();

    openTable();
    const [oldRow, newRow] = rowEls();
    expect(newRow!.className).toContain('bg-[var(--new-bg)]');
    expect(within(newRow!).getByText('신규')).toBeInTheDocument();
    expect(within(newRow!).getByRole('button', { name: '추가' }).className).toContain('bg-[var(--primary)]');
    expect(within(oldRow!).getByRole('button', { name: '추가' }).className).not.toContain('bg-[var(--primary)]');
  });

  it('깜박임이 없다 — 강조 요소에 animate 클래스가 없다', () => {
    const { update } = setup({ items: [] });
    update({ items: [A] });
    openTable();
    const root = document.querySelector('[data-slot="breakout"]')!;
    expect(root.querySelector('[class*="animate-"]')).toBeNull();
  });
});

describe('BreakoutStrip — E4 overflow (200행)', () => {
  const many = Array.from({ length: 200 }, (_, i) =>
    item({
      isin: `KR7${String(i).padStart(6, '0')}000`,
      code: String(i).padStart(6, '0'),
      name: `종목${i}`,
      exchangeTime: `09${String(10 + Math.floor(i / 60)).padStart(2, '0')}${String(i % 60).padStart(2, '0')}000000`,
    }),
  );

  it('200행이면 칩 줄은 한 줄 가로 스크롤이고 표는 세로로 자연 확장한다(자르지 않는다)', () => {
    setup({ items: many });
    expect(chips()).toHaveLength(200);
    const chipRow = document.querySelector('[data-slot="breakout-chips"]')!;
    expect(chipRow.className).toContain('overflow-x-auto');
    expect(chipRow.className).toContain('flex-nowrap');
    for (const c of chips().slice(0, 3)) expect(c.className).toContain('flex-none');

    openTable();
    expect(rowEls()).toHaveLength(200);
    const table = document.querySelector('[data-slot="breakout-table"]')!;
    expect(table.className).not.toMatch(/max-h-|overflow-y-/);
  });

  it('폰 밴드 열 접기 구조가 있다 — 임계·돌파시각 <700 · 기준가 <830 숨김 + 보조줄 「{HH:MM:SS}」', () => {
    // 실제 잘림 0 은 컨테이너 쿼리라 jsdom 이 재지 못한다 — 18-13 Playwright 가 맡는다.
    setup({ items: [A] });
    openTable();
    const th = (col: string) => document.querySelector(`th[data-col="${col}"]`)!;
    expect(th('thr').className).toContain('hidden @min-[700px]/wb:table-cell');
    expect(th('at').className).toContain('hidden @min-[700px]/wb:table-cell');
    expect(th('base').className).toContain('hidden @min-[830px]/wb:table-cell');
    const sub = rowEls()[0]!.querySelector('[data-slot="breakout-row-subline"]')!;
    expect(sub.textContent).toBe('09:41:31');
    expect(sub.className).toContain('@min-[700px]/wb:hidden');
    // 7열 헤더
    expect([...document.querySelectorAll('th')].map((t) => t.textContent)).toEqual([
      '종목',
      '현재가',
      '등락률',
      '임계',
      '기준가',
      '돌파시각',
      '액션',
    ]);
  });
});

describe('BreakoutStrip — E4 long-text · partial', () => {
  it('긴 종목명은 1줄 ellipsis 이고 칩 title 에 UI-SPEC 템플릿 전문이 담긴다', () => {
    const long = item({ name: '아주아주긴이름을가진가상의종목주식회사우선주', code: '123450' });
    setup({ items: [long] });
    const chip = chips()[0]!;
    expect(chip).toHaveAttribute(
      'title',
      '아주아주긴이름을가진가상의종목주식회사우선주 123450 · 임계 20% · 기준가 10,000 · 돌파 09:41:31',
    );
    const name = chip.querySelector('[data-slot="breakout-chip-name"]')!;
    expect(name.className).toContain('truncate');
    expect(name.className).toMatch(/max-w-/);
    openTable();
    const rowName = rowEls()[0]!.querySelector('[data-slot="breakout-row-name"]')!;
    expect(rowName.className).toContain('truncate');
    expect(rowName).toHaveAttribute('title', '아주아주긴이름을가진가상의종목주식회사우선주');
  });

  it('name/code 없는 행의 칩 title 은 ISIN 으로 시작하고 코드를 지어내지 않는다', () => {
    const bare = item({ name: undefined, code: undefined });
    setup({ items: [bare] });
    expect(chips()[0]).toHaveAttribute('title', `${bare.isin} · 임계 20% · 기준가 10,000 · 돌파 09:41:31`);
    // 칩 이름 자리는 ISIN 원문 그대로다(ISIN 에서 단축코드를 잘라 만들지 않는다 — D-28)
    expect(chips()[0]!.querySelector('[data-slot="breakout-chip-name"]')!.textContent).toBe(bare.isin);
  });
});
