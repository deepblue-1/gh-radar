import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

/**
 * Phase 16 Plan 09 Task 3 — `RelayProvider` / `useRelaySubscription` 회귀면.
 *
 * 전역 승격(D-22)이 깨질 수 있는 지점만 고른다. 각 케이스는 **깨졌을 때 사용자가 겪는 일**과
 * 1:1 이다 — 단언이 추상적이면 회귀를 잡지 못한다.
 *
 *  1. 비로그인 미연결 (D-23)        → 깨지면 로그인도 안 한 사용자가 DMA 세션을 점유한다
 *  2. 로그아웃 close (D-23)          → 깨지면 로그아웃 후에도 세션이 살아 있다
 *  3. 구독 참조계수                  → 깨지면 소비자 하나가 빠질 때 남은 화면의 시세가 멈춘다
 *  4. 재접속 재구독                  → 깨지면 재접속 후 호가창이 영원히 굳는다
 *  5. 키 격리 (T-16-02 / T-15-40)    → 깨지면 **다른 종목 호가로 주문하는 사고**가 난다
 *  6. 전략 프레임 반영 (D-12)        → 깨지면 사이드바 전략 목록이 비거나 삭제된 전략이 남는다
 *  7. 미지 프레임 무해 (T-15-41)     → 깨지면 서버가 앞서 나갈 때 화면 전체가 터진다
 *  8. Provider 밖 폴백               → 깨지면 Provider 없이 렌더되는 컴포넌트가 전부 throw 한다
 *
 * ⚠️ 3·4 는 **실제 송신된 프레임 배열**을 세어 단언한다. 상태만 보면 「보내지 않았는데
 *    보낸 것처럼 보이는」 경우를 놓친다.
 */

// --- auth mock — 세션 유무가 연결 게이트다 -------------------------------------
const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

// --- supabase 세션 mock (토큰 취득 경로) ----------------------------------------
const getSessionMock = vi.fn(async () => ({
  data: { session: { access_token: 'tok-abc' } as { access_token: string } | null },
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: () => getSessionMock() } }),
}));

vi.mock('@/lib/relay-url', () => ({
  resolveRelayWsUrl: () => 'ws://relay.test:8090/ws',
}));

import type {
  RelayExchange,
  RelayLimitChaser,
  RelayQuote,
  RelayViOrderItem,
} from '@gh-radar/shared';
import { RelayProvider, useRelayContext, useRelaySubscription } from '../relay-provider';

const ISIN_A = 'KR7005930003';
const ISIN_B = 'KR7000660001';

// ============================================================
// fake WebSocket — 테스트가 서버 역할을 한다
// ============================================================

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  static last(): FakeWebSocket {
    const ws = FakeWebSocket.instances.at(-1);
    if (!ws) throw new Error('WebSocket 인스턴스가 없습니다');
    return ws;
  }

  readonly url: string;
  readyState = 0;
  readonly sent: string[] = [];
  closedWith: { code?: number } | null = null;
  closeCallCount = 0;

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closedWith = { code };
    this.closeCallCount += 1;
    this.readyState = 3;
  }

  accept(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  push(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }

  serverClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }

  parsedSent(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }

  /** `t` 가 같은 송신 프레임만. 참조계수 단언은 이 배열의 **길이**로 한다. */
  sentOfType(t: string): Array<Record<string, unknown>> {
    return this.parsedSent().filter((m) => m.t === t);
  }
}

// ============================================================
// 픽스처
// ============================================================

function tenFrom(base: number): number[] {
  return Array.from({ length: 10 }, (_, k) => base + k * 100);
}

function quoteFrame(over: Partial<RelayQuote> = {}): RelayQuote {
  return {
    t: 'q',
    i: ISIN_A,
    x: 'KRX',
    snap: true,
    p: 70_000,
    o: 69_500,
    h: 71_200,
    l: 68_900,
    c: 1_000,
    cs: '2',
    cr: 1.45,
    v: 1_234_567,
    va: 86_419_690_000,
    ap: tenFrom(70_100),
    aq: Array.from({ length: 10 }, (_, k) => 100 + k),
    bp: tenFrom(69_000),
    bq: Array.from({ length: 10 }, (_, k) => 200 + k),
    ta: 5_500,
    tb: 6_100,
    ul: 89_700,
    ll: 48_300,
    base: 69_000,
    viu: 76_000,
    vid: 62_000,
    ls: 5_969_782_550,
    et: '093015123456',
    ...over,
  };
}

/** 상따 에코 1건. `key` 는 relay 가 채우는 파생값이라 픽스처가 직접 준다. */
function lcItem(over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  const isin = over.isin ?? ISIN_A;
  const accountNo = over.accountNo ?? '12345678-01';
  const exchange: RelayExchange = over.exchange ?? 'KRX';
  return {
    isin,
    accountNo,
    market: 'K',
    crud: 'C',
    buyOrderPrice: 69_900,
    buyOrderQty: 10,
    buyWatchPrice: 69_800,
    buyWatchQty: 100,
    buyMinTradeQty: 0,
    buyWatchSide: '0',
    buyTradeQtyEnabled: false,
    buyEnabled: true,
    sellOrderPrice: 71_000,
    sellOrderQty: 0,
    sellWatchPrice: 70_900,
    sellWatchQty: 50,
    sellMinTradeQty: 0,
    sellEnabled: false,
    sellTradeQtyEnabled: false,
    sweepWatchPrice: 0,
    sweepEnabled: false,
    sweepMinTickCount: 0,
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
    exchange,
    sellOrderRatio: 100,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50,
    sellQtyTrackBaseline: 0,
    buyOrderAmount: 100,
    sellEntryLatched: false,
    cancelQtyEnabled: false,
    cancelWatchQty: 0,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
    cancelQtyTrackBaseline: 0,
    key: `${isin}:${accountNo}:${exchange}`,
    ...over,
  };
}

function viOrder(over: Partial<RelayViOrderItem> = {}): RelayViOrderItem {
  return {
    isin: ISIN_A,
    market: 'K',
    accountNo: '12345678-01',
    orderNo: '',
    orderQty: 10,
    orderPrice: 89_700,
    triggerPrice: 86_000,
    basePrice: 69_000,
    viEndTime: '093215000',
    deadline110Ms: 1_700_000_110_000,
    deadline119Ms: 1_700_000_119_000,
    confirmed: false,
    confirmLocked: false,
    state: 'Pending',
    filledQty: 0,
    ...over,
  };
}

// ============================================================
// 소비자 컴포넌트
// ============================================================

function QuoteConsumer({
  id,
  isin,
  exchange,
}: {
  id: string;
  isin: string;
  exchange: RelayExchange;
}) {
  const relay = useRelaySubscription({ isin, exchange });
  return (
    <div data-testid={`quote-${id}`}>{relay.quote == null ? 'none' : String(relay.quote.p)}</div>
  );
}

/** 구독 없이 전역 상태만 보는 화면(사이드바·My page)의 대역. */
function StrategyProbe() {
  const relay = useRelayContext();
  return (
    <>
      <div data-testid="status">{relay.status}</div>
      <div data-testid="lc-keys">{relay.limitChasers.map((c) => c.key).join(',')}</div>
      <div data-testid="vi-state">
        {relay.viTrigger === undefined
          ? 'unfetched'
          : relay.viTrigger === null
            ? 'unregistered'
            : `run:${relay.viTrigger.run}`}
      </div>
      <div data-testid="vi-orders">{relay.viOrders.map((o) => o.state).join(',')}</div>
      <div data-testid="vi-order-count">{String(relay.viOrders.length)}</div>
      <div data-testid="vi-notices">{String(relay.viNotices.length)}</div>
      <div data-testid="disabled">
        {relay.strategiesDisabled == null ? 'none' : String(relay.strategiesDisabled.count)}
      </div>
    </>
  );
}

// ============================================================
// 하네스
// ============================================================

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** 연결 → 인증 ACK 까지 진행한 소켓. */
async function acceptAndAuth(): Promise<FakeWebSocket> {
  await settle();
  const ws = FakeWebSocket.last();
  await act(async () => {
    ws.accept();
  });
  await act(async () => {
    ws.push({ t: 'state', s: 'ready', accounts: [{ accountNo: '12345678-01', name: '위탁종합' }] });
  });
  return ws;
}

function signedIn(): void {
  mockUseAuth.mockReturnValue({
    user: { id: 'u-1' },
    displayName: '테스터',
    isLoading: false,
    signOut: async () => {},
  });
}

function signedOut(): void {
  mockUseAuth.mockReturnValue({
    user: null,
    displayName: null,
    isLoading: false,
    signOut: async () => {},
  });
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.useFakeTimers();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok-abc' } } });
  mockUseAuth.mockReset();
  signedIn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ============================================================
// 테스트
// ============================================================

describe('RelayProvider — 연결 게이트 (D-23)', () => {
  it('① 비로그인이면 소켓을 열지 않고 idle 로 남는다', async () => {
    signedOut();

    render(
      <RelayProvider>
        <StrategyProbe />
      </RelayProvider>,
    );
    await settle();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });

  it('② 로그아웃하면 열려 있던 소켓을 즉시 닫는다', async () => {
    const view = render(
      <RelayProvider>
        <StrategyProbe />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();
    expect(FakeWebSocket.instances).toHaveLength(1);

    signedOut();
    await act(async () => {
      view.rerender(
        <RelayProvider>
          <StrategyProbe />
        </RelayProvider>,
      );
    });

    expect(ws.closeCallCount).toBe(1);
    expect(ws.closedWith).toEqual({ code: 1000 });
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });
});

describe('useRelaySubscription — 구독 참조계수', () => {
  it('③ 같은 키를 두 소비자가 봐도 sub 1회, 마지막 하나가 빠질 때만 unsub 1회', async () => {
    // ★ 두 번째 소비자는 **연결이 살아 있는 상태에서** 붙는다. 둘 다 인증 전에 붙여 두면
    //   플러시가 맵을 한 번 훑을 뿐이라 참조계수 중복 송신 방어가 실행되지 않는다 —
    //   그 순서로는 「0→1 에서만 sub」 규율을 지워도 테스트가 통과한다(실측 확인).
    const view = render(
      <RelayProvider>
        <QuoteConsumer id="a1" isin={ISIN_A} exchange="KRX" />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();
    expect(ws.sentOfType('sub')).toEqual([{ t: 'sub', isin: ISIN_A, ex: 'KRX' }]);

    // 1→2. 이미 와이어에 걸린 키이므로 **더 보내지 않는다**
    await act(async () => {
      view.rerender(
        <RelayProvider>
          <QuoteConsumer id="a1" isin={ISIN_A} exchange="KRX" />
          <QuoteConsumer id="a2" isin={ISIN_A} exchange="KRX" />
        </RelayProvider>,
      );
    });
    expect(ws.sentOfType('sub')).toHaveLength(1);

    // 2→1. 남은 소비자가 아직 보고 있으므로 해제하면 안 된다
    await act(async () => {
      view.rerender(
        <RelayProvider>
          <QuoteConsumer id="a1" isin={ISIN_A} exchange="KRX" />
        </RelayProvider>,
      );
    });
    expect(ws.sentOfType('unsub')).toHaveLength(0);
    expect(ws.sentOfType('sub')).toHaveLength(1);

    // 1→0 에서만 해제한다
    await act(async () => {
      view.rerender(<RelayProvider>{null}</RelayProvider>);
    });
    expect(ws.sentOfType('unsub')).toEqual([{ t: 'unsub', isin: ISIN_A, ex: 'KRX' }]);
  });

  it('③-a 거래소 토글은 이전 키 unsub → 새 키 sub 순서로 나간다', async () => {
    const view = render(
      <RelayProvider>
        <QuoteConsumer id="a1" isin={ISIN_A} exchange="KRX" />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();
    expect(ws.sentOfType('sub')).toHaveLength(1);

    await act(async () => {
      view.rerender(
        <RelayProvider>
          <QuoteConsumer id="a1" isin={ISIN_A} exchange="NXT" />
        </RelayProvider>,
      );
    });

    // 해제를 빠뜨리면 relay 참조계수가 새고 업스트림 구독이 영원히 남는다
    const after = ws.parsedSent().filter((m) => m.t === 'sub' || m.t === 'unsub');
    expect(after).toEqual([
      { t: 'sub', isin: ISIN_A, ex: 'KRX' },
      { t: 'unsub', isin: ISIN_A, ex: 'KRX' },
      { t: 'sub', isin: ISIN_A, ex: 'NXT' },
    ]);
  });

  it('④ 재접속하면 참조계수 2인 키를 sub 1회만 다시 건다', async () => {
    render(
      <RelayProvider>
        <QuoteConsumer id="a1" isin={ISIN_A} exchange="KRX" />
        <QuoteConsumer id="a2" isin={ISIN_A} exchange="KRX" />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();
    expect(ws.sentOfType('sub')).toHaveLength(1);

    await act(async () => {
      ws.serverClose(1006);
    });
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    await settle();

    const ws2 = FakeWebSocket.last();
    expect(ws2).not.toBe(ws);
    await act(async () => {
      ws2.accept();
    });
    await act(async () => {
      ws2.push({ t: 'state', s: 'ready', accounts: [] });
    });

    // 참조계수가 2라고 두 번 보내면 relay 쪽 계수가 부풀어 해제가 영원히 안 끝난다
    expect(ws2.sentOfType('sub')).toEqual([{ t: 'sub', isin: ISIN_A, ex: 'KRX' }]);
  });
});

describe('useRelaySubscription — 키 격리 (T-16-02 / T-15-40)', () => {
  it('⑤ 종목 A 의 호가가 종목 B 를 구독한 소비자에게 새지 않는다', async () => {
    render(
      <RelayProvider>
        <QuoteConsumer id="a" isin={ISIN_A} exchange="KRX" />
        <QuoteConsumer id="b" isin={ISIN_B} exchange="KRX" />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();

    await act(async () => {
      ws.push(quoteFrame({ i: ISIN_A, p: 70_000 }));
    });

    expect(screen.getByTestId('quote-a')).toHaveTextContent('70000');
    // 새면 사용자는 **다른 종목 호가로 주문**한다
    expect(screen.getByTestId('quote-b')).toHaveTextContent('none');

    await act(async () => {
      ws.push(quoteFrame({ i: ISIN_B, p: 51_000 }));
    });
    expect(screen.getByTestId('quote-a')).toHaveTextContent('70000');
    expect(screen.getByTestId('quote-b')).toHaveTextContent('51000');
  });

  it('⑤-a 거래소가 다르면 같은 종목이어도 서로의 값을 보지 않는다', async () => {
    render(
      <RelayProvider>
        <QuoteConsumer id="krx" isin={ISIN_A} exchange="KRX" />
        <QuoteConsumer id="nxt" isin={ISIN_A} exchange="NXT" />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();

    await act(async () => {
      ws.push(quoteFrame({ x: 'KRX', p: 70_000 }));
    });

    expect(screen.getByTestId('quote-krx')).toHaveTextContent('70000');
    expect(screen.getByTestId('quote-nxt')).toHaveTextContent('none');
  });
});

describe('RelayProvider — 전략 프레임 반영 (D-12)', () => {
  it('⑥ lc.snap 이 목록을 채우고, crud:"D" 에코가 그 한 건만 지운다', async () => {
    render(
      <RelayProvider>
        <StrategyProbe />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();

    const first = lcItem({ isin: ISIN_A });
    const second = lcItem({ isin: ISIN_B });

    await act(async () => {
      ws.push({ t: 'lc.snap', items: [first, second] });
    });
    expect(screen.getByTestId('lc-keys')).toHaveTextContent(`${first.key},${second.key}`);

    // 「삭제됨」은 스위치 조합이 아니라 에코의 crud 로 판정한다 (Pitfall 7)
    await act(async () => {
      ws.push({ t: 'lc', item: { ...first, crud: 'D' } });
    });
    expect(screen.getByTestId('lc-keys')).toHaveTextContent(second.key);
    expect(screen.getByTestId('lc-keys')).not.toHaveTextContent(first.key);
  });

  it('⑥-a lc 에코 갱신은 목록 자리를 지킨다 (사이드바 순서가 튀지 않는다)', async () => {
    render(
      <RelayProvider>
        <StrategyProbe />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();

    const first = lcItem({ isin: ISIN_A });
    const second = lcItem({ isin: ISIN_B });

    await act(async () => {
      ws.push({ t: 'lc.snap', items: [first, second] });
      ws.push({ t: 'lc', item: { ...first, buyEnabled: false } });
    });

    expect(screen.getByTestId('lc-keys')).toHaveTextContent(`${first.key},${second.key}`);
  });

  it('⑥-b vi 는 미조회/미등록/등록 3상태를 구분한다', async () => {
    render(
      <RelayProvider>
        <StrategyProbe />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();

    // 스냅샷 전 — 아직 아무것도 모른다
    expect(screen.getByTestId('vi-state')).toHaveTextContent('unfetched');

    await act(async () => {
      ws.push({ t: 'vi', cfg: null });
    });
    // 조회했고 등록이 없다 — 「모름」으로 되돌아가면 안 된다
    expect(screen.getByTestId('vi-state')).toHaveTextContent('unregistered');

    await act(async () => {
      ws.push({
        t: 'vi',
        cfg: {
          accountNo: '12345678-01',
          orderAmountKrw: 1_000_000,
          checkRate: 25,
          priceType: 'U',
          run: true,
        },
      });
    });
    expect(screen.getByTestId('vi-state')).toHaveTextContent('run:true');
  });

  it('⑥-c vi.list 는 snap 전량교체 / 델타 upsert 로 갈린다', async () => {
    render(
      <RelayProvider>
        <StrategyProbe />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();

    await act(async () => {
      ws.push({
        t: 'vi.list',
        snap: true,
        items: [viOrder({ orderNo: 'A1', state: 'Accepted' })],
      });
    });
    expect(screen.getByTestId('vi-orders')).toHaveTextContent('Accepted');

    // 델타를 교체로 처리하면 단건 푸시가 나머지 행을 통째로 지운다
    await act(async () => {
      ws.push({
        t: 'vi.list',
        snap: false,
        items: [viOrder({ orderNo: 'A2', state: 'Pending' })],
      });
    });
    expect(screen.getByTestId('vi-orders')).toHaveTextContent('Accepted,Pending');
  });

  it('⑥-d 접수 전(orderNo "") 행은 주문번호가 붙어도 두 줄로 남지 않는다', async () => {
    render(
      <RelayProvider>
        <StrategyProbe />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();

    // relay `viPendingKey` 와 같은 규칙(@ISIN:계좌:발동가)이 아니면 여기서 갈린다
    await act(async () => {
      ws.push({ t: 'vi.list', snap: false, items: [viOrder({ orderNo: '', state: 'Pending' })] });
    });
    expect(screen.getByTestId('vi-order-count')).toHaveTextContent('1');

    await act(async () => {
      ws.push({
        t: 'vi.list',
        snap: false,
        items: [viOrder({ orderNo: 'A9', state: 'Accepted' })],
      });
    });

    expect(screen.getByTestId('vi-order-count')).toHaveTextContent('1');
    expect(screen.getByTestId('vi-orders')).toHaveTextContent('Accepted');
  });

  it('⑥-e vi.notice 누적과 strategies.disabled 완료 신호가 반영된다', async () => {
    render(
      <RelayProvider>
        <StrategyProbe />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();

    await act(async () => {
      ws.push({
        t: 'vi.notice',
        isin: ISIN_A,
        accountNo: '12345678-01',
        triggerPrice: 86_000,
        basePrice: 69_000,
        changeRate: 24,
        orderPrice: 89_700,
        orderQty: 10,
        market: 'K',
        orderSeq: 1,
        viEndTime: '093215000',
      });
      ws.push({ t: 'strategies.disabled', count: 3, viDisabled: true });
    });

    expect(screen.getByTestId('vi-notices')).toHaveTextContent('1');
    expect(screen.getByTestId('disabled')).toHaveTextContent('3');
  });
});

describe('RelayProvider — 견고성', () => {
  it('⑦ 알 수 없는 프레임을 받아도 예외 없이 상태가 그대로다 (T-15-41)', async () => {
    render(
      <RelayProvider>
        <StrategyProbe />
        <QuoteConsumer id="a" isin={ISIN_A} exchange="KRX" />
      </RelayProvider>,
    );
    const ws = await acceptAndAuth();

    await act(async () => {
      ws.push(quoteFrame({ p: 70_000 }));
      ws.push({ t: 'lc.snap', items: [lcItem()] });
    });

    expect(() => {
      act(() => {
        ws.push({ t: 'zzz', whatever: 1 });
      });
    }).not.toThrow();

    expect(screen.getByTestId('quote-a')).toHaveTextContent('70000');
    expect(screen.getByTestId('lc-keys')).toHaveTextContent(lcItem().key);
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
  });

  it('⑧ Provider 밖에서도 throw 하지 않고 빈 값을 돌려준다', () => {
    // 기존 RTL 테스트(account-panel 등)는 Provider 없이 컴포넌트를 렌더한다.
    // 여기서 throw 하면 그 테스트가 전부 깨지고, 프로덕션에서는 화면 전체가 날아간다.
    expect(() =>
      render(
        <>
          <StrategyProbe />
          <QuoteConsumer id="orphan" isin={ISIN_A} exchange="KRX" />
        </>,
      ),
    ).not.toThrow();

    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(screen.getByTestId('lc-keys')).toHaveTextContent('');
    expect(screen.getByTestId('vi-state')).toHaveTextContent('unfetched');
    expect(screen.getByTestId('quote-orphan')).toHaveTextContent('none');
    // 구독을 시도해도 소켓이 없으니 아무 일도 일어나지 않는다
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
