import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type {
  RelayAccountState,
  RelayQuote,
  RelayQueuedWindowMsg,
  RelayUnfilled,
} from '@gh-radar/shared';

/**
 * Phase 18 Plan 10 Task 3 — 종목상세 호가 탭 = 카드 본문 (D-24 · D-23 · D-28, TRADE-07/09).
 *
 * 잠그는 것:
 *   ① 호가 탭 루트가 카드와 **같은 이름의 컨테이너**(`@container/lc`)를 선언한다
 *   ② 본문이 `CardBody variant="orderbook"` 이다 — 사다리·옵션 4그룹을 이 파일이 다시 조립하지 않는다
 *   ③ 상태줄 = DMA · 계좌 · 거래소 KRX|NXT 세그먼트 · LED 3칩 · 구간 배지 · 반영 시각
 *      (카드와 다른 점 ① — 거래소가 헤더가 아니라 상태줄에 있다)
 *   ④ 수동주문 폼에 주문유형 콤보가 있다(다른 점 ②)
 *   ⑤ 미체결은 **이 종목만**이다(다른 점 ③ · T-18-51)
 *   ⑥ 각주가 정정 지원을 반영한 새 원문이다(옛 「정정 미지원」 문장은 거짓이 됐다)
 *   ⑦ 탭을 떠나면(언마운트) 구독이 해제된다 — 보이지 않는 탭에서 실시간 호가를 유지하지 않는다
 *
 * ★ 스텁 경계는 relay 컨텍스트 값(`ctx`) 하나다. `useRelaySubscription` 은 그 값 위에 실제와
 *   같은 계약으로 다시 세워 `subscribe`/`unsubscribe` 호출(⑦)을 관측한다(아래 mock 주석).
 */

type Ctx = import('@/lib/relay-provider').RelayContextValue;
let ctx: Ctx;
const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();

/*
  ★ `useRelaySubscription` 은 같은 모듈 안에서 `useRelayContext` 를 **지역 바인딩**으로 부른다 —
    export 를 바꿔도 그 안쪽 호출은 스텁을 보지 않는다. 그래서 구독 훅도 **실제와 같은 계약**
    (effect 에서 subscribe · cleanup 에서 unsubscribe · 키로 시세 선택)으로 스텁의 `ctx` 위에 다시 세운다.
*/
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  const React = await import('react');
  const { relayQuoteKey: keyOf } = await import('@/lib/use-relay-socket');
  return {
    ...actual,
    useRelayContext: () => ctx,
    useRelaySubscription: ({
      isin,
      exchange,
      enabled = true,
    }: {
      isin: string;
      exchange: 'KRX' | 'NXT';
      enabled?: boolean;
    }) => {
      const active = enabled && isin.length > 0;
      React.useEffect(() => {
        if (!active) return;
        ctx.subscribe(isin, exchange);
        return () => ctx.unsubscribe(isin, exchange);
      }, [active, isin, exchange]);
      return {
        ...ctx,
        quote: active ? (ctx.quotes.get(keyOf(isin, exchange)) ?? null) : null,
        tape: [],
      };
    },
  };
});

import { EMPTY_RELAY_VALUE } from '@/lib/relay-provider';
import { relayQuoteKey } from '@/lib/use-relay-socket';
import { StockOrderbookSection } from '../stock-orderbook-section';

const ISIN = 'KR7042700005';
const OTHER_ISIN = 'KR7005930003';
const CODE = '042700';
const NAME = '한미반도체';
const ACCOUNT = '12345678-01';

function quote(over: Partial<RelayQuote> = {}): RelayQuote {
  const ap = Array.from({ length: 10 }, (_, i) => 128_800 + i * 100);
  const bp = Array.from({ length: 10 }, (_, i) => 128_700 - i * 100);
  return {
    t: 'q',
    i: ISIN,
    x: 'KRX',
    snap: true,
    p: 128_700,
    o: 111_000,
    h: 128_900,
    l: 106_000,
    c: 21_700,
    cs: '2',
    cr: 20.28,
    v: 1_000,
    va: 128_700_000,
    ap,
    aq: ap.map((_, i) => 100 + i),
    bp,
    bq: bp.map((_, i) => 200 + i),
    ta: 0,
    tb: 0,
    ul: 139_100,
    ll: 74_900,
    base: 107_000,
    viu: 0,
    vid: 0,
    kc: 0,
    ls: 0,
    et: '094152000000',
    ...over,
  };
}

function unfilled(over: Partial<RelayUnfilled>): RelayUnfilled {
  return {
    orderNo: '0000000001',
    orgOrderNo: '',
    isin: ISIN,
    side: 'B',
    price: 128_500,
    orderQty: 100,
    filledQty: 60,
    unfilledQty: 40,
    orderTime: '094100',
    queuedStatus: '',
    pendingStatus: '',
    board: '',
    pendingCancelSent: false,
    exchange: 'KRX',
    name: NAME,
    code: CODE,
    ...over,
  };
}

function accountStates(): ReadonlyMap<string, RelayAccountState> {
  return new Map<string, RelayAccountState>([
    [
      ACCOUNT,
      {
        t: 'acct',
        a: ACCOUNT,
        snap: true,
        hold: [{ isin: ISIN, qty: 60, sellableQty: 60, avgPrice: 126_900, name: NAME, code: CODE }],
        unf: [
          unfilled({ orderNo: '3407000064' }),
          // 다른 종목의 미체결 — 이 탭에 절대 나타나면 안 된다(T-18-51).
          unfilled({ orderNo: '9999999999', isin: OTHER_ISIN, name: '삼성전자', code: '005930' }),
        ],
        rm: [],
        st: '094152',
      },
    ],
  ]);
}

function win(): RelayQueuedWindowMsg {
  return {
    t: 'queued.window',
    open: false,
    maxPieces: 10,
    preopenOpen: false,
    g2Open: false,
    g3Open: false,
    nxtPreopenOpen: false,
  };
}

function renderSection() {
  return render(
    <StockOrderbookSection
      code={CODE}
      name={NAME}
      isin={ISIN}
      basePrice={107_000}
      upperLimit={139_100}
      lowerLimit={74_900}
    />,
  );
}

const statusBar = () =>
  document.querySelector('[data-slot="orderbook-status-bar"]') as HTMLElement;

beforeEach(() => {
  subscribeMock.mockReset();
  unsubscribeMock.mockReset();
  ctx = {
    ...EMPTY_RELAY_VALUE,
    status: 'ready',
    statusLabel: '실시간',
    accounts: [{ accountNo: ACCOUNT, name: '위탁종합' }],
    accountStates: accountStates(),
    quotes: new Map([[relayQuoteKey(ISIN, 'KRX'), quote()]]),
    queuedWindow: win(),
    subscribe: subscribeMock,
    unsubscribe: unsubscribeMock,
    send: () => true,
  };
});

describe('StockOrderbookSection — 호가 탭 = 카드 본문 (D-24)', () => {
  it('① 루트가 카드와 같은 이름의 컨테이너(`@container/lc`)를 선언한다', () => {
    renderSection();
    const root = screen.getByTestId('stock-orderbook-section');
    expect(root.className.split(/\s+/)).toContain('@container/lc');
  });

  it('② 본문이 `CardBody variant="orderbook"` 이고 그 안에 사다리·옵션 4그룹이 있다', () => {
    renderSection();
    const body = document.querySelector('[data-slot="card-body"]') as HTMLElement;
    expect(body).not.toBeNull();
    expect(body.getAttribute('data-variant')).toBe('orderbook');
    expect(within(body).getAllByLabelText(/^호가 10단/).length).toBeGreaterThan(0);
    for (const slot of ['buy', 'sweep', 'sell', 'cancel']) {
      expect(body.querySelector(`[data-slot="lc-group-${slot}"]`)).not.toBeNull();
    }
    // 옛 조립 흔적(Phase 15 주문 패널)이 남아 있지 않다.
    expect(screen.queryByTestId('order-panel')).toBeNull();
  });

  it('③ 상태줄에 DMA · 계좌 · 거래소 세그먼트 · LED 점 3개 · 구간 배지 · 반영 시각이 있다 (D-24)', () => {
    renderSection();
    const bar = statusBar();
    expect(bar).not.toBeNull();
    expect(within(bar).getByText('실시간')).toBeInTheDocument();
    expect(bar.textContent).toContain('DMA');
    const account = within(bar).getByRole('combobox', { name: '계좌' });
    expect(account).toHaveValue(ACCOUNT);
    // D-24 — 보이는 「계좌」 글자 대신 select 의 이름(aria-label)과 title 「{번호} · {이름}」이 말한다.
    expect(account).toHaveAttribute('title', `${ACCOUNT} · 위탁종합`);
    const accountWrap = bar.querySelector('[data-slot="orderbook-account"]') as HTMLElement;
    expect(accountWrap).not.toBeNull();
    const ownText = Array.from(accountWrap.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join('');
    expect(ownText).not.toContain('계좌');
    const seg = within(bar).getByRole('group', { name: '거래소' });
    expect(within(seg).getByRole('radio', { name: 'KRX' })).toHaveAttribute('aria-checked', 'true');
    expect(within(seg).getByRole('radio', { name: 'NXT' })).toBeInTheDocument();
    // D-24 — LED 는 칩이 아니라 점 3개(접힌 카드 헤더와 같은 문법). 상태는 sr-only 가 말한다.
    const leds = Array.from(bar.querySelectorAll('[data-slot="latch-led"][data-variant="dot"]'));
    expect(leds.map((el) => el.getAttribute('data-kind'))).toEqual(['buy', 'sell', 'cancel']);
    expect(bar.querySelectorAll('[data-slot="latch-led"]:not([data-variant="dot"])')).toHaveLength(0);
    expect(leds[0].textContent).toMatch(/매수\s*래치\s*OFF/);
    expect(within(bar).getByText('정규')).toBeInTheDocument();
    // D-24 — 「반영 」 접두는 sr-only 이고 title 이 뜻을 말한다(작업대 `stat-applied` 와 같은 규칙).
    const applied = bar.querySelector('[data-slot="orderbook-applied-at"]') as HTMLElement;
    expect(applied).not.toBeNull();
    expect(applied).toHaveAttribute('title', '서버 반영 시각');
    expect(applied.querySelector('.sr-only')?.textContent?.trim()).toBe('반영');
    expect(applied.textContent).toBe('반영 —');
  });

  it('③-e 서버 거부 문장은 상태줄이 아니라 고지 줄의 role=alert 로 한 번만 선다 (D-24)', () => {
    ctx = {
      ...ctx,
      messages: [
        {
          t: 'msg',
          lv: 'ERROR',
          m: '주문 가능 금액이 부족합니다',
          i: ISIN,
          a: ACCOUNT,
          src: 'LimitChaser',
          kind: '',
          receivedAt: '14:32:07',
        },
      ],
    };
    renderSection();
    const notices = document.querySelector('[data-slot="orderbook-notices"]') as HTMLElement;
    expect(notices).not.toBeNull();
    const alert = within(notices).getByRole('alert');
    expect(alert).toHaveAttribute('data-slot', 'orderbook-server-error');
    expect(alert.querySelector('[data-slot="orderbook-server-error-src"]')?.textContent).toBe(
      '[상따]',
    );
    expect(alert.textContent).toContain('주문 가능 금액이 부족합니다');
    // 상태줄에는 경보가 없다 — 같은 문장이 두 자리에서 말하지 않는다.
    expect(within(statusBar()).queryAllByRole('alert')).toHaveLength(0);
    expect(statusBar().textContent).not.toContain('주문 가능 금액이 부족합니다');
    expect(screen.getAllByText(/주문 가능 금액이 부족합니다/)).toHaveLength(1);
  });

  it('③-e2 구간 모름 · 거부/배너/미반영/전환/빈 NXT 없음이면 고지 줄이 렌더되지 않는다', () => {
    ctx = { ...ctx, queuedWindow: undefined };
    renderSection();
    expect(document.querySelector('[data-slot="orderbook-notices"]')).toBeNull();
  });

  it('③-b 구간이 모름(77 미수신)이면 구간 배지가 없다 — 「정규」로 위장하지 않는다', () => {
    ctx = { ...ctx, queuedWindow: undefined };
    renderSection();
    expect(within(statusBar()).queryByText('정규')).toBeNull();
  });

  it('③-c 거래소 세그먼트 NXT → 그 거래소로 구독한다 (거래소는 상태줄이 소유)', () => {
    renderSection();
    fireEvent.click(within(statusBar()).getByRole('radio', { name: 'NXT' }));
    expect(subscribeMock).toHaveBeenCalledWith(ISIN, 'NXT');
  });

  it('③-d quick-260923-pq2 — nxtTradable 집합에 이 종목이 없으면 상태줄 세그먼트가 KRX 라벨 하나(NXT radio 없음), 있으면 둘 다', () => {
    ctx = { ...ctx, nxtTradable: new Set(['KR7000000000']) };
    const { unmount } = renderSection();
    expect(within(statusBar()).queryByRole('radio', { name: 'NXT' })).toBeNull();
    const single = statusBar().querySelector(
      '[data-slot="orderbook-exchange-segment"][data-single="true"]',
    ) as HTMLElement | null;
    expect(single).not.toBeNull();
    expect(single!.textContent).toBe('KRX');
    unmount();

    ctx = { ...ctx, nxtTradable: new Set([ISIN]) };
    renderSection();
    expect(within(statusBar()).getByRole('radio', { name: 'NXT' })).toBeInTheDocument();
    expect(
      statusBar().querySelector('[data-slot="orderbook-exchange-segment"][data-single="true"]'),
    ).toBeNull();
  });

  it('④ 수동주문 폼에 주문유형 콤보가 있다 (호가 탭 전용 · D-23)', () => {
    renderSection();
    expect(screen.getByRole('combobox', { name: '주문유형' })).toBeInTheDocument();
  });

  it('⑤ 미체결은 이 종목만 보여준다 — 다른 종목 주문번호가 이 화면에 없다 (T-18-51)', () => {
    renderSection();
    expect(screen.getAllByText('3407000064').length).toBeGreaterThan(0);
    expect(screen.queryByText('9999999999')).toBeNull();
  });

  it('⑤-b 미체결 행을 누르면 수동주문 폼에 원주문 칩이 뜬다 — 작업대와 같은 정정/취소 계약', () => {
    renderSection();
    fireEvent.click(screen.getAllByRole('button', { pressed: false }).find((b) =>
      b.textContent?.includes('3407000064'),
    ) as HTMLElement);
    const chip = screen.getByTestId('manual-order-selchip');
    expect(chip.textContent).toContain('3407000064');
  });

  it('⑥ 각주가 정정 지원을 반영한 새 원문이다 — 옛 「취소만 지원」 문장이 없다', () => {
    renderSection();
    expect(
      screen.getByText('신규 매수/매도와 정정·취소 · 시간외종가는 정정 불가(취소 후 재등록)'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/신규 매수\/매도와 취소만 지원해요/)).toBeNull();
  });

  it('⑦ 언마운트(탭 이탈)하면 그 종목 구독을 해제한다 — 보이지 않는 탭에서 호가를 유지하지 않는다', () => {
    const { unmount } = renderSection();
    expect(subscribeMock).toHaveBeenCalledWith(ISIN, 'KRX');
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledWith(ISIN, 'KRX');
  });

  it('⑧ 권한 없음이면 게이트가 본문을 대체하고 카드 본문을 그리지 않는다 (섹션은 남는다)', () => {
    ctx = { ...ctx, status: 'unauthorized' };
    renderSection();
    expect(screen.getByTestId('orderbook-access-gate')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="card-body"]')).toBeNull();
    expect(screen.getByTestId('stock-orderbook-section')).toBeInTheDocument();
  });

  it('⑨ 본문과 상태줄에 뷰포트 브레이크포인트가 없다 — 밴드는 컨테이너 폭이다 (D-28)', () => {
    renderSection();
    const root = screen.getByTestId('stock-orderbook-section');
    const all = [root, ...Array.from(root.querySelectorAll('*'))]
      .filter((el) => !el.closest('[data-testid="account-unfilled"], [data-testid="account-holdings"], [data-slot="account-panel"]'))
      .map((el) => el.getAttribute('class') ?? '')
      .join(' ');
    expect(all).not.toMatch(/(^|\s)(sm|md|lg|xl|min-\[900px\]):/);
  });
});
