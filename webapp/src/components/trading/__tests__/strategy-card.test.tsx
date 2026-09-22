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
    // 등록된 카드라 거래소가 잠긴다(서버 전략 = 자기 키의 것).
    expect(screen.getByRole('group', { name: '거래소' })).toHaveAttribute('aria-disabled', 'true');
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
      (card.querySelector('[data-slot="card-header-l1"]') as HTMLElement).className,
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
    fireEvent.click(screen.getByRole('button', { expanded: true }));
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
});
