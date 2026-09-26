import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  RelayAccountState,
  RelayLimitChaser,
  RelayOrderMsg,
  RelayRateCrossItem,
  RelayUnfilled,
  RelayViNoticeMsg,
  RelayViOrderItem,
} from '@gh-radar/shared';

/**
 * Phase 18 Plan 11 Task 3 — `/trading` 작업대 셸: 조립과 카드 집합 단일 소유 (D-01 · D-02 · D-04 ·
 * D-09 · D-27 · D-28, TRADE-09).
 *
 * 잠그는 것:
 *   - 게이트가 서면 `DmaGate` 문구만 — 격자·스트립이 렌더되지 않는다(T-18-54).
 *   - 게이트 통과 후 섹션이 UI-SPEC §레이아웃 계약 순서대로 선다.
 *   - 돌파 칩 / 종목 추가 → 카드 1장(KRX · 펼침). 같은 ISIN 은 카드가 늘지 않고 그 카드가 펼쳐진다.
 *   - ✕ → 그 카드만 사라지고 포커스가 다음 카드 헤더(없으면 검색란)로. 등록된 전략 카드는 확인을 거친다.
 *   - `?focus={키}` 는 마운트 1회만 소비한다 — 이후 URL 이 바뀌어도 카드 상태를 덮지 않는다(T-18-53).
 *   - 더티 카드가 있으면 이탈 경고가 한 곳에서 걸린다.
 *   - 작업대는 카드에 `limitChasers`(전략 배열)를 **prop 으로 내리지 않는다**(T-18-52 · Pitfall 9).
 *   - 본문 래퍼가 `@container/wb` 를 갖는다.
 *
 * ★ 스텁 경계: relay 컨텍스트 · 인증 · 라우터 · 검색 API. `StrategyCard` 는 prop 을 기록하는 얇은
 *   스텁으로 바꿔 「작업대가 무엇을 내려주는가」를 그대로 본다(카드 내부는 `strategy-card.test.tsx` 몫).
 *   종목 추가란도 스텁이다(검색 상호작용은 `stock-add-bar.test.tsx` 몫).
 */

type RelayShape = ReturnType<typeof import('@/lib/relay-provider').useRelayContext>;

let mockRelay: RelayShape;
const authState: { user: { id: string } | null; isLoading: boolean } = {
  user: { id: 'u1' },
  isLoading: false,
};
let searchParams = new URLSearchParams();

vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => mockRelay,
    useRelaySubscription: () => ({ ...mockRelay, quote: null, tape: [] }),
  };
});

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => authState,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/trading',
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/alert-tone', () => ({
  playBreakoutTone: vi.fn(() => false),
  isTonePlaybackBlocked: vi.fn(() => false),
  resumeToneContext: vi.fn(async () => {}),
}));

/** 카드 스텁 — 작업대가 내려주는 prop 을 **카드 id** 별로 기록한다(WR-05 — 같은 ISIN 카드가 둘일 수 있다). */
const cardProps = new Map<string, Record<string, unknown>>();
/** 그 ISIN 의 첫 카드 prop — 종목당 카드 1장인 케이스용. */
const propsOf = (isin: string) => [...cardProps.values()].find((p) => p.isin === isin);
vi.mock('@/components/trading/card/strategy-card', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/trading/card/strategy-card')>();
  function StubCard(props: import('@/components/trading/card/strategy-card').StrategyCardProps) {
    cardProps.set(props.cardId, props as unknown as Record<string, unknown>);
    const label = props.name === '' ? props.isin : props.name;
    return (
      <article
        data-slot="strategy-card"
        data-key={`${props.isin}:${props.accountNo}:${props.exchange}`}
        data-open={props.open ? 'true' : 'false'}
        data-exchange={props.exchange}
        data-alert={props.alerted ? 'true' : 'false'}
      >
        <button
          type="button"
          id={`strategy-card-${props.cardId}-toggle`}
          aria-expanded={props.open}
          onClick={() => props.onToggle(props.cardId)}
        >
          {label}
        </button>
        <button type="button" aria-label={`${label} 카드 닫기`} onClick={() => props.onClose(props.cardId)}>
          ✕
        </button>
        <button
          type="button"
          aria-label={`${label} 더티`}
          onClick={() => props.onDirtyCountChange?.(props.cardId, 2)}
        >
          dirty
        </button>
        <button
          type="button"
          aria-label={`${label} NXT`}
          onClick={() => props.onExchangeChange(props.cardId, 'NXT')}
        >
          nxt
        </button>
      </article>
    );
  }
  return { ...actual, StrategyCard: StubCard };
});

vi.mock('@/components/trading/card/stock-info-modal', () => ({
  StockInfoModal: () => null,
}));

vi.mock('@/components/trading/workbench/stock-add-bar', () => ({
  StockAddBar: ({
    cards,
    onAdd,
    onFocusCard,
  }: {
    cards: ReadonlySet<string>;
    onAdd: (isin: string, name: string, code: string) => void;
    onFocusCard: (isin: string) => void;
  }) => (
    <div data-slot="stock-add-bar">
      <input aria-label="종목 추가 검색" />
      <button
        type="button"
        onClick={() =>
          cards.has('KR7005930003')
            ? onFocusCard('KR7005930003')
            : onAdd('KR7005930003', '삼성전자', '005930')
        }
      >
        추가
      </button>
    </div>
  ),
}));

/**
 * 공용 패널은 **실물 그대로** 렌더하고 마지막 prop 만 기록한다 — 작업대가 무엇을 내려주는가
 * (`priceOf` · `logEntries` · 더티 바 수)를 본다(18-31). 미체결 행 클릭 등 기존 케이스는 실물이 받는다.
 */
const sharedPanelsProps: { last: Record<string, unknown> | null } = { last: null };
vi.mock('@/components/trading/workbench/shared-panels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/trading/workbench/shared-panels')>();
  function SpySharedPanels(props: import('@/components/trading/workbench/shared-panels').SharedPanelsProps) {
    sharedPanelsProps.last = props as unknown as Record<string, unknown>;
    return <actual.SharedPanels {...props} />;
  }
  return { ...actual, SharedPanels: SpySharedPanels };
});

import { EMPTY_RELAY_VALUE } from '@/lib/relay-provider';
import { indexUnfilled } from '@/lib/trading-alerts';
import { requestTradingFocus } from '@/lib/trading-focus';
import { LEAVE_WARNING } from '@/lib/use-leave-warning';
import {
  cardForAlert,
  cardForUnfilled,
  closeLockedExchangesLine,
  EXCHANGE_SWITCH_TITLE,
  exchangeSwitchBody,
  fillAccountCards,
  holdingQuotePrice,
  restoreSavedCards,
  TradingWorkbench,
  withCardOpen,
  pruneInactiveCards,
  type WorkbenchCard,
} from '../workbench/trading-workbench';
import { renderOrderOf } from '../workbench/card-grid';

const ACCOUNT = '37728502101';
const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`) as HTMLElement | null;
const cardsInDom = () =>
  Array.from(document.querySelectorAll('[data-slot="strategy-card"]')) as HTMLElement[];
/** 그 ISIN 의 첫 카드 헤더 토글(`aria-expanded` 를 가진 버튼) — DOM id 는 카드 id 축이다. */
const toggleOf = (isin: string) =>
  cardsInDom()
    .find((c) => c.getAttribute('data-key')?.startsWith(`${isin}:`))!
    .querySelector('button[aria-expanded]') as HTMLElement;

function rc(over: Partial<RelayRateCrossItem> = {}): RelayRateCrossItem {
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

/** 완전한 VI 주문 1건 — 표·칩이 실제로 그려질 만큼 필드를 채운다(`vi-trigger-strip.test` 의 `item()` 모양). */
function viOrder(over: Partial<RelayViOrderItem> = {}): RelayViOrderItem {
  return {
    isin: 'KR7000660001',
    exchange: 'KRX',
    market: 'Q',
    accountNo: ACCOUNT,
    orderNo: '1',
    orderQty: 10,
    orderPrice: 190_100,
    triggerPrice: 190_000,
    basePrice: 160_000,
    viEndTime: '094331000',
    deadline110Ms: Date.now() + 84_000,
    deadline119Ms: Date.now() + 93_000,
    confirmed: false,
    confirmLocked: false,
    state: 'Accepted',
    filledQty: 0,
    name: 'SK하이닉스',
    ...over,
  };
}

function lc(isin: string, over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  const exchange = over.exchange ?? 'KRX';
  const accountNo = over.accountNo ?? ACCOUNT;
  return {
    isin,
    accountNo,
    exchange,
    key: `${isin}:${accountNo}:${exchange}`,
    crud: 'C',
    buyEnabled: true,
    sellEnabled: false,
    sweepEnabled: false,
    ...over,
  } as RelayLimitChaser;
}

function relay(over: Partial<RelayShape> = {}): RelayShape {
  return {
    ...EMPTY_RELAY_VALUE,
    status: 'ready',
    statusLabel: '실시간',
    accounts: [{ accountNo: ACCOUNT, name: '위탁종합' }],
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    send: vi.fn(() => true),
    ...over,
  } as RelayShape;
}

beforeEach(() => {
  window.localStorage.clear();
  authState.user = { id: 'u1' };
  authState.isLoading = false;
  searchParams = new URLSearchParams();
  cardProps.clear();
  sharedPanelsProps.last = null;
  mockRelay = relay();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TradingWorkbench — 게이트 (D-27 · T-18-54)', () => {
  it('게이트가 서면 DmaGate 문구만 보이고 격자·스트립·상태줄이 렌더되지 않는다', () => {
    authState.user = null;
    render(<TradingWorkbench />);
    expect(slot('dma-gate')).not.toBeNull();
    expect(screen.getByText('로그인이 필요해요')).toBeTruthy();
    expect(slot('trading-workbench')).toBeNull();
    expect(slot('breakout')).toBeNull();
    expect(slot('card-grid')).toBeNull();
    expect(slot('card-grid-empty')).toBeNull();
    expect(slot('workbench-status-bar')).toBeNull();
  });

  it('DMA 매핑 없음(unauthorized)도 게이트가 페이지를 대신한다 — 「불러오는 중」 위장 없음', () => {
    mockRelay = relay({ status: 'unauthorized' });
    render(<TradingWorkbench />);
    expect(screen.getByText('DMA 계정이 연결되지 않았어요')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/불러오는 중/);
    expect(slot('trading-workbench')).toBeNull();
  });
});

describe('TradingWorkbench — 조립 (D-04 · 레이아웃 계약)', () => {
  it('섹션이 순서대로 선다 — 제목줄 → 상태줄 → VI 패널(스트립 · 설정 · 표) → 돌파 스트립/표 → 종목 추가 → 격자 → 공용 패널', () => {
    // 표는 목록이 있을 때만 선다 — VI 주문 1건 · 돌파 1건을 넣는다.
    mockRelay = relay({ rateCrossItems: [rc()], viOrders: [viOrder()] });
    render(<TradingWorkbench />);
    // VI 설정은 VI 패널 안에 있고, 펼치기 전에는 hidden 조상 아래다.
    expect(slot('vi-trigger')!.contains(slot('vi-settings-rows'))).toBe(true);
    expect(slot('vi-settings-rows')!.closest('[hidden]')).not.toBeNull();
    // 표 2개는 「더보기」로 펼친다 — 펼친 표가 자기 스트립 바로 아래에 선다.
    fireEvent.click(slot('vi-trigger')!.querySelector('[data-slot="vi-strip-more"]')!);
    fireEvent.click(slot('breakout-more')!);
    expect(slot('vi-settings-rows')!.closest('[hidden]')).toBeNull();

    const order = [
      slot('workbench-title'),
      slot('workbench-status-bar'),
      slot('vi-trigger-strip'),
      slot('vi-settings-rows'),
      slot('vi-trigger-table'),
      slot('breakout-strip'),
      slot('breakout-table'),
      slot('stock-add-bar'),
      slot('card-grid-empty'),
      screen.getByTestId('shared-panels'),
    ];
    order.forEach((el) => expect(el).not.toBeNull());
    for (let i = 1; i < order.length; i += 1) {
      const rel = order[i - 1]!.compareDocumentPosition(order[i]!);
      expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(within(slot('workbench-title')!).getByRole('heading', { name: '트레이딩' })).toBeTruthy();
    expect(within(slot('workbench-title')!).getByRole('combobox', { name: '계좌' })).toBeTruthy();
  });

  it('머리줄 — 제목·계좌와 상태줄이 같은 flex-wrap 부모(workbench-head)에 서고 상태줄은 flex-[1_1_auto] (quick-260925-ptw)', () => {
    render(<TradingWorkbench />);
    const head = slot('workbench-head')!;
    expect(head).not.toBeNull();
    expect(slot('workbench-title')!.parentElement).toBe(head);
    expect(slot('workbench-status-bar')!.parentElement).toBe(head);
    expect(head.className.split(/\s+/)).toContain('flex-wrap');
    expect(slot('workbench-status-bar')!.className.split(/\s+/)).toContain('flex-[1_1_auto]');
    // 새 뷰포트 브레이크포인트를 들이지 않는다(내용 폭 기반 줄바꿈).
    for (const el of [head, slot('workbench-title')!, slot('workbench-status-bar')!]) {
      expect(el.className).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):/);
    }
  });

  it('본문 래퍼가 @container/wb 를 갖는다', () => {
    render(<TradingWorkbench />);
    expect(slot('trading-workbench')!.className).toContain('@container/wb');
  });

  it('카드 0장이면 격자 자리에 빈 문구가 선다', () => {
    render(<TradingWorkbench />);
    expect(slot('card-grid-empty')!.textContent).toContain('거래할 종목이 없어요');
    expect(cardsInDom()).toHaveLength(0);
  });
});

describe('TradingWorkbench — 카드 추가 (D-07 · D-08)', () => {
  it('돌파 칩 클릭 → 카드 1장 · 거래소 KRX · 펼침 · 상태줄 계좌로 시작한다', () => {
    mockRelay = relay({ rateCrossItems: [rc()] });
    render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    const cards = cardsInDom();
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('data-key')).toBe(`KR7096530001:${ACCOUNT}:KRX`);
    expect(cards[0].getAttribute('data-open')).toBe('true');
    expect(propsOf('KR7096530001')?.name).toBe('씨젠');
    expect(propsOf('KR7096530001')?.code).toBe('096530');
  });

  it('이미 카드가 있는 ISIN 을 다시 누르면 카드가 늘지 않고 그 카드가 펼쳐진다', () => {
    mockRelay = relay({ rateCrossItems: [rc()] });
    render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    fireEvent.click(screen.getByRole('button', { name: '씨젠' })); // 접기
    expect(cardsInDom()[0].getAttribute('data-open')).toBe('false');
    fireEvent.click(slot('breakout-chip')!); // 「거래중」 칩 → 펼침
    expect(cardsInDom()).toHaveLength(1);
    expect(cardsInDom()[0].getAttribute('data-open')).toBe('true');
  });

  it('종목 추가란 「추가」 도 같은 규칙으로 카드를 만든다(중복 없음)', () => {
    render(<TradingWorkbench />);
    const add = within(slot('stock-add-bar')!).getByRole('button', { name: '추가' });
    fireEvent.click(add);
    fireEvent.click(add);
    const cards = cardsInDom();
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('data-key')).toBe(`KR7005930003:${ACCOUNT}:KRX`);
    expect(cards[0].getAttribute('data-open')).toBe('true');
  });
});

describe('TradingWorkbench — 돌파 행 → 카드 거래소 (quick-260926-s5v)', () => {
  const S = 'KR7096530001';
  const T = 'KR7005930003';
  const key = (isin: string, ex: string) => `${isin}:${ACCOUNT}:${ex}`;
  const byKey = () =>
    Object.fromEntries(cardsInDom().map((c) => [c.getAttribute('data-key'), c.getAttribute('data-open')]));

  it('W1 NXT 로 발화한 행 · NXT 거래 여부 모름 → 카드 1장이 NXT 키 · 펼침 · 이름·코드 전달', () => {
    mockRelay = relay({ rateCrossItems: [rc({ exchange: 'NXT' })] });
    render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    const cards = cardsInDom();
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('data-key')).toBe(key(S, 'NXT'));
    expect(cards[0].getAttribute('data-open')).toBe('true');
    expect(propsOf(S)?.name).toBe('씨젠');
    expect(propsOf(S)?.code).toBe('096530');
    expect((mockRelay.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('W2 NXT 미거래 확정(빈 집합)이면 NXT 요청을 무시하고 KRX 로 연다 · 집합에 있으면 NXT', () => {
    mockRelay = relay({ rateCrossItems: [rc({ exchange: 'NXT' })], nxtTradable: new Set<string>() });
    const view = render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    expect(byKey()).toEqual({ [key(S, 'KRX')]: 'true' });
    view.unmount();
    cardProps.clear();

    mockRelay = relay({ rateCrossItems: [rc({ exchange: 'NXT' })], nxtTradable: new Set([S]) });
    render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    expect(byKey()).toEqual({ [key(S, 'NXT')]: 'true' });
  });

  it('W3 KRX 카드가 있는 종목이 NXT 로 발화하면 칩(거래중) 클릭이 그 카드를 NXT 로 전환한다 — 카드 1장 · 같은 id · 펼침', () => {
    mockRelay = relay({ rateCrossItems: [rc()] });
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    const id = propsOf(S)?.cardId;
    fireEvent.click(toggleOf(S)); // 접기
    expect(byKey()).toEqual({ [key(S, 'KRX')]: 'false' });

    mockRelay = relay({ rateCrossItems: [rc({ exchange: 'NXT', exchangeTime: '100500000000' })] });
    rerender(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    expect(cardsInDom()).toHaveLength(1);
    expect(byKey()).toEqual({ [key(S, 'NXT')]: 'true' });
    expect(propsOf(S)?.cardId).toBe(id);
  });

  it('W4 전환할 카드에 미전송 더티가 있으면 확인 다이얼로그가 뜨고 확인 전에는 KRX 그대로다', () => {
    mockRelay = relay({ rateCrossItems: [rc()] });
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    fireEvent.click(screen.getByRole('button', { name: '씨젠 더티' }));

    mockRelay = relay({ rateCrossItems: [rc({ exchange: 'NXT', exchangeTime: '100500000000' })] });
    rerender(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    expect(screen.getByTestId('workbench-exchange-confirm')).toBeInTheDocument();
    expect(byKey()).toEqual({ [key(S, 'KRX')]: 'true' });

    fireEvent.click(
      within(screen.getByTestId('workbench-exchange-confirm')).getByRole('button', { name: '바꾸기' }),
    );
    expect(byKey()).toEqual({ [key(S, 'NXT')]: 'true' });
  });

  it('W5 같은 ISIN 에 KRX·NXT 카드가 둘이면 NXT 행은 NXT 카드를 펼친다 — KRX 키 불변 · 스크롤은 NXT 키', () => {
    const scrolled: (string | null)[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.getAttribute('data-key'));
    };
    try {
      mockRelay = relay({
        limitChasers: [lc(T), lc(T, { exchange: 'NXT' })],
        rateCrossItems: [rc({ isin: T, name: '삼성전자', code: '005930', exchange: 'NXT' })],
      });
      render(<TradingWorkbench />);
      expect(byKey()).toEqual({ [key(T, 'KRX')]: 'false', [key(T, 'NXT')]: 'false' });
      fireEvent.click(slot('breakout-chip')!);
      expect(byKey()).toEqual({ [key(T, 'KRX')]: 'false', [key(T, 'NXT')]: 'true' });
      expect(scrolled.at(-1)).toBe(key(T, 'NXT'));
      expect(screen.queryByTestId('workbench-exchange-confirm')).toBeNull();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('W6 NXT 카드만 있는 종목의 KRX 행은 그 카드를 KRX 로 전환한다 (gh-trade 「KRX 행도 명시 KRX」)', () => {
    mockRelay = relay({
      limitChasers: [lc(T, { exchange: 'NXT' })],
      rateCrossItems: [rc({ isin: T, name: '삼성전자', code: '005930' })],
    });
    render(<TradingWorkbench />);
    expect(byKey()).toEqual({ [key(T, 'NXT')]: 'false' });
    fireEvent.click(slot('breakout-chip')!);
    expect(cardsInDom()).toHaveLength(1);
    expect(byKey()).toEqual({ [key(T, 'KRX')]: 'true' });
  });
});

describe('TradingWorkbench — 카드 제거 (UI-SPEC E7 · 접근성)', () => {
  it('✕ → 그 카드만 사라지고 포커스가 다음 카드 헤더로, 마지막이면 검색란으로 간다', async () => {
    mockRelay = relay({ rateCrossItems: [rc()] });
    render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    expect(cardsInDom()).toHaveLength(2);

    const close = screen.getByRole('button', { name: '씨젠 카드 닫기' });
    close.focus();
    await act(async () => {
      fireEvent.click(close);
    });
    expect(cardsInDom()).toHaveLength(1);
    expect(document.activeElement).toBe(toggleOf('KR7005930003'));

    const close2 = screen.getByRole('button', { name: '삼성전자 카드 닫기' });
    close2.focus();
    await act(async () => {
      fireEvent.click(close2);
    });
    expect(cardsInDom()).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '종목 추가 검색' }));
  });

  it('등록된 전략이 있는 카드는 확인을 거친다 — 취소하면 카드가 남고, 「카드 닫기」 면 사라진다', () => {
    mockRelay = relay({ limitChasers: [lc('KR7086520004', { name: '에코프로' } as Partial<RelayLimitChaser>)] });
    render(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /카드 닫기$/ }));
    const dialog = screen.getByTestId('workbench-close-confirm');
    expect(dialog.textContent).toContain('서버의 상따 전략은 그대로 동작해요');
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(cardsInDom()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /카드 닫기$/ }));
    fireEvent.click(within(screen.getByTestId('workbench-close-confirm')).getByRole('button', { name: '카드 닫기' }));
    expect(cardsInDom()).toHaveLength(0);
  });
});

describe('TradingWorkbench — 등록된 전략과 ?focus= (D-02 · T-18-53)', () => {
  it('등록된 전략은 처음 보는 키일 때 접힌 카드로 들어온다(자기 키의 계좌·거래소 유지)', () => {
    mockRelay = relay({
      limitChasers: [lc('KR7086520004'), lc('KR7247540008', { exchange: 'NXT', accountNo: '99999999901' })],
    });
    render(<TradingWorkbench />);
    const keys = cardsInDom().map((c) => [c.getAttribute('data-key'), c.getAttribute('data-open')]);
    expect(keys).toEqual([
      [`KR7086520004:${ACCOUNT}:KRX`, 'false'],
      ['KR7247540008:99999999901:NXT', 'false'],
    ]);
  });

  it('?focus={키} 로 들어오면 그 카드가 펼쳐지고, 이후 URL 이 바뀌어도(뒤로가기) 다시 덮지 않는다', () => {
    const focusKey = `KR7247540008:${ACCOUNT}:KRX`;
    searchParams = new URLSearchParams(`focus=${encodeURIComponent(focusKey)}`);
    mockRelay = relay({ limitChasers: [lc('KR7086520004'), lc('KR7247540008')] });
    const { rerender } = render(<TradingWorkbench />);
    const byKey = () =>
      Object.fromEntries(cardsInDom().map((c) => [c.getAttribute('data-key'), c.getAttribute('data-open')]));
    expect(byKey()[focusKey]).toBe('true');
    expect(byKey()[`KR7086520004:${ACCOUNT}:KRX`]).toBe('false');

    // 사용자가 접는다 → 로컬 상태가 정본.
    fireEvent.click(toggleOf('KR7247540008'));
    expect(byKey()[focusKey]).toBe('false');

    // URL 이 바뀌어도(뒤로가기 · 다른 focus) 카드를 다시 펼치지 않는다.
    searchParams = new URLSearchParams(`focus=${encodeURIComponent(`KR7086520004:${ACCOUNT}:KRX`)}`);
    mockRelay = relay({ limitChasers: [...mockRelay.limitChasers] });
    rerender(<TradingWorkbench />);
    expect(byKey()[focusKey]).toBe('false');
    expect(byKey()[`KR7086520004:${ACCOUNT}:KRX`]).toBe('false');
  });

  it('형식이 어긋나거나 등록되지 않은 키의 focus 는 카드를 만들지 않는다(펼침만, 등록 없음)', () => {
    searchParams = new URLSearchParams(`focus=${encodeURIComponent('KR7000000000:1:KRX')}`);
    mockRelay = relay({ limitChasers: [] });
    render(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(0);
    expect((mockRelay.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);

    searchParams = new URLSearchParams('focus=garbage');
    render(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(0);
  });
});

describe('TradingWorkbench — 사이드바 포커스 요청 (18-12 · 이미 /trading 위일 때)', () => {
  const byKey = () =>
    Object.fromEntries(cardsInDom().map((c) => [c.getAttribute('data-key'), c.getAttribute('data-open')]));

  it('요청 이벤트가 오면 그 키의 카드를 펼친다 — 같은 항목을 다시 눌러도(URL 불변) 다시 펼친다', () => {
    const key = `KR7247540008:${ACCOUNT}:KRX`;
    mockRelay = relay({ limitChasers: [lc('KR7086520004'), lc('KR7247540008')] });
    render(<TradingWorkbench />);
    expect(byKey()[key]).toBe('false');

    act(() => requestTradingFocus(key));
    expect(byKey()[key]).toBe('true');
    expect(byKey()[`KR7086520004:${ACCOUNT}:KRX`]).toBe('false');

    fireEvent.click(toggleOf('KR7247540008'));
    expect(byKey()[key]).toBe('false');
    act(() => requestTradingFocus(key));
    expect(byKey()[key]).toBe('true');
  });

  it('스냅샷 전에 온 요청은 등록 전략이 보이는 순간 펼친다', () => {
    const key = `KR7247540008:${ACCOUNT}:KRX`;
    mockRelay = relay({ limitChasers: [] });
    const { rerender } = render(<TradingWorkbench />);
    act(() => requestTradingFocus(key));
    expect(cardsInDom()).toHaveLength(0);

    mockRelay = relay({ limitChasers: [lc('KR7247540008')] });
    rerender(<TradingWorkbench />);
    expect(byKey()[key]).toBe('true');
  });

  it('형식이 어긋나거나 등록되지 않은 키의 요청은 카드를 만들지 않고 아무것도 보내지 않는다', () => {
    mockRelay = relay({ limitChasers: [lc('KR7086520004')] });
    render(<TradingWorkbench />);
    act(() => requestTradingFocus('garbage'));
    act(() => requestTradingFocus(`KR7000000000:${ACCOUNT}:KRX`));
    expect(cardsInDom()).toHaveLength(1);
    expect(byKey()[`KR7086520004:${ACCOUNT}:KRX`]).toBe('false');
    expect((mockRelay.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

describe('TradingWorkbench — WR-07 — 스냅샷 이후의 포커스 미스는 보류하지 않는다 (D-02 · T-18-98)', () => {
  /*
    「64 스냅샷을 받았는가」 는 relay 상태 `limitChaserSnapSeq`(이번 ready 구간에서 받은 확정 lc.snap
    수 · 0 = 아직) 하나로 표현한다 — `status` 나 목록 길이로 추론하지 않는다(인증 ACK 가 lc.snap 보다
    먼저 온다). relay 는 64 전에 lc.snap 을 보내지 않으므로(18-26) 받은 스냅샷은 빈 배열도 확정이다.
  */
  const A = 'KR7086520004';
  const K = 'KR7247540008';
  const kKey = `${K}:${ACCOUNT}:KRX`;
  const byKey = () =>
    Object.fromEntries(cardsInDom().map((c) => [c.getAttribute('data-key'), c.getAttribute('data-open')]));
  const snapped = (limitChasers: RelayLimitChaser[], seq = 1) =>
    relay({ limitChasers, limitChaserSnapSeq: seq } as Partial<RelayShape>);

  it('(확인) 스냅샷 이후 사이드바 요청 K(없음) → 나중에 K 가 등록돼도 접힌 채 들어온다', () => {
    mockRelay = snapped([lc(A)]);
    const { rerender } = render(<TradingWorkbench />);
    act(() => requestTradingFocus(kKey));
    expect(cardsInDom()).toHaveLength(1);

    mockRelay = snapped([lc(A), lc(K)]);
    rerender(<TradingWorkbench />);
    expect(byKey()[kKey]).toBe('false');
  });

  it('(확인) 스냅샷 이후 마운트 · ?focus=K(없음) → 나중에 K 가 등록돼도 접힌 채 들어온다', () => {
    searchParams = new URLSearchParams(`focus=${encodeURIComponent(kKey)}`);
    mockRelay = snapped([lc(A)]);
    const { rerender } = render(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(1);

    mockRelay = snapped([lc(A), lc(K)]);
    rerender(<TradingWorkbench />);
    expect(byKey()[kKey]).toBe('false');
  });

  it('스냅샷 전 요청 K → 스냅샷에 K 가 있으면 펼친다', () => {
    mockRelay = snapped([], 0);
    const { rerender } = render(<TradingWorkbench />);
    act(() => requestTradingFocus(kKey));
    expect(cardsInDom()).toHaveLength(0);

    mockRelay = snapped([lc(A), lc(K)]);
    rerender(<TradingWorkbench />);
    expect(byKey()).toEqual({ [`${A}:${ACCOUNT}:KRX`]: 'false', [kKey]: 'true' });
  });

  it('콜드 세션 — relay 는 64 전에 lc.snap 을 보내지 않는다(snapSeq 0) → 첫 스냅샷에 K 가 있으면 ?focus=K 를 펼친다 (D-02 · 18-26)', () => {
    /*
      18-26 이전 relay 는 콜드 세션에서 빈 캐시를 `lc.snap []` 으로 먼저 내렸고, 이 케이스는 그
      우회(빈 첫 스냅샷 = snapSeq 1 을 모호하게 다룸)를 잠그고 있었다. 이제 relay 는 64 를 받은
      뒤에만 `lc.snap` 을 내리므로 콜드 세션은 첫 64 까지 snapSeq 0 이다.
    */
    searchParams = new URLSearchParams(`focus=${encodeURIComponent(kKey)}`);
    mockRelay = snapped([], 0);
    const { rerender } = render(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(0);

    mockRelay = snapped([lc(A), lc(K)], 1);
    rerender(<TradingWorkbench />);
    expect(byKey()[kKey]).toBe('true');
  });

  it('① 등록 전략 0건 사용자 — 확정 빈 스냅샷 뒤 요청 K 는 버려진다 → 나중에 K 가 등록돼도 접힌 채 (GC-IN-02 · 18-26)', () => {
    mockRelay = snapped([], 1);
    const { rerender } = render(<TradingWorkbench />);
    act(() => requestTradingFocus(kKey));
    expect(cardsInDom()).toHaveLength(0);

    // 60 에코로 K 가 등록된다 — 64 가 아니므로 snapSeq 는 그대로다.
    mockRelay = snapped([lc(K)], 1);
    rerender(<TradingWorkbench />);
    expect(byKey()[kKey]).toBe('false');
  });

  it('② 목록이 있다가 모두 지워진 뒤(snapSeq 2 · 빈 목록) 요청 K 는 버려진다 (GC-IN-02 · 18-26)', () => {
    mockRelay = snapped([lc(A)], 1);
    const { rerender } = render(<TradingWorkbench />);
    mockRelay = snapped([], 2);
    rerender(<TradingWorkbench />);
    act(() => requestTradingFocus(kKey));

    mockRelay = snapped([lc(K)], 2);
    rerender(<TradingWorkbench />);
    expect(byKey()[kKey]).toBe('false');
  });

  it('③ 재연결 — 기준점 0 · 옛 목록 [J] 이 남은 동안의 요청 K 는 보류 → 새 확정 스냅샷 [K] 에서 펼친다 (GC-IN-02 · 18-26)', () => {
    mockRelay = snapped([lc(A)], 1);
    const { rerender } = render(<TradingWorkbench />);
    // 재연결 · 인증 ACK(ready 전환) — 리듀서가 기준점을 0 으로 되돌리고 옛 목록은 남는다.
    mockRelay = snapped([lc(A)], 0);
    rerender(<TradingWorkbench />);
    act(() => requestTradingFocus(kKey));
    expect(byKey()[kKey]).toBeUndefined();

    mockRelay = snapped([lc(K)], 1);
    rerender(<TradingWorkbench />);
    expect(byKey()[kKey]).toBe('true');
  });

  it('스냅샷 전 요청 K → 스냅샷에 K 가 없으면 보류를 버린다 → 나중에 K 가 등록돼도 접힌 채', () => {
    mockRelay = snapped([], 0);
    const { rerender } = render(<TradingWorkbench />);
    act(() => requestTradingFocus(kKey));

    mockRelay = snapped([lc(A)]);
    rerender(<TradingWorkbench />);
    expect(byKey()).toEqual({ [`${A}:${ACCOUNT}:KRX`]: 'false' });

    mockRelay = snapped([lc(A), lc(K)]);
    rerender(<TradingWorkbench />);
    expect(byKey()[kKey]).toBe('false');
  });
});

describe('TradingWorkbench — WR-05 — 같은 종목의 두 번째 전략 (D-03 · T-18-92 · T-18-93)', () => {
  /*
    ★ 이 describe 는 `cardProps` Map 을 쓰지 않는다 — 스텁 기록 축이 카드 1장 = 1 키가 아닐 수 있어
      두 카드를 구분하지 못한다. 단언은 DOM 의 `data-key` · `data-open` 만 본다.
  */
  const X = 'KR7086520004';
  const OTHER = '99999999901';
  const byKey = () =>
    Object.fromEntries(cardsInDom().map((c) => [c.getAttribute('data-key'), c.getAttribute('data-open')]));

  it('같은 ISIN · 같은 계좌의 KRX · NXT 두 전략 → 카드 2장, 각자 자기 키', () => {
    mockRelay = relay({ limitChasers: [lc(X), lc(X, { exchange: 'NXT' })] });
    render(<TradingWorkbench />);
    expect(cardsInDom().map((c) => c.getAttribute('data-key'))).toEqual([
      `${X}:${ACCOUNT}:KRX`,
      `${X}:${ACCOUNT}:NXT`,
    ]);
  });

  it('같은 ISIN 의 계좌 A · B 두 전략 → 카드 2장', () => {
    mockRelay = relay({ limitChasers: [lc(X), lc(X, { accountNo: OTHER })] });
    render(<TradingWorkbench />);
    expect(cardsInDom().map((c) => c.getAttribute('data-key'))).toEqual([
      `${X}:${ACCOUNT}:KRX`,
      `${X}:${OTHER}:KRX`,
    ]);
  });

  it('사이드바 요청 X:A:NXT → NXT 카드만 펼쳐지고 KRX 카드는 접힌 그대로', () => {
    mockRelay = relay({ limitChasers: [lc(X), lc(X, { exchange: 'NXT' })] });
    render(<TradingWorkbench />);
    act(() => requestTradingFocus(`${X}:${ACCOUNT}:NXT`));
    expect(byKey()).toEqual({
      [`${X}:${ACCOUNT}:KRX`]: 'false',
      [`${X}:${ACCOUNT}:NXT`]: 'true',
    });
  });

  it('?focus=X:A:NXT 로 마운트 → 그 키의 카드만 펼쳐진다', () => {
    searchParams = new URLSearchParams(`focus=${encodeURIComponent(`${X}:${ACCOUNT}:NXT`)}`);
    mockRelay = relay({ limitChasers: [lc(X), lc(X, { exchange: 'NXT' })] });
    render(<TradingWorkbench />);
    expect(byKey()).toEqual({
      [`${X}:${ACCOUNT}:KRX`]: 'false',
      [`${X}:${ACCOUNT}:NXT`]: 'true',
    });
  });
});

describe('TradingWorkbench — 카드 키 규칙 (WR-05 · D-07 · D-08 · T-18-94)', () => {
  const S = 'KR7005930003'; // 종목 추가 스텁 · 돌파 칩이 쓰는 종목
  const byKey = () =>
    Object.fromEntries(cardsInDom().map((c) => [c.getAttribute('data-key'), c.getAttribute('data-open')]));

  it('카드가 둘인 ISIN 의 돌파 칩 · 종목 추가는 카드를 늘리지 않고 첫 카드를 펼친다', () => {
    mockRelay = relay({
      limitChasers: [lc(S), lc(S, { exchange: 'NXT' })],
      rateCrossItems: [rc({ isin: S, name: '삼성전자', code: '005930' })],
    });
    render(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(2);

    fireEvent.click(slot('breakout-chip')!);
    expect(cardsInDom()).toHaveLength(2);
    expect(byKey()).toEqual({ [`${S}:${ACCOUNT}:KRX`]: 'true', [`${S}:${ACCOUNT}:NXT`]: 'false' });

    fireEvent.click(toggleOf(S)); // 펼친 KRX 를 다시 접는다 → 스택 맨 앞(2026-09-23 개정) · 스택 [KRX, NXT]
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    expect(cardsInDom()).toHaveLength(2);
    // 펼친 카드가 없으면 배열(= 표시) 첫 카드를 편다 — 방금 접은 KRX 가 스택 맨 앞이라 KRX 가 첫 카드다.
    expect(byKey()).toEqual({ [`${S}:${ACCOUNT}:KRX`]: 'true', [`${S}:${ACCOUNT}:NXT`]: 'false' });
  });

  it('등록 전 카드의 거래소 토글이 다른 카드의 키와 같아지면 토글하지 않고 그 카드를 펼친다', () => {
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' })); // S KRX · 등록 전 · 펼침
    mockRelay = relay({ limitChasers: [lc(S, { exchange: 'NXT' })] }); // 같은 종목 NXT 전략 유입
    rerender(<TradingWorkbench />);
    expect(byKey()).toEqual({ [`${S}:${ACCOUNT}:KRX`]: 'true', [`${S}:${ACCOUNT}:NXT`]: 'false' });

    fireEvent.click(screen.getByRole('button', { name: '삼성전자 NXT' })); // 등록 전 카드의 NXT 토글
    expect(cardsInDom()).toHaveLength(2);
    expect(byKey()).toEqual({ [`${S}:${ACCOUNT}:KRX`]: 'true', [`${S}:${ACCOUNT}:NXT`]: 'true' });
  });

  it('충돌이 없으면 등록 전 카드의 거래소 토글은 그대로 키를 바꾼다(카드는 다시 마운트되지 않는다)', () => {
    render(<TradingWorkbench />);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    const idBefore = [...cardProps.keys()];
    fireEvent.click(screen.getByRole('button', { name: '삼성전자 NXT' }));
    expect(byKey()).toEqual({ [`${S}:${ACCOUNT}:NXT`]: 'true' });
    expect(propsOf(S)?.cardId).toBe(idBefore[0]);
  });

  it('같은 키의 60 에코가 다시 와도 카드가 늘지 않는다 — 등록 전 카드가 그 키면 그 카드가 곧 전략 카드다', () => {
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' })); // S KRX · 등록 전
    expect(cardsInDom()).toHaveLength(1);

    mockRelay = relay({ limitChasers: [lc(S)] });
    rerender(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(1);
    expect(byKey()).toEqual({ [`${S}:${ACCOUNT}:KRX`]: 'true' });

    mockRelay = relay({ limitChasers: [lc(S, { buyEnabled: false })] }); // 같은 키 · 새 에코
    rerender(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(1);
  });

  it('카드 id 축 — 같은 ISIN 두 카드는 id 가 다르고, 한 장을 닫아도 다른 장은 남는다', () => {
    const OTHER = '99999999901';
    mockRelay = relay({
      accounts: [
        { accountNo: ACCOUNT, name: '위탁종합' },
        { accountNo: OTHER, name: '위탁2' },
      ],
      limitChasers: [
        lc(S, { name: '삼성전자' } as Partial<RelayLimitChaser>),
        lc(S, { accountNo: OTHER, name: '삼성전자우' } as Partial<RelayLimitChaser>),
      ],
    });
    render(<TradingWorkbench />);
    const ids = [...cardProps.keys()];
    expect(new Set(ids).size).toBe(2);
    expect(new Set([...cardProps.values()].map((p) => p.isin))).toEqual(new Set([S]));

    // 등록 전략 카드 ✕ → 확인 → 그 카드만 사라진다(다른 계좌 카드는 남는다).
    fireEvent.click(screen.getByRole('button', { name: '삼성전자 카드 닫기' }));
    fireEvent.click(
      within(screen.getByTestId('workbench-close-confirm')).getByRole('button', { name: '카드 닫기' }),
    );
    expect(cardsInDom().map((c) => c.getAttribute('data-key'))).toEqual([`${S}:${OTHER}:KRX`]);
  });
});

describe('TradingWorkbench — 이탈 경고 (한 곳)', () => {
  it('더티 카드가 있으면 다른 경로 링크 클릭에 경고가 뜬다', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockRelay = relay({ rateCrossItems: [rc()] });
    render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);

    const link = document.createElement('a');
    link.href = '/me';
    link.textContent = 'My page';
    // jsdom 은 문서 이동을 구현하지 않는다 — 대상 단계에서 막는다(경고 훅은 캡처 단계라 먼저 본다).
    link.addEventListener('click', (e) => e.preventDefault());
    document.body.appendChild(link);

    fireEvent.click(link);
    expect(confirm).not.toHaveBeenCalled(); // 더티 0 이면 묻지 않는다

    fireEvent.click(screen.getByRole('button', { name: '씨젠 더티' }));
    fireEvent.click(link);
    expect(confirm).toHaveBeenCalledWith(LEAVE_WARNING);
    link.remove();
  });
});

describe('TradingWorkbench — VI 설정 더티는 패널을 접어도 남는다 (hidden 접힘)', () => {
  it('VI 설정을 고친 뒤 VI 패널을 접어도 입력값과 이탈 경고가 유지된다', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockRelay = relay({ viTriggers: { KRX: null, NXT: null } });
    render(<TradingWorkbench />);
    const more = slot('vi-strip-more')!;
    fireEvent.click(more);
    const input = document.querySelector('#vi-krx-rate') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.click(more); // 접기
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(slot('vi-settings-rows')!.closest('[hidden]')).not.toBeNull();

    const link = document.createElement('a');
    link.href = '/me';
    link.addEventListener('click', (e) => e.preventDefault());
    document.body.appendChild(link);
    fireEvent.click(link);
    expect(confirm).toHaveBeenCalledWith(LEAVE_WARNING);
    link.remove();

    fireEvent.click(more); // 다시 펼침
    expect((document.querySelector('#vi-krx-rate') as HTMLInputElement).value).toBe('25');
    expect(document.querySelector('#vi-krx-rate')).toBe(input);
  });
});

describe('TradingWorkbench — 에코를 분배하지 않는다 (T-18-52 · Pitfall 9)', () => {
  it('카드에 전략 배열·라벨 Map 을 prop 으로 내리지 않는다 — 문자열·불리언·안정 콜백뿐', () => {
    const strategies = [lc('KR7086520004'), lc('KR7247540008')];
    mockRelay = relay({ limitChasers: strategies });
    render(<TradingWorkbench />);
    expect(cardProps.size).toBe(2);
    const allowed = new Set([
      'cardId',
      'isin',
      'accountNo',
      'exchange',
      'name',
      'code',
      'open',
      'onToggle',
      'onClose',
      'onExchangeChange',
      'onInfo',
      'onDirtyCountChange',
      'onLogChange',
      'body',
      // quick-260923-onn — 카드 탭: 선택 원주문번호(문자열|null) · 작업대 안정 콜백 2개.
      'selectedOrderNo',
      'onSelectUnfilled',
      'priceOf',
      // quick-260923-pgu — 알림 표시(불리언) · 탭 요청(대상 카드에만 `{ tab, seq }`, 나머지 undefined).
      'alerted',
      'requestedTab',
    ]);
    for (const props of cardProps.values()) {
      for (const [k, v] of Object.entries(props)) {
        expect(allowed.has(k)).toBe(true);
        expect(Array.isArray(v)).toBe(false);
        expect(v instanceof Map).toBe(false);
        expect(v).not.toBe(strategies);
      }
      expect(props).not.toHaveProperty('limitChasers');
      expect(props).not.toHaveProperty('server');
    }
  });

  it('카드 콜백은 모든 카드에 같은 참조(안정 콜백)다', () => {
    mockRelay = relay({ limitChasers: [lc('KR7086520004'), lc('KR7247540008')] });
    render(<TradingWorkbench />);
    const [a, b] = [...cardProps.values()];
    expect(a.onToggle).toBe(b.onToggle);
    expect(a.onClose).toBe(b.onClose);
    expect(a.onDirtyCountChange).toBe(b.onDirtyCountChange);
    // quick-260923-onn — 카드 탭 선택·현재가 콜백도 작업대 한 벌(공용 패널과 같은 참조)이다.
    expect(a.onSelectUnfilled).toBe(b.onSelectUnfilled);
    expect(a.priceOf).toBe(b.priceOf);
  });
});

describe('TradingWorkbench — 개수는 스트립 칩이 말한다 (상태줄은 핵심만)', () => {
  it('상태줄에 개수가 없고, 스트립 라벨은 「돌파」·「VI」 · 돌파 칩 2 · VI 칩 1 · 「미확인 1」 필', () => {
    mockRelay = relay({
      rateCrossItems: [rc(), rc({ isin: 'KR7005930003', name: '삼성전자', code: '005930' })],
      viOrders: [viOrder()],
    });
    render(<TradingWorkbench />);
    const bar = slot('workbench-status-bar')!;
    for (const word of ['돌파', 'VI 발동', '거래 종목', '임계', '미확인', '신규']) {
      expect(bar.textContent).not.toContain(word);
    }
    expect(screen.queryByTestId('stat-breakout')).toBeNull();
    expect(screen.queryByTestId('stat-vi')).toBeNull();
    expect(screen.queryByTestId('stat-cards')).toBeNull();
    expect(screen.getByTestId('breakout-strip-label').textContent).toBe('돌파');
    expect(screen.getByTestId('vi-strip-label').textContent).toBe('VI');
    expect(document.querySelectorAll('[data-slot="breakout-chip"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="vi-chip"]')).toHaveLength(1);
    expect(slot('vi-unconfirmed-pill')!.textContent).toBe('미확인 1');
  });
});

describe('TradingWorkbench — 미체결 행 선택 (D-21)', () => {
  function unf(over: Partial<RelayUnfilled> = {}): RelayUnfilled {
    return {
      orderNo: '3407000065',
      orgOrderNo: '',
      isin: 'KR7086520004',
      side: 'B',
      price: 100_000,
      orderQty: 10,
      filledQty: 0,
      unfilledQty: 10,
      exchange: 'KRX',
      orderTime: '094100',
      queuedStatus: '',
      pendingStatus: '',
      board: '',
      pendingCancelSent: false,
      name: '에코프로',
      code: '086520',
      ...over,
    } as RelayUnfilled;
  }

  /** 카드 본문 렌더 prop 이 만든 `CardBody` 요소의 `selectedUnfilled`. */
  function selectedOf(isin: string): unknown {
    const body = propsOf(isin)?.body as (s: unknown) => { props: { selectedUnfilled: unknown } };
    return body({}).props.selectedUnfilled;
  }

  it('행을 누르면 같은 종목·계좌·거래소 카드의 본문에만 내려가고 그 카드가 펼쳐진다', () => {
    const row = unf();
    mockRelay = relay({
      limitChasers: [lc('KR7086520004'), lc('KR7247540008')],
      accountStates: new Map([
        [
          ACCOUNT,
          { t: 'acct', a: ACCOUNT, snap: true, rm: [], st: '09:41:52', hold: [], unf: [row] },
        ],
      ]) as RelayShape['accountStates'],
    });
    render(<TradingWorkbench />);
    expect(selectedOf('KR7086520004')).toBeNull();

    const tr = screen.getByTestId('shared-panels').querySelector('[data-slot="account-embed-unfilled-row"]')!;
    fireEvent.click(tr.querySelectorAll('td')[3]!);

    expect(selectedOf('KR7086520004')).toMatchObject({ orderNo: '3407000065' });
    expect(selectedOf('KR7247540008')).toBeNull();
    const card = cardsInDom().find((c) => c.getAttribute('data-key')?.startsWith('KR7086520004'))!;
    expect(card.getAttribute('data-open')).toBe('true');
  });

  /*
    ── WR-04 · D-13 · D-21 — 받을 카드 보장 ─────────────────────────────────────────────
    선택 전달 조건(같은 ISIN ∧ 행의 거래소 ∧ 카드 계좌 = 상태줄 계좌)은 그대로 두고, 그 조건을
    만족하는 카드가 없으면 **붙인다**(서버 송신 0 · T-18-99). 같은 ISIN 카드가 둘일 수 있어(WR-05)
    선택 전달은 전략 키로 찾은 카드 prop 으로 단언한다.
  */
  /** 전략 키로 찾은 카드의 본문 `selectedUnfilled`. */
  function selectedOfKey(key: string): unknown {
    const props = [...cardProps.values()].find(
      (p) => `${p.isin}:${p.accountNo}:${p.exchange}` === key,
    );
    const body = props?.body as (s: unknown) => { props: { selectedUnfilled: unknown } };
    return body({}).props.selectedUnfilled;
  }
  const rowEl = (orderNo: string) =>
    Array.from(
      screen.getByTestId('shared-panels').querySelectorAll('[data-slot="account-embed-unfilled-row"]'),
    ).find((tr) => tr.textContent?.includes(orderNo)) as HTMLElement | undefined;
  function acctWith(rows: RelayUnfilled[]): RelayShape['accountStates'] {
    return new Map([
      [ACCOUNT, { t: 'acct', a: ACCOUNT, snap: true, rm: [], st: '09:41:52', hold: [], unf: rows }],
    ]) as RelayShape['accountStates'];
  }
  const byKey = () =>
    Object.fromEntries(cardsInDom().map((c) => [c.getAttribute('data-key'), c.getAttribute('data-open')]));

  it('WR-04 — 카드가 없는 종목의 미체결을 누르면 그 종목 카드가 붙어 펼쳐지고 선택이 그 카드에만 내려간다 · 송신 0', () => {
    const Y = 'KR7247540008';
    const row = unf({ orderNo: '3407000077', isin: Y, name: '에코프로비엠', code: '247540' });
    mockRelay = relay({ limitChasers: [lc('KR7086520004')], accountStates: acctWith([row]) });
    render(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(1);

    fireEvent.click(rowEl('3407000077')!.querySelectorAll('td')[3]!);

    expect(cardsInDom()).toHaveLength(2);
    expect(byKey()[`${Y}:${ACCOUNT}:KRX`]).toBe('true');
    expect(byKey()[`KR7086520004:${ACCOUNT}:KRX`]).toBe('false');
    expect(selectedOfKey(`${Y}:${ACCOUNT}:KRX`)).toMatchObject({ orderNo: '3407000077' });
    expect(selectedOfKey(`KR7086520004:${ACCOUNT}:KRX`)).toBeNull();
    expect(propsOf(Y)?.name).toBe('에코프로비엠');
    expect(propsOf(Y)?.code).toBe('247540');
    expect((mockRelay.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('WR-04 — KRX 카드만 있는 종목의 NXT 미체결을 누르면 NXT 카드가 붙고 선택은 그 카드에만 간다', () => {
    const X = 'KR7086520004';
    const row = unf({ orderNo: '3407000088', exchange: 'NXT' });
    mockRelay = relay({ limitChasers: [lc(X)], accountStates: acctWith([row]) });
    render(<TradingWorkbench />);

    fireEvent.click(rowEl('3407000088')!.querySelectorAll('td')[3]!);

    expect(byKey()).toEqual({ [`${X}:${ACCOUNT}:KRX`]: 'false', [`${X}:${ACCOUNT}:NXT`]: 'true' });
    expect(selectedOfKey(`${X}:${ACCOUNT}:NXT`)).toMatchObject({ orderNo: '3407000088' });
    expect(selectedOfKey(`${X}:${ACCOUNT}:KRX`)).toBeNull();
    expect((mockRelay.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('WR-04 — 정확 일치 카드가 있으면 카드가 늘지 않고 그 카드가 펼쳐진다', () => {
    const X = 'KR7086520004';
    const row = unf({ orderNo: '3407000099', exchange: 'NXT' });
    mockRelay = relay({ limitChasers: [lc(X), lc(X, { exchange: 'NXT' })], accountStates: acctWith([row]) });
    render(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(2);

    fireEvent.click(rowEl('3407000099')!.querySelectorAll('td')[3]!);

    expect(cardsInDom()).toHaveLength(2);
    expect(byKey()).toEqual({ [`${X}:${ACCOUNT}:KRX`]: 'false', [`${X}:${ACCOUNT}:NXT`]: 'true' });
    expect(selectedOfKey(`${X}:${ACCOUNT}:NXT`)).toMatchObject({ orderNo: '3407000099' });
  });

  it('quick-260923-p3k — 접힌 정확 일치 카드를 행으로 펼치면 펼친 카드들의 맨 끝으로 온다', () => {
    const X = 'KR7086520004';
    const Y = 'KR7247540008';
    const Z = 'KR7005930003';
    const row = unf({ orderNo: '3407000111' });
    mockRelay = relay({ limitChasers: [lc(X), lc(Y), lc(Z)], accountStates: acctWith([row]) });
    render(<TradingWorkbench />);
    fireEvent.click(toggleOf(Y));
    fireEvent.click(toggleOf(Z));
    const keys = () => cardsInDom().map((c) => [c.getAttribute('data-key'), c.getAttribute('data-open')]);
    expect(keys()).toEqual([
      [`${Y}:${ACCOUNT}:KRX`, 'true'],
      [`${Z}:${ACCOUNT}:KRX`, 'true'],
      [`${X}:${ACCOUNT}:KRX`, 'false'],
    ]);

    fireEvent.click(rowEl('3407000111')!.querySelectorAll('td')[3]!);

    // 옛 규칙(생성 순서 고정)이면 X 가 펼친 무리의 맨 앞이었다.
    expect(keys()).toEqual([
      [`${Y}:${ACCOUNT}:KRX`, 'true'],
      [`${Z}:${ACCOUNT}:KRX`, 'true'],
      [`${X}:${ACCOUNT}:KRX`, 'true'],
    ]);
    expect(selectedOfKey(`${X}:${ACCOUNT}:KRX`)).toMatchObject({ orderNo: '3407000111' });
  });

  it('quick-260923-onn — 카드 탭 선택은 같은 selectUnfilled 를 탄다 · selectedOrderNo 파생 · 다른 계좌 카드엔 선택 콜백 없음', () => {
    const X = 'KR7086520004';
    const OTHER = '99999999901';
    const row = unf({ orderNo: '3407000055' });
    mockRelay = relay({
      limitChasers: [lc(X), lc('KR7247540008', { accountNo: OTHER })],
      accountStates: acctWith([row]),
    });
    render(<TradingWorkbench />);
    const mine = () => [...cardProps.values()].find((p) => p.isin === X)!;
    const other = [...cardProps.values()].find((p) => p.accountNo === OTHER)!;
    // 카드 계좌 ≠ 상태줄 계좌 → 선택 UI 없음(T-onn-04). 현재가 콜백은 같은 한 벌.
    expect(other.onSelectUnfilled).toBeUndefined();
    expect(other.priceOf).toBe(mine().priceOf);
    expect(mine().selectedOrderNo).toBeNull();

    // 카드 탭이 올리는 것과 같은 호출 — 작업대 선택 상태 하나가 바뀐다(공용 패널과 두 진실 없음).
    act(() => (mine().onSelectUnfilled as (r: RelayUnfilled | null) => void)(row));
    expect(mine().selectedOrderNo).toBe('3407000055');
    expect(selectedOfKey(`${X}:${ACCOUNT}:KRX`)).toMatchObject({ orderNo: '3407000055' });
    expect(rowEl('3407000055')).toHaveAttribute('data-selected', 'true');

    act(() => (mine().onSelectUnfilled as (r: RelayUnfilled | null) => void)(null));
    expect(mine().selectedOrderNo).toBeNull();
    expect(selectedOfKey(`${X}:${ACCOUNT}:KRX`)).toBeNull();
  });

  it('WR-04 — 같은 행을 다시 누르면(해제) 붙은 카드는 남고 선택만 풀린다', () => {
    const Y = 'KR7247540008';
    const row = unf({ orderNo: '3407000077', isin: Y });
    mockRelay = relay({ accountStates: acctWith([row]) });
    render(<TradingWorkbench />);

    fireEvent.click(rowEl('3407000077')!.querySelectorAll('td')[3]!);
    expect(selectedOfKey(`${Y}:${ACCOUNT}:KRX`)).toMatchObject({ orderNo: '3407000077' });

    fireEvent.click(rowEl('3407000077')!.querySelectorAll('td')[3]!);
    expect(cardsInDom()).toHaveLength(1);
    expect(byKey()).toEqual({ [`${Y}:${ACCOUNT}:KRX`]: 'true' });
    expect(selectedOfKey(`${Y}:${ACCOUNT}:KRX`)).toBeNull();
  });

  /*
    ── quick-260925-ptw — 공용 패널 행(미체결 · 잔고) → 카드 보장 · 머리 위로 스크롤 · 헤더 토글 포커스 ──
    카드 탭 안 미체결 클릭은 reveal 하지 않는다(nearest · 포커스 불변). 어느 경로도 송신 0(T-18-99 · D-07).
  */
  describe('공용 패널 행 → 카드 reveal (quick-260925-ptw)', () => {
    type Scroll = { key: string | null; block: ScrollLogicalPosition | undefined };
    let scrolled: Scroll[] = [];
    let original: typeof Element.prototype.scrollIntoView;
    beforeEach(() => {
      scrolled = [];
      original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
        scrolled.push({
          key: this.getAttribute('data-key'),
          block: typeof arg === 'object' ? arg.block : undefined,
        });
      };
    });
    afterEach(() => {
      Element.prototype.scrollIntoView = original;
    });

    function acctWithHold(
      hold: RelayAccountState['hold'],
      unfRows: RelayUnfilled[] = [],
    ): RelayShape['accountStates'] {
      return new Map([
        [ACCOUNT, { t: 'acct', a: ACCOUNT, snap: true, rm: [], st: '09:41:52', hold, unf: unfRows }],
      ]) as RelayShape['accountStates'];
    }
    const holdingRow = (label: string) =>
      Array.from(
        screen.getByTestId('shared-panels').querySelectorAll('[data-slot="account-embed-holding-row"]'),
      ).find((tr) => tr.textContent?.includes(label)) as HTMLElement | undefined;
    const openHoldingsTab = () =>
      fireEvent.mouseDown(within(screen.getByTestId('shared-panels')).getByRole('tab', { name: /^잔고/ }));
    const sendCalls = () => (mockRelay.send as ReturnType<typeof vi.fn>).mock.calls.length;

    it('① 카드 없는 ISIN 잔고 행 → 펼친 카드(상태줄 계좌 · KRX) +1 · block:start 스크롤 · 헤더 토글 포커스 · 송신 0', () => {
      const Y = 'KR7247540008';
      mockRelay = relay({
        limitChasers: [lc('KR7086520004')],
        accountStates: acctWithHold([
          { isin: Y, qty: 10, sellableQty: 10, avgPrice: 100_000, name: '에코프로비엠', code: '247540' },
        ]),
      });
      render(<TradingWorkbench />);
      expect(cardsInDom()).toHaveLength(1);
      openHoldingsTab();

      fireEvent.click(holdingRow('에코프로비엠')!.querySelectorAll('td')[1]!);

      expect(cardsInDom()).toHaveLength(2);
      expect(byKey()[`${Y}:${ACCOUNT}:KRX`]).toBe('true');
      expect(propsOf(Y)?.name).toBe('에코프로비엠');
      expect(propsOf(Y)?.code).toBe('247540');
      expect(scrolled.at(-1)).toEqual({ key: `${Y}:${ACCOUNT}:KRX`, block: 'start' });
      expect(document.activeElement).toBe(toggleOf(Y));
      expect(sendCalls()).toBe(0);
    });

    it('② 카드가 이미 있는 ISIN 잔고 행 → 카드 수 불변 · 그 카드 펼침 · 같은 스크롤·포커스', () => {
      const X = 'KR7086520004';
      mockRelay = relay({
        limitChasers: [lc(X), lc('KR7005930003')],
        accountStates: acctWithHold([
          { isin: X, qty: 5, sellableQty: 5, avgPrice: 90_000, name: '에코프로', code: '086520' },
        ]),
      });
      render(<TradingWorkbench />);
      expect(byKey()[`${X}:${ACCOUNT}:KRX`]).toBe('false');
      openHoldingsTab();

      // 첫 셀의 「카드 열기」 핸들(버튼)을 눌러도 행 한 경로로 1회다.
      fireEvent.click(within(holdingRow('에코프로')!).getByRole('button', { name: '에코프로 카드 열기' }));

      expect(cardsInDom()).toHaveLength(2);
      expect(byKey()[`${X}:${ACCOUNT}:KRX`]).toBe('true');
      expect(scrolled.at(-1)).toEqual({ key: `${X}:${ACCOUNT}:KRX`, block: 'start' });
      expect(document.activeElement).toBe(toggleOf(X));
      expect(sendCalls()).toBe(0);
    });

    it('③ 하단 미체결 행 → WR-04 카드 보장 · 선택 전달 + block:start · 헤더 토글 포커스 · 재클릭(해제)은 스크롤·포커스 없음', () => {
      const Y = 'KR7247540008';
      const row = unf({ orderNo: '3407000077', isin: Y, name: '에코프로비엠', code: '247540' });
      mockRelay = relay({ limitChasers: [lc('KR7086520004')], accountStates: acctWith([row]) });
      render(<TradingWorkbench />);

      fireEvent.click(rowEl('3407000077')!.querySelectorAll('td')[3]!);

      expect(cardsInDom()).toHaveLength(2);
      expect(byKey()[`${Y}:${ACCOUNT}:KRX`]).toBe('true');
      expect(selectedOfKey(`${Y}:${ACCOUNT}:KRX`)).toMatchObject({ orderNo: '3407000077' });
      expect(scrolled.at(-1)).toEqual({ key: `${Y}:${ACCOUNT}:KRX`, block: 'start' });
      expect(document.activeElement).toBe(toggleOf(Y));

      const before = scrolled.length;
      (document.activeElement as HTMLElement).blur();
      fireEvent.click(rowEl('3407000077')!.querySelectorAll('td')[3]!); // 해제
      expect(selectedOfKey(`${Y}:${ACCOUNT}:KRX`)).toBeNull();
      expect(scrolled).toHaveLength(before);
      expect(document.activeElement).not.toBe(toggleOf(Y));
      expect(sendCalls()).toBe(0);
    });

    it('④ 카드 「미체결」 탭 행 → 선택만 · block:nearest · 포커스는 헤더 토글로 가지 않는다 · 송신 0', () => {
      const X = 'KR7086520004';
      const row = unf({ orderNo: '3407000055' });
      mockRelay = relay({ limitChasers: [lc(X)], accountStates: acctWith([row]) });
      render(<TradingWorkbench />);
      const mine = [...cardProps.values()].find((p) => p.isin === X)!;

      act(() => (mine.onSelectUnfilled as (r: RelayUnfilled | null) => void)(row));

      expect(selectedOfKey(`${X}:${ACCOUNT}:KRX`)).toMatchObject({ orderNo: '3407000055' });
      expect(scrolled.at(-1)).toEqual({ key: `${X}:${ACCOUNT}:KRX`, block: 'nearest' });
      expect(document.activeElement).not.toBe(toggleOf(X));
      expect(sendCalls()).toBe(0);
    });

    it('⑤ 공용 패널이 onPickHolding 을 받는다 · 카드 탭 선택 콜백과 공용 패널 선택 콜백은 다른 함수다(reveal 차이)', () => {
      const X = 'KR7086520004';
      mockRelay = relay({ limitChasers: [lc(X)], accountStates: acctWith([unf()]) });
      render(<TradingWorkbench />);
      expect(typeof sharedPanelsProps.last?.onPickHolding).toBe('function');
      expect(sharedPanelsProps.last?.onSelectUnfilled).not.toBe(propsOf(X)?.onSelectUnfilled);
    });
  });
});

describe('cardForUnfilled — 미체결 행을 받을 카드 판정 (WR-04 · 판정의 유일 지점)', () => {
  const X = 'KR7086520004';
  const OTHER = '99999999901';
  const card = (over: Partial<WorkbenchCard>): WorkbenchCard => ({
    id: 'wb-card-1',
    isin: X,
    accountNo: ACCOUNT,
    exchange: 'KRX',
    open: false,
    ...over,
  });
  const row = (over: Partial<RelayUnfilled> = {}) =>
    ({ orderNo: '1', isin: X, exchange: 'KRX', name: '에코프로', code: '086520', ...over }) as RelayUnfilled;

  it('정확 일치(ISIN ∧ 거래소 ∧ 상태줄 계좌) 카드가 있으면 그 카드 id', () => {
    const cards = [
      card({ id: 'wb-card-1', exchange: 'KRX' }),
      card({ id: 'wb-card-2', exchange: 'NXT' }),
    ];
    expect(cardForUnfilled(cards, row({ exchange: 'NXT' }), ACCOUNT)).toEqual({
      kind: 'existing',
      id: 'wb-card-2',
    });
  });

  it('거래소 · 계좌가 어긋난 카드뿐이면 행의 ISIN · 거래소 · 상태줄 계좌로 펼친 새 카드 모양', () => {
    const cards = [card({ exchange: 'KRX' }), card({ id: 'wb-card-2', exchange: 'NXT', accountNo: OTHER })];
    expect(cardForUnfilled(cards, row({ exchange: 'NXT' }), ACCOUNT)).toEqual({
      kind: 'new',
      card: { isin: X, accountNo: ACCOUNT, exchange: 'NXT', open: true, name: '에코프로', code: '086520' },
    });
  });

  it('카드가 없으면 새 카드 모양', () => {
    expect(cardForUnfilled([], row(), ACCOUNT)).toMatchObject({
      kind: 'new',
      card: { isin: X, accountNo: ACCOUNT, exchange: 'KRX', open: true },
    });
  });
});

describe('TradingWorkbench — VI 몫 서버 거부 (18-13 · T-16-07 · Pitfall 9)', () => {
  const msg = (src: string, m: string, i = '') =>
    ({ t: 'msg', lv: 'ERROR', i, a: ACCOUNT, src, kind: '', m, receivedAt: '13:42:05' }) as never;

  it('VI 몫 ERROR 는 VI 패널 스트립 줄 아래 role="alert" 로 서고(접혀도 보인다), 상따 몫·relay 자기 거부는 서지 않는다', () => {
    mockRelay = relay({
      messages: [
        msg('Relay', '요청 형식이 올바르지 않습니다'),
        msg('Account', '주문 가능 금액이 부족합니다', 'KR7005930003'),
      ],
    });
    const { rerender } = render(<TradingWorkbench />);
    expect(slot('vi-server-error')).toBeNull();

    mockRelay = relay({
      messages: [
        msg('Account', 'VI 주문금액이 0 입니다'),
        msg('Relay', '요청 형식이 올바르지 않습니다'),
        msg('Account', '주문 가능 금액이 부족합니다', 'KR7005930003'),
      ],
    });
    rerender(<TradingWorkbench />);
    const el = slot('vi-server-error')!;
    expect(el).not.toBeNull();
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.textContent).toContain('VI 주문금액이 0 입니다');
    expect(el.textContent).not.toContain('주문 가능 금액이 부족합니다');
    expect(el.textContent).not.toContain('요청 형식이 올바르지 않습니다');
    // VI 패널 안에 서고, 패널이 접혀 있어도 숨지 않는다(안전 신호 가시성).
    expect(slot('vi-trigger')!.contains(el)).toBe(true);
    expect(slot('vi-strip-more')!.getAttribute('aria-expanded')).toBe('false');
    expect(el.closest('[hidden]')).toBeNull();
  });
});

describe('TradingWorkbench — R3-WR-02 — 잠금은 RelayProvider 가 들고 작업대는 ✕ 에만 읽는다', () => {
  type OrderLockKind = import('@/lib/relay-provider').OrderLockKind;
  const SAMSUNG = 'KR7005930003';
  const SEEGENE = 'KR7096530001';
  const ECOPRO = 'KR7086520004';
  const OTHER_ACCOUNT = '99999999901';
  const UNKNOWN_BODY =
    '미체결 목록에서 접수 여부를 확인하세요. 카드를 닫았다 다시 열거나 다른 화면에 다녀와도 이 종목의 주문 버튼은 잠긴 채로 남아요. 로그아웃하거나 새로고침하면 풀려요.';
  const REGISTERED_BODY =
    '카드를 닫아도 서버의 상따 전략은 그대로 동작해요. 전략을 멈추려면 카드에서 매수·매도 스위치를 끄세요.';

  /** 지금 격자에 있는 카드 id — 스텁 토글 id(`strategy-card-{id}-toggle`)에서 읽는다(지운 카드 기록 제외). */
  const liveIds = () =>
    cardsInDom().map((c) =>
      c.querySelector('button[aria-expanded]')!.id.replace(/^strategy-card-/, '').replace(/-toggle$/, ''),
    );
  /** 전략 키로 찾은 **살아 있는** 카드의 본문 `CardBody` 요소 props(렌더 함수가 만든 요소). */
  function bodyOfKey(key: string): Record<string, unknown> | undefined {
    const live = new Set(liveIds());
    const hit = [...cardProps.entries()].find(
      ([id, p]) => live.has(id) && `${p.isin}:${p.accountNo}:${p.exchange}` === key,
    );
    if (hit === undefined) return undefined;
    const body = hit[1].body as (s: unknown) => { props: Record<string, unknown> };
    return body({}).props;
  }
  /** 본문 요소 props 중 잠금을 말하는 키 — 작업대는 잠금을 본문에 내리지 않는다(원천은 Provider 하나). */
  const lockPropsOf = (key: string) =>
    Object.keys(bodyOfKey(key) ?? {}).filter((k) => /lock|unknown/i.test(k));
  const keyOf = (isin: string, exchange: 'KRX' | 'NXT' = 'KRX', account = ACCOUNT) =>
    `${isin}:${account}:${exchange}`;
  const sendCalls = () => (mockRelay.send as ReturnType<typeof vi.fn>).mock.calls.length;
  const sendOrderSpy = () => mockRelay.sendOrder as unknown as ReturnType<typeof vi.fn>;

  /**
   * Provider 잠금 하네스 — `RelayProvider.orderLocks` 가 바뀐 것처럼 컨텍스트 값을 갈아 끼우고 다시
   * 렌더한다. 같은 `send` · `sendOrder` 스파이를 이어 쓴다(송신 0 단언).
   */
  function withLocks(
    rerender: (ui: import('react').ReactElement) => void,
    entries: [string, OrderLockKind][],
  ): ReadonlyMap<string, OrderLockKind> {
    const locks: ReadonlyMap<string, OrderLockKind> = new Map(entries);
    mockRelay = { ...mockRelay, orderLocks: locks };
    rerender(<TradingWorkbench />);
    return locks;
  }

  function acctWith(rows: RelayUnfilled[]): RelayShape['accountStates'] {
    return new Map([
      [ACCOUNT, { t: 'acct', a: ACCOUNT, snap: true, rm: [], st: '09:41:52', hold: [], unf: rows }],
    ]) as RelayShape['accountStates'];
  }
  function unfRow(over: Partial<RelayUnfilled> = {}): RelayUnfilled {
    return {
      orderNo: '3407000111',
      orgOrderNo: '',
      isin: SAMSUNG,
      side: 'B',
      price: 70_000,
      orderQty: 10,
      filledQty: 0,
      unfilledQty: 10,
      exchange: 'KRX',
      orderTime: '094100',
      queuedStatus: '',
      pendingStatus: '',
      board: '',
      pendingCancelSent: false,
      name: '삼성전자',
      code: '005930',
      ...over,
    } as RelayUnfilled;
  }
  const clickRow = (orderNo: string) => {
    const tr = Array.from(
      screen.getByTestId('shared-panels').querySelectorAll('[data-slot="account-embed-unfilled-row"]'),
    ).find((el) => el.textContent?.includes(orderNo)) as HTMLElement;
    fireEvent.click(tr.querySelectorAll('td')[3]!);
  };
  const closeBtn = (label: string) => screen.getByRole('button', { name: `${label} 카드 닫기` });
  const dialogEl = () => screen.getByTestId('workbench-close-confirm');
  const confirmClose = () =>
    fireEvent.click(within(dialogEl()).getByRole('button', { name: '카드 닫기' }));
  const addBtn = () => within(slot('stock-add-bar')!).getByRole('button', { name: '추가' });

  beforeEach(() => {
    mockRelay = relay({ sendOrder: vi.fn() } as Partial<RelayShape>);
  });

  it('① 결과 모름 키 카드 ✕ → data-reason="unknown" · 제목 · 본문 원문 → 「취소」 면 남고 「카드 닫기」 면 사라진다', () => {
    mockRelay = relay({ rateCrossItems: [rc()], sendOrder: vi.fn() } as Partial<RelayShape>);
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    withLocks(rerender, [[keyOf(SEEGENE), 'result-unknown']]);

    fireEvent.click(closeBtn('씨젠'));
    const dialog = dialogEl();
    expect(dialog.getAttribute('data-reason')).toBe('unknown');
    expect(within(dialog).getByRole('heading', { name: '결과를 모르는 주문이 있어요' })).toBeInTheDocument();
    expect(dialog.textContent).toContain(UNKNOWN_BODY);
    // 등록 전략이 없으면 등록 전략 문장은 붙지 않는다 · 「실패」 없음.
    expect(dialog.textContent).not.toContain('서버의 상따 전략은 그대로 동작해요');
    expect(dialog.textContent).not.toMatch(/실패/);
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(cardsInDom()).toHaveLength(1);

    fireEvent.click(closeBtn('씨젠'));
    confirmClose();
    expect(cardsInDom()).toHaveLength(0);
    expect(sendCalls()).toBe(0);
    expect(sendOrderSpy()).not.toHaveBeenCalled();
  });

  it('② 진행 중(in-flight) 키 카드 ✕ → 같은 unknown 다이얼로그 (R3-IN-02)', () => {
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(addBtn());
    withLocks(rerender, [[keyOf(SAMSUNG), 'in-flight']]);

    fireEvent.click(closeBtn('삼성전자'));
    const dialog = dialogEl();
    expect(dialog.getAttribute('data-reason')).toBe('unknown');
    expect(within(dialog).getByRole('heading', { name: '결과를 모르는 주문이 있어요' })).toBeInTheDocument();
    expect(dialog.textContent).toContain(UNKNOWN_BODY);
    confirmClose();
    expect(cardsInDom()).toHaveLength(0);
    expect(sendCalls()).toBe(0);
    expect(sendOrderSpy()).not.toHaveBeenCalled();
  });

  it.each([['result-unknown'], ['in-flight']] as const)(
    '③ %s 키 카드를 닫은 뒤 돌파 칩 · 종목 추가 · 미체결 선택으로 재추가 → 새 카드가 서고 본문 props 에 잠금이 없으며 orderLocks 는 그대로다',
    (kind) => {
      mockRelay = relay({
        rateCrossItems: [rc({ isin: SAMSUNG, name: '삼성전자', code: '005930' })],
        accountStates: acctWith([unfRow()]),
        sendOrder: vi.fn(),
      } as Partial<RelayShape>);
      const { rerender } = render(<TradingWorkbench />);
      const key = keyOf(SAMSUNG);
      fireEvent.click(addBtn());
      const locks = withLocks(rerender, [[key, kind]]);
      const before = [...locks];

      const closeAndGone = () => {
        const firstId = liveIds()[0];
        fireEvent.click(closeBtn('삼성전자'));
        expect(dialogEl().getAttribute('data-reason')).toBe('unknown');
        confirmClose();
        expect(cardsInDom()).toHaveLength(0);
        return firstId;
      };
      const reopened = (prevId: string) => {
        expect(cardsInDom()).toHaveLength(1);
        expect(cardsInDom()[0].getAttribute('data-key')).toBe(key);
        expect(liveIds()[0]).not.toBe(prevId); // 새 카드(새 id)
        expect(bodyOfKey(key)).toBeDefined();
        expect(lockPropsOf(key)).toEqual([]);
      };

      // 돌파 칩
      let prev = closeAndGone();
      fireEvent.click(slot('breakout-chip')!);
      reopened(prev);
      // 종목 추가
      prev = closeAndGone();
      fireEvent.click(addBtn());
      reopened(prev);
      // 미체결 선택(cardForUnfilled 새 카드)
      prev = closeAndGone();
      clickRow('3407000111');
      reopened(prev);

      // 재추가 카드도 ✕ 판정은 같은 컨텍스트를 읽는다.
      fireEvent.click(closeBtn('삼성전자'));
      expect(dialogEl().getAttribute('data-reason')).toBe('unknown');

      expect(mockRelay.orderLocks).toBe(locks);
      expect([...locks]).toEqual(before);
      expect(sendCalls()).toBe(0);
      expect(sendOrderSpy()).not.toHaveBeenCalled();
    },
  );

  it('④ 잠기지 않은 미등록 카드 ✕ → 다이얼로그 없이 즉시 사라진다', () => {
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(addBtn());
    // 다른 키만 잠겨 있다.
    withLocks(rerender, [[keyOf(SEEGENE), 'result-unknown']]);
    fireEvent.click(closeBtn('삼성전자'));
    expect(screen.queryByTestId('workbench-close-confirm')).toBeNull();
    expect(cardsInDom()).toHaveLength(0);
    expect(sendCalls()).toBe(0);
  });

  it('⑤ 잠김 + 등록 전략 카드 ✕ → unknown 다이얼로그에 등록 전략 문장이 한 줄 더 붙는다', () => {
    mockRelay = relay({
      limitChasers: [lc(ECOPRO, { name: '에코프로' } as Partial<RelayLimitChaser>)],
      sendOrder: vi.fn(),
    } as Partial<RelayShape>);
    const { rerender } = render(<TradingWorkbench />);
    withLocks(rerender, [[keyOf(ECOPRO), 'result-unknown']]);

    fireEvent.click(screen.getByRole('button', { name: /카드 닫기$/ }));
    const dialog = dialogEl();
    expect(dialog.getAttribute('data-reason')).toBe('unknown');
    expect(within(dialog).getByRole('heading', { name: '결과를 모르는 주문이 있어요' })).toBeInTheDocument();
    expect(dialog.textContent).toContain(UNKNOWN_BODY);
    expect(dialog.textContent).toContain(REGISTERED_BODY);
    confirmClose();
    expect(cardsInDom()).toHaveLength(0);
    expect(sendCalls()).toBe(0);
    expect(sendOrderSpy()).not.toHaveBeenCalled();
  });

  it('⑥ 잠기지 않은 등록 전략 카드는 기존 data-reason="registered" 다이얼로그 그대로다', () => {
    mockRelay = relay({ limitChasers: [lc(ECOPRO)], sendOrder: vi.fn() } as Partial<RelayShape>);
    render(<TradingWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: /카드 닫기$/ }));
    const dialog = dialogEl();
    expect(dialog.getAttribute('data-reason')).toBe('registered');
    expect(within(dialog).getByRole('heading', { name: '등록된 전략이 있는 카드예요' })).toBeInTheDocument();
    expect(dialog.textContent).toContain(REGISTERED_BODY);
    expect(dialog.textContent).not.toContain('결과를 모르는 주문');
  });

  it('⑦ 키 범위 — 다른 계좌 키 잠금은 이 카드 ✕ 에 영향이 없고, 같은 계좌·ISIN 의 NXT 잠금은 NXT 카드가 옆에서 보여주므로 KRX 카드 ✕ 는 등록 전략 다이얼로그 · NXT 카드 ✕ 는 「NXT」 경고 (quick-260923-pgv · quick-260923-que)', () => {
    mockRelay = relay({
      limitChasers: [lc(SAMSUNG), lc(SAMSUNG, { exchange: 'NXT' }), lc(SAMSUNG, { accountNo: OTHER_ACCOUNT })],
      sendOrder: vi.fn(),
    } as Partial<RelayShape>);
    const { rerender } = render(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(3);
    withLocks(rerender, [
      [keyOf(SAMSUNG, 'NXT'), 'result-unknown'],
      [keyOf(SAMSUNG, 'KRX', OTHER_ACCOUNT), 'in-flight'],
    ]);
    // KRX · 이 계좌 카드(첫 카드) — 자기 키는 안 잠겼고, 같은 계좌·ISIN 의 NXT 키 잠금은 옆의 NXT
    // 카드가 지금 보여주고 있다 → 이 카드를 닫아도 잠긴 주문이 시야에서 사라지지 않으니 unknown 이
    // 아니다(quick-260923-que). 다른 계좌 KRX 잠금도 섞이지 않는다 → 등록 전략 다이얼로그만.
    fireEvent.click(screen.getAllByRole('button', { name: /카드 닫기$/ })[0]);
    expect(dialogEl().getAttribute('data-reason')).toBe('registered');
    expect(dialogEl().textContent).not.toContain(closeLockedExchangesLine(['NXT']));
    expect(dialogEl().textContent).toContain(REGISTERED_BODY);
    fireEvent.click(within(dialogEl()).getByRole('button', { name: '취소' }));
    // NXT 카드는 자기 키가 잠겼다 → unknown.
    fireEvent.click(screen.getAllByRole('button', { name: /카드 닫기$/ })[1]);
    expect(dialogEl().getAttribute('data-reason')).toBe('unknown');
    expect(dialogEl().getAttribute('data-locked-exchanges')).toBe('NXT');
    fireEvent.click(within(dialogEl()).getByRole('button', { name: '취소' }));
    expect(cardsInDom()).toHaveLength(3);
    // 본문은 어느 카드도 잠금을 모른다.
    for (const k of [keyOf(SAMSUNG), keyOf(SAMSUNG, 'NXT'), keyOf(SAMSUNG, 'KRX', OTHER_ACCOUNT)]) {
      expect(lockPropsOf(k)).toEqual([]);
    }
  });

  it('⑦-b 잠금은 요청의 키에 걸리지만 ✕ 는 두 거래소 키를 본다 — NXT 키만 잠겨도 KRX 미등록 카드 ✕ 는 「잠긴 거래소: NXT」 로 경고한다 (quick-260923-pgv)', () => {
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(addBtn()); // KRX 카드
    withLocks(rerender, [[keyOf(SAMSUNG, 'NXT'), 'result-unknown']]);
    fireEvent.click(closeBtn('삼성전자'));
    expect(dialogEl().getAttribute('data-reason')).toBe('unknown');
    expect(dialogEl().textContent).toContain(closeLockedExchangesLine(['NXT']));
    // 등록 전략이 없으니 등록 전략 문장은 붙지 않는다.
    expect(dialogEl().textContent).not.toContain(REGISTERED_BODY);
    confirmClose();
    expect(cardsInDom()).toHaveLength(0);
    expect(sendCalls()).toBe(0);
  });

  it('⑦-e KRX 키가 잠긴 카드를 NXT 로 바꾼 뒤 ✕ → 「잠긴 거래소: KRX」 unknown 다이얼로그 · 잠금은 그대로 (quick-260923-pgv)', () => {
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(addBtn()); // KRX 카드
    const locks = withLocks(rerender, [[keyOf(SAMSUNG), 'result-unknown']]);
    fireEvent.click(screen.getByRole('button', { name: '삼성전자 NXT' }));
    expect(cardsInDom()[0].getAttribute('data-key')).toBe(keyOf(SAMSUNG, 'NXT'));

    fireEvent.click(closeBtn('삼성전자'));
    const dialog = dialogEl();
    expect(dialog.getAttribute('data-reason')).toBe('unknown');
    expect(dialog.getAttribute('data-locked-exchanges')).toBe('KRX');
    expect(closeLockedExchangesLine(['KRX'])).toBe('잠긴 거래소: KRX');
    expect(dialog.textContent).toContain('잠긴 거래소: KRX');
    expect(dialog.textContent).toContain(UNKNOWN_BODY);
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(cardsInDom()).toHaveLength(1);
    expect(mockRelay.orderLocks).toBe(locks);
    expect(sendCalls()).toBe(0);
    expect(sendOrderSpy()).not.toHaveBeenCalled();
  });

  it('⑦-f 두 거래소 키가 모두 잠겼으면 「잠긴 거래소: KRX · NXT」 (quick-260923-pgv)', () => {
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(addBtn());
    withLocks(rerender, [
      [keyOf(SAMSUNG, 'NXT'), 'in-flight'],
      [keyOf(SAMSUNG), 'result-unknown'],
    ]);
    fireEvent.click(closeBtn('삼성전자'));
    expect(dialogEl().getAttribute('data-locked-exchanges')).toBe('KRX NXT');
    expect(dialogEl().textContent).toContain('잠긴 거래소: KRX · NXT');
  });

  /** 미등록 KRX 카드 + 같은 종목 NXT 카드(NXT 미체결 행으로 붙인다 · WR-04) · NXT 키 잠금. */
  function krxAndNxtCardsWithNxtLock() {
    mockRelay = relay({
      accountStates: acctWith([unfRow({ orderNo: '3407000222', exchange: 'NXT' })]),
      sendOrder: vi.fn(),
    } as Partial<RelayShape>);
    const view = render(<TradingWorkbench />);
    fireEvent.click(addBtn()); // KRX 카드 · 미등록
    clickRow('3407000222'); // 같은 종목 NXT 카드가 붙는다 · 미등록
    expect(cardsInDom().map((c) => c.getAttribute('data-key')).sort()).toEqual(
      [keyOf(SAMSUNG), keyOf(SAMSUNG, 'NXT')].sort(),
    );
    const locks = withLocks(view.rerender, [[keyOf(SAMSUNG, 'NXT'), 'result-unknown']]);
    return { locks };
  }
  const closeOfKey = (key: string) =>
    within(cardsInDom().find((c) => c.getAttribute('data-key') === key)!).getByRole('button', {
      name: /카드 닫기$/,
    });

  it('⑦-g 다른 카드가 그 거래소 키를 보여주면 ✕ 경고에서 뺀다 — KRX 카드는 즉시 닫히고, 남은 NXT 카드는 자기 키로 「NXT」 경고 (quick-260923-que)', () => {
    const { locks } = krxAndNxtCardsWithNxtLock();
    // (a) KRX 카드 ✕ — NXT 잠금은 옆 NXT 카드가 보여준다 · 미등록 → 다이얼로그 없이 즉시 닫힘.
    fireEvent.click(closeOfKey(keyOf(SAMSUNG)));
    expect(screen.queryByTestId('workbench-close-confirm')).toBeNull();
    expect(cardsInDom()).toHaveLength(1);
    expect(cardsInDom()[0].getAttribute('data-key')).toBe(keyOf(SAMSUNG, 'NXT'));
    // (b) 남은 NXT 카드 ✕ — 자기 키 잠금은 언제나 포함.
    fireEvent.click(closeOfKey(keyOf(SAMSUNG, 'NXT')));
    expect(dialogEl().getAttribute('data-reason')).toBe('unknown');
    expect(dialogEl().getAttribute('data-locked-exchanges')).toBe('NXT');
    expect(dialogEl().textContent).toContain(closeLockedExchangesLine(['NXT']));
    // 잠금은 그대로 · 송신 0.
    expect(mockRelay.orderLocks).toBe(locks);
    expect(sendCalls()).toBe(0);
    expect(sendOrderSpy()).not.toHaveBeenCalled();
  });

  it('⑦-g 반대 순서 — 잠금을 보여주던 NXT 카드를 먼저 닫으면 KRX 카드 ✕ 는 다시 「잠긴 거래소: NXT」 로 경고한다 (quick-260923-que)', () => {
    const { locks } = krxAndNxtCardsWithNxtLock();
    fireEvent.click(closeOfKey(keyOf(SAMSUNG, 'NXT')));
    expect(dialogEl().getAttribute('data-reason')).toBe('unknown');
    confirmClose();
    expect(cardsInDom()).toHaveLength(1);
    expect(cardsInDom()[0].getAttribute('data-key')).toBe(keyOf(SAMSUNG));

    fireEvent.click(closeOfKey(keyOf(SAMSUNG)));
    expect(dialogEl().getAttribute('data-reason')).toBe('unknown');
    expect(dialogEl().getAttribute('data-locked-exchanges')).toBe('NXT');
    expect(dialogEl().textContent).toContain(closeLockedExchangesLine(['NXT']));
    expect(mockRelay.orderLocks).toBe(locks);
    expect(sendCalls()).toBe(0);
  });

  it('⑦-c 접기/펴기 · 상태줄 계좌 A→B→A 전환 뒤에도 ✕ 는 같은 컨텍스트 잠금을 읽는다', () => {
    mockRelay = relay({
      accounts: [
        { accountNo: ACCOUNT, name: '위탁종합' },
        { accountNo: OTHER_ACCOUNT, name: 'ISA' },
      ],
      sendOrder: vi.fn(),
    } as Partial<RelayShape>);
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(addBtn());
    withLocks(rerender, [[keyOf(SAMSUNG), 'result-unknown']]);

    fireEvent.click(toggleOf(SAMSUNG));
    fireEvent.click(toggleOf(SAMSUNG));
    const pill = screen.getByRole('combobox', { name: '계좌' });
    fireEvent.change(pill, { target: { value: OTHER_ACCOUNT } });
    fireEvent.change(pill, { target: { value: ACCOUNT } });

    fireEvent.click(closeBtn('삼성전자'));
    expect(dialogEl().getAttribute('data-reason')).toBe('unknown');
    expect(lockPropsOf(keyOf(SAMSUNG))).toEqual([]);
    expect(sendCalls()).toBe(0);
  });

  it('⑦-d DMA 게이트가 섰다 걷혀도(작업대 본문 언마운트) 잠금은 컨텍스트에 있고 다시 연 카드의 ✕ 가 그것을 읽는다', () => {
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(addBtn());
    const locks = withLocks(rerender, [[keyOf(SAMSUNG), 'result-unknown']]);

    mockRelay = { ...mockRelay, status: 'unauthorized' } as RelayShape;
    rerender(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(0);
    expect(slot('stock-add-bar')).toBeNull();

    mockRelay = { ...mockRelay, status: 'ready' } as RelayShape;
    rerender(<TradingWorkbench />);
    fireEvent.click(addBtn());
    expect(lockPropsOf(keyOf(SAMSUNG))).toEqual([]);
    fireEvent.click(closeBtn('삼성전자'));
    expect(dialogEl().getAttribute('data-reason')).toBe('unknown');
    expect(mockRelay.orderLocks).toBe(locks);
  });

  it('⑧ 카드 본문에는 전략 배열 · 라벨 Map · 잠금이 내려가지 않는다 — 잠금이 있어도 없어도 본문 props 키가 같다 · 송신 0', () => {
    mockRelay = relay({ limitChasers: [lc(SAMSUNG), lc(SEEGENE)], sendOrder: vi.fn() } as Partial<RelayShape>);
    const { rerender } = render(<TradingWorkbench />);
    const keysBefore = Object.keys(bodyOfKey(keyOf(SAMSUNG))!).sort();
    withLocks(rerender, [
      [keyOf(SAMSUNG), 'result-unknown'],
      [keyOf(SEEGENE), 'in-flight'],
    ]);
    expect(Object.keys(bodyOfKey(keyOf(SAMSUNG))!).sort()).toEqual(keysBefore);
    for (const k of [keyOf(SAMSUNG), keyOf(SEEGENE)]) {
      const props = bodyOfKey(k)!;
      expect(lockPropsOf(k)).toEqual([]);
      for (const v of Object.values(props)) {
        expect(v instanceof Map).toBe(false);
        expect(Array.isArray(v)).toBe(false);
      }
    }
    expect(sendCalls()).toBe(0);
    expect(sendOrderSpy()).not.toHaveBeenCalled();
  });
});

describe('fillAccountCards — 계좌 채움 (GC-IN-05 · D-07 · 순수 함수)', () => {
  const X = 'KR7005930003';
  const A = ACCOUNT;
  const card = (over: Partial<WorkbenchCard>): WorkbenchCard => ({
    id: 'wb-card-1',
    isin: X,
    accountNo: '',
    exchange: 'KRX',
    open: true,
    ...over,
  });

  it('사용자 카드(X::KRX · 펼침)와 같은 키의 등록 카드(X:A:KRX · 접힘) → 사용자 카드는 치우고 등록 카드가 펼침을 잇는다', () => {
    const user = card({ id: 'wb-card-1', open: true, name: '삼성전자' });
    const reg = card({ id: 'wb-card-2', accountNo: A, open: false });
    const { next, dropped } = fillAccountCards([user, reg], A);
    expect(next).toEqual([{ ...reg, open: true }]);
    expect(dropped).toEqual(['wb-card-1']);
  });

  it('사용자 카드가 접혀 있었으면 등록 카드는 접힌 채다', () => {
    const user = card({ id: 'wb-card-1', open: false });
    const reg = card({ id: 'wb-card-2', accountNo: A, open: false });
    const { next, dropped } = fillAccountCards([user, reg], A);
    expect(next).toEqual([reg]);
    expect(dropped).toEqual(['wb-card-1']);
  });

  it('충돌이 없으면 빈 계좌 카드를 그 계좌로 채워 남긴다(치운 카드 없음)', () => {
    const user = card({ id: 'wb-card-1' });
    const other = card({ id: 'wb-card-2', isin: 'KR7096530001', accountNo: A, open: false });
    const { next, dropped } = fillAccountCards([user, other], A);
    expect(next).toEqual([{ ...user, accountNo: A }, other]);
    expect(dropped).toEqual([]);
  });

  it('빈 계좌 카드가 없으면 같은 배열 참조를 돌려준다(효과 무한 루프 방지)', () => {
    const cards = [card({ accountNo: A })];
    const { next, dropped } = fillAccountCards(cards, A);
    expect(next).toBe(cards);
    expect(dropped).toEqual([]);
  });
});

describe('TradingWorkbench — GC-IN-05 — 계좌가 늦게 와도 사용자가 연 카드의 맥락이 잇는다', () => {
  const S = 'KR7005930003';

  it('계좌 없음 → 종목 추가(펼침) → 같은 키 등록 전략 유입(접힘) → 계좌 도착 → 카드 1장 · 등록 키 · 펼침', () => {
    mockRelay = relay({ accounts: [] });
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    expect(cardsInDom().map((c) => c.getAttribute('data-key'))).toEqual([`${S}::KRX`]);

    mockRelay = relay({ accounts: [], limitChasers: [lc(S)] });
    rerender(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(2);

    mockRelay = relay({ limitChasers: [lc(S)] }); // 계좌 도착
    rerender(<TradingWorkbench />);
    const after = cardsInDom();
    expect(after).toHaveLength(1);
    expect(after[0].getAttribute('data-key')).toBe(`${S}:${ACCOUNT}:KRX`);
    expect(after[0].getAttribute('data-open')).toBe('true');
  });

  it('치운 카드가 보고한 더티는 치운 뒤 더티 바 수·이탈 경고 합산에 남지 않는다', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockRelay = relay({ accounts: [] });
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    fireEvent.click(screen.getByRole('button', { name: '삼성전자 더티' }));

    mockRelay = relay({ accounts: [], limitChasers: [lc(S)] });
    rerender(<TradingWorkbench />);
    mockRelay = relay({ limitChasers: [lc(S)] });
    rerender(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(1);

    const link = document.createElement('a');
    link.href = '/me';
    link.addEventListener('click', (e) => e.preventDefault());
    document.body.appendChild(link);
    fireEvent.click(link);
    expect(confirm).not.toHaveBeenCalled();
    link.remove();
  });
});

describe('TradingWorkbench — 더티 바는 카드 하단(2026-09-23 · 목업 B) — 공용 패널은 화면 하단 바를 비켜 서지 않는다', () => {
  it('더티 카드가 늘어도 dirtyBarCount 는 0 이다(비켜 설 화면 하단 바가 없다)', () => {
    mockRelay = relay({ rateCrossItems: [rc()] });
    render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    fireEvent.click(screen.getByRole('button', { name: '씨젠 더티' }));
    fireEvent.click(screen.getByRole('button', { name: '삼성전자 더티' }));
    expect(sharedPanelsProps.last?.dirtyBarCount).toBe(0);
  });
});

describe('TradingWorkbench — R3-IN-03 — 카드 정리는 커밋된 cards 에서 파생한다 (불변식 회귀)', () => {
  const S = 'KR7005930003';
  /** 이탈 경고가 걸려 있는가 — 다른 경로 링크 클릭에 confirm 이 불리는지로 본다. */
  function leaveWarned(): boolean {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const link = document.createElement('a');
    link.href = '/me';
    link.addEventListener('click', (e) => e.preventDefault());
    document.body.appendChild(link);
    fireEvent.click(link);
    link.remove();
    const warned = confirm.mock.calls.length > 0;
    confirm.mockRestore();
    return warned;
  }
  const report = (id: string, text: string, entryId: string) => {
    const onLog = cardProps.get(id)!.onLogChange as (
      id: string,
      log: readonly { id: string; at: string; text: string }[],
    ) => void;
    act(() => onLog(id, [{ id: entryId, at: '09:41:00', text }]));
  };
  const liveId = () =>
    cardsInDom()[0].querySelector('button[aria-expanded]')!.id.replace(/^strategy-card-/, '').replace(/-toggle$/, '');

  it('계좌 도착과 같은 키 등록 전략 유입이 같은 렌더에 와도 — 카드 1장 · 등록 키 · 펼침 승계 · 더티 바 0 · 이탈 경고 없음', () => {
    mockRelay = relay({ accounts: [] });
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    fireEvent.click(screen.getByRole('button', { name: '삼성전자 더티' }));
    expect(leaveWarned()).toBe(true);

    // 한 렌더에 계좌와 등록 전략이 함께 들어온다(두 효과가 같은 배치에서 setCards 를 부른다).
    act(() => {
      mockRelay = relay({ limitChasers: [lc(S)] });
      rerender(<TradingWorkbench />);
    });
    const after = cardsInDom();
    expect(after).toHaveLength(1);
    expect(after[0].getAttribute('data-key')).toBe(`${S}:${ACCOUNT}:KRX`);
    expect(after[0].getAttribute('data-open')).toBe('true');
    expect(leaveWarned()).toBe(false);
  });

  it('더티 2 인 사용자 카드가 계좌 채움으로 치워진 뒤 → 더티 바 0 · 이탈 경고 해제 · 같은 키로 다시 만든 카드의 더티 0(새 id)', () => {
    mockRelay = relay({ accounts: [] });
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    const userId = liveId();
    fireEvent.click(screen.getByRole('button', { name: '삼성전자 더티' })); // 더티 2

    mockRelay = relay({ accounts: [], limitChasers: [lc(S)] });
    rerender(<TradingWorkbench />);
    mockRelay = relay({ limitChasers: [lc(S)] }); // 계좌 도착 → 사용자 카드 치움
    rerender(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(1);
    expect(liveId()).not.toBe(userId);
    expect(leaveWarned()).toBe(false);

    // 등록 카드를 닫고(「카드 닫기」) 같은 키로 다시 만든다 → 새 id · 더티 0.
    fireEvent.click(screen.getByRole('button', { name: /카드 닫기$/ }));
    fireEvent.click(
      within(screen.getByTestId('workbench-close-confirm')).getByRole('button', { name: '카드 닫기' }),
    );
    expect(cardsInDom()).toHaveLength(0);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    expect(cardsInDom()[0].getAttribute('data-key')).toBe(`${S}:${ACCOUNT}:KRX`);
    expect(liveId()).not.toBe(userId);
    expect(leaveWarned()).toBe(false);
  });

  it('✕ 로 치운 카드의 직전 로그 문장이 새 카드(다른 id)의 같은 문장을 막지 않는다 · 합친 로그 귀속은 그대로', () => {
    render(<TradingWorkbench />);
    const add = within(slot('stock-add-bar')!).getByRole('button', { name: '추가' });
    fireEvent.click(add);
    const first = liveId();
    report(first, '매수 주문을 냈어요', 'a-1');
    // 같은 카드의 직전 줄과 같은 문장은 두 번 쌓이지 않는다(기존 규칙).
    report(first, '매수 주문을 냈어요', 'a-2');
    expect((sharedPanelsProps.last?.logEntries as unknown[]).length).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: '삼성전자 카드 닫기' }));
    expect(cardsInDom()).toHaveLength(0);
    fireEvent.click(add);
    const second = liveId();
    expect(second).not.toBe(first);
    report(second, '매수 주문을 냈어요', 'b-1');

    const log = sharedPanelsProps.last?.logEntries as { who?: string; text: string }[];
    expect(log.map((e) => e.text)).toEqual(['매수 주문을 냈어요', '매수 주문을 냈어요']);
    expect(log.map((e) => e.who)).toEqual(['삼성전자', '삼성전자']);
  });
});

describe('holdingQuotePrice — 잔고 평가 가격 (GC-IN-04 · KRX 우선 · NXT 폴백)', () => {
  const X = 'KR7005930003';
  const q = (isin: string, x: 'KRX' | 'NXT', p: number) =>
    [`${isin}|${x}`, { t: 'q', i: isin, x, snap: true, p, o: p, h: p, l: p }] as const;
  const quotes = (...entries: ReturnType<typeof q>[]) =>
    new Map(entries) as unknown as RelayShape['quotes'];

  it('KRX 100 · NXT 110 → 100 (KRX 우선)', () => {
    expect(holdingQuotePrice(quotes(q(X, 'KRX', 100), q(X, 'NXT', 110)), X)).toBe(100);
  });
  it('NXT 만 110 → 110 (NXT 카드만 있는 종목의 평가를 비우지 않는다)', () => {
    expect(holdingQuotePrice(quotes(q(X, 'NXT', 110)), X)).toBe(110);
  });
  it('KRX 0 · NaN 이면 NXT 110 으로 폴백한다', () => {
    expect(holdingQuotePrice(quotes(q(X, 'KRX', 0), q(X, 'NXT', 110)), X)).toBe(110);
    expect(holdingQuotePrice(quotes(q(X, 'KRX', Number.NaN), q(X, 'NXT', 110)), X)).toBe(110);
  });
  it('둘 다 없으면 undefined(「—」)', () => {
    expect(holdingQuotePrice(quotes(), X)).toBeUndefined();
  });
});

describe('TradingWorkbench — GC-IN-04 — 같은 종목 KRX·NXT 카드 둘의 평가 가격 · 로그 귀속', () => {
  const S = 'KR7005930003';
  const q = (x: 'KRX' | 'NXT', p: number) =>
    [`${S}|${x}`, { t: 'q', i: S, x, snap: true, p, o: p, h: p, l: p }] as const;
  const quotes = new Map([q('KRX', 100), q('NXT', 110)]) as unknown as RelayShape['quotes'];
  const priceOf = () =>
    (sharedPanelsProps.last?.priceOf as (isin: string) => number | undefined)(S);

  it('카드 순서 [NXT, KRX] 와 [KRX, NXT] 에서 공용 패널 priceOf 가 같은 값(KRX)이다', () => {
    mockRelay = relay({ quotes, limitChasers: [lc(S, { exchange: 'NXT' }), lc(S)] });
    const first = render(<TradingWorkbench />);
    expect(cardsInDom().map((c) => c.getAttribute('data-exchange'))).toEqual(['NXT', 'KRX']);
    expect(priceOf()).toBe(100);
    first.unmount();
    // 이 테스트는 등록 순서만 바꿔 보는 것이다 — 배치 기억(quick-260923-lyt)이 첫 순서를 복원하지 않게 지운다.
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith('gh-radar:trading-layout:')) window.localStorage.removeItem(k);
    }

    mockRelay = relay({ quotes, limitChasers: [lc(S), lc(S, { exchange: 'NXT' })] });
    render(<TradingWorkbench />);
    expect(cardsInDom().map((c) => c.getAttribute('data-exchange'))).toEqual(['KRX', 'NXT']);
    expect(priceOf()).toBe(100);
  });

  it('합친 로그 who — NXT 카드 줄은 「삼성전자 · NXT」, KRX 카드 줄은 「삼성전자」', () => {
    mockRelay = relay({
      limitChasers: [
        lc(S, { name: '삼성전자' } as Partial<RelayLimitChaser>),
        lc(S, { exchange: 'NXT', name: '삼성전자' } as Partial<RelayLimitChaser>),
      ],
    });
    render(<TradingWorkbench />);
    const idOf = (x: 'KRX' | 'NXT') =>
      [...cardProps.entries()].find(([, p]) => p.exchange === x)![0];
    const report = (x: 'KRX' | 'NXT', text: string) => {
      const id = idOf(x);
      const onLog = cardProps.get(id)!.onLogChange as (
        id: string,
        log: readonly { id: string; at: string; text: string }[],
      ) => void;
      act(() => onLog(id, [{ id: `${x}-1`, at: '09:41:00', text }]));
    };
    report('KRX', '매수 주문을 냈어요');
    report('NXT', '매수 주문을 냈어요');
    const log = sharedPanelsProps.last?.logEntries as { who?: string; text: string }[];
    expect(log.map((e) => e.who)).toEqual(['삼성전자 · NXT', '삼성전자']);
  });
});

describe('TradingWorkbench — 배치 기억 (quick-260923-lyt)', () => {
  const byKey = () =>
    cardsInDom().map((c) => [c.getAttribute('data-key'), c.getAttribute('data-open')]);

  it('L1 다른 메뉴에 갔다 오면(언마운트 → 마운트) 카드 순서·펼침·등록 전 카드가 그대로다', () => {
    mockRelay = relay({ limitChasers: [lc('KR7086520004'), lc('KR7247540008')], rateCrossItems: [rc()] });
    const first = render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!); // 등록 전 카드 추가(펼침)
    fireEvent.click(toggleOf('KR7247540008')); // 등록 카드 하나 펼침
    const before = byKey();
    expect(before).toHaveLength(3);
    first.unmount();

    render(<TradingWorkbench />);
    expect(byKey()).toEqual(before);
  });

  it('L2 다른 사용자로 들어오면 앞 사용자의 배치를 복원하지 않는다', () => {
    mockRelay = relay({ rateCrossItems: [rc()] });
    const first = render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    expect(cardsInDom()).toHaveLength(1);
    first.unmount();

    const prevUser = authState.user;
    authState.user = { id: 'other-user' };
    try {
      render(<TradingWorkbench />);
      expect(cardsInDom()).toHaveLength(0);
    } finally {
      authState.user = prevUser;
    }
  });
});

describe('restoreSavedCards (quick-260923-lyt)', () => {
  const card = (isin: string, over: Partial<WorkbenchCard> = {}): WorkbenchCard => ({
    id: `c-${isin}`,
    isin,
    accountNo: ACCOUNT,
    exchange: 'KRX',
    open: false,
    ...over,
  });
  const keyOfIsin = (isin: string) => `${isin}:${ACCOUNT}:KRX`;

  it('저장 카드가 저장 순서로 앞에 서고, 복원 전에 생긴 새 등록 카드는 뒤에 붙는다', () => {
    const saved = {
      cards: [
        { isin: 'B', accountNo: ACCOUNT, exchange: 'KRX' as const, open: true },
        { isin: 'A', accountNo: ACCOUNT, exchange: 'KRX' as const, open: false },
      ],
      seen: [keyOfIsin('A')],
    };
    const out = restoreSavedCards([card('A'), card('C')], saved, ['n1', 'n2']);
    expect(out.map((c) => [c.isin, c.open, c.id])).toEqual([
      ['B', true, 'n1'],
      ['A', false, 'n2'],
      ['C', false, 'c-C'],
    ]);
  });

  it('사용자가 닫아 둔 등록 카드(seen 에 있고 저장 카드에 없음)는 되살리지 않는다', () => {
    const saved = { cards: [], seen: [keyOfIsin('A')] };
    expect(restoreSavedCards([card('A')], saved, []).map((c) => c.isin)).toEqual([]);
  });
});

describe('TradingWorkbench — VI 해제된 발동 숨김 (quick-260923-nvr)', () => {
  it('서버가 viReleased 를 세운 발동은 칩·표에서 빠지고, 없거나 false 면 그대로다', () => {
    mockRelay = relay({
      viOrders: [
        viOrder({ isin: 'KR7000660001', orderNo: '0000000001' }),
        viOrder({ isin: 'KR7005930003', orderNo: '0000000002', viReleased: true }),
        viOrder({ isin: 'KR7086520004', orderNo: '0000000003', viReleased: false }),
      ],
    });
    render(<TradingWorkbench />);
    const chips = Array.from(document.querySelectorAll('[data-slot="vi-chip"]'));
    expect(chips).toHaveLength(2);
    fireEvent.click(slot('vi-trigger')!.querySelector('[data-slot="vi-strip-more"]')!);
    const table = slot('vi-trigger-table')!;
    expect(table.textContent).not.toContain('0000000002');
  });
});

describe('withCardOpen — 카드 순서 규칙 (quick-260923-p3k · 순수 함수)', () => {
  const wc = (id: string, open: boolean): WorkbenchCard => ({
    id,
    isin: `KR7${id}`,
    accountNo: ACCOUNT,
    exchange: 'KRX',
    open,
  });
  const ids = (cards: readonly WorkbenchCard[]) => cards.map((c) => c.id);

  it('대상이 이미 같은 상태면 같은 배열 참조를 돌려준다(베일아웃 · 순서 불변)', () => {
    const prev = [wc('A', true), wc('B', false)];
    expect(withCardOpen(prev, 'A', true)).toBe(prev);
    expect(withCardOpen(prev, 'B', false)).toBe(prev);
  });

  it('없는 id 면 같은 배열 참조를 돌려준다', () => {
    const prev = [wc('A', true)];
    expect(withCardOpen(prev, 'Z', false)).toBe(prev);
  });

  it('접으면 그 카드가 배열 맨 앞 = 접힘 스택 맨 앞으로 간다(2026-09-23 개정) · 입력은 변하지 않는다', () => {
    const prev = [wc('A', true), wc('B', true), wc('C', false)];
    const next = withCardOpen(prev, 'B', false);
    expect(ids(next)).toEqual(['B', 'A', 'C']);
    expect(next.map((c) => c.open)).toEqual([false, true, false]);
    const { open, folded } = renderOrderOf(next);
    expect(ids(open)).toEqual(['A']);
    expect(ids(folded)).toEqual(['B', 'C']);
    expect(ids(prev)).toEqual(['A', 'B', 'C']);
    expect(prev[1].open).toBe(true);
  });

  it('펼치면 그 카드가 배열 맨 끝 = 펼친 카드들 맨 끝으로 간다', () => {
    const prev = [wc('A', false), wc('B', false), wc('C', true)];
    const next = withCardOpen(prev, 'A', true);
    expect(ids(next)).toEqual(['B', 'C', 'A']);
    const { open, folded } = renderOrderOf(next);
    expect(ids(open)).toEqual(['C', 'A']);
    expect(ids(folded)).toEqual(['B']);
  });
});

describe('TradingWorkbench — 카드 순서: 접으면 접힘 맨 앞 · 펼치면 펼친 맨 끝 (quick-260923-p3k · 2026-09-23 개정)', () => {
  const X = 'KR7086520004';
  const Y = 'KR7247540008';
  const Z = 'KR7000660001';
  const S = 'KR7096530001';
  const k = (isin: string, open: boolean) => [`${isin}:${ACCOUNT}:KRX`, String(open)];
  const keys = () => cardsInDom().map((c) => [c.getAttribute('data-key'), c.getAttribute('data-open')]);

  it('토글 — 접으면 접힘 스택 맨 앞, 펼치면 펼친 카드 맨 끝', () => {
    mockRelay = relay({ limitChasers: [lc(X), lc(Y), lc(Z)] });
    render(<TradingWorkbench />);
    fireEvent.click(toggleOf(X));
    fireEvent.click(toggleOf(Y));
    expect(keys()).toEqual([k(X, true), k(Y, true), k(Z, false)]);

    fireEvent.click(toggleOf(X)); // 접기 → 스택 맨 앞
    expect(keys()).toEqual([k(Y, true), k(X, false), k(Z, false)]);

    fireEvent.click(toggleOf(Z)); // 펼치기 → 펼친 무리 맨 끝
    expect(keys()).toEqual([k(Y, true), k(Z, true), k(X, false)]);
  });

  it('돌파 칩 — 새 카드도, 접힌 카드를 다시 여는 「거래중」 칩도 펼친 카드 맨 끝 · 이미 펼친 카드는 순서 불변', () => {
    mockRelay = relay({ limitChasers: [lc(X), lc(Y)], rateCrossItems: [rc()] });
    render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!); // 추가 · 펼침 · 끝
    expect(keys()).toEqual([k(S, true), k(X, false), k(Y, false)]);

    fireEvent.click(toggleOf(S)); // 접기
    fireEvent.click(toggleOf(Y)); // 펼치기
    fireEvent.click(toggleOf(X)); // 펼치기
    expect(keys()).toEqual([k(Y, true), k(X, true), k(S, false)]);

    fireEvent.click(slot('breakout-chip')!); // 「거래중」 → focusCard
    expect(keys()).toEqual([k(Y, true), k(X, true), k(S, true)]);

    fireEvent.click(slot('breakout-chip')!); // 이미 펼침 → 참조 유지
    expect(keys()).toEqual([k(Y, true), k(X, true), k(S, true)]);
  });

  it('카드가 둘인 ISIN — 펼친 카드가 끝으로 옮겨도 칩을 다시 누르면 둘째 카드를 열지 않고, 스크롤은 펼친 그 카드로 간다', () => {
    const T = 'KR7005930003';
    const scrolled: (string | null)[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.getAttribute('data-key'));
    };
    try {
      mockRelay = relay({
        limitChasers: [lc(T), lc(T, { exchange: 'NXT' })],
        rateCrossItems: [rc({ isin: T, name: '삼성전자', code: '005930' })],
      });
      render(<TradingWorkbench />);
      const kt = (ex: string, open: boolean) => [`${T}:${ACCOUNT}:${ex}`, String(open)];

      fireEvent.click(slot('breakout-chip')!); // KRX 펼침 → 배열 [NXT, KRX]
      expect(keys()).toEqual([kt('KRX', true), kt('NXT', false)]);
      expect(scrolled.at(-1)).toBe(`${T}:${ACCOUNT}:KRX`);

      fireEvent.click(slot('breakout-chip')!); // 이미 펼친 KRX → 불변 · NXT 는 접힌 그대로
      expect(keys()).toEqual([kt('KRX', true), kt('NXT', false)]);
      expect(scrolled.at(-1)).toBe(`${T}:${ACCOUNT}:KRX`);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

describe('TradingWorkbench — 이벤트 알림 (quick-260923-pgu · 목업 ③A)', () => {
  const SEEGENE = 'KR7096530001';
  const ALTEO = 'KR7196170005';

  function unfRow(orderNo: string, isin: string, over: Partial<RelayUnfilled> = {}): RelayUnfilled {
    return {
      orderNo,
      orgOrderNo: '',
      isin,
      side: 'B',
      price: 12_100,
      orderQty: 500,
      filledQty: 0,
      unfilledQty: 500,
      exchange: 'KRX',
      orderTime: '094131',
      queuedStatus: '',
      pendingStatus: '',
      board: '',
      pendingCancelSent: false,
      name: '씨젠',
      code: '096530',
      ...over,
    };
  }

  function orderMsg(over: Partial<RelayOrderMsg> = {}): RelayOrderMsg {
    return { t: 'order', no: '123', nt: 'E', rc: 0, msg: '', org: '', p: 12_100, q: 100, x: 'KRX', ...over };
  }

  function viNotice(over: Partial<RelayViNoticeMsg> = {}): RelayViNoticeMsg {
    return {
      t: 'vi.notice',
      isin: ALTEO,
      exchange: 'NXT',
      accountNo: ACCOUNT,
      triggerPrice: 453_200,
      basePrice: 412_000,
      changeRate: 10,
      orderPrice: 535_500,
      orderQty: 3,
      market: 'Q',
      orderSeq: 1,
      viEndTime: '094412000',
      name: '알테오젠',
      ...over,
    } as RelayViNoticeMsg;
  }

  const row = unfRow('123', SEEGENE);
  const accountStates = new Map<string, RelayAccountState>([
    [ACCOUNT, { t: 'acct', a: ACCOUNT, snap: true, hold: [], unf: [row], rm: [], st: '09:41:31' }],
  ]);
  const orderIndex = indexUnfilled(new Map(), ACCOUNT, [row]);
  const base = { rateCrossItems: [rc()], accountStates, orderIndex };

  const toastEls = () => Array.from(document.querySelectorAll('[data-slot="alert-toast"]')) as HTMLElement[];
  const cardOf = (isin: string) =>
    cardsInDom().find((c) => c.getAttribute('data-key')?.startsWith(`${isin}:`)) as HTMLElement;
  const idOf = (isin: string) => [...cardProps.entries()].find(([, p]) => p.isin === isin)![0];

  /** 돌파 칩으로 씨젠 카드를 세우고 접는다 — 체결 통보가 올 접힌 카드. */
  function mountWithCollapsedCard() {
    mockRelay = relay(base);
    const view = render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    fireEvent.click(toggleOf(SEEGENE));
    expect(cardOf(SEEGENE).getAttribute('data-open')).toBe('false');
    return view;
  }

  it('W-T1 돌파 토스트는 스트립 새 행 신호로만 — 첫 채움 0 · 76 새 종목 1 · 78 새 종목 0 (quick-260926-s5v)', () => {
    const breakoutToasts = () => document.querySelectorAll('[data-slot="alert-toast"][data-kind="breakout"]');
    mockRelay = relay({ rateCrossItems: [rc()] });
    const view = render(<TradingWorkbench />);
    expect(breakoutToasts()).toHaveLength(0);

    const samsung = rc({ isin: 'KR7005930003', name: '삼성전자', code: '005930', exchangeTime: '094500000000' });
    mockRelay = relay({ rateCrossItems: [samsung, rc()] });
    view.rerender(<TradingWorkbench />);
    expect(breakoutToasts()).toHaveLength(1);
    expect(breakoutToasts()[0].textContent).toContain('삼성전자');

    const hynix = rc({ isin: 'KR7000660001', name: 'SK하이닉스', code: '000660', exchangeTime: '094600000000' });
    mockRelay = relay({ rateCrossItems: [hynix, samsung, rc()], rateCrossSnapSeq: 1 });
    view.rerender(<TradingWorkbench />);
    expect(breakoutToasts()).toHaveLength(1);
  });

  it('① 새 체결 통보 → 토스트 1 · 색인 조인 문구 · 접힌 카드에 data-alert', () => {
    const view = mountWithCollapsedCard();
    expect(toastEls()).toHaveLength(0);
    expect(slot('alert-toasts')).toHaveAttribute('role', 'status');
    // 앱 셸이 아니라 작업대 루트 안에만 산다(게이트 화면에는 없다).
    expect(document.querySelector('[data-slot="trading-workbench"] [data-slot="alert-toasts"]')).not.toBeNull();

    mockRelay = relay({ ...base, orders: [orderMsg()] });
    view.rerender(<TradingWorkbench />);

    expect(toastEls()).toHaveLength(1);
    const text = toastEls()[0].textContent ?? '';
    expect(text).toContain('씨젠');
    expect(text).toContain('체결');
    expect(text).toContain('매수 100/500주');
    expect(toastEls()[0]).toHaveAttribute('data-kind', 'fill');
    expect(cardOf(SEEGENE).getAttribute('data-alert')).toBe('true');
    expect(cardOf(SEEGENE).getAttribute('data-open')).toBe('false');
  });

  it('② 토스트 클릭 → 카드 펼침 · 미체결 탭 요청 · 표시 해제 · 토스트 닫힘', () => {
    const view = mountWithCollapsedCard();
    mockRelay = relay({ ...base, orders: [orderMsg()] });
    view.rerender(<TradingWorkbench />);

    fireEvent.click(toastEls()[0]);
    expect(cardOf(SEEGENE).getAttribute('data-open')).toBe('true');
    expect(cardProps.get(idOf(SEEGENE))?.requestedTab).toEqual({ tab: 'unfilled', seq: 1 });
    expect(cardOf(SEEGENE).getAttribute('data-alert')).toBe('false');
    expect(toastEls()).toHaveLength(0);
  });

  it('③ 마운트 시점의 통보는 알리지 않는다 · 같은 주문 체결 두 번은 한 토스트 「2건」', () => {
    const old = orderMsg({ nt: 'A', q: 500 });
    mockRelay = relay({ ...base, orders: [old] });
    const view = render(<TradingWorkbench />);
    expect(toastEls()).toHaveLength(0);

    const f1 = orderMsg();
    mockRelay = relay({ ...base, orders: [f1, old] });
    view.rerender(<TradingWorkbench />);
    mockRelay = relay({ ...base, orders: [orderMsg(), f1, old] });
    view.rerender(<TradingWorkbench />);

    expect(toastEls()).toHaveLength(1);
    expect(within(toastEls()[0]).getByText('2건')).toBeInTheDocument();
    expect(toastEls()[0].textContent).toContain('매수 200/500주');
  });

  it('④ 카드 없는 종목의 VI → 토스트만(카드 표시 없음) · 클릭하면 그 종목·계좌·거래소 카드가 붙고 정보 탭', () => {
    mockRelay = relay(base);
    const view = render(<TradingWorkbench />);
    mockRelay = relay({ ...base, viNotices: [viNotice()] });
    view.rerender(<TradingWorkbench />);

    expect(toastEls()).toHaveLength(1);
    expect(toastEls()[0]).toHaveAttribute('data-kind', 'vi');
    expect(toastEls()[0].textContent).toContain('알테오젠 VI 발동');
    expect(cardsInDom()).toHaveLength(0);

    fireEvent.click(toastEls()[0]);
    const card = cardOf(ALTEO);
    expect(card.getAttribute('data-key')).toBe(`${ALTEO}:${ACCOUNT}:NXT`);
    expect(card.getAttribute('data-open')).toBe('true');
    expect(card.getAttribute('data-alert')).toBe('false');
    expect((cardProps.get(idOf(ALTEO))?.requestedTab as { tab: string }).tab).toBe('info');
    expect(toastEls()).toHaveLength(0);
  });

  it('⑤ 헤더 토글로도 표시가 풀린다', () => {
    const view = mountWithCollapsedCard();
    mockRelay = relay({ ...base, orders: [orderMsg()] });
    view.rerender(<TradingWorkbench />);
    expect(cardOf(SEEGENE).getAttribute('data-alert')).toBe('true');

    fireEvent.click(toggleOf(SEEGENE));
    expect(cardOf(SEEGENE).getAttribute('data-alert')).toBe('false');
    expect(cardOf(SEEGENE).getAttribute('data-open')).toBe('true');
    // 토스트는 제 수명대로 남는다 — 헤더 토글은 카드 표시만 지운다.
    expect(toastEls()).toHaveLength(1);
  });

  it('⑥ 색인에 없는 주문(조인 실패)은 1.5초 뒤 「주문 {No}」 토스트 · 클릭해도 카드를 만들지 않는다', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      mockRelay = relay(base);
      const view = render(<TradingWorkbench />);
      mockRelay = relay({ ...base, orders: [orderMsg({ no: '999' })] });
      view.rerender(<TradingWorkbench />);
      expect(toastEls()).toHaveLength(0);
      act(() => {
        vi.advanceTimersByTime(1_500);
      });
      expect(toastEls()).toHaveLength(1);
      expect(toastEls()[0].textContent).toContain('주문 999 체결');
      fireEvent.click(toastEls()[0]);
      expect(cardsInDom()).toHaveLength(0);
      expect(toastEls()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('cardForAlert — 알림을 받을 카드 판정 (quick-260923-pgu · 판정의 유일 지점)', () => {
  const card = (id: string, over: Partial<WorkbenchCard> = {}): WorkbenchCard => ({
    id,
    isin: 'KR7096530001',
    accountNo: ACCOUNT,
    exchange: 'KRX',
    open: false,
    ...over,
  });

  it('ISIN 을 모르면 undefined', () => {
    expect(cardForAlert([card('a')], { isin: undefined, accountNo: ACCOUNT, exchange: 'KRX' })).toBeUndefined();
  });

  it('(ISIN · 계좌 · 거래소) 정확 일치가 먼저', () => {
    const cards = [card('a', { accountNo: 'other', open: true }), card('b')];
    expect(cardForAlert(cards, { isin: 'KR7096530001', accountNo: ACCOUNT, exchange: 'KRX' })?.id).toBe('b');
  });

  it('계좌를 모르면(돌파) 같은 거래소의 펼친 카드 우선 · 거래소가 없으면 ISIN 의 펼친 카드', () => {
    const cards = [card('a'), card('b', { open: true }), card('c', { exchange: 'NXT', open: true })];
    expect(cardForAlert(cards, { isin: 'KR7096530001', exchange: 'KRX' })?.id).toBe('b');
    expect(cardForAlert([card('a'), card('c', { exchange: 'NXT', open: true })], { isin: 'KR7096530001', exchange: 'KRX' })?.id).toBe('a');
    expect(cardForAlert([card('c', { exchange: 'NXT', open: true })], { isin: 'KR7096530001', exchange: 'KRX' })?.id).toBe('c');
  });
});

describe('TradingWorkbench — 거래소 전환: 등록 후 잠금 해제 (quick-260923-pgv)', () => {
  const S = 'KR7005930003';
  const OTHER = 'KR7086520004';
  const KRX = `${S}:${ACCOUNT}:KRX`;
  const NXT = `${S}:${ACCOUNT}:NXT`;
  const named = (over: Partial<RelayLimitChaser> = {}) =>
    lc(S, { name: '삼성전자', ...over } as Partial<RelayLimitChaser>);
  const registered = (list: RelayLimitChaser[], seq = 1) =>
    relay({ limitChasers: list, limitChaserSnapSeq: seq } as Partial<RelayShape>);
  const byKey = () =>
    Object.fromEntries(cardsInDom().map((c) => [c.getAttribute('data-key'), c.getAttribute('data-open')]));
  const nxt = () => screen.getByRole('button', { name: /NXT$/ });
  const confirmEl = () => screen.queryByTestId('workbench-exchange-confirm');

  it('T1 더티 0 — 등록 KRX 카드의 NXT 토글은 즉시 키를 바꾸고 카드 id 는 그대로 · 다이얼로그 없음', () => {
    mockRelay = registered([named()]);
    render(<TradingWorkbench />);
    expect(byKey()).toEqual({ [KRX]: 'false' });
    const id = propsOf(S)?.cardId;
    fireEvent.click(nxt());
    expect(byKey()).toEqual({ [NXT]: 'false' });
    expect(cardsInDom()).toHaveLength(1);
    expect(propsOf(S)?.cardId).toBe(id);
    expect(confirmEl()).toBeNull();
    expect((mockRelay.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('T2 더티 >0 — 확인 다이얼로그: 취소면 유지, 바꾸기면 전환', async () => {
    mockRelay = registered([named()]);
    render(<TradingWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: '삼성전자 더티' }));
    fireEvent.click(nxt());
    const dialog = screen.getByTestId('workbench-exchange-confirm');
    expect(EXCHANGE_SWITCH_TITLE).toBe('수정 중인 값이 사라져요');
    expect(within(dialog).getByRole('heading', { name: EXCHANGE_SWITCH_TITLE })).toBeInTheDocument();
    expect(exchangeSwitchBody('삼성전자', 2, 'KRX', 'NXT')).toBe(
      '삼성전자 의 수정 중인 값 2개가 사라져요. KRX → NXT 로 바꿀까요?',
    );
    expect(dialog.textContent).toContain(exchangeSwitchBody('삼성전자', 2, 'KRX', 'NXT'));
    expect(byKey()).toEqual({ [KRX]: 'false' });

    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(confirmEl()).toBeNull());
    expect(byKey()).toEqual({ [KRX]: 'false' });

    fireEvent.click(nxt());
    fireEvent.click(within(screen.getByTestId('workbench-exchange-confirm')).getByRole('button', { name: '바꾸기' }));
    expect(byKey()).toEqual({ [NXT]: 'false' });
    await waitFor(() => expect(confirmEl()).toBeNull());
  });

  it('T3 자동 카드 — 전환으로 비워진 KRX 키를 다시 만들지 않는다(실측 2026-09-23)', () => {
    mockRelay = registered([named()]);
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(nxt());
    expect(byKey()).toEqual({ [NXT]: 'false' });

    // 같은 등록 목록이 새 배열 · 새 snapSeq 로 다시 온다.
    mockRelay = registered([named()], 2);
    rerender(<TradingWorkbench />);
    expect(byKey()).toEqual({ [NXT]: 'false' });

    // 다른 종목 전략이 들어와 `fresh` 가 생겨도 S 의 KRX 카드는 되살아나지 않는다.
    mockRelay = registered([named(), lc(OTHER)], 3);
    rerender(<TradingWorkbench />);
    expect(byKey()).toEqual({ [NXT]: 'false', [`${OTHER}:${ACCOUNT}:KRX`]: 'false' });
  });

  it('T4 언마운트 → 마운트(배치 기억) — NXT 로 바꾼 카드가 그대로 복원되고 KRX 키 카드는 생기지 않는다', () => {
    mockRelay = registered([named()]);
    const first = render(<TradingWorkbench />);
    fireEvent.click(nxt());
    expect(byKey()).toEqual({ [NXT]: 'false' });
    first.unmount();

    render(<TradingWorkbench />);
    expect(byKey()).toEqual({ [NXT]: 'false' });
    expect(cardsInDom()).toHaveLength(1);
  });

  it('T5 충돌 — 같은 키 카드가 있으면 이 카드는 그대로, 그 카드를 펼친다 · 더티가 있어도 다이얼로그 없음', () => {
    mockRelay = registered([named(), named({ exchange: 'NXT' })]);
    render(<TradingWorkbench />);
    expect(byKey()).toEqual({ [KRX]: 'false', [NXT]: 'false' });
    const krxCard = cardsInDom().find((c) => c.getAttribute('data-key') === KRX)!;
    fireEvent.click(within(krxCard).getByRole('button', { name: '삼성전자 더티' }));
    fireEvent.click(within(krxCard).getByRole('button', { name: /NXT$/ }));
    expect(byKey()).toEqual({ [KRX]: 'false', [NXT]: 'true' });
    expect(cardsInDom()).toHaveLength(2);
    expect(confirmEl()).toBeNull();
  });

  it('T6 왕복 — NXT 로 갔다가 KRX 로 돌아오면 같은 카드 id 가 KRX 키를 본다', () => {
    mockRelay = registered([named()]);
    render(<TradingWorkbench />);
    const id = propsOf(S)?.cardId as string;
    fireEvent.click(nxt());
    expect(byKey()).toEqual({ [NXT]: 'false' });
    act(() => {
      (cardProps.get(id)!.onExchangeChange as (id: string, ex: 'KRX' | 'NXT') => void)(id, 'KRX');
    });
    expect(byKey()).toEqual({ [KRX]: 'false' });
    expect(propsOf(S)?.cardId).toBe(id);
  });
});

describe('꺼진 전략 — 기본 카드 없음 · 복원 카드 걷기 (2026-09-23 사용자 결정)', () => {
  const X = 'KR7086520004';
  const Y = 'KR7247540008';
  const card = (id: string, isin: string, open = false): WorkbenchCard => ({
    id,
    isin,
    accountNo: ACCOUNT,
    exchange: 'KRX',
    open,
  });

  it('매수·매도·취소잔량이 모두 꺼진 등록 전략은 카드를 만들지 않는다(한방·취소 체결만 켜져도 마찬가지)', () => {
    mockRelay = relay({
      limitChasers: [
        lc(X),
        lc(Y, { buyEnabled: false, sweepEnabled: true, cancelTradeEnabled: true } as Partial<RelayLimitChaser>),
      ],
    });
    render(<TradingWorkbench />);
    expect(cardsInDom().map((c) => c.getAttribute('data-key'))).toEqual([`${X}:${ACCOUNT}:KRX`]);
  });

  it('취소잔량만 켜진 전략은 켜진 전략이다', () => {
    mockRelay = relay({
      limitChasers: [lc(Y, { buyEnabled: false, cancelQtyEnabled: true } as Partial<RelayLimitChaser>)],
    });
    render(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(1);
  });

  it('pruneInactiveCards — 꺼진 등록 전략 카드만 뺀다 · 미등록 카드와 잠긴 카드는 남긴다 · 뺄 것이 없으면 참조 유지', () => {
    const Z = 'KR7000660001';
    const W = 'KR7005930003';
    const chasers = [lc(X), lc(Y, { buyEnabled: false }), lc(W, { buyEnabled: false })];
    const cards = [card('a', X), card('b', Y, true), card('c', Z), card('d', W)];
    const locks = new Map([[`${W}:${ACCOUNT}:KRX`, 'result-unknown']]);
    const { next, dropped } = pruneInactiveCards(cards, chasers, locks);
    expect(next.map((c) => c.id)).toEqual(['a', 'c', 'd']);
    expect(dropped).toEqual([`${Y}:${ACCOUNT}:KRX`]);
    const same = [card('a', X)];
    expect(pruneInactiveCards(same, chasers, new Map()).next).toBe(same);
  });
});
