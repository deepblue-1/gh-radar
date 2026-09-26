import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import type { RelayExchange, RelayLimitChaser, RelayLimitChaserInput } from '@gh-radar/shared';

import { EMPTY_RELAY_VALUE, RelayContext, type RelayContextValue } from '@/lib/relay-provider';
import {
  ACK_TIMEOUT_MS,
  StrategyCard,
  type StrategyCardProps,
  type StrategyCardState,
} from '../card/strategy-card';

/**
 * Phase 18 Plan 06 Task 3 — 전략 카드 1장 (D-27 · D-28 · TRADE-09).
 *
 * 잠그는 것:
 *   - 카드는 자기 `isin`/`exchange` 로만 구독·해제한다(T-18-26).
 *   - 카드는 서버 전략을 **자기 key 로만** 고른다 — 작업대가 분배하지 않는다(T-18-25).
 *   - 카드 A 의 에코가 카드 B 의 pending·미반영·배너를 건드리지 않는다(두 카드 동시 렌더).
 *   - `@container/lc` 는 카드 래퍼가 선언한다 — 안쪽 밴드 유틸리티가 카드 폭을 잰다(D-28).
 *   - 라벨 Map 이 새 인스턴스가 돼도 이름 문자열이 같으면 카드가 다시 그려지지 않는다(T-18-29).
 *
 * ★ 스텁 경계는 `RelayContext` 하나다 — 실제 Provider 컨텍스트에 값을 꽂고 진짜
 *   `useRelaySubscription` 을 태운다. 구독 참조계수가 카드 단위로 도는지를 그대로 본다.
 * ★ 실제 컨테이너 쿼리 폭 전환은 jsdom 이 평가하지 않는다 — 여기서는 선언 위치와 클래스까지만
 *   단언하고, 폭 램프는 18-13 Playwright 가 맡는다.
 */

const ACCOUNT = '37728502101';
const ISIN_A = 'KR7086520004';
const ISIN_B = 'KR7247540008';
const keyOf = (isin: string, exchange: RelayExchange = 'KRX', account = ACCOUNT) =>
  `${isin}:${account}:${exchange}`;

function echo(isin: string, over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  const exchange = over.exchange ?? 'KRX';
  const accountNo = over.accountNo ?? ACCOUNT;
  return {
    isin,
    accountNo,
    market: 'K',
    exchange,
    crud: 'C',
    key: keyOf(isin, exchange, accountNo),
    buyOrderPrice: 130_000,
    buyOrderQty: 1,
    buyWatchPrice: 130_000,
    buyWatchQty: 10_000,
    buyMinTradeQty: 30_000,
    buyWatchSide: '1',
    buyTradeQtyEnabled: false,
    buyEnabled: true,
    buyOrderAmount: 10,
    sellOrderPrice: 130_000,
    sellOrderQty: 0,
    sellWatchPrice: 130_000,
    sellWatchQty: 10,
    sellMinTradeQty: 30_000,
    sellEnabled: false,
    sellTradeQtyEnabled: false,
    sellOrderRatio: 100,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50,
    sellQtyTrackBaseline: 0,
    sellEntryLatched: false,
    sweepWatchPrice: 130_000,
    sweepEnabled: false,
    sweepMinTickCount: 3,
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
    cancelQtyEnabled: false,
    cancelWatchQty: 10,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
    cancelQtyTrackBaseline: 0,
    cancelEntryLatched: false,
    buyEntryLatched: false,
    ...over,
  };
}

const subscribe = vi.fn();
const unsubscribe = vi.fn();
const send = vi.fn(() => true);

function relay(over: Partial<RelayContextValue> = {}): RelayContextValue {
  return {
    ...EMPTY_RELAY_VALUE,
    status: 'ready',
    statusLabel: '실시간',
    accounts: [{ accountNo: ACCOUNT, name: 'KB 위탁종합' }],
    subscribe,
    unsubscribe,
    send,
    ...over,
  } as RelayContextValue;
}

const noop = () => {};
const baseProps: Omit<StrategyCardProps, 'isin'> = {
  cardId: 'wb-card-1',
  accountNo: ACCOUNT,
  exchange: 'KRX',
  name: '에코프로비엠',
  code: '247540',
  open: true,
  onToggle: noop,
  onClose: noop,
  onExchangeChange: noop,
};

/** 본문 슬롯 — 카드 상태를 DOM 으로 비춰 단언 가능하게 한다(18-10 card-body 자리). */
function probeBody(s: StrategyCardState): ReactNode {
  return (
    <div data-testid={`probe-${s.key}`}>
      <span data-part="server-key">{s.server?.key ?? 'none'}</span>
      <span data-part="answer">{s.answerSeq}</span>
      <button
        type="button"
        onClick={() => s.handleSent({ buyEnabled: true } as unknown as RelayLimitChaserInput)}
      >
        보내기
      </button>
    </div>
  );
}

const cardOf = (isin: string) =>
  document.querySelector(`[data-slot="strategy-card"][data-key="${keyOf(isin)}"]`) as HTMLElement;

beforeEach(() => {
  subscribe.mockReset();
  unsubscribe.mockReset();
  send.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StrategyCard', () => {
  it('마운트에서 자기 isin·exchange 로 subscribe 1회, 언마운트에서 같은 키를 unsubscribe', () => {
    const { unmount } = render(
      <RelayContext.Provider value={relay()}>
        <StrategyCard {...baseProps} isin={ISIN_A} exchange="NXT" />
      </RelayContext.Provider>,
    );
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(ISIN_A, 'NXT');
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledWith(ISIN_A, 'NXT');
  });

  it('limitChasers 에 다른 키 전략이 여럿 있어도 자기 key 의 것만 읽는다', () => {
    const others = [
      echo(ISIN_B),
      echo(ISIN_A, { exchange: 'NXT' }),
      echo(ISIN_A, { accountNo: '99999999999' }),
    ];
    const mine = echo(ISIN_A, { buyEnabled: false });
    render(
      <RelayContext.Provider value={relay({ limitChasers: [...others, mine] })}>
        <StrategyCard {...baseProps} isin={ISIN_A} body={probeBody} />
      </RelayContext.Provider>,
    );
    const probe = screen.getByTestId(`probe-${keyOf(ISIN_A)}`);
    expect(probe.querySelector('[data-part="server-key"]')?.textContent).toBe(keyOf(ISIN_A));
    // 헤더 LED 도 자기 전략(매수 무장 OFF)을 읽는다 — 남의 무장(ON)이 새어 들지 않는다.
    const buyLed = cardOf(ISIN_A).querySelector('[data-slot="latch-led"][data-kind="buy"]');
    expect(buyLed?.getAttribute('data-tone')).toBe('off');
    // 등록된 카드도 거래소 세그먼트는 활성이다(quick-260923-pgv — D-10 잠금 절 대체).
    expect(screen.getByRole('group', { name: '거래소' })).not.toHaveAttribute('aria-disabled');
  });

  it('거래소 prop 이 바뀌면 카드는 새 키를 본다 — NXT 전략 없으면 미설정, 있으면 그 전략 · relay 전송 0 (quick-260923-pgv)', () => {
    const krxOnly = relay({ limitChasers: [echo(ISIN_A)] });
    const view = (value: RelayContextValue, exchange: RelayExchange) => (
      <RelayContext.Provider value={value}>
        <StrategyCard {...baseProps} open isin={ISIN_A} exchange={exchange} body={probeBody} />
      </RelayContext.Provider>
    );
    const serverKey = (exchange: RelayExchange) =>
      screen.getByTestId(`probe-${keyOf(ISIN_A, exchange)}`).querySelector('[data-part="server-key"]')
        ?.textContent;
    const card = () => document.querySelector('[data-slot="strategy-card"]') as HTMLElement;

    const { rerender } = render(view(krxOnly, 'KRX'));
    expect(serverKey('KRX')).toBe(keyOf(ISIN_A));
    subscribe.mockClear();

    // KRX → NXT: NXT 키에 서버 전략이 없으니 미설정. 구독도 새 거래소로 옮긴다.
    rerender(view(krxOnly, 'NXT'));
    expect(card().getAttribute('data-key')).toBe(keyOf(ISIN_A, 'NXT'));
    expect(serverKey('NXT')).toBe('none');
    expect(unsubscribe).toHaveBeenCalledWith(ISIN_A, 'KRX');
    expect(subscribe).toHaveBeenCalledWith(ISIN_A, 'NXT');
    expect(card().querySelector('[data-part="name"]')?.getAttribute('title')).toMatch(/ · NXT$/);

    // NXT 전략이 생기면 그것을 읽는다.
    const both = relay({ limitChasers: [echo(ISIN_A), echo(ISIN_A, { exchange: 'NXT' })] });
    rerender(view(both, 'NXT'));
    expect(serverKey('NXT')).toBe(keyOf(ISIN_A, 'NXT'));

    // 되돌리면 KRX 전략을 다시 본다 — KRX 전략은 그대로 있었다.
    rerender(view(both, 'KRX'));
    expect(serverKey('KRX')).toBe(keyOf(ISIN_A));

    // 전 과정에서 relay 로 아무것도 보내지 않는다(전략 삭제·재등록 없음).
    expect(send).not.toHaveBeenCalled();
  });

  it('카드 A 의 에코가 카드 B 의 pending·미반영을 건드리지 않는다(두 카드 동시 렌더)', () => {
    function Harness({ value }: { value: RelayContextValue }) {
      return (
        <RelayContext.Provider value={value}>
          <StrategyCard {...baseProps} isin={ISIN_A} body={probeBody} />
          <StrategyCard {...baseProps} cardId="wb-card-2" isin={ISIN_B} name="다른종목" body={probeBody} />
        </RelayContext.Provider>
      );
    }
    const a0 = echo(ISIN_A);
    const b0 = echo(ISIN_B);
    const { rerender } = render(<Harness value={relay({ limitChasers: [a0, b0] })} />);

    // 두 카드가 각자 한 번씩 보냈다.
    const sendButtons = screen.getAllByRole('button', { name: '보내기' });
    fireEvent.click(sendButtons[0]);
    fireEvent.click(sendButtons[1]);

    const probeA = () => screen.getByTestId(`probe-${keyOf(ISIN_A)}`);
    const probeB = () => screen.getByTestId(`probe-${keyOf(ISIN_B)}`);
    const answerB0 = probeB().querySelector('[data-part="answer"]')?.textContent;

    // A 의 에코만 도착한다.
    const a1 = echo(ISIN_A, { buyOrderQty: 2 });
    rerender(<Harness value={relay({ limitChasers: [a1, b0], lastLimitChaserEcho: a1 })} />);

    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    });

    // A 는 답을 받았다 — 미반영이 서지 않는다. B 는 여전히 답이 없다 — 미반영.
    expect(cardOf(ISIN_A).querySelector('[data-slot="card-unacked"]')).toBeNull();
    expect(cardOf(ISIN_B).querySelector('[data-slot="card-unacked"]')?.textContent).toContain('미반영');
    // A 의 에코로 B 의 답 카운터가 움직이지 않는다.
    expect(probeB().querySelector('[data-part="answer"]')?.textContent).toBe(answerB0);
    expect(Number(probeA().querySelector('[data-part="answer"]')?.textContent)).toBeGreaterThan(0);
    // 내가 보낸 에코라 A 에 「다른 단말」 배너가 없다.
    expect(cardOf(ISIN_A).querySelector('[data-slot="card-echo-banner"]')).toBeNull();
  });

  it('보내지 않은 카드 B 의 서버 변경은 B 에만 「다른 단말에서 변경됐어요」를 세운다', () => {
    function Harness({ value }: { value: RelayContextValue }) {
      return (
        <RelayContext.Provider value={value}>
          <StrategyCard {...baseProps} isin={ISIN_A} body={probeBody} />
          <StrategyCard {...baseProps} cardId="wb-card-2" isin={ISIN_B} name="다른종목" body={probeBody} />
        </RelayContext.Provider>
      );
    }
    const a0 = echo(ISIN_A);
    const b0 = echo(ISIN_B);
    const { rerender } = render(<Harness value={relay({ limitChasers: [a0, b0] })} />);
    const b1 = echo(ISIN_B, { buyOrderQty: 5 });
    rerender(<Harness value={relay({ limitChasers: [a0, b1], lastLimitChaserEcho: b1 })} />);

    expect(cardOf(ISIN_B).querySelector('[data-slot="card-echo-banner"]')?.textContent).toContain(
      '다른 단말에서 변경됐어요',
    );
    expect(cardOf(ISIN_A).querySelector('[data-slot="card-echo-banner"]')).toBeNull();
  });

  it('한 번도 펼친 적 없이 open=false 면 헤더만 남고 10칸·본문이 렌더되지 않는다', () => {
    const body = vi.fn(probeBody);
    render(
      <RelayContext.Provider value={relay()}>
        <StrategyCard {...baseProps} isin={ISIN_A} open={false} body={body} />
      </RelayContext.Provider>,
    );
    const card = cardOf(ISIN_A);
    expect(card.querySelector('[data-slot="card-header"]')).not.toBeNull();
    expect(card.querySelector('[data-slot="lc-quote-grid"]')).toBeNull();
    expect(body).not.toHaveBeenCalled();
    const region = card.querySelector('[data-slot="strategy-card-body"]') as HTMLElement;
    expect(region).toHaveAttribute('hidden');
    expect(region.childElementCount).toBe(0);
    // 헤더 토글이 그 영역을 가리킨다.
    const toggle = screen.getByRole('button', { expanded: false });
    expect(toggle).toHaveAttribute('aria-controls', region.id);
  });

  it('quick-260923-onn — 접힌 헤더 요약 칩은 이 카드 종목·거래소·계좌 슬라이스 숫자다', () => {
    const row = (orderNo: string, isin: string, exchange: RelayExchange) => ({
      orderNo,
      orgOrderNo: '',
      isin,
      side: 'B' as const,
      price: 1000,
      orderQty: 10,
      filledQty: 0,
      unfilledQty: 10,
      exchange,
      orderTime: '090000',
      queuedStatus: '',
      pendingStatus: '',
      board: '',
      pendingCancelSent: false,
    });
    const value = relay({
      accountStates: new Map([
        [
          ACCOUNT,
          {
            t: 'acct' as const,
            a: ACCOUNT,
            snap: true,
            rm: [],
            st: '',
            unf: [row('1', ISIN_A, 'KRX'), row('2', ISIN_A, 'NXT'), row('3', ISIN_B, 'KRX')],
            hold: [{ isin: ISIN_A, qty: 100, sellableQty: 100, avgPrice: 1000 }],
          },
        ],
      ]),
    });
    render(
      <RelayContext.Provider value={value}>
        <StrategyCard {...baseProps} isin={ISIN_A} open={false} />
        <StrategyCard {...baseProps} cardId="wb-card-2" isin={ISIN_B} open={false} />
      </RelayContext.Provider>,
    );
    const a = cardOf(ISIN_A);
    expect(a.querySelector('[data-slot="card-summary-unfilled"]')?.textContent).toBe('미체결 1');
    expect(a.querySelector('[data-slot="card-summary-holding"]')?.textContent).toBe('잔고 100주');
    const b = cardOf(ISIN_B);
    expect(b.querySelector('[data-slot="card-summary-unfilled"]')?.textContent).toBe('미체결 1');
    expect(b.querySelector('[data-slot="card-summary-holding"]')).toBeNull();
  });

  it('WR-02 — 한 번 펼친 본문은 접어도 상태를 지킨다(숨김으로 남는다)', () => {
    function StatefulProbe() {
      const [value, setValue] = useState('');
      return (
        <input
          aria-label="프로브 값"
          data-testid="stateful-probe"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    }
    const body = () => <StatefulProbe />;
    const value = relay();
    const { rerender } = render(
      <RelayContext.Provider value={value}>
        <StrategyCard {...baseProps} isin={ISIN_A} open body={body} />
      </RelayContext.Provider>,
    );
    const probe = screen.getByTestId('stateful-probe') as HTMLInputElement;
    fireEvent.change(probe, { target: { value: '12345' } });
    expect(probe.value).toBe('12345');

    rerender(
      <RelayContext.Provider value={value}>
        <StrategyCard {...baseProps} isin={ISIN_A} open={false} body={body} />
      </RelayContext.Provider>,
    );
    const card = cardOf(ISIN_A);
    const region = card.querySelector('[data-slot="strategy-card-body"]') as HTMLElement;
    // 접힌 카드는 헤더만 **보인다**(D-11) — 본문은 숨김으로 DOM 에 남는다.
    expect(region).toHaveAttribute('hidden');
    expect(screen.getByTestId('stateful-probe')).toBe(probe);
    const grid = card.querySelector('[data-slot="lc-quote-grid"]') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(region.contains(grid)).toBe(true);
    expect(grid).not.toBeVisible();

    rerender(
      <RelayContext.Provider value={value}>
        <StrategyCard {...baseProps} isin={ISIN_A} open body={body} />
      </RelayContext.Provider>,
    );
    expect(region).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('stateful-probe')).toBe(probe);
    expect((screen.getByTestId('stateful-probe') as HTMLInputElement).value).toBe('12345');
  });

  it('open=true 면 헤더 · 종목정보 10칸 · 본문 슬롯이 이 순서로 그려진다', () => {
    render(
      <RelayContext.Provider value={relay()}>
        <StrategyCard {...baseProps} isin={ISIN_A} body={probeBody} />
      </RelayContext.Provider>,
    );
    const card = cardOf(ISIN_A);
    const grid = card.querySelector('[data-slot="lc-quote-grid"]') as HTMLElement;
    expect(grid).not.toBeNull();
    // 시세 미수신 — 10칸 값은 「—」(E8), 헤더 현재가도 「—」(E7).
    expect(grid.querySelectorAll('[data-slot="lc-quote-cell"]')).toHaveLength(10);
    expect(card.querySelector('[data-slot="card-header-price"] [data-part="price"]')?.textContent).toBe('—');
    const probe = screen.getByTestId(`probe-${keyOf(ISIN_A)}`);
    expect(grid.compareDocumentPosition(probe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('카드 래퍼가 @container/lc 를 선언하고, 안쪽 배치는 /lc 유틸리티뿐이며 뷰포트 브레이크포인트가 없다', () => {
    render(
      <RelayContext.Provider value={relay()}>
        <StrategyCard {...baseProps} isin={ISIN_A} />
      </RelayContext.Provider>,
    );
    const card = cardOf(ISIN_A);
    expect(card.tagName).toBe('ARTICLE');
    expect(card.className.split(/\s+/)).toContain('@container/lc');
    // 컨테이너 기준 — 10칸·헤더의 밴드 전환은 카드 폭(`/lc`)을 잰다.
    const grid = card.querySelector('[data-slot="lc-quote-grid"]') as HTMLElement;
    expect(grid.className).toMatch(/@min-\[700px\]\/lc:/);
    expect(
      (card.querySelector('[data-slot="card-header-l2"]') as HTMLElement).className,
    ).toMatch(/@min-\[760px\]\/lc:/);
    // 카드 안에 뷰포트 브레이크포인트가 섞이지 않는다(D-28).
    const classes = [card, ...Array.from(card.querySelectorAll('*'))].map((el) => el.getAttribute('class') ?? '');
    for (const cls of classes) expect(cls).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):/);
    // 카드 안에 두 번째 lc 컨테이너가 없다(가장 가까운 조상 = 카드).
    expect(card.querySelectorAll('[class*="@container/lc"]')).toHaveLength(0);
  });

  it('라벨 Map 이 새 인스턴스가 돼도 이름이 같으면 카드가 재렌더되지 않는다', () => {
    const body = vi.fn(probeBody);
    const onToggle = vi.fn();
    const value = relay();
    let bump: () => void = noop;
    let rename: () => void = noop;

    function Parent() {
      const [labels, setLabels] = useState(
        () => new Map([[ISIN_A, { name: '에코프로비엠', code: '247540' }]]),
      );
      bump = () => setLabels((prev) => new Map(prev));
      rename = () => setLabels(new Map([[ISIN_A, { name: '에코프로비엠우', code: '247540' }]]));
      const label = labels.get(ISIN_A);
      return (
        <RelayContext.Provider value={value}>
          <StrategyCard
            {...baseProps}
            onToggle={onToggle}
            isin={ISIN_A}
            name={label?.name ?? ''}
            code={label?.code ?? null}
            body={body}
          />
        </RelayContext.Provider>
      );
    }

    render(<Parent />);
    const before = body.mock.calls.length;
    expect(before).toBeGreaterThan(0);

    act(() => bump());
    act(() => bump());
    expect(body.mock.calls.length).toBe(before);

    // 이름이 실제로 바뀌면 그때는 다시 그린다.
    act(() => rename());
    expect(body.mock.calls.length).toBeGreaterThan(before);
    expect(screen.getByRole('button', { name: '에코프로비엠우 카드 닫기' })).toBeInTheDocument();
  });

  it('헤더 캐럿·✕·거래소 콜백은 자기 cardId 를 실어 부모에게 알린다 (WR-05 — ISIN 이 아니다)', () => {
    const onToggle = vi.fn();
    const onClose = vi.fn();
    const onExchangeChange = vi.fn();
    render(
      <RelayContext.Provider value={relay()}>
        <StrategyCard
          {...baseProps}
          cardId="wb-card-7"
          isin={ISIN_A}
          onToggle={onToggle}
          onClose={onClose}
          onExchangeChange={onExchangeChange}
        />
      </RelayContext.Provider>,
    );
    // 카드 탭 접기 버튼(quick-260925-ptw)도 aria-expanded 를 가져 헤더 토글은 이름으로 고른다.
    fireEvent.click(screen.getByRole('button', { name: '에코프로비엠', expanded: true }));
    fireEvent.click(screen.getByRole('button', { name: '에코프로비엠 카드 닫기' }));
    fireEvent.click(screen.getByRole('radio', { name: 'NXT' }));
    expect(onToggle).toHaveBeenCalledWith('wb-card-7');
    expect(onClose).toHaveBeenCalledWith('wb-card-7');
    expect(onExchangeChange).toHaveBeenCalledWith('wb-card-7', 'NXT');
    // DOM id 접두도 카드 id 에서 나온다 — 같은 종목 카드 둘이 id 를 공유하지 않는다.
    expect(document.getElementById('strategy-card-wb-card-7-toggle')).not.toBeNull();
    expect(document.getElementById('strategy-card-wb-card-7-body')).not.toBeNull();
  });

  it('종목명 title 이 「{종목명} · 계좌 {계좌} · {거래소}」 를 말한다 (UI-SPEC Q-3 · 보이는 글자는 종목명뿐)', () => {
    render(
      <RelayContext.Provider value={relay()}>
        <StrategyCard {...baseProps} isin={ISIN_A} exchange="NXT" />
      </RelayContext.Provider>,
    );
    const nameEl = document.querySelector('[data-part="name"]') as HTMLElement;
    expect(nameEl.getAttribute('title')).toBe(`에코프로비엠 · 계좌 ${ACCOUNT} · NXT`);
    expect(nameEl.textContent).toBe('에코프로비엠');
  });

  it('quick-260923-pq2 — 컨텍스트 nxtTradable 집합에 이 카드 ISIN 이 없으면 헤더 세그먼트가 세그먼트 없음, 있으면/모르면 둘 다', () => {
    const headerOf = () =>
      cardOf(ISIN_A).querySelector('[data-slot="card-header"]') as HTMLElement;
    const radios = () => headerOf().querySelectorAll('[role="radio"]');
    const singles = () => headerOf().querySelectorAll('[data-single="true"]');

    const { rerender } = render(
      <RelayContext.Provider value={relay({ nxtTradable: new Set(['KR7000000000']) })}>
        <StrategyCard {...baseProps} isin={ISIN_A} />
      </RelayContext.Provider>,
    );
    expect(radios()).toHaveLength(0);
    // 2026-09-23 — NXT 미거래 종목은 세그먼트 자체를 그리지 않는다(라벨도 없음).
    expect(singles()).toHaveLength(0);
    expect(headerOf().querySelector('[data-slot="card-exchange-segment"]')).toBeNull();

    rerender(
      <RelayContext.Provider value={relay({ nxtTradable: new Set([ISIN_A]) })}>
        <StrategyCard {...baseProps} isin={ISIN_A} />
      </RelayContext.Provider>,
    );
    expect(radios()).toHaveLength(2);
    expect(singles()).toHaveLength(0);

    rerender(
      <RelayContext.Provider value={relay()}>
        <StrategyCard {...baseProps} isin={ISIN_A} />
      </RelayContext.Provider>,
    );
    expect(radios()).toHaveLength(2);
  });
});

/**
 * G-21-R3-2 · D-25a — 카드 더티 바는 앱에서 네이티브 탭바 몫까지 비킨다.
 * 탭바 몫은 숨은 프로브(`native-tabbar-probe`)의 computed `bottom` px 다(calc 변수는 getPropertyValue 로 못 읽는다).
 * jsdom 은 레이아웃·calc 가 없으므로 기하와 프로브 계산값만 꽂고 **식**(innerHeight − inset − 탭바 몫)을 잠근다 —
 * 실브라우저에서 프로브가 82px(14 + 60 + 8)로 풀리는지는 e2e 「G-21-R3-2」 가 본다.
 */
describe('StrategyCard 더티 바 탭바 비킴 (G-21-R3-2)', () => {
  const dirtyBody = (s: StrategyCardState): ReactNode => (
    <button type="button" onClick={() => s.setDirtyCount(1)}>
      더티
    </button>
  );

  function mountDirty(tabbarPx: string): HTMLElement {
    const realGcs = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
      const cs = realGcs(el, pseudo);
      if ((el as HTMLElement).dataset?.slot !== 'native-tabbar-probe') return cs;
      return new Proxy(cs, {
        get: (t, k) => (k === 'bottom' ? tabbarPx : Reflect.get(t, k)),
      });
    });
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844);
    const realRect = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if ((this as HTMLElement).dataset?.slot === 'strategy-card') {
        return { top: 100, bottom: 1500, left: 0, right: 390, width: 390, height: 1400, x: 0, y: 100, toJSON() {} } as DOMRect;
      }
      return realRect.call(this);
    });
    render(
      <RelayContext.Provider value={relay()}>
        <StrategyCard {...baseProps} isin={ISIN_A} body={dirtyBody} />
      </RelayContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '더티' }));
    return document.querySelector('[data-slot="card-dirty-host"]') as HTMLElement;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('[data-slot="native-tabbar-probe"]').forEach((n) => n.remove());
  });

  it('프로브는 문서에 한 번만 깔린다 — 카드가 둘이어도', () => {
    render(
      <RelayContext.Provider value={relay()}>
        <StrategyCard {...baseProps} isin={ISIN_A} />
        <StrategyCard {...baseProps} cardId="wb-card-2" isin={ISIN_B} />
      </RelayContext.Provider>,
    );
    const probes = document.querySelectorAll('[data-slot="native-tabbar-probe"]');
    expect(probes).toHaveLength(1);
    expect((probes[0] as HTMLElement).style.position).toBe('fixed');
    expect((probes[0] as HTMLElement).style.visibility).toBe('hidden');
  });

  it('앱 — 화면 아래 = innerHeight − 탭바 몫(82) 에 바를 붙인다', () => {
    const host = mountDirty('82px');
    // 카드 끝 1500 · 한계 844 − 0 − 82 = 762 → −738 만큼 올린다.
    expect(host.style.transform).toBe('translateY(-738px)');
  });

  it('브라우저 — 탭바 몫 0 이면 종전 식(innerHeight − inset) 그대로', () => {
    const host = mountDirty('0px');
    expect(host.style.transform).toBe('translateY(-656px)');
  });
});
