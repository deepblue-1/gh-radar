import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RelayLcSetMsg, RelayLimitChaser, RelayLimitChaserInput } from '@gh-radar/shared';

/**
 * Phase 16 Plan 12 — 상따 폼 조작 규율 검증 (TRADE-01).
 *
 * 잠그는 규칙:
 *   - **D-05 스위치는 즉시** — 매수/매도/한방 스위치는 확인 다이얼로그 없이 그 자리에서 전송된다.
 *     다이얼로그를 되살리면 상한가 직전 1~2초를 잃는다. ①이 그 부재를 명시적으로 단언한다.
 *   - **D-06 값은 「수정」 버튼** — 입력 변경은 전송을 만들지 않는다. 자동 반영(디바운스·타이머)이
 *     되살아나면 사용자가 누르지 않은 등록이 나간다(②③④).
 *   - **D-06 스위치는 더티를 함께 민다** — 스위치 전송 cfg 에 그 시점 더티 값이 실린다(⑤).
 *   - **D-08 전부 OFF = `crud "D"`** — 별도 삭제 버튼이 없다. 단, **취소 게이트가 살아 있으면
 *     전략이 남는다**(⑥⑦, Pitfall 7).
 *   - **D-11 에코 우선** — 서버값이 더티 필드도 덮고 액션 바가 사라진다(⑧). 유일한 예외가
 *     `buyOrderAmount === 0`(=「서버가 모른다」)이다(⑪, Pitfall 11).
 *   - **S→C 전용 4필드 미송신** — 되보내면 에코 비교가 오염된다(⑨, Pitfall 6).
 *   - **파생값은 금액→수량 한 방향** — 역산 금지(⑩).
 *   - **토스트 없음** — 결과는 액션 바 소멸로만 알린다(파일 전역: 토스트 조회가 하나도 없다).
 *
 * ★ 스텁 경계 — `@/lib/relay-provider` 의 `useRelayContext` 하나다. 폼이 바깥과 맺는 계약은
 *   `send({t:"lc.set", cfg})` 뿐이고, `send` 는 **응답을 돌려주지 않는다**(fire-and-forget).
 *   반영 판정은 60 에코 수신이므로 이 파일에는 「전송 성공/실패」 시나리오가 없다 — 있으면
 *   존재하지 않는 경로를 검증하게 된다.
 *
 * ★ jsdom 에는 CSS 가 없다. 모바일 탭 pane 의 `hidden` 은 **좁은 폭에서만** 걸리므로,
 *   ⑫ 는 `matchMedia` 를 좁은 폭으로 갈아끼운 뒤 단언한다. 갈아끼우지 않으면 데스크톱
 *   스냅샷(`matches:false`)이라 `hidden` 이 애초에 붙지 않는다.
 */

const sendMock = vi.fn();
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, send: sendMock }),
  };
});

import { LimitChaserForm, type LimitChaserFormProps } from '../limit-chaser-form';

const ISIN = 'KR7086520004';
const ACCOUNT = '37728502101';

/** `lc.set` 로 나간 cfg 만 뽑는다 — 다른 프레임이 섞여도 단언이 흔들리지 않는다. */
function sentConfigs(): RelayLimitChaserInput[] {
  return sendMock.mock.calls
    .map(([msg]) => msg as RelayLcSetMsg)
    .filter((msg) => msg?.t === 'lc.set')
    .map((msg) => msg.cfg);
}

function lastConfig(): RelayLimitChaserInput {
  const cfgs = sentConfigs();
  expect(cfgs.length).toBeGreaterThan(0);
  return cfgs[cfgs.length - 1]!;
}

/**
 * 서버 에코 1건. 기본은 **매수만 켜진 살아 있는 전략**이다 —
 * 「전략이 이미 있다」가 더티·수정·에코 케이스 전부의 전제다.
 */
function echo(over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  return {
    isin: ISIN,
    accountNo: ACCOUNT,
    market: 'K',
    exchange: 'KRX',
    crud: 'C',
    key: `${ISIN}:${ACCOUNT}:KRX`,
    buyOrderPrice: 130_000,
    buyOrderQty: 1,
    buyWatchPrice: 130_000,
    buyWatchQty: 10_000,
    buyMinTradeQty: 30_000,
    buyWatchSide: '0',
    buyTradeQtyEnabled: false,
    buyEnabled: true,
    buyOrderAmount: 10,
    sellOrderPrice: 130_000,
    sellWatchPrice: 130_000,
    sellWatchQty: 100_000,
    sellMinTradeQty: 30_000,
    sellEnabled: false,
    sellTradeQtyEnabled: false,
    sellOrderRatio: 100,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50,
    sweepWatchPrice: 0,
    sweepEnabled: false,
    sweepMinTickCount: 3,
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
    cancelQtyEnabled: false,
    cancelWatchQty: 10,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
    // S→C 전용 4필드 — 서버만 채운다. 폼은 되보내지 않는다(⑨).
    sellOrderQty: 76,
    sellQtyTrackBaseline: 41_200,
    sellEntryLatched: false,
    cancelQtyTrackBaseline: 0,
    ...over,
  };
}

function props(over: Partial<LimitChaserFormProps> = {}): LimitChaserFormProps {
  return {
    isin: ISIN,
    accountNo: ACCOUNT,
    exchange: 'KRX',
    server: echo(),
    ...over,
  };
}

/**
 * 숫자 입력은 **표시 포맷(천단위 구분자)이 붙은 controlled input** 이다.
 * `userEvent.type` 은 매 키 입력마다 재포맷된 값 위에서 캐럿을 다시 잡아야 해서 결과가
 * 브라우저/버전 의존적이다 — 값 자체를 단언하려는 케이스에서는 `change` 로 확정한다.
 */
function setNumber(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

/** 뷰포트 스냅샷 교체 — `useSyncExternalStore` 가 렌더 시점에 읽는다. */
function setViewport(narrow: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: narrow && query.includes('max-width'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const actionBar = () => document.querySelector('[data-slot="dirty-action-bar"]');

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  sendMock.mockReset();
  setViewport(false); // 기본은 데스크톱 — 두 폼 카드가 모두 보인다.
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('① 스위치는 확인 없이 즉시 전송된다 (D-05)', () => {
  it('매수주문 스위치 ON → lc.set 1회, buyEnabled true, crud "C", **다이얼로그 없음**', async () => {
    const user = userEvent.setup();
    // 신규 폼(에코 없음) — 첫 스위치가 곧 등록이다.
    render(<LimitChaserForm {...props({ server: null })} />);

    await user.click(screen.getByRole('switch', { name: '매수주문 켜기' }));

    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyEnabled).toBe(true);
    expect(lastConfig().crud).toBe('C');
    // ★ 확인 다이얼로그가 **뜨지 않는다**. 이 단언이 D-05 의 본체다.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('매도주문·한방체결 스위치도 같은 규율이다', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);

    await user.click(screen.getByRole('switch', { name: '매도주문 켜기' }));
    expect(lastConfig().sellEnabled).toBe(true);

    await user.click(screen.getByRole('switch', { name: '한방체결 켜기' }));
    expect(lastConfig().sweepEnabled).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('② 값 변경은 전송하지 않는다 (D-06)', () => {
  it('매수가격을 바꿔도 send 0회 · 액션 바가 나타나고 제목에 「1개」', () => {
    render(<LimitChaserForm {...props()} />);

    expect(actionBar()).toBeNull(); // 더티 0 → 렌더 자체가 없다

    setNumber(screen.getByLabelText(/매수가격/), '150000');

    expect(sendMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('변경한 값 1개가 아직 서버에 반영되지 않았어요'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('「수정」을 눌러야 반영돼요 · 스위치를 켜면 변경한 값까지 함께 반영돼요'),
    ).toBeInTheDocument();
  });

  it('두 필드를 바꾸면 「2개」다 — 개수가 더티 집합과 같다', () => {
    render(<LimitChaserForm {...props()} />);

    setNumber(screen.getByLabelText(/매수가격/), '150000');
    setNumber(screen.getByLabelText(/주문금액/), '20');

    expect(sendMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('변경한 값 2개가 아직 서버에 반영되지 않았어요'),
    ).toBeInTheDocument();
  });
});

describe('③ 「수정」을 눌러야 나간다', () => {
  it('lc.set 1회 · cfg 에 변경값이 실린다', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);

    setNumber(screen.getByLabelText(/매수가격/), '150000');
    await user.click(screen.getByRole('button', { name: '수정' }));

    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyOrderPrice).toBe(150_000);
    expect(lastConfig().crud).toBe('C');
  });

  it('전송 중에는 버튼이 `반영 중…` 으로 잠긴다 — 즉시 재활성 금지', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);

    setNumber(screen.getByLabelText(/매수가격/), '150000');
    await user.click(screen.getByRole('button', { name: '수정' }));

    const busy = screen.getByRole('button', { name: '반영 중…' });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(sentConfigs()).toHaveLength(1); // 중복 제출 없음
  });
});

describe('④ 「되돌리기」는 전송하지 않는다', () => {
  it('폼이 서버값으로 복귀하고 액션 바가 사라진다 · send 0회', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);

    setNumber(screen.getByLabelText(/매수가격/), '150000');
    expect(actionBar()).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '되돌리기' }));

    expect(screen.getByLabelText(/매수가격/)).toHaveValue('130,000');
    expect(actionBar()).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('⑤ 스위치는 더티 값을 함께 밀어낸다 (D-06)', () => {
  it('더티가 있는 상태에서 스위치를 켜면 cfg 에 더티 값도 실린다', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);

    setNumber(screen.getByLabelText(/매수가격/), '150000');
    setNumber(screen.getByLabelText(/매도비율/), '40');
    expect(sendMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('switch', { name: '매도주문 켜기' }));

    const cfg = lastConfig();
    expect(cfg.sellEnabled).toBe(true);
    expect(cfg.buyOrderPrice).toBe(150_000); // ★ 더티 값이 함께 나갔다
    expect(cfg.sellOrderRatio).toBe(40);
  });
});

describe('⑥⑦ 삭제 판정은 취소 게이트를 포함한다 (D-08 / Pitfall 7)', () => {
  it('⑥ 매수·매도·취소가 전부 꺼지는 마지막 OFF 는 crud "D"', async () => {
    const user = userEvent.setup();
    render(
      <LimitChaserForm
        {...props({
          server: echo({
            buyEnabled: true,
            sellEnabled: false,
            cancelQtyEnabled: false,
            cancelTradeEnabled: false,
          }),
        })}
      />,
    );

    await user.click(screen.getByRole('switch', { name: '매수주문 켜기' }));

    expect(lastConfig().buyEnabled).toBe(false);
    expect(lastConfig().crud).toBe('D');
    // 삭제에도 확인 다이얼로그가 없다 — 「삭제」 버튼 자체가 존재하지 않는다(D-08).
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /삭제/ })).toBeNull();
  });

  it('⑦ 취소잔량이 켜져 있으면 매수·매도를 둘 다 꺼도 crud "C"', async () => {
    const user = userEvent.setup();
    render(
      <LimitChaserForm
        {...props({
          server: echo({
            buyEnabled: true,
            sellEnabled: false,
            cancelQtyEnabled: true,
            cancelTradeEnabled: false,
          }),
        })}
      />,
    );

    await user.click(screen.getByRole('switch', { name: '매수주문 켜기' }));

    expect(lastConfig().buyEnabled).toBe(false);
    expect(lastConfig().crud).toBe('C'); // 전략이 남는다
  });
});

describe('⑧⑪ 에코가 도착하면 서버가 이긴다 (D-11)', () => {
  it('⑧ 더티 2개인 상태에서 새 에코가 오면 폼이 서버값이 되고 액션 바가 사라진다', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);

    setNumber(screen.getByLabelText(/매수가격/), '150000');
    setNumber(screen.getByLabelText(/매도비율/), '40');
    expect(
      screen.getByText('변경한 값 2개가 아직 서버에 반영되지 않았어요'),
    ).toBeInTheDocument();

    // 다른 단말이 값을 바꿨다 — 편집 중 보호·보류 없이 덮는다.
    rerender(
      <LimitChaserForm {...props({ server: echo({ buyOrderPrice: 128_000, sellOrderRatio: 70 }) })} />,
    );

    expect(screen.getByLabelText(/매수가격/)).toHaveValue('128,000');
    expect(screen.getByLabelText(/매도비율/)).toHaveValue('70');
    expect(actionBar()).toBeNull();
  });

  it('⑪ `buyOrderAmount: 0` 인 에코는 금액 칸을 덮지 않는다 (Pitfall 11)', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);

    setNumber(screen.getByLabelText(/주문금액/), '150');
    rerender(<LimitChaserForm {...props({ server: echo({ buyOrderAmount: 0 }) })} />);

    // 「서버가 모른다」 — 사용자가 친 값이 남는다. 수량×가격 역산으로 채우지도 않는다.
    expect(screen.getByLabelText(/주문금액/)).toHaveValue('150');
    // 비교 대상에서도 빠지므로 액션 바가 뜨지 않는다.
    expect(actionBar()).toBeNull();
  });
});

describe('⑨ S→C 전용 4필드를 보내지 않는다 (Pitfall 6)', () => {
  const FORBIDDEN = [
    'sellOrderQty',
    'sellQtyTrackBaseline',
    'sellEntryLatched',
    'cancelQtyTrackBaseline',
  ] as const;

  /**
   * 클라 입력 29 + 클라 고정 3 = 32. `key` 도 싣지 않는다(relay 파생값이다).
   * `market` 도 없다 — relay 가 `SymbolMap` 으로 ISIN 을 푼다 (WR-03 / D-28).
   */
  const EXPECTED_KEYS = [
    'isin',
    'accountNo',
    'exchange',
    'crud',
    'buyOrderQty',
    'buyOrderPrice',
    'buyOrderAmount',
    'buyWatchPrice',
    'buyWatchQty',
    'buyWatchSide',
    'buyMinTradeQty',
    'buyTradeQtyEnabled',
    'buyEnabled',
    'sellOrderPrice',
    'sellOrderRatio',
    'sellWatchPrice',
    'sellWatchQty',
    'sellMinTradeQty',
    'sellTradeQtyEnabled',
    'sellQtyTrackEnabled',
    'sellQtyTrackRatio',
    'sellEnabled',
    'sweepWatchPrice',
    'sweepMinTickCount',
    'sweepEnabled',
    'sweepRecalcEnabled',
    'sweepMinCount',
    'sweepMinRate',
    'cancelQtyEnabled',
    'cancelWatchQty',
    'cancelTradeEnabled',
    'cancelQtyTrackEnabled',
  ];

  it('스위치 경로·「수정」 경로 어느 쪽에서도 cfg 키 집합이 정확히 32개다', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props({ server: echo({ sellEntryLatched: true }) })} />);

    await user.click(screen.getByRole('switch', { name: '매도주문 켜기' }));
    setNumber(screen.getByLabelText(/매수가격/), '150000');
    await user.click(screen.getByRole('button', { name: '수정' }));

    const cfgs = sentConfigs();
    expect(cfgs).toHaveLength(2);
    for (const cfg of cfgs) {
      const keys = Object.keys(cfg);
      expect(keys).toHaveLength(32);
      expect(keys.sort()).toEqual([...EXPECTED_KEYS].sort());
      for (const f of FORBIDDEN) expect(keys).not.toContain(f);
      expect(keys).not.toContain('key');
      // ★ D-28 회귀 잠금 — 브라우저가 시장을 지어내 싣지 않는다 (WR-03).
      expect(keys).not.toContain('market');
    }
  });

  it('클라 고정 3 은 항상 true/0/0 으로 나간다 — 폼에 노출되지 않는다', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);

    await user.click(screen.getByRole('switch', { name: '한방체결 켜기' }));

    expect(lastConfig().sweepRecalcEnabled).toBe(true);
    expect(lastConfig().sweepMinCount).toBe(0);
    expect(lastConfig().sweepMinRate).toBe(0);
    expect(screen.queryByLabelText(/한방 재계산|최소 횟수|최소 상승률/)).toBeNull();
  });
});

describe('⑩ 파생값은 금액 → 수량 한 방향이다', () => {
  it('주문금액 10(만원) · 매수가격 30,000 → 산출 3주 / 실제 90,000원', () => {
    render(
      <LimitChaserForm {...props({ server: echo({ buyOrderPrice: 30_000, buyOrderAmount: 10 }) })} />,
    );

    const qtyRow = screen.getByText('산출 주문수량').closest('div')!;
    expect(within(qtyRow).getByText('3주')).toBeInTheDocument();

    const amtRow = screen.getByText('실제 주문금액').closest('div')!;
    expect(within(amtRow).getByText('90,000원')).toBeInTheDocument();
  });

  it('매수가격 0 이면 파생값은 `—` 다 — 0 으로 나눈 숫자를 보여주지 않는다', () => {
    render(<LimitChaserForm {...props({ server: echo({ buyOrderPrice: 0 }) })} />);

    const qtyRow = screen.getByText('산출 주문수량').closest('div')!;
    expect(within(qtyRow).getByText('—')).toBeInTheDocument();
  });

  it('예상 매도수량은 매도가능 × 비율 이고 「서버 계산값이 정본」임을 표시한다', () => {
    render(<LimitChaserForm {...props({ sellableQty: 153, server: echo({ sellOrderRatio: 50 }) })} />);

    expect(screen.getByText('예상 매도수량 (매도가능 153주 × 50%)')).toBeInTheDocument();
    expect(screen.getByText('· 서버 계산값이 정본이에요')).toBeInTheDocument();
  });
});

describe('⑫ 접근성 · 모바일 탭', () => {
  it('스위치 3개에 aria-label 이 있고 상태가 aria-checked 로 읽힌다', () => {
    render(<LimitChaserForm {...props()} />);

    expect(screen.getByRole('switch', { name: '매수주문 켜기' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('switch', { name: '매도주문 켜기' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('switch', { name: '한방체결 켜기' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('그룹 6개가 E2E 앵커(`data-slot`)를 갖는다', () => {
    const { container } = render(<LimitChaserForm {...props()} />);
    for (const slot of ['buy', 'buy-price', 'sweep', 'sell', 'sell-price', 'cancel']) {
      expect(container.querySelector(`[data-slot="lc-group-${slot}"]`)).not.toBeNull();
    }
  });

  it('좁은 폭에서 비활성 pane 이 `hidden` 속성으로 감춰지고 탭이 tablist 다', async () => {
    setViewport(true);
    const user = userEvent.setup();
    const { container } = render(<LimitChaserForm {...props()} />);

    const tablist = screen.getByRole('tablist', { name: '주문 설정' });
    const [buyTab, sellTab] = within(tablist).getAllByRole('tab');
    expect(buyTab).toHaveAttribute('aria-selected', 'true');
    expect(sellTab).toHaveAttribute('aria-selected', 'false');

    const buyPane = container.querySelector('[data-pane="buy"]')!;
    const sellPane = container.querySelector('[data-pane="sell"]')!;
    // ★ 클래스가 아니라 **속성**이어야 한다 — 작성자 `display:grid` 가 UA 규칙을 이긴다(Pitfall 13).
    expect(buyPane.hasAttribute('hidden')).toBe(false);
    expect(sellPane.hasAttribute('hidden')).toBe(true);

    await user.click(sellTab!);
    expect(buyPane.hasAttribute('hidden')).toBe(true);
    expect(sellPane.hasAttribute('hidden')).toBe(false);
  });

  it('데스크톱에서는 어느 pane 도 `hidden` 이 아니다 — 접근성 트리에서 매도 폼이 사라지면 안 된다', () => {
    setViewport(false);
    const { container } = render(<LimitChaserForm {...props()} />);

    expect(container.querySelector('[data-pane="buy"]')!.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('[data-pane="sell"]')!.hasAttribute('hidden')).toBe(false);
  });

  it('체크박스는 라벨로 찾히고 라벨 클릭으로 토글된다', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);

    const cancelQty = screen.getByLabelText(/취소잔량/);
    expect(cancelQty).not.toBeChecked();

    await user.click(screen.getByText('취소잔량', { selector: 'label' }));
    expect(cancelQty).toBeChecked();
    // 체크박스는 **값**이다 — 스위치가 아니므로 전송하지 않는다.
    expect(sendMock).not.toHaveBeenCalled();
    expect(actionBar()).not.toBeNull();
  });

  it('취소잔량이 꺼져 있으면 「매도 「비율」 값 재사용」이 비활성이다 (A9)', () => {
    render(<LimitChaserForm {...props()} />);
    expect(screen.getByLabelText(/매도 「비율」 값 재사용/)).toBeDisabled();
  });
});
