import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { RelayLimitChaser, RelayQuote, RelayQueuedWindowMsg } from '@gh-radar/shared';

/**
 * Phase 18 Plan 10 Task 1 — 카드 본문 계약 (D-12 · D-19 · D-23 · D-24 · D-28, TRADE-07/09).
 *
 * 잠그는 것:
 *   ① 좌 호가(+체결) | 우 옵션 4그룹 — 세로 스택이 없고 섹션 라벨이 없다(D-12)
 *   ② 그룹 제목줄 스위치 4개(Phase 20 — 매수취소 포함) · 제목 옆 보조문 5문구(「감시 중」 등)
 *   ③ 시세 없음 → 10단 행은 그리되 가격 「—」(E9 empty) · 값 없는 셀 클릭은 no-op(T-18-47)
 *   ④ 밴드는 **카드 폭**(`@min-[Npx]/lc:`) — 뷰포트 브레이크포인트 0건(D-28)
 *   ⑤ `variant` 가 주문유형 콤보 유무를 가른다(D-23)
 *   ⑥ 즉시 반영 — 값 확정 1회 = `lc.set` 1회 · 더티 바·더티 테두리 없음(Phase 20 D-04)
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

/*
  D-15a — 카드 본문이 종목 마스터 분류(`stocks.security_group`)를 읽어 두 폼에 같은 잠금 강도를 준다.
  스텁 경계는 `createClient` 하나 — 조회 결과만 바꾼다(기본: 행 없음 → unknown).
*/
const master = vi.hoisted(() => ({ group: null as string | null }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: master.group === null ? null : { security_group: master.group },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import { mockPointer, restoreMatchMedia } from '@/lib/__tests__/match-media';
import { clearTickRuleCache } from '@/lib/tick-rule';
import type { StrategyCardState } from '../card/strategy-card';
import { CardBody, cardGroupStatusOf, type CardBodyProps } from '../card/card-body';

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
  clearTickRuleCache();
  master.group = '주권';
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
    // 「체결」 은 체크 행 라벨(`role="checkbox"` 버튼 안)로만 산다 — 섹션 제목이 아니다(Phase 20 D-22).
    const optionsCheLabels = within(optionsPane(container))
      .queryAllByText('체결', { exact: true })
      .filter((el) => el.closest('[role="checkbox"]') === null);
    expect(optionsCheLabels).toHaveLength(0);
  });

  it('그룹 제목줄 스위치 4개(`role="switch"`)의 접근성 이름이 계약 원문이다 — 매수취소 포함(Phase 20 D-21)', () => {
    render(<CardBody {...props()} />);
    expect(screen.getByRole('switch', { name: '매수주문 켜기' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '한방체결 켜기' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '매도주문 켜기' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '매수취소 켜기' })).toBeInTheDocument();
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

/**
 * Phase 20 D-04 — 상따 설정의 더티 누적 · 하단 「수정/되돌리기」 바를 폐기했다. 값 하나를 확정하면
 * 그 한 필드가 곧 `lc.set` 1회다(`useLcFieldCommit`). 옛 ⑥ 「더티 바 — body 포털 · 종목명」 4건의
 * 의미를 여기로 옮긴다: 바가 **없다**는 것 · 확정이 곧 전송이라는 것 · 실패가 행에서 말한다는 것.
 */
describe('⑥ 즉시 반영 — 더티 바 없음 (D-04)', () => {
  const lcSets = () =>
    sendMock.mock.calls
      .map(([m]) => m as { t?: string; cfg?: Record<string, unknown> })
      .filter((m) => m?.t === 'lc.set');
  const INLINE_FAILED = '반영하지 못했어요 · Enter 로 다시 시도해 주세요';

  /** 「잔량 10,000주」 행을 눌러 인라인 편집기를 열고 값을 친 뒤 Enter — 확정 1회. */
  function commitWatchQty(value: string): HTMLInputElement {
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '잔량 10,000주' }));
    });
    const input = document.querySelector('#lc-buy-watch-qty') as HTMLInputElement;
    expect(input, '잔량 인라인 입력').not.toBeNull();
    act(() => {
      fireEvent.change(input, { target: { value } });
    });
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    return input;
  }

  function noDirtyTraces(): void {
    expect(document.querySelector('[data-slot="dirty-action-bar"]')).toBeNull();
    const all = Array.from(document.querySelectorAll<HTMLElement>('[class]'));
    expect(all.some((el) => (el.getAttribute('class') ?? '').includes('var(--primary)_55%'))).toBe(false);
  }

  it('작업대 카드 — 잔량 행 인라인 8000 Enter → lc.set 1회(cfg 8000) · 더티 바·더티 테두리 없음', () => {
    render(<CardBody {...props({ card: cardState({ server: server() }) })} />);
    commitWatchQty('8000');
    expect(lcSets()).toHaveLength(1);
    expect(lcSets()[0]!.cfg!.buyWatchQty).toBe(8_000);
    noDirtyTraces();
  });

  it('호가 탭(`variant="orderbook"`)도 같은 편집 뒤 더티 바가 없다 — 종목명 바 문구도 사라졌다', () => {
    render(<CardBody {...props({ variant: 'orderbook', card: cardState({ server: server() }) })} />);
    commitWatchQty('8000');
    expect(lcSets()).toHaveLength(1);
    noDirtyTraces();
    expect(document.body.textContent).not.toContain('개 미반영');
    expect(document.body.textContent).not.toContain('「수정」을 눌러야 반영돼요');
  });

  it('매수취소 스위치 → cfg.cancelQtyEnabled 토글 1회 전송 · 확인 다이얼로그 없음 (D-21)', () => {
    render(<CardBody {...props({ card: cardState({ server: server({ buyEnabled: true }) }) })} />);
    act(() => {
      fireEvent.click(screen.getByRole('switch', { name: '매수취소 켜기' }));
    });
    expect(lcSets()).toHaveLength(1);
    expect(lcSets()[0]!.cfg!.cancelQtyEnabled).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    noDirtyTraces();
  });

  it('보낸 뒤 카드 `unacked` 가 true 가 되면 편집 중이던 행에 「반영하지 못했어요 · Enter 로 다시 시도해 주세요」 (UI-SPEC A10)', () => {
    const srv = server();
    const { rerender } = render(<CardBody {...props({ card: cardState({ server: srv }) })} />);
    const input = commitWatchQty('8000');
    expect(lcSets()).toHaveLength(1);
    rerender(<CardBody {...props({ card: cardState({ server: srv, unacked: true }) })} />);
    const bubble = screen.getByText(INLINE_FAILED);
    expect(bubble.closest('[role="alert"]')).not.toBeNull();
    // 입력값은 보존된다 — 다시 Enter 가 재시도다(자동 재전송 없음).
    expect(input.value).toBe('8,000');
    expect(lcSets()).toHaveLength(1);
  });

  describe('터치 기기 — 시트 칩 「현재가」 원천 (D-12 · 20-03)', () => {
    beforeEach(() => mockPointer(true));
    afterEach(restoreMatchMedia);

    it('매수가격 행 탭 → 시트 「매수가격」 · 시세가 있으면 칩 「현재가」 활성', () => {
      render(<CardBody {...props({ card: cardState({ server: server(), quote: quote() }) })} />);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '매수가격 130,000원' }));
      });
      expect(screen.getByRole('dialog', { name: '매수가격' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '현재가' })).toBeEnabled();
    });

    it('시세가 없으면 칩 「현재가」 는 비활성이다', () => {
      render(<CardBody {...props({ card: cardState({ server: server() }) })} />);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '매수가격 130,000원' }));
      });
      expect(screen.getByRole('button', { name: '현재가' })).toBeDisabled();
    });

    it('수동주문 가격 상자 → 시트 칩 「현재가」「상한가」 가 같은 카드 시세(quote.p · quote.ul)다 · 전송 0 (20-06 · T-18-48)', () => {
      render(<CardBody {...props({ card: cardState({ server: server(), quote: quote() }) })} />);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '가격' }));
      });
      expect(screen.getByRole('dialog', { name: '가격' })).toBeInTheDocument();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '상한가' }));
      });
      expect(document.querySelector('[data-slot="numpad-value"]')?.textContent).toBe('156,000');
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '현재가' }));
      });
      expect(document.querySelector('[data-slot="numpad-value"]')?.textContent).toBe('130,000');
      expect(sendMock).not.toHaveBeenCalled();
      expect(sendOrderMock).not.toHaveBeenCalled();
    });

    it('시세가 없으면 수동주문 시트의 「현재가」 는 비활성이다', () => {
      render(<CardBody {...props({ card: cardState({ server: server() }) })} />);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '가격' }));
      });
      expect(screen.getByRole('button', { name: '현재가' })).toBeDisabled();
    });
  });
});

describe('⑦ D-15a — 종목 분류가 두 폼의 호가 단위 잠금을 가른다 (20-REVIEW WR-05)', () => {
  beforeEach(() => mockPointer(true));
  afterEach(restoreMatchMedia);

  const statusLine = () => document.querySelector('[data-slot="numpad-status"]') as HTMLElement;
  const confirmBtn = () => document.querySelector('[data-slot="numpad-confirm"]') as HTMLButtonElement;
  const typeKeys = (digits: string) => {
    const pad = screen.getByRole('group', { name: '숫자 키패드' });
    for (const d of digits) {
      act(() => {
        fireEvent.click(within(pad).getByRole('button', { name: d }));
      });
    }
  };
  /** 분류 조회가 끝날 때까지 기다린다(조회 중 = 주식 잠금이라 결과가 반영된 뒤 단언해야 한다). */
  const settle = () => act(async () => {});

  it.each([
    ['ETF', 'etp'],
    [null, '마스터에 없음(unknown)'],
  ] as const)('%s — 상따 매수가격 시트 · 수동주문 가격 시트 모두 호가 단위 위반을 경고만 한다 (%s)', async (group, _rule) => {
    master.group = group;
    render(<CardBody {...props({ card: cardState({ server: server(), quote: quote() }) })} />);
    await settle();
    // 상따 매수가격 시트 — 130,050 은 주식 표(100원 구간) 위반.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '매수가격 130,000원' }));
    });
    typeKeys('130050');
    expect(within(statusLine()).queryByRole('alert')).toBeNull();
    expect(within(statusLine()).getByRole('status')).toHaveTextContent('주식 호가 단위(100원)와 달라요');
    expect(confirmBtn()).toBeEnabled();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    });
    // 수동주문 가격 시트 — 같은 분류 값이다(진입 경로별로 갈라지지 않는다).
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '가격' }));
    });
    typeKeys('130050');
    expect(within(statusLine()).queryByRole('alert')).toBeNull();
    expect(confirmBtn()).toBeEnabled();
  });

  it('주권 — 두 시트 모두 잠근다(D-15) · 상한가 초과는 ETF 여도 잠근다', async () => {
    render(<CardBody {...props({ card: cardState({ server: server(), quote: quote() }) })} />);
    await settle();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '매수가격 130,000원' }));
    });
    typeKeys('130050');
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent('100원 단위로 입력해 주세요');
    expect(confirmBtn()).toBeDisabled();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '가격' }));
    });
    typeKeys('130050');
    expect(confirmBtn()).toBeDisabled();
  });

  it('ETF 여도 상한가 초과는 잠근다', async () => {
    master.group = 'ETF';
    render(<CardBody {...props({ card: cardState({ server: server(), quote: quote() }) })} />);
    await settle();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '가격' }));
    });
    typeKeys('156100');
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent('상한가 156,000원을 넘을 수 없어요');
    expect(confirmBtn()).toBeDisabled();
  });
});
