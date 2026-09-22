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

/** 카드 스텁 — 작업대가 내려주는 prop 을 ISIN 별로 기록한다. */
const cardProps = new Map<string, Record<string, unknown>>();
vi.mock('@/components/trading/card/strategy-card', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/trading/card/strategy-card')>();
  function StubCard(props: import('@/components/trading/card/strategy-card').StrategyCardProps) {
    cardProps.set(props.isin, props as unknown as Record<string, unknown>);
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
          id={`strategy-card-${props.isin}-toggle`}
          aria-expanded={props.open}
          onClick={() => props.onToggle(props.isin)}
        >
          {label}
        </button>
        <button type="button" aria-label={`${label} 카드 닫기`} onClick={() => props.onClose(props.isin)}>
          ✕
        </button>
        <button
          type="button"
          aria-label={`${label} 더티`}
          onClick={() => props.onDirtyCountChange?.(props.isin, 2)}
        >
          dirty
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

import { EMPTY_RELAY_VALUE } from '@/lib/relay-provider';
import { requestTradingFocus } from '@/lib/trading-focus';
import { LEAVE_WARNING } from '@/lib/use-leave-warning';
import { TradingWorkbench } from '../workbench/trading-workbench';

const ACCOUNT = '37728502101';
const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`) as HTMLElement | null;
const cardsInDom = () =>
  Array.from(document.querySelectorAll('[data-slot="strategy-card"]')) as HTMLElement[];

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
    expect(cardProps.get('KR7096530001')?.name).toBe('씨젠');
    expect(cardProps.get('KR7096530001')?.code).toBe('096530');
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
    expect(document.activeElement?.id).toBe('strategy-card-KR7005930003-toggle');

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
    fireEvent.click(document.getElementById('strategy-card-KR7247540008-toggle')!);
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

    fireEvent.click(document.getElementById('strategy-card-KR7247540008-toggle')!);
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
    const body = cardProps.get(isin)?.body as (s: unknown) => { props: { selectedUnfilled: unknown } };
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
});
