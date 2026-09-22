import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type {
  RelayLimitChaser,
  RelayRateCrossItem,
  RelayUnfilled,
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
import { requestTradingFocus } from '@/lib/trading-focus';
import { LEAVE_WARNING } from '@/lib/use-leave-warning';
import {
  cardForUnfilled,
  fillAccountCards,
  holdingQuotePrice,
  TradingWorkbench,
  type WorkbenchCard,
} from '../workbench/trading-workbench';

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
  it('섹션이 UI-SPEC 순서대로 선다 — 제목줄 → 상태줄 → VI 2줄 → VI 스트립/표 → 돌파 스트립/표 → 종목 추가 → 격자 → 공용 패널', () => {
    render(<TradingWorkbench />);
    // 표 2개는 「더보기」로 펼친다 — 펼친 표가 자기 스트립 바로 아래에 선다.
    fireEvent.click(slot('vi-trigger')!.querySelector('[data-slot="vi-strip-more"]')!);
    fireEvent.click(slot('breakout-more')!);

    const order = [
      slot('workbench-title'),
      slot('workbench-status-bar'),
      slot('vi-settings-rows'),
      slot('vi-trigger-strip'),
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

  it('본문 래퍼가 @container/wb 를 갖는다', () => {
    render(<TradingWorkbench />);
    expect(slot('trading-workbench')!.className).toContain('@container/wb');
  });

  it('카드 0장이면 격자 자리에 빈 문구가 서고, 상태줄 거래 종목은 0 이다', () => {
    render(<TradingWorkbench />);
    expect(slot('card-grid-empty')!.textContent).toContain('거래할 종목이 없어요');
    expect(screen.getByTestId('stat-cards').textContent).toBe('거래 종목 0');
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
    expect(screen.getByTestId('stat-cards').textContent).toBe('거래 종목 1');
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

    fireEvent.click(toggleOf(S)); // 첫 카드를 다시 접는다
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    expect(cardsInDom()).toHaveLength(2);
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
  });
});

describe('TradingWorkbench — 상태줄 카운터 (TRADE-09 precision)', () => {
  it('상태줄 돌파·VI 카운터가 스트립과 같은 값을 말한다', () => {
    mockRelay = relay({
      rateCrossItems: [rc(), rc({ isin: 'KR7005930003', name: '삼성전자', code: '005930' })],
      viOrders: [
        {
          isin: 'KR7000660001',
          exchange: 'KRX',
          accountNo: ACCOUNT,
          orderNo: '1',
          state: 'Accepted',
          confirmed: false,
        },
      ] as unknown as RelayShape['viOrders'],
    });
    render(<TradingWorkbench />);
    expect(screen.getByTestId('stat-breakout').textContent).toBe('돌파 2');
    expect(screen.getByTestId('breakout-strip-label').textContent).toBe('돌파 2');
    expect(screen.getByTestId('stat-vi').textContent).toBe('VI 발동 1');
    expect(screen.getByTestId('vi-strip-label').textContent).toBe('VI 1');
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

  it('VI 몫 ERROR 는 VI 두 줄 아래 role="alert" 로 서고, 상따 몫·relay 자기 거부는 서지 않는다', () => {
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
    // VI 두 줄 섹션 안에 선다(폼 인라인 — UI-SPEC E1 error: 설정 오류는 해당 폼 자리).
    expect(slot('vi-settings-rows')!.contains(el)).toBe(true);
  });
});

describe('TradingWorkbench — GC-WR-03 — 결과 모름 잠금은 작업대 키 상태다', () => {
  type ResultUnknownKey = { accountNo: string; isin: string; exchange: 'KRX' | 'NXT' };
  type BodyProps = {
    resultUnknownLocked?: boolean;
    onResultUnknown?: (k: ResultUnknownKey) => void;
  };
  const SAMSUNG = 'KR7005930003';
  const SEEGENE = 'KR7096530001';
  const OTHER_ACCOUNT = '99999999901';

  /** 지금 격자에 있는 카드 id — 스텁 토글 id(`strategy-card-{id}-toggle`)에서 읽는다(지운 카드 기록 제외). */
  const liveIds = () =>
    cardsInDom().map((c) =>
      c.querySelector('button[aria-expanded]')!.id.replace(/^strategy-card-/, '').replace(/-toggle$/, ''),
    );
  /** 전략 키로 찾은 **살아 있는** 카드의 본문 `CardBody` prop(렌더 함수가 만든 요소의 props). */
  function bodyOfKey(key: string): BodyProps | undefined {
    const live = new Set(liveIds());
    const hit = [...cardProps.entries()].find(
      ([id, p]) => live.has(id) && `${p.isin}:${p.accountNo}:${p.exchange}` === key,
    );
    if (hit === undefined) return undefined;
    const body = hit[1].body as (s: unknown) => { props: BodyProps };
    return body({}).props;
  }
  /** 카드 폼이 timeout 을 본 순간 — 보낸 요청의 키로 콜백을 부른다(폼 동작은 폼 테스트 몫). */
  function timeoutOn(key: string, req: ResultUnknownKey) {
    act(() => bodyOfKey(key)!.onResultUnknown!(req));
  }
  const keyOf = (isin: string, exchange: 'KRX' | 'NXT' = 'KRX', account = ACCOUNT) =>
    `${isin}:${account}:${exchange}`;
  const sendCalls = () => (mockRelay.send as ReturnType<typeof vi.fn>).mock.calls.length;
  const sendOrderSpy = () => mockRelay.sendOrder as unknown as ReturnType<typeof vi.fn>;

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

  beforeEach(() => {
    mockRelay = relay({ sendOrder: vi.fn() } as Partial<RelayShape>);
  });

  it('잠긴 카드 ✕ → data-reason="unknown" 다이얼로그 · 취소면 남고 「카드 닫기」 면 사라진다 → 돌파 칩으로 재추가해도 잠긴 채 · 송신 0', () => {
    mockRelay = relay({ rateCrossItems: [rc()], sendOrder: vi.fn() } as Partial<RelayShape>);
    render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    const key = keyOf(SEEGENE);
    expect(bodyOfKey(key)?.resultUnknownLocked).toBe(false);

    timeoutOn(key, { accountNo: ACCOUNT, isin: SEEGENE, exchange: 'KRX' });
    expect(bodyOfKey(key)?.resultUnknownLocked).toBe(true);

    fireEvent.click(closeBtn('씨젠'));
    const dialog = screen.getByTestId('workbench-close-confirm');
    expect(dialog.getAttribute('data-reason')).toBe('unknown');
    expect(within(dialog).getByRole('heading', { name: '결과를 모르는 주문이 있어요' })).toBeInTheDocument();
    expect(dialog.textContent).toContain(
      '미체결 목록에서 접수 여부를 확인하세요. 카드를 닫았다 다시 열거나 다른 화면에 다녀와도 이 종목의 주문 버튼은 잠긴 채로 남아요. 로그아웃하거나 새로고침하면 풀려요.',
    );
    // 등록 전략이 없으면 등록 전략 문장은 붙지 않는다 · 「실패」 없음.
    expect(dialog.textContent).not.toContain('서버의 상따 전략은 그대로 동작해요');
    expect(dialog.textContent).not.toMatch(/실패/);
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(cardsInDom()).toHaveLength(1);

    fireEvent.click(closeBtn('씨젠'));
    fireEvent.click(
      within(screen.getByTestId('workbench-close-confirm')).getByRole('button', { name: '카드 닫기' }),
    );
    expect(cardsInDom()).toHaveLength(0);

    fireEvent.click(slot('breakout-chip')!);
    expect(cardsInDom()).toHaveLength(1);
    expect(bodyOfKey(key)?.resultUnknownLocked).toBe(true);
    expect(sendCalls()).toBe(0);
    expect(sendOrderSpy()).not.toHaveBeenCalled();
  });

  it('종목 추가로 재추가해도 잠긴 채다', () => {
    render(<TradingWorkbench />);
    const add = within(slot('stock-add-bar')!).getByRole('button', { name: '추가' });
    fireEvent.click(add);
    const key = keyOf(SAMSUNG);
    timeoutOn(key, { accountNo: ACCOUNT, isin: SAMSUNG, exchange: 'KRX' });
    fireEvent.click(closeBtn('삼성전자'));
    fireEvent.click(
      within(screen.getByTestId('workbench-close-confirm')).getByRole('button', { name: '카드 닫기' }),
    );
    expect(cardsInDom()).toHaveLength(0);

    fireEvent.click(add);
    expect(bodyOfKey(key)?.resultUnknownLocked).toBe(true);
    expect(sendCalls()).toBe(0);
  });

  it('미체결 행 선택(cardForUnfilled 새 카드)으로 재추가해도 잠긴 채다', () => {
    mockRelay = relay({ accountStates: acctWith([unfRow()]), sendOrder: vi.fn() } as Partial<RelayShape>);
    render(<TradingWorkbench />);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    const key = keyOf(SAMSUNG);
    timeoutOn(key, { accountNo: ACCOUNT, isin: SAMSUNG, exchange: 'KRX' });
    fireEvent.click(closeBtn('삼성전자'));
    fireEvent.click(
      within(screen.getByTestId('workbench-close-confirm')).getByRole('button', { name: '카드 닫기' }),
    );
    expect(cardsInDom()).toHaveLength(0);

    clickRow('3407000111');
    expect(cardsInDom()).toHaveLength(1);
    expect(cardsInDom()[0].getAttribute('data-key')).toBe(key);
    expect(bodyOfKey(key)?.resultUnknownLocked).toBe(true);
    expect(sendCalls()).toBe(0);
    expect(sendOrderSpy()).not.toHaveBeenCalled();
  });

  it('키 범위 — 같은 ISIN 다른 거래소(NXT) · 다른 계좌 카드는 잠기지 않는다', () => {
    mockRelay = relay({
      limitChasers: [
        lc(SAMSUNG),
        lc(SAMSUNG, { exchange: 'NXT' }),
        lc(SAMSUNG, { accountNo: OTHER_ACCOUNT }),
      ],
      sendOrder: vi.fn(),
    } as Partial<RelayShape>);
    render(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(3);
    timeoutOn(keyOf(SAMSUNG), { accountNo: ACCOUNT, isin: SAMSUNG, exchange: 'KRX' });
    expect(bodyOfKey(keyOf(SAMSUNG))?.resultUnknownLocked).toBe(true);
    expect(bodyOfKey(keyOf(SAMSUNG, 'NXT'))?.resultUnknownLocked).toBe(false);
    expect(bodyOfKey(keyOf(SAMSUNG, 'KRX', OTHER_ACCOUNT))?.resultUnknownLocked).toBe(false);
  });

  it('잠금은 요청의 키를 따른다 — KRX 카드에서 NXT 원주문 정정이 timeout 이면 NXT 키가 잠긴다', () => {
    mockRelay = relay({
      limitChasers: [lc(SAMSUNG), lc(SAMSUNG, { exchange: 'NXT' })],
      sendOrder: vi.fn(),
    } as Partial<RelayShape>);
    render(<TradingWorkbench />);
    timeoutOn(keyOf(SAMSUNG), { accountNo: ACCOUNT, isin: SAMSUNG, exchange: 'NXT' });
    expect(bodyOfKey(keyOf(SAMSUNG))?.resultUnknownLocked).toBe(false);
    expect(bodyOfKey(keyOf(SAMSUNG, 'NXT'))?.resultUnknownLocked).toBe(true);
  });

  it('접기/펴기 · 상태줄 계좌 A→B→A 전환 뒤에도 A 키 잠금이 남는다', () => {
    mockRelay = relay({
      accounts: [
        { accountNo: ACCOUNT, name: '위탁종합' },
        { accountNo: OTHER_ACCOUNT, name: 'ISA' },
      ],
      sendOrder: vi.fn(),
    } as Partial<RelayShape>);
    render(<TradingWorkbench />);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    const key = keyOf(SAMSUNG);
    timeoutOn(key, { accountNo: ACCOUNT, isin: SAMSUNG, exchange: 'KRX' });

    fireEvent.click(toggleOf(SAMSUNG));
    fireEvent.click(toggleOf(SAMSUNG));
    expect(bodyOfKey(key)?.resultUnknownLocked).toBe(true);

    const pill = screen.getByRole('combobox', { name: '계좌' });
    fireEvent.change(pill, { target: { value: OTHER_ACCOUNT } });
    fireEvent.change(pill, { target: { value: ACCOUNT } });
    expect(bodyOfKey(key)?.resultUnknownLocked).toBe(true);
    expect(sendCalls()).toBe(0);
  });

  it('DMA 게이트가 섰다 걷혀도(작업대 본문 언마운트) 잠금이 남는다 — 페이지를 떠날 때만 풀린다', () => {
    const { rerender } = render(<TradingWorkbench />);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    const key = keyOf(SAMSUNG);
    timeoutOn(key, { accountNo: ACCOUNT, isin: SAMSUNG, exchange: 'KRX' });

    mockRelay = relay({ status: 'unauthorized', sendOrder: vi.fn() } as Partial<RelayShape>);
    rerender(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(0);
    expect(slot('stock-add-bar')).toBeNull();

    mockRelay = relay({ sendOrder: vi.fn() } as Partial<RelayShape>);
    rerender(<TradingWorkbench />);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    expect(bodyOfKey(key)?.resultUnknownLocked).toBe(true);
  });

  it('잠김 + 등록 전략 카드 ✕ → 결과 모름 다이얼로그에 등록 전략 문장이 한 줄 더 붙는다', () => {
    mockRelay = relay({
      limitChasers: [lc('KR7086520004', { name: '에코프로' } as Partial<RelayLimitChaser>)],
      sendOrder: vi.fn(),
    } as Partial<RelayShape>);
    render(<TradingWorkbench />);
    const key = keyOf('KR7086520004');
    timeoutOn(key, { accountNo: ACCOUNT, isin: 'KR7086520004', exchange: 'KRX' });

    fireEvent.click(screen.getByRole('button', { name: /카드 닫기$/ }));
    const dialog = screen.getByTestId('workbench-close-confirm');
    expect(dialog.getAttribute('data-reason')).toBe('unknown');
    expect(within(dialog).getByRole('heading', { name: '결과를 모르는 주문이 있어요' })).toBeInTheDocument();
    expect(dialog.textContent).toContain('로그아웃하거나 새로고침하면 풀려요.');
    expect(dialog.textContent).toContain(
      '카드를 닫아도 서버의 상따 전략은 그대로 동작해요. 전략을 멈추려면 카드에서 매수·매도 스위치를 끄세요.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: '카드 닫기' }));
    expect(cardsInDom()).toHaveLength(0);
    expect(sendCalls()).toBe(0);
  });

  it('잠기지 않은 등록 전략 카드는 기존 data-reason="registered" 다이얼로그 그대로다', () => {
    mockRelay = relay({ limitChasers: [lc('KR7086520004')], sendOrder: vi.fn() } as Partial<RelayShape>);
    render(<TradingWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: /카드 닫기$/ }));
    const dialog = screen.getByTestId('workbench-close-confirm');
    expect(dialog.getAttribute('data-reason')).toBe('registered');
    expect(within(dialog).getByRole('heading', { name: '등록된 전략이 있는 카드예요' })).toBeInTheDocument();
    expect(dialog.textContent).not.toContain('결과를 모르는 주문');
  });

  it('카드 본문 콜백은 모든 카드에 같은 참조(안정 콜백)다 — 불리언 + 안정 콜백만 (③)', () => {
    mockRelay = relay({ limitChasers: [lc(SAMSUNG), lc(SEEGENE)], sendOrder: vi.fn() } as Partial<RelayShape>);
    render(<TradingWorkbench />);
    const a = bodyOfKey(keyOf(SAMSUNG))!;
    const b = bodyOfKey(keyOf(SEEGENE))!;
    expect(typeof a.resultUnknownLocked).toBe('boolean');
    expect(a.onResultUnknown).toBe(b.onResultUnknown);
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
    expect(sharedPanelsProps.last?.dirtyBarCount).toBe(1);

    mockRelay = relay({ accounts: [], limitChasers: [lc(S)] });
    rerender(<TradingWorkbench />);
    mockRelay = relay({ limitChasers: [lc(S)] });
    rerender(<TradingWorkbench />);
    expect(cardsInDom()).toHaveLength(1);
    expect(sharedPanelsProps.last?.dirtyBarCount).toBe(0);

    const link = document.createElement('a');
    link.href = '/me';
    link.addEventListener('click', (e) => e.preventDefault());
    document.body.appendChild(link);
    fireEvent.click(link);
    expect(confirm).not.toHaveBeenCalled();
    link.remove();
  });
});

describe('TradingWorkbench — GC-IN-01 — 공용 패널에 더티 카드 수를 내린다 (R1 IN-03)', () => {
  it('더티가 있는 카드 수가 dirtyBarCount 로 내려간다 — 0 → 1 → 2', () => {
    mockRelay = relay({ rateCrossItems: [rc()] });
    render(<TradingWorkbench />);
    fireEvent.click(slot('breakout-chip')!);
    fireEvent.click(within(slot('stock-add-bar')!).getByRole('button', { name: '추가' }));
    expect(sharedPanelsProps.last?.dirtyBarCount).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: '씨젠 더티' }));
    expect(sharedPanelsProps.last?.dirtyBarCount).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '삼성전자 더티' }));
    expect(sharedPanelsProps.last?.dirtyBarCount).toBe(2);
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
