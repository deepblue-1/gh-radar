import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import type { RelayLimitChaser, RelayQuote, RelayQueuedWindowMsg } from '@gh-radar/shared';

/**
 * Phase 18 Plan 10 Task 1 — 카드 본문 계약 (D-12 · D-19 · D-23 · D-24 · D-28, TRADE-07/09).
 *
 * 잠그는 것:
 *   ① 좌 호가(+체결) | 우 옵션 4그룹 — 세로 스택이 없고 섹션 라벨이 없다(D-12)
 *   ② 그룹 제목줄 스위치 3개 · 제목 옆 보조문 5문구(「감시 중」 등)
 *   ③ 시세 없음 → 10단 행은 그리되 가격 「—」(E9 empty) · 값 없는 셀 클릭은 no-op(T-18-47)
 *   ④ 밴드는 **카드 폭**(`@min-[Npx]/lc:`) — 뷰포트 브레이크포인트 0건(D-28)
 *   ⑤ `variant` 가 주문유형 콤보 유무를 가른다(D-23)
 *   ⑥ 더티 바는 `document.body` 포털이고 문구에 종목명이 선다(D-28)
 *
 * ★ jsdom 은 컨테이너 쿼리를 평가하지 않는다. 밴드 전환은 **클래스 존재**로만 단언하고,
 *   실제 폭 램프는 18-13 Playwright 가 맡는다. 없는 검증을 했다고 적지 않는다.
 * ★ 스텁 경계는 `useRelayContext` 하나다(`send` · `sendOrder`). 카드 상태는 훅을 돌리지 않고
 *   `StrategyCardState` 모양의 값을 직접 넣는다 — 본문이 상태를 **소유하지 않는다**는 계약 그대로다.
 */

const sendMock = vi.fn();
const sendOrderMock = vi.fn();
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({
      ...actual.EMPTY_RELAY_VALUE,
      send: sendMock,
      sendOrder: sendOrderMock,
    }),
  };
});

import { CHAT_FAB_CLEARANCE_CLASS } from '@/components/chat/fab-clearance';
import type { StrategyCardState } from '../card/strategy-card';
import {
  CardBody,
  cardDirtyHint,
  cardGroupStatusOf,
  type CardBodyProps,
} from '../card/card-body';

const ISIN = 'KR7042700005';
const ACCOUNT = '12345678-01';
const NAME = '한미반도체';

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

function quote(over: Partial<RelayQuote> = {}): RelayQuote {
  const ap = Array.from({ length: 10 }, (_, i) => 130_100 + i * 100);
  const bp = Array.from({ length: 10 }, (_, i) => 130_000 - i * 100);
  return {
    t: 'q',
    i: ISIN,
    x: 'KRX',
    snap: true,
    p: 130_000,
    o: 120_000,
    h: 131_000,
    l: 119_000,
    c: 10_000,
    cs: '2',
    cr: 8.33,
    v: 1_000,
    va: 130_000_000,
    ap,
    aq: ap.map((_, i) => 100 + i),
    bp,
    bq: bp.map((_, i) => 200 + i),
    ta: 0,
    tb: 0,
    ul: 156_000,
    ll: 84_000,
    base: 120_000,
    viu: 0,
    vid: 0,
    kc: 0,
    ls: 0,
    et: '093000000000',
    ...over,
  };
}

function server(over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  return {
    isin: ISIN,
    accountNo: ACCOUNT,
    market: 'K',
    exchange: 'KRX',
    crud: 'C',
    key: `${ISIN}:${ACCOUNT}:KRX`,
    buyOrderPrice: 130_000,
    buyOrderQty: 3,
    buyWatchPrice: 130_000,
    buyWatchQty: 10_000,
    buyMinTradeQty: 30_000,
    buyWatchSide: '1',
    buyTradeQtyEnabled: false,
    buyEnabled: false,
    buyOrderAmount: 50,
    sellOrderPrice: 130_000,
    sellWatchPrice: 130_000,
    sellWatchQty: 100_000,
    sellMinTradeQty: 30_000,
    sellEnabled: false,
    sellTradeQtyEnabled: false,
    sellOrderRatio: 100,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50,
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
    sellOrderQty: 0,
    sellQtyTrackBaseline: 0,
    sellEntryLatched: false,
    cancelQtyTrackBaseline: 0,
    cancelEntryLatched: false,
    buyEntryLatched: false,
    ...over,
  };
}

function cardState(over: Partial<StrategyCardState> = {}): StrategyCardState {
  return {
    key: `${ISIN}:${ACCOUNT}:KRX`,
    server: null,
    quote: null,
    tape: [],
    isStale: false,
    log: [],
    unacked: false,
    answerSeq: 0,
    banner: null,
    appliedAt: null,
    lastError: null,
    resetSeq: 0,
    liveSeed: 0,
    fired: false,
    badges: { buyText: '', sellText: '' },
    ledServer: null,
    dirtyCount: 0,
    setDirtyCount: vi.fn(),
    handleArm: vi.fn(),
    handleSent: vi.fn(),
    handleServerEcho: vi.fn(),
    ...over,
  };
}

function props(over: Partial<CardBodyProps> = {}): CardBodyProps {
  return {
    variant: 'card',
    card: cardState(),
    isin: ISIN,
    accountNo: ACCOUNT,
    exchange: 'KRX',
    name: NAME,
    code: '042700',
    status: 'ready',
    queuedWindow: win(),
    ...over,
  };
}

/**
 * 더티 수를 **실제 state** 로 들고 있는 하네스 — 카드 훅이 하는 일(폼 → `setDirtyCount` →
 * 본문 재렌더)을 그대로 재현한다. 가짜 `setDirtyCount` 로는 바 문구의 N 이 영원히 0 이다.
 */
function Harness(over: Partial<CardBodyProps>) {
  const [dirtyCount, setDirtyCount] = useState(0);
  // 더티는 **서버 기준선**이 있어야 생긴다 — 신규 폼(서버 전략 없음)에는 더티가 없다.
  const [srv] = useState(() => server());
  const base = props({ card: cardState({ server: srv }), ...over });
  return <CardBody {...base} card={{ ...base.card, dirtyCount, setDirtyCount }} />;
}

const bodyRoot = (c: HTMLElement) => c.querySelector('[data-slot="card-body"]') as HTMLElement;
const orderbookPane = (c: HTMLElement) =>
  c.querySelector('[data-slot="card-body-orderbook"]') as HTMLElement;
const optionsPane = (c: HTMLElement) =>
  c.querySelector('[data-slot="card-body-options"]') as HTMLElement;
const manualPrice = (c: HTMLElement) =>
  c.querySelector(`#mo-price-${ISIN}`) as HTMLInputElement;

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockReturnValue(true);
  sendOrderMock.mockReset();
});

describe('① 좌 호가 | 우 옵션 4그룹 (D-12)', () => {
  it('좌 pane 에 「호가 10단」 사다리가, 우 pane 에 옵션 4그룹이 있다 · 좌 pane 은 오른쪽 테두리', () => {
    const { container } = render(<CardBody {...props({ card: cardState({ quote: quote() }) })} />);

    const left = orderbookPane(container);
    const right = optionsPane(container);
    expect(within(left).getAllByLabelText(/^호가 10단/).length).toBeGreaterThan(0);
    expect(left.className).toContain('border-r');
    expect(left.className).toContain('border-[var(--border-subtle)]');
    for (const slot of ['buy', 'sweep', 'sell', 'cancel']) {
      expect(right.querySelector(`[data-slot="lc-group-${slot}"]`)).not.toBeNull();
    }
    // 두 pane 은 형제다 — 세로 스택이 아니라 한 그리드의 두 칸이다.
    expect(left.parentElement).toBe(bodyRoot(container));
    expect(right.parentElement).toBe(bodyRoot(container));
  });

  it('「호가」「체결」「옵션 세팅」 같은 섹션 라벨이 없다 — 제목 역할 요소 0개', () => {
    const { container } = render(<CardBody {...props({ card: cardState({ quote: quote() }) })} />);
    const root = bodyRoot(container);

    expect(within(root).queryByText('호가', { exact: true })).toBeNull();
    expect(within(root).queryByText('옵션 세팅', { exact: true })).toBeNull();
    expect(within(root).queryByText('체결 테이프', { exact: true })).toBeNull();
    expect(within(root).queryAllByRole('heading')).toHaveLength(0);
    // 「체결」 은 폼 필드 라벨(체크박스 `<label>`)로만 산다 — 섹션 제목이 아니다.
    const optionsCheLabels = within(optionsPane(container))
      .queryAllByText('체결', { exact: true })
      .filter((el) => el.tagName !== 'LABEL');
    expect(optionsCheLabels).toHaveLength(0);
  });

  it('그룹 제목줄 스위치 3개의 접근성 이름이 계약 원문이다', () => {
    render(<CardBody {...props()} />);
    expect(screen.getByRole('checkbox', { name: '매수주문 켜기' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '한방체결 켜기' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '매도주문 켜기' })).toBeInTheDocument();
  });
});

describe('② 그룹 보조문 5문구 (UI-SPEC §카드)', () => {
  it('등록 전(서버 전략 없음)은 네 그룹 전부 「꺼짐」이다 (E10 empty)', () => {
    expect(cardGroupStatusOf(null, false)).toEqual({
      buy: '꺼짐',
      sweep: '꺼짐',
      sell: '꺼짐',
      cancel: '꺼짐',
    });
    const { container } = render(<CardBody {...props()} />);
    const buy = container.querySelector('[data-slot="lc-group-buy"]') as HTMLElement;
    expect(within(buy).getByText('꺼짐')).toBeInTheDocument();
  });

  it('무장 래치 전은 「무장 · 대기」, 래치 후는 「감시 중」, 한방은 「켜짐」', () => {
    const latent = server({ buyEnabled: true, sweepEnabled: true, sellEnabled: true });
    expect(cardGroupStatusOf(latent, false)).toMatchObject({
      buy: '무장 · 대기',
      sweep: '켜짐',
      sell: '무장 · 대기',
    });
    const armed = server({
      buyEnabled: true,
      buyEntryLatched: true,
      sellEnabled: true,
      sellEntryLatched: true,
      cancelQtyEnabled: true,
      cancelEntryLatched: true,
    });
    expect(cardGroupStatusOf(armed, false)).toEqual({
      buy: '감시 중',
      sweep: '꺼짐',
      sell: '감시 중',
      cancel: '감시 중',
    });
  });

  it('발주로 무장이 풀렸으면 매수는 「발주 완료 · 무장 해제」다 (fired)', () => {
    expect(cardGroupStatusOf(server({ buyEnabled: false }), true).buy).toBe(
      '발주 완료 · 무장 해제',
    );
    const { container } = render(
      <CardBody
        {...props({ card: cardState({ server: server({ buyEnabled: false }), fired: true }) })}
      />,
    );
    const buy = container.querySelector('[data-slot="lc-group-buy"]') as HTMLElement;
    expect(within(buy).getByText('발주 완료 · 무장 해제')).toBeInTheDocument();
  });
});

describe('③ 시세 없음 · 가격 셀 클릭 (E9 · T-18-47)', () => {
  it('시세가 없어도 10단 행을 그리고 가격은 「—」, 체결 행은 0건이다 (E9 empty)', () => {
    const { container } = render(<CardBody {...props()} />);
    const left = orderbookPane(container);

    const rows = left.querySelectorAll('[data-slot="ladder-row-mobile"]');
    expect(rows).toHaveLength(20); // 매도 10 + 매수 10
    for (const row of Array.from(rows)) expect(row.textContent).toContain('—');
    expect(left.querySelectorAll('[data-slot="trade-tape"] tbody tr')).toHaveLength(0);
    // 빈 상태 안내 카드(「호가 정보가 없어요」)로 대체하지 않는다 — 행 수가 고정이다.
    expect(within(left).queryByText('호가 정보가 없어요')).toBeNull();
  });

  it('값 없는 가격 셀 클릭은 no-op 이다 — 수동주문 가격을 채우지 않는다', () => {
    const { container } = render(<CardBody {...props()} />);
    const row = orderbookPane(container).querySelector(
      '[data-slot="ladder-row-mobile"]',
    ) as HTMLElement;
    fireEvent.click(row);
    expect(manualPrice(container).value).toBe('');
  });

  it('값 있는 가격 셀 클릭은 그 가격을 수동주문 폼에 1회 채운다', () => {
    const { container } = render(<CardBody {...props({ card: cardState({ quote: quote() }) })} />);
    const cell = within(orderbookPane(container)).getAllByText('130,100')[0];
    fireEvent.click(cell);
    expect(manualPrice(container).value).toBe('130,100');
  });
});

describe('④ 밴드는 카드 폭이다 (D-28)', () => {
  it('본문 그리드가 700 · 830 · 992 세 경계를 `/lc` 로 쓰고 뷰포트 브레이크포인트가 없다', () => {
    const { container } = render(<CardBody {...props()} />);
    const cls = bodyRoot(container).className;
    expect(cls).toContain('@min-[700px]/lc:');
    expect(cls).toContain('@min-[830px]/lc:');
    expect(cls).toContain('@min-[992px]/lc:');
    expect(cls).not.toMatch(/(^|\s)(sm|md|lg|xl):/);
  });
});

describe('⑤ variant — 주문유형 콤보 (D-23)', () => {
  it('`variant="card"` 는 주문유형 콤보가 없다', () => {
    render(<CardBody {...props({ variant: 'card' })} />);
    expect(screen.queryByRole('combobox', { name: '주문유형' })).toBeNull();
  });

  it('`variant="orderbook"` 는 주문유형 콤보가 있다', () => {
    render(<CardBody {...props({ variant: 'orderbook' })} />);
    expect(screen.getByRole('combobox', { name: '주문유형' })).toBeInTheDocument();
  });

  it('폰 밴드 3탭 「매수 | 매도 | 수동」 이 한 줄이다 — 폼 자체의 2탭 줄이 함께 서지 않는다', () => {
    render(<CardBody {...props()} />);
    expect(screen.getByRole('tablist', { name: '주문 진입' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: '주문 설정' })).toBeNull();
  });

  it('3탭의 「매도」 는 옵션 영역의 매도 pane 을 보이게 한다 (제어형 탭)', () => {
    const { container } = render(<CardBody {...props()} />);
    fireEvent.click(screen.getByRole('tab', { name: '매도' }));
    const buyPane = container.querySelector('[data-pane="buy"]') as HTMLElement;
    const sellPane = container.querySelector('[data-pane="sell"]') as HTMLElement;
    expect(buyPane.className).toContain('hidden');
    expect(sellPane.className).not.toContain('hidden');
  });
});

describe('⑥ 더티 바 — body 포털 · 종목명 (D-28 · E15)', () => {
  it('더티가 생기면 바가 `document.body` 에 포털되고 보조문에 종목명과 개수가 선다(호가 탭 — 작업대 카드는 카드 하단 자리 · 종목명 없음)', () => {
    const { container } = render(<Harness variant="orderbook" />);
    fireEvent.change(screen.getByLabelText(/매수가격/), { target: { value: '150000' } });

    const bar = document.querySelector('[data-slot="dirty-action-bar"]') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(container.contains(bar)).toBe(false);
    expect(document.body.contains(bar)).toBe(true);
    expect(bar.textContent).toContain(`${NAME} · 1개 미반영`);
  });

  it('호가 탭(`variant="orderbook"`)만 바의 오른쪽 끝이 AI FAB 자리 앞에서 멈춘다 (실측 폭 변수)', () => {
    render(<Harness variant="orderbook" />);
    fireEvent.change(screen.getByLabelText(/매수가격/), { target: { value: '150000' } });
    const bar = document.querySelector('[data-slot="dirty-action-bar"]') as HTMLElement;
    expect(bar.className.split(/\s+/)).toContain(CHAT_FAB_CLEARANCE_CLASS);
    expect(CHAT_FAB_CLEARANCE_CLASS).toContain('var(--chat-fab-w');
  });

  it('작업대 카드(`variant="card"`)의 바는 전폭이고 오른쪽 예약이 없다 — FAB 이 없는 표면이다', () => {
    render(<Harness variant="card" />);
    fireEvent.change(screen.getByLabelText(/매수가격/), { target: { value: '150000' } });
    const bar = document.querySelector('[data-slot="dirty-action-bar"]') as HTMLElement;
    const utils = bar.className.split(/\s+/);
    expect(utils.some((c) => /^(pr|right)-/.test(c))).toBe(false);
    expect(utils).toContain('inset-x-0');
  });

  it('긴 종목명은 한 줄 말줄임(…)으로 잘리고 안내 문장은 그대로다 (E15 long-text)', () => {
    const long = '아주아주긴이름의가상종목홀딩스우선주스페셜에디션';
    const hint = cardDirtyHint(long, 3);
    expect(hint).toContain('…');
    expect(hint).not.toContain(long);
    expect(hint).toContain('3개 미반영');
    expect(hint).toContain('「수정」을 눌러야 반영돼요');
    expect(cardDirtyHint(NAME, 2).startsWith(`${NAME} · 2개 미반영`)).toBe(true);
  });
});
