import { describe, expect, it, vi, beforeEach } from 'vitest';
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
 *   `send({t:"lc.set", cfg})` 뿐이고, 그 반환값은 **「소켓에 실었는가」** 하나다(16-19,
 *   `use-relay-socket.ts:863`). 서버 응답이 아니다 — 반영 판정은 여전히 60 에코 수신이다.
 *   기본 스텁은 `true`(나갔다)이고, `false` 를 돌려주는 케이스가 잠그는 것은 **보내지 못한
 *   요청에 낙관 반영·잠금을 걸지 않는다**는 규율뿐이다(⑭, GC-WR-06).
 *
 * ★ jsdom 에는 CSS 도 레이아웃도 없다. 260912-k2x 부터 탭 pane 숨김은 **CSS 클래스**이고
 *   판정 기준이 뷰포트가 아니라 **본문 폭**이라, 뷰포트를 갈아끼워 확인할 대상이 아예 없다
 *   (본문 폭은 미디어 질의 API 로 관측할 수 없다). 그래서 ⑫ 는 **클래스 계약**과
 *   **언마운트하지 않는다**는 사실을 단언하고, 실제 폭 판정은 `.planning/WINDOWS.md` 에
 *   미검증으로 남아 있다. 없는 검증을 했다고 적지 않는다.
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
    // ★ 발주 가능한 값이다 — `floor(50만원 / 130,000) = 3주`. 0 주가 나오는 조합은 WR-06 이
    //   무장을 막으므로, 「무장이 되는 전략」을 전제로 하는 케이스들의 기본값이어야 한다.
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

const actionBar = () => document.querySelector('[data-slot="dirty-action-bar"]');

beforeEach(() => {
  sendMock.mockReset();
  // ★ 기본은 「소켓에 실렸다」 — `send` 는 boolean 계약이고(16-19) 호출부가 그것으로 분기한다.
  //   `mockReset()` 뒤의 기본 반환은 `undefined`(falsy)라, 세우지 않으면 모든 케이스가
  //   「전송 실패」 경로로 떨어진다.
  sendMock.mockReturnValue(true);
});

describe('① 스위치는 확인 없이 즉시 전송된다 (D-05)', () => {
  it('매수주문 스위치 ON → lc.set 1회, buyEnabled true, crud "C", **다이얼로그 없음**', async () => {
    const user = userEvent.setup();
    // 신규 폼(에코 없음) — 첫 스위치가 곧 등록이다. 상한가 시딩으로 가격 칸이 차 있어야
    // 무장할 수 있다(WR-06) — 시세를 못 받은 종목은 애초에 켤 수 없다.
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);

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

describe('⑩ 화면에 파생값 3행을 그리지 않는다', () => {
  /**
   * quick 260911-tuk — 「산출 주문수량」·「실제 주문금액」·「예상 매도수량」 3행을 걷어냈다.
   *
   * **산출식이 사라진 것이 아니다.** `buyOrderQtyFromAmount` 는 무장 판정(`canArmBuy`)이
   * 계속 쓰고 `estimatedSellQty` 는 `lib/__tests__/limit-chaser.test.ts` 가 단위로 잠근다.
   * 여기서 잠그는 것은 **표시하지 않는다**는 사실 하나다 — 지운 줄이 슬그머니 돌아오면
   * 이 케이스가 빨개진다.
   */
  it('매수 파생값 2행이 없다 (산출식은 무장 판정이 계속 쓴다)', () => {
    render(
      <LimitChaserForm {...props({ server: echo({ buyOrderPrice: 30_000, buyOrderAmount: 10 }) })} />,
    );

    expect(screen.queryByText('산출 주문수량')).toBeNull();
    expect(screen.queryByText('실제 주문금액')).toBeNull();
    // 값도 함께 사라졌다 — 라벨만 지우고 숫자가 떠 있는 상태가 아니다.
    expect(screen.queryByText('3주')).toBeNull();
    expect(screen.queryByText('90,000원')).toBeNull();
  });

  it('예상 매도수량 행이 없다 (「서버 계산값이 정본」 주석도 함께 사라진다)', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellOrderRatio: 50 }) })} />);

    expect(screen.queryByText(/예상 매도수량/)).toBeNull();
    expect(screen.queryByText('· 서버 계산값이 정본이에요')).toBeNull();
  });

  it('매수가격·매도가격 그룹에는 제목이 없고 빈 헤더 줄도 남지 않는다', () => {
    const { container } = render(<LimitChaserForm {...props()} />);

    for (const slot of ['lc-group-buy-price', 'lc-group-sell-price']) {
      const group = container.querySelector(`[data-slot="${slot}"]`)!;
      expect(group).not.toBeNull();
      // 첫 자식이 곧 첫 입력 행이다 — 앞에 빈 24px 헤더 줄이 끼어 있으면 안 된다.
      const first = group.firstElementChild!.nextElementSibling!; // [0] 은 좌측 3px 액센트 바
      expect(first.className).toContain('grid-cols-[var(--lw)_minmax(0,1fr)]');
    }
  });

  it('한방체결·자동취소 그룹의 hint 한 줄이 화면에서 사라졌다 (툴팁도 함께)', () => {
    const { container } = render(<LimitChaserForm {...props()} />);

    expect(screen.queryByText(/N건 연속 한 호가에서 체결이 쏟아지면/)).toBeNull();
    expect(screen.queryByText(/비교가격은 매수가격을 그대로 사용/)).toBeNull();
    expect(container.querySelector('[data-slot="lc-group-sweep"]')).not.toHaveAttribute('title');
    expect(container.querySelector('[data-slot="lc-group-cancel"]')).not.toHaveAttribute('title');
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

  /*
    ★ 260912-k2x — 탭 pane 숨김이 **DOM 속성에서 CSS 클래스로** 옮겨졌다. 같은 명제를 다시
      쓴 것이지 단언을 지운 것이 아니다.

      옮긴 이유는 판정 기준이 바뀌었기 때문이다: 이제 「탭이냐 2열이냐」를 가르는 것은
      뷰포트가 아니라 **본문 폭**인데, 본문 폭은 미디어 질의 API 로 관측할 수 없다(그 API 는
      뷰포트만 본다). 그래서 폭 판정을 CSS 에 통째로 넘기고 JS 는 「어느 탭이 선택됐나」만 안다.
      `display:none` 은 접근성 트리에서도 빠지므로 사용자 결정이 요구한 성질은 그대로다.
  */
  it('비활성 pane 이 폰에서 숨고 700 이상에서 되살아나는 **클래스 쌍**을 갖는다', async () => {
    const user = userEvent.setup();
    const { container } = render(<LimitChaserForm {...props()} />);

    const tablist = screen.getByRole('tablist', { name: '주문 설정' });
    // 탭 줄 자체가 폰 전용이다 — 700 이상에서는 사라진다.
    expect(tablist.className).toContain('@min-[700px]/lc:hidden');
    const [buyTab, sellTab] = within(tablist).getAllByRole('tab');
    expect(buyTab).toHaveAttribute('aria-selected', 'true');
    expect(sellTab).toHaveAttribute('aria-selected', 'false');

    const buyPane = container.querySelector('[data-pane="buy"]')!;
    const sellPane = container.querySelector('[data-pane="sell"]')!;
    // 활성 pane 에는 숨김 클래스가 없다.
    expect(buyPane.className).not.toContain('hidden');
    // 비활성 pane 은 폰에서 숨고 700 이상에서 다시 블록이다.
    expect(sellPane.className).toContain('hidden');
    expect(sellPane.className).toContain('@min-[700px]/lc:block');

    await user.click(sellTab!);
    expect(buyPane.className).toContain('hidden');
    expect(buyPane.className).toContain('@min-[700px]/lc:block');
    expect(sellPane.className).not.toContain('hidden');

    // 두 카드 그리드도 같은 경계에서 2열이 된다.
    const grid = buyPane.parentElement!;
    expect(grid.className).toContain('@min-[700px]/lc:grid-cols-2');
    // 옛 뷰포트 분기가 한 톨도 남지 않았다.
    expect(grid.className).not.toContain('min-[1280px]:grid-cols-2');
  });

  it('★ 두 pane 이 **언제나 DOM 에 있다** — 조건부 렌더가 아니다', () => {
    const { container } = render(<LimitChaserForm {...props()} />);

    // 폭과 무관하게 둘 다 마운트돼 있다. 접근성 트리에서 빼는 일은 CSS 가 한다.
    expect(container.querySelector('[data-pane="buy"]')).not.toBeNull();
    expect(container.querySelector('[data-pane="sell"]')).not.toBeNull();
    // 옛 `hidden` **속성** 경로는 사라졌다 — 이제 숨김은 클래스 한 축뿐이다.
    expect(container.querySelector('[data-pane="buy"]')!.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('[data-pane="sell"]')!.hasAttribute('hidden')).toBe(false);
  });

  /*
    ★ **이번 변경의 핵심 계약이고, 지금까지 어느 테스트도 잠그지 않았다.**
      pane 을 조건부 렌더로 바꾸면(=언마운트) 탭을 옮길 때마다 매도 설정이 초기화되고
      더티 카운트·에코 덮어쓰기 계산이 함께 망가진다. 사용자 입장에서는 「탭을 갔다 왔더니
      방금 친 매도가격이 사라졌다」이고, 그 상태로 「수정」을 누르면 서버에 **의도하지 않은
      값**이 나간다.
  */
  it('★ 탭을 오가도 반대편 입력값과 더티 수가 그대로다 (언마운트 금지)', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);

    const sellTab = within(screen.getByRole('tablist', { name: '주문 설정' })).getAllByRole(
      'tab',
    )[1]!;
    await user.click(sellTab);
    setNumber(screen.getByLabelText(/매도가격/), '150000');
    expect(
      screen.getByText('변경한 값 1개가 아직 서버에 반영되지 않았어요'),
    ).toBeInTheDocument();

    // 매수 탭으로 갔다가 돌아온다.
    const buyTab = within(screen.getByRole('tablist', { name: '주문 설정' })).getAllByRole(
      'tab',
    )[0]!;
    await user.click(buyTab);
    // ★ 더티 수는 탭을 옮기는 동안에도 유지된다 — 매도 pane 이 살아 있다는 증거다.
    expect(
      screen.getByText('변경한 값 1개가 아직 서버에 반영되지 않았어요'),
    ).toBeInTheDocument();

    await user.click(sellTab);
    expect((screen.getByLabelText(/매도가격/) as HTMLInputElement).value).toBe('150,000');
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

  it('취소잔량이 꺼져 있으면 자동취소의 「잔량추적」이 비활성이다 (A9)', () => {
    const { container } = render(<LimitChaserForm {...props()} />);
    // 라벨을 축약하면서(quick 260911-tuk) 매도 그룹의 체크박스와 **같은 문구**가 됐다.
    // 그래서 문구가 아니라 id 로 좁힌다 — 문구 조회는 2건을 잡아 터진다.
    expect(container.querySelector('#lc-cancel-qty-track')).toBeDisabled();
  });

  /*
    ★ quick-260912-u58 ② — 취소 그룹 라벨이 **「매수취소」한 덩어리**다.

    옛 헤더는 `title="매수 미체결 자동취소" caption="가드"` 라 화면에서 「매수 미체결
    자동취소 가드」로 읽혔다. 사용자가 그 덩어리 전체를 「매수취소」로 줄이라고 지시했다.
    ★ `strategy-log.tsx` 의 **로그 문구는 다른 표면**이고 문장으로서 여전히 정확하다 —
      함께 바꾸면 `strategy-log.test.tsx` 4곳이 흔들린다. 여기서 잠그는 것은 폼뿐이다.
  */
  it('취소 그룹 헤더가 「매수취소」로만 읽힌다 — 캡션이 없다 (quick-260912-u58 ②)', () => {
    const { container } = render(<LimitChaserForm {...props()} />);

    const cancelGroup = container.querySelector('[data-slot="lc-group-cancel"]') as HTMLElement;
    expect(within(cancelGroup).getByText('매수취소')).toBeInTheDocument();
    // 옛 문구와 캡션이 그룹 어디에도 렌더되지 않는다.
    expect(cancelGroup.textContent).not.toContain('매수 미체결 자동취소');
    expect(within(cancelGroup).queryByText('가드')).toBeNull();
  });

  it('자동취소 체크박스 2개의 라벨이 「체결」·「잔량추적」이다', () => {
    const { container } = render(<LimitChaserForm {...props()} />);

    const cancelGroup = container.querySelector('[data-slot="lc-group-cancel"]')!;
    expect(within(cancelGroup as HTMLElement).getByText('체결')).toBeInTheDocument();
    expect(within(cancelGroup as HTMLElement).getByText('잔량추적')).toBeInTheDocument();
    expect(screen.queryByText(/값 재사용/)).toBeNull();
  });

  it('체크박스 행이 NumField 와 같은 2열 그리드를 쓰고 입력에 고정폭이 없다', () => {
    const { container } = render(<LimitChaserForm {...props()} />);

    // 입력을 가진 체크박스 행 — 취소 감시 잔량.
    const input = container.querySelector('#lc-cancel-watch-qty')!;
    const inputBox = input.parentElement!; // NumInput 의 테두리 박스
    expect(inputBox.className).not.toContain('w-[104px]');
    expect(inputBox.className).not.toContain('flex-none');

    const row = inputBox.parentElement!;
    expect(row.className).toContain('grid-cols-[var(--lw)_minmax(0,1fr)]');
    // 체크박스와 라벨은 1열 안에 함께 묶인다(2열은 입력 차지).
    expect(row.querySelector('#lc-cancel-qty')!.parentElement).not.toBe(row);
  });
});

/*
  WR-06 — 「켜졌는데 아무 일도 안 하는」 전략을 만들 수 없게 한다.

  `mergeMasterAndQuote` 는 `stock_quotes` 행이 없으면 `upperLimit: 0`·`price: 0` 을 돌려주고,
  상한가 시딩이 가격 칸을 전부 0 으로 채운다. 옛 폼은 그 상태에서도 스위치를 켤 수 있었고
  `{buyEnabled:true, buyOrderPrice:0, buyOrderQty:0}` 이 나갔다 — 화면은 「무장」인데 그 전략은
  영원히 발주하지 않는 조용한 실패다.

  ★ 이 describe 가 잠그는 세 가지: **못 켠다 · 이유가 보인다 · 그래도 끌 수는 있다**.
*/
describe('⑬ 발주할 수 없는 전략은 무장되지 않는다 (WR-06)', () => {
  const buySwitch = () => screen.getByRole('switch', { name: '매수주문 켜기' });
  /*
    ★ 260911-w5h — 사유는 카드 **맨 아래** 패널로 모였고 한 줄이 「게이트 이름 · 문장」이 됐다.
      문장만 뽑아야 기존 문구 단언이 그대로 유효하다(문구 계약은 바뀌지 않았다).
      게이트 이름은 `armBlockedGates()` 로 따로 본다.
  */
  const armBlockedTexts = () =>
    Array.from(document.querySelectorAll('[data-slot="lc-arm-blocked-text"]')).map(
      (el) => el.textContent ?? '',
    );
  const armBlockedGates = () =>
    Array.from(document.querySelectorAll('[data-slot="lc-arm-blocked-gates"]')).map(
      (el) => el.textContent ?? '',
    );

  it('시세를 못 받은 종목(가격 칸 전부 0)은 매수 스위치가 비활성이고 사유가 뜬다', () => {
    // 에코 없음 + 상한가 0 = 시세를 못 받은 종목을 고른 신규 폼.
    render(<LimitChaserForm {...props({ server: null, upperLimit: 0 })} />);

    expect(buySwitch()).toBeDisabled();
    expect(armBlockedTexts()).toContain(
      '시세를 받지 못해 매수가격이 0 이에요. 매수가격을 입력하면 켤 수 있어요.',
    );
    // 배지만 회색으로 두지 않는다 — 눌러도 아무 일이 없으면 사용자는 이유를 모른다.
    fireEvent.click(buySwitch());
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('가격을 입력하면 켤 수 있게 되고 사유가 사라진다', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props({ server: null, upperLimit: 0 })} />);
    expect(buySwitch()).toBeDisabled();

    // 매수가격 30,000 + 기본 주문금액 10만원 → 산출 3주.
    setNumber(screen.getByLabelText(/매수가격/), '30000');

    expect(buySwitch()).toBeEnabled();
    expect(armBlockedTexts()).not.toContain(
      '시세를 받지 못해 매수가격이 0 이에요. 매수가격을 입력하면 켤 수 있어요.',
    );
    await user.click(buySwitch());
    expect(lastConfig().buyEnabled).toBe(true);
    expect(lastConfig().buyOrderQty).toBe(3);
  });

  it('주문금액이 가격보다 작아 산출 수량이 0 이면 켤 수 없다 — 0 주 발주는 무장이 아니다', () => {
    // 130,000원 종목에 주문금액 1만원 → `floor(10,000 / 130,000) = 0주`.
    // 꺼져 있는 게이트라야 「켤 수 없다」를 볼 수 있다 — 켜진 것은 언제나 끌 수 있다.
    render(<LimitChaserForm {...props({ server: echo({ buyEnabled: false, buyOrderAmount: 1 }) })} />);

    expect(buySwitch()).toBeDisabled();
  });

  it('★ 이미 켜진 게이트는 값이 0 이 돼도 **끌 수 있다** (T-16-44)', async () => {
    const user = userEvent.setup();
    // 서버가 「매수 무장」으로 에코했는데 발주가가 0 인 상태 — 끄는 길이 막히면 안 된다.
    render(
      <LimitChaserForm
        {...props({ server: echo({ buyEnabled: true, buyOrderPrice: 0, buyOrderAmount: 0 }) })}
      />,
    );

    const sw = buySwitch();
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).toBeEnabled(); // 끄는 방향은 언제나 열려 있다

    await user.click(sw);
    expect(lastConfig().buyEnabled).toBe(false);
  });

  it('한방체결은 매수 무장 조건까지 함께 본다 — 매수를 못 켜면 한방도 못 켠다', () => {
    render(<LimitChaserForm {...props({ server: echo({ buyOrderAmount: 1 }) })} />);

    expect(screen.getByRole('switch', { name: '한방체결 켜기' })).toBeDisabled();
    // 한방가격(130,000)은 정상이고 막은 것은 매수 쪽이다 — 문장이 매수 사유 **그대로**다.
    // (옛 「한방은 매수 무장 조건을 함께 요구해요 — 」 접두는 폐기됐다. 그 맥락 고지는 이제
    //  게이트 이름 나열이 한다 — 여기서는 매수가 이미 켜져 있어 한방만 나열된다.)
    expect(armBlockedTexts()).toContain(
      '주문금액이 매수가격보다 작아 주문수량이 0 주예요. 금액을 올리면 켤 수 있어요.',
    );
    expect(armBlockedGates()).toContain('한방체결');
  });

  it('매도는 감시 호가잔량 0 일 때 못 켠다 — 서버가 눕히는 조건과 같은 축이다', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellWatchQty: 0 }) })} />);

    expect(screen.getByRole('switch', { name: '매도주문 켜기' })).toBeDisabled();
    expect(armBlockedTexts()).toContain(
      '매도 호가잔량이 0 이에요. 감시할 잔량을 입력하면 켤 수 있어요.',
    );
  });

  it('보유 0 이어도 매도는 무장할 수 있다 — 상따는 사기 전에 팔 조건을 건다', async () => {
    const user = userEvent.setup();
    // 보유가 0 이어도(예상 매도수량은 애초에 표시 전용이었고 지금은 화면에도 없다)
    // 무장 판정은 `sellOrderPrice`·`sellWatchQty` 만 본다.
    render(<LimitChaserForm {...props()} />);

    await user.click(screen.getByRole('switch', { name: '매도주문 켜기' }));
    expect(lastConfig().sellEnabled).toBe(true);
  });
});

/*
  GC-WR-09 · GC-WR-06 — **말한 대로 동작하는 전송 직전 가드**.

  파일 머리말은 "판정은 `gateBlocked()` 하나이고 렌더의 `disabled` 와 전송 직전 가드가 그것을
  함께 읽는다"고 적어 왔지만, 실제로 읽던 것은 `toggleGate` 하나였다. 서버 에코로
  `buyEnabled: true` 를 받은 뒤 시세가 끊겨 가격 칸이 0 이 되면 「수정」이 relay 의
  `#strategyArmable` 에 **통째로** 거부되고, 함께 실린 다른 값까지 하나도 저장되지 않는다.

  그리고 16-19 가 `send` 를 `void → boolean` 으로 바꾼 목적은 "호출부가 **보내지 않았음**을
  알 수 있어야 한다"였는데, 이 파일의 두 호출부는 반환값을 버렸다 — 소켓이 받지 않은 요청에도
  스위치가 켜진 것처럼 보이고 「수정」 버튼은 오지 않을 에코를 기다리며 잠긴 채로 남았다.

  ★ 이 describe 가 잠그는 세 가지: **막힌 이유가 보인다 · 못 보낸 것은 반영되지 않는다 ·
    못 보냈으면 다시 누를 수 있다**.
*/
describe('⑭ 전송 직전 가드가 「수정」에도 걸리고, 못 보낸 요청은 반영되지 않는다 (GC-WR-09 / GC-WR-06)', () => {
  const submitError = () => document.querySelector('[data-slot="lc-submit-error"]');

  it('게이트가 켜진 채 발주가가 0 이면 「수정」이 나가지 않고 사유가 뜬다 (GC-WR-09)', async () => {
    const user = userEvent.setup();
    // 서버는 「매수 무장」으로 에코했는데 시세가 끊겨 가격 칸이 0 인 상태 — 스위치는 이미
    // 켜져 있으므로(끄는 방향은 언제나 열려 있다) `armBlocked` 사유줄은 뜨지 않는다.
    render(
      <LimitChaserForm
        {...props({ server: echo({ buyEnabled: true, buyOrderPrice: 0, buyOrderAmount: 0 }) })}
      />,
    );

    // 더티를 하나 만들어 액션 바를 띄운다 — 「수정」은 그 바에만 있다.
    // ★ 매수 무장 조건과 무관한 필드를 고른다(주문금액은 가격이 0 이면 수량을 못 만든다).
    setNumber(screen.getByLabelText(/한방가격/), '140000');
    await user.click(screen.getByRole('button', { name: '수정' }));

    // relay 에 통째로 거부되기 **전에** 화면이 사유를 말한다.
    expect(sendMock).not.toHaveBeenCalled();
    expect(submitError()).toHaveTextContent(
      '시세를 받지 못해 매수가격이 0 이에요. 매수가격을 입력하면 켤 수 있어요.',
    );
    // 잠금 **전**에 막았다 — 버튼은 살아 있다(잠근 뒤 막으면 영구히 잠긴다).
    expect(screen.getByRole('button', { name: '수정' })).toBeEnabled();
  });

  it('게이트를 내리는 「수정」은 무장 조건과 무관하게 나간다 (T-16-44 승계)', async () => {
    const user = userEvent.setup();
    render(
      <LimitChaserForm
        {...props({ server: echo({ buyEnabled: true, buyOrderPrice: 0, buyOrderAmount: 0 }) })}
      />,
    );

    // 스위치를 끄면(끄는 방향은 허용) 그 자리에서 나가고, 폼의 게이트도 내려간다.
    await user.click(screen.getByRole('switch', { name: '매수주문 켜기' }));
    expect(lastConfig().buyEnabled).toBe(false);

    // 그 뒤의 「수정」은 켜진 게이트가 없으므로 가드를 지난다.
    setNumber(screen.getByLabelText(/한방가격/), '140000');
    await user.click(screen.getByRole('button', { name: '수정' }));
    expect(sentConfigs()).toHaveLength(2);
    expect(submitError()).toBeNull();
  });

  it('`send` 가 false 면 스위치 낙관 반영이 걸리지 않고 실패 문구가 뜬다 (GC-WR-06)', async () => {
    const user = userEvent.setup();
    sendMock.mockReturnValue(false); // `ready` 표시와 소켓 readyState 가 어긋나는 창
    render(<LimitChaserForm {...props()} />);

    const sellSwitch = screen.getByRole('switch', { name: '매도주문 켜기' });
    expect(sellSwitch).toHaveAttribute('aria-checked', 'false');

    await user.click(sellSwitch);

    expect(sendMock).toHaveBeenCalledTimes(1); // 시도는 했다
    // ★ 그러나 켜진 것처럼 보이지 않는다 — 이 화면 최악의 결과를 막는 단언이다.
    expect(screen.getByRole('switch', { name: '매도주문 켜기' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(submitError()).toHaveTextContent(
      '연결이 끊겨 스위치를 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.',
    );
  });

  it('`send` 가 false 면 「수정」이 잠기지 않아 다시 누를 수 있다 (GC-WR-06)', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);

    setNumber(screen.getByLabelText(/매수가격/), '150000');
    sendMock.mockReturnValue(false);

    await user.click(screen.getByRole('button', { name: '수정' }));

    expect(sendMock).toHaveBeenCalledTimes(1);
    // `반영 중…` 으로 잠기지 않는다 — 잠금을 푸는 신호(60 에코)가 영영 오지 않기 때문이다.
    expect(screen.queryByRole('button', { name: '반영 중…' })).toBeNull();
    expect(submitError()).toHaveTextContent(
      '연결이 끊겨 수정 내용을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.',
    );

    // 연결이 돌아오면 같은 버튼이 그대로 다시 나간다.
    sendMock.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: '수정' }));
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(submitError()).toBeNull();
  });
});

/*
  GC-WR-12 — **안내가 사용자가 실제로 만져야 할 곳을 가리킨다**.

  옛 `ARM_BLOCKED_TEXT.buy` 는 "**시세를 받지 못해** 발주가·수량이 0 이에요"라고 단정했다.
  그런데 같은 phase 의 e2e(`trading-limit-chaser.spec.ts:181-192`)가 고정한 실제 재현 조건은
  「기본 주문금액 10만원으로 127,400원 종목을 사면 `floor(10만/12.74만) = 0주`」다 —
  **시세는 정상이고 금액이 부족한 것**이다. 안전 게이트가 원인을 틀리게 말하면 사용자는
  엉뚱한 곳(재접속·새로고침)을 만지고, 그 사이 시장은 움직인다.

  ★ 이 describe 가 잠그는 것: **두 원인이 값으로 갈리고 서로 다른 문구를 낸다**.
*/
describe('⑮ 무장 불가 안내가 원인을 값으로 가른다 (GC-WR-12)', () => {
  /*
    ★ 260911-w5h — 사유는 카드 **맨 아래** 패널로 모였고 한 줄이 「게이트 이름 · 문장」이 됐다.
      문장만 뽑아야 기존 문구 단언이 그대로 유효하다(문구 계약은 바뀌지 않았다).
      게이트 이름은 `armBlockedGates()` 로 따로 본다.
  */
  const armBlockedTexts = () =>
    Array.from(document.querySelectorAll('[data-slot="lc-arm-blocked-text"]')).map(
      (el) => el.textContent ?? '',
    );
  const armBlockedGates = () =>
    Array.from(document.querySelectorAll('[data-slot="lc-arm-blocked-gates"]')).map(
      (el) => el.textContent ?? '',
    );

  it('매수가격이 0 이면 **시세** 문구다 — 만져야 할 것은 가격이다', () => {
    // 에코 없음 + 상한가 0 = `stock_quotes` 행이 없어 가격 칸이 전부 0 인 종목.
    render(<LimitChaserForm {...props({ server: null, upperLimit: 0 })} />);

    expect(armBlockedTexts()).toContain(
      '시세를 받지 못해 매수가격이 0 이에요. 매수가격을 입력하면 켤 수 있어요.',
    );
  });

  it('매수가격은 있는데 주문금액이 부족하면 **금액** 문구다 (e2e 가 고정한 흔한 쪽)', () => {
    // 130,000원 종목 + 주문금액 1만원 → `floor(10,000 / 130,000) = 0주`. 시세는 정상이다.
    render(
      <LimitChaserForm {...props({ server: echo({ buyEnabled: false, buyOrderAmount: 1 }) })} />,
    );

    expect(armBlockedTexts()).toContain(
      '주문금액이 매수가격보다 작아 주문수량이 0 주예요. 금액을 올리면 켤 수 있어요.',
    );
    // ★ 두 문구는 배타적이다 — 시세 문구가 함께 뜨면 사용자는 다시 원인을 고르게 된다.
    expect(armBlockedTexts()).not.toContain(
      '시세를 받지 못해 매수가격이 0 이에요. 매수가격을 입력하면 켤 수 있어요.',
    );
  });

  it('매도는 가격 0 과 감시 호가잔량 0 이 서로 다른 문구다', () => {
    const { unmount } = render(
      <LimitChaserForm {...props({ server: echo({ sellOrderPrice: 0 }) })} />,
    );
    expect(armBlockedTexts()).toContain(
      '시세를 받지 못해 매도가격이 0 이에요. 매도가격을 입력하면 켤 수 있어요.',
    );
    unmount();

    render(<LimitChaserForm {...props({ server: echo({ sellWatchQty: 0 }) })} />);
    expect(armBlockedTexts()).toContain(
      '매도 호가잔량이 0 이에요. 감시할 잔량을 입력하면 켤 수 있어요.',
    );
  });

  it('한방은 자기 감시가가 0 인 경우와 매수가 막힌 경우를 가른다', () => {
    const { unmount } = render(
      <LimitChaserForm {...props({ server: echo({ sweepWatchPrice: 0 }) })} />,
    );
    expect(armBlockedTexts()).toContain(
      '시세를 받지 못해 한방가격이 0 이에요. 한방가격을 입력하면 켤 수 있어요.',
    );
    unmount();

    // 한방가격은 정상(130,000)이고 매수 쪽이 0주라 못 켠다 — 문장은 매수 사유 그대로다.
    render(<LimitChaserForm {...props({ server: echo({ buyOrderAmount: 1 }) })} />);
    expect(armBlockedTexts()).toContain(
      '주문금액이 매수가격보다 작아 주문수량이 0 주예요. 금액을 올리면 켤 수 있어요.',
    );
  });

  /*
    ★ **중복 병합 잠금** (260911-w5h). 매수와 한방이 **같은 사유**를 공유하면 한 줄로 합쳐지고
      게이트 이름이 `·` 로 앞에 나열된다. 옛 계약은 한방 문장에 접두어를 붙여 **같은 문장을
      두 번** 보여 줬다 — 390px 에서 그것은 카드 하단 절반을 같은 말로 채우는 일이었다.
  */
  it('매수와 한방이 같은 사유면 한 줄로 합쳐지고 게이트 이름이 앞에 나열된다', () => {
    // 매수 OFF + 주문금액 부족 → 매수·한방 둘 다 `주문금액…` 하나로 막힌다.
    render(
      <LimitChaserForm {...props({ server: echo({ buyEnabled: false, buyOrderAmount: 1 }) })} />,
    );

    // 매수 카드의 사유는 **한 줄**이다.
    expect(document.querySelectorAll('[data-slot="lc-arm-blocked"]')).toHaveLength(1);
    expect(armBlockedGates()).toEqual(['매수주문 · 한방체결']);
    // 문장은 매수 사유 **그대로** — 접두어가 붙지 않는다.
    expect(armBlockedTexts()).toEqual([
      '주문금액이 매수가격보다 작아 주문수량이 0 주예요. 금액을 올리면 켤 수 있어요.',
    ]);
  });

  /*
    ★ **반대 방향 잠금**. 병합만 잠그면 「한방이 자기 고유 원인일 때도 매수와 합쳐지는」
      퇴행이 초록으로 지나간다. 두 방향을 서로 다른 입력으로 각각 박는다.
  */
  it('한방이 자기 고유 원인이면 자기 사유만 쓴다 — 매수와 합쳐지지 않는다', () => {
    // 매수는 무장 가능(이미 ON)하고 한방만 자기 감시가가 0 이다.
    render(<LimitChaserForm {...props({ server: echo({ sweepWatchPrice: 0 }) })} />);

    expect(document.querySelectorAll('[data-slot="lc-arm-blocked"]')).toHaveLength(1);
    expect(armBlockedGates()).toEqual(['한방체결']);
    expect(armBlockedTexts()).toEqual([
      '시세를 받지 못해 한방가격이 0 이에요. 한방가격을 입력하면 켤 수 있어요.',
    ]);
  });

  it('사유가 하나도 없으면 「켤 수 없는 이유」 영역 자체가 DOM 에 없다', () => {
    // 기본 에코는 매수 ON · 매도/한방 전부 무장 가능한 값이다.
    render(<LimitChaserForm {...props()} />);

    expect(document.querySelector('[data-slot="lc-arm-blocked-panel"]')).toBeNull();
    expect(document.querySelectorAll('[data-slot="lc-arm-blocked"]')).toHaveLength(0);
  });

  it('매도 카드는 자기 사유만 갖는다 — 매수 사유가 매도 카드로 새지 않는다', () => {
    render(
      <LimitChaserForm
        {...props({ server: echo({ buyEnabled: false, buyOrderAmount: 1, sellWatchQty: 0 }) })}
      />,
    );

    const panels = Array.from(
      document.querySelectorAll('[data-slot="lc-arm-blocked-panel"]'),
    );
    expect(panels).toHaveLength(2); // 매수 카드 1 + 매도 카드 1

    const sellPanel = panels.find((el) =>
      el.parentElement?.querySelector('[data-slot="lc-group-sell"]'),
    )!;
    expect(
      Array.from(sellPanel.querySelectorAll('[data-slot="lc-arm-blocked-gates"]')).map(
        (el) => el.textContent,
      ),
    ).toEqual(['매도주문']);
    expect(sellPanel.textContent).not.toContain('주문금액이 매수가격보다');
  });

  it('사유 패널은 카드의 **마지막 자식**이다 — 사유 유무로 입력 그룹이 밀리지 않는다', () => {
    render(
      <LimitChaserForm {...props({ server: echo({ buyEnabled: false, buyOrderAmount: 1 }) })} />,
    );

    const panel = document.querySelector('[data-slot="lc-arm-blocked-panel"]')!;
    const card = panel.parentElement!;
    expect(card.lastElementChild).toBe(panel);
    // 패널 뒤에 입력 그룹이 오지 않는다 — 그룹들은 전부 패널 **앞**에 있다.
    const groups = Array.from(card.querySelectorAll('[data-slot^="lc-group-"]'));
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(panel.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    }
  });
});

/*
  R2-WR-02 · R2-IN-01 — **첫 관문이 마지막 관문보다 엄격하면 안 된다 · 해결된 경고는 접힌다**.

  ⑭ 가 「수정」에도 무장 가드를 걸어 준 것은 옳았지만, 그 가드에 **철거 면제가 빠졌다.**
  `GATE_KEYS` 는 `['buyEnabled','sweepEnabled','sellEnabled']` 인데 `sweepEnabled` 는 삭제
  판정 4종(`isDeleteIntent`: buy/sell/cancelQty/cancelTrade)에 **들어 있지 않다.** 그래서
  「게이트 4종 OFF(= 전략을 내린다) + 한방 ON + 시세가 끊겨 매수가격 0」이면 화면이 「수정」을
  막는데, **relay 는 같은 요청을 받아 준다** — `fanout.ts` `#strategyArmable` 첫 줄이
  `#isTeardown` 으로 면제하기 때문이다(16-36 이 그 줄을 남긴 이유가 정확히 이 조합이다).
  전략을 내리려는 사용자를 화면이 막는 것은 자산을 인질로 잡는 방향이다(T-16-44).

  그리고 `submitError` 는 (a) 다음 성공 전송 (b) `[server]` 에코 두 곳에서만 지워졌다 —
  「금액을 올리면 켤 수 있어요」를 읽고 금액을 올려도 `role="alert"` 가 그대로 남았다.
  상시 표시되는 안전 문구는 다음번에 읽히지 않는다(T-16-86).
*/
describe('⑯ 철거 의도의 「수정」은 막히지 않고, 원인을 고치면 문구가 접힌다 (R2-WR-02 / R2-IN-01)', () => {
  const submitError = () => document.querySelector('[data-slot="lc-submit-error"]');

  /**
   * 게이트 4종이 전부 꺼진 = **전략을 내리는** 전략. 한방만 켜져 있고 시세가 끊겨
   * 매수가격이 0 이라 `canArmSweep` 이 거짓이다 — 옛 코드가 정확히 여기서 막았다.
   */
  const teardownWithSweep = () =>
    echo({
      buyEnabled: false,
      sellEnabled: false,
      cancelQtyEnabled: false,
      cancelTradeEnabled: false,
      sweepEnabled: true,
      buyOrderPrice: 0,
      buyOrderAmount: 0,
    });

  it('게이트 4종 OFF + 한방 ON + 매수가격 0 이어도 「수정」이 나간다 (R2-WR-02 / T-16-44)', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props({ server: teardownWithSweep() })} />);

    // 더티를 하나 만들어 액션 바를 띄운다 — 「수정」은 그 바에만 있다.
    setNumber(screen.getByLabelText(/한방가격/), '140000');
    await user.click(screen.getByRole('button', { name: '수정' }));

    // relay 가 받아 주는 요청을 화면이 막지 않는다.
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]![0]).toMatchObject({ t: 'lc.set' });
    // 삭제 의도가 맞다 — `crudOf` 가 'D' 로 파생됐다.
    expect(lastConfig().crud).toBe('D');
    expect(submitError()).toBeNull();
  });

  it('게이트가 하나라도 켜진 무장 미달은 여전히 막힌다 (T-16-60 회귀 게이트)', async () => {
    const user = userEvent.setup();
    // 위와 **같은 조합**인데 `cancelTradeEnabled` 하나만 켠다 — 삭제 의도가 아니게 된다.
    render(
      <LimitChaserForm
        {...props({ server: echo({ ...teardownWithSweep(), cancelTradeEnabled: true }) })}
      />,
    );

    setNumber(screen.getByLabelText(/한방가격/), '140000');
    await user.click(screen.getByRole('button', { name: '수정' }));

    expect(sendMock).not.toHaveBeenCalled();
    // ★ 패널과 **같은 조립 규칙**이다 — `{게이트 표시이름} · {사유}`.
    //   접두어를 지우면서 잃을 뻔한 「어느 게이트가 막혔는가」가 여기서도 남는다.
    expect(submitError()).toHaveTextContent(
      '한방체결 · 시세를 받지 못해 매수가격이 0 이에요. 매수가격을 입력하면 켤 수 있어요.',
    );
  });

  it('값을 고치면 무장 차단 문구가 사라진다 (R2-IN-01 / T-16-86)', async () => {
    const user = userEvent.setup();
    // 「주문금액이 매수가격보다 작아 주문수량이 0 주예요」 — 사용자가 금액을 올려 고칠 수 있는 쪽.
    render(<LimitChaserForm {...props({ server: echo({ buyOrderAmount: 1 }) })} />);

    setNumber(screen.getByLabelText(/한방가격/), '140000');
    await user.click(screen.getByRole('button', { name: '수정' }));

    expect(sendMock).not.toHaveBeenCalled();
    expect(submitError()).toHaveTextContent(
      '주문금액이 매수가격보다 작아 주문수량이 0 주예요. 금액을 올리면 켤 수 있어요.',
    );

    // ★ 원인 필드를 고친다 — 문구가 접힌다. 전송은 하지 않는다(D-06).
    setNumber(screen.getByLabelText(/주문금액/), '50');
    expect(submitError()).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();

    // 그리고 이제 「수정」이 나간다 — 문구가 사라진 것이 표시만의 일이 아니다.
    await user.click(screen.getByRole('button', { name: '수정' }));
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

/*
  260911-w5h — **모바일 폼 전면 정리**. 390px 에서 이 폼이 쓰기 어려웠던 원인은 전부
  표시 쪽이었다: ⓐ 「감시 대상」 라벨이 폭을 먹어 세그먼트가 두 줄로 접혔고 ⓑ 사유가 그룹
  안에 끼어 뜰 때마다 아래 입력이 밀렸고 ⓒ 입력 글꼴이 16px 미만이라 iOS 가 포커스 시
  화면을 확대하고 되돌리지 않았고 ⓓ 포커스·더티가 링 그림자로 겹쳐 보였다.

  ★ 이 describe 가 잠그는 것은 **표시 계약**이다. 무장 판정식·전송 cfg 는 한 줄도 바뀌지
    않았고, 그 사실은 ①~⑯ 이 그대로 통과하는 것으로 증명된다.
*/
describe('⑰ 모바일 폼 표시 계약 (260911-w5h)', () => {
  const segment = () => screen.getByRole('group', { name: '감시 대상' });

  it('세그먼트는 접근성 이름을 유지하되 시각 라벨이 없고 행 전체 폭을 쓴다', () => {
    render(<LimitChaserForm {...props()} />);

    // 접근성 이름은 그대로 정확히 1개다 — 라벨을 없앤 것이 이름을 없앤 것이 아니다.
    expect(screen.getAllByRole('group', { name: '감시 대상' })).toHaveLength(1);
    // 시각 라벨 `<label>` 로서의 「감시 대상」은 없다.
    expect(
      Array.from(document.querySelectorAll('label')).map((el) => el.textContent?.trim()),
    ).not.toContain('감시 대상');
    // 라벨 칸(`--lw`)을 회수했다.
    expect(segment().className).toContain('w-full');
  });

  it('세그먼트 두 버튼이 절대 접히지 않는다 — 「매도잔량」 4글자가 한 줄이다', () => {
    render(<LimitChaserForm {...props()} />);

    const buttons = within(segment()).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const b of buttons) expect(b.className).toContain('whitespace-nowrap');
  });

  it('`buyWatchSide` 더티는 세그먼트 **테두리**로 읽힌다 — 링은 붙지 않는다', () => {
    render(<LimitChaserForm {...props()} />);

    // 서버값과 같으면 더티가 아니다.
    expect(segment().className).toContain('border-[var(--border)]');
    expect(segment().className).not.toContain('border-[var(--primary)]');

    // 값을 바꾸면 테두리가 `--primary` 로 간다(라벨이 사라지며 더티가 조용히 사라지지 않는다).
    fireEvent.click(within(segment()).getByRole('button', { name: '매수잔량' }));
    expect(segment().className).toContain('border-[var(--primary)]');
    expect(segment().className).not.toContain('shadow-[0_0_0_2px');
  });

  it('세그먼트 클릭은 여전히 `buyWatchSide` 를 전송 cfg 에 반영한다 (회귀 없음)', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);

    fireEvent.click(within(segment()).getByRole('button', { name: '매수잔량' }));
    await user.click(screen.getByRole('button', { name: '수정' }));
    expect(lastConfig().buyWatchSide).toBe('1');
  });

  it('그룹에 좌측 3px 세로 액센트 바가 없다', () => {
    render(<LimitChaserForm {...props()} />);

    expect(document.querySelectorAll('[class*="w-[3px]"]')).toHaveLength(0);
  });

  /*
    ★ ② 감시 대상 세그먼트 = **그 선택지의 방향색** (260912-gyz).
      서버 기본값은 `buyWatchSide:'0'`(매도잔량)이므로 첫 렌더에서 파랑이어야 한다.
      두 방향을 **둘 다** 단언한다 — 한쪽만 잠그면 반대쪽이 조용히 그룹색(빨강)으로 남는다.
  */
  it('② 매도잔량이 선택되면 파랑(`--down`)이고 매수잔량은 중립이다', () => {
    render(<LimitChaserForm {...props()} />);

    const ask = within(segment()).getByRole('button', { name: '매도잔량' });
    const bid = within(segment()).getByRole('button', { name: '매수잔량' });

    expect(ask.className).toContain('bg-[var(--down-bg)]');
    expect(ask.className).toContain('text-[var(--down)]');
    // 그룹색(매수주문 = `--up`)이 새어 들어오지 않는다 — 그것이 이번에 고친 거짓말이다.
    expect(ask.className).not.toContain('--up-bg');
    expect(bid.className).toContain('bg-transparent');
    expect(bid.className).toContain('text-[var(--muted-fg)]');
  });

  it('② 매수잔량을 고르면 빨강(`--up`)으로 갈리고 매도잔량이 중립으로 돌아온다', () => {
    render(<LimitChaserForm {...props()} />);

    fireEvent.click(within(segment()).getByRole('button', { name: '매수잔량' }));

    const ask = within(segment()).getByRole('button', { name: '매도잔량' });
    const bid = within(segment()).getByRole('button', { name: '매수잔량' });
    expect(bid.className).toContain('bg-[var(--up-bg)]');
    expect(bid.className).toContain('text-[var(--up)]');
    expect(ask.className).toContain('bg-transparent');
    expect(ask.className).not.toContain('--down-bg');
  });

  it('카드 크롬은 데스크톱에만 있고 `--lw` 가 76/104 로 갈린다 (13px 라벨 + 17px 체크박스)', () => {
    render(<LimitChaserForm {...props()} />);

    const card = document.querySelector('[data-slot="lc-group-buy"]')!.parentElement!;
    /*
      ★ 라벨이 13px 이 되면 4글자(「잔량추적」·「취소잔량」)가 체크박스 17px + gap 과 함께
        옛 64/88px 에 **들어가지 않아 조용히 잘린다**. 잘린 라벨은 사용자가 다른 필드를
        고치게 만든다(T-gyz-04) — 그래서 라벨 칸을 같은 커밋에서 함께 넓힌다.
    */
    /*
      ★ 260912-k2x — **값은 한 톨도 바뀌지 않았다.** 키만 뷰포트 1280 에서 본문 폭 992
        컨테이너 분기로 옮겼다(둘은 같은 지점이다 — 1280 − 사이드바 240 − 패딩 48 = 992).
        그래서 아래 단언은 지운 것이 아니라 **같은 명제를 새 키로 다시 쓴 것**이다.
    */
    expect(card.className).toContain('[--lw:76px]');
    expect(card.className).toContain('@min-[992px]/lc:[--lw:104px]');
    expect(card.className).not.toContain('[--lw:64px]');
    expect(card.className).not.toContain('[--lw:88px]');
    // 테두리·배경·radius 는 전부 992 컨테이너 접두가 붙어 있다.
    expect(card.className).toContain('@min-[992px]/lc:border');
    expect(card.className).toContain('@min-[992px]/lc:rounded-[var(--r-lg)]');
    /*
      ★ quick-260912-mvo Q-06 — **같은 명제를 새 기계로 다시 쓴다.**
        「데스크톱에서만 카드 배경이 `--card` 다」는 그대로인데, 그 배경을 직접 거는 유틸리티
        (`@min-[992px]/lc:bg-[var(--card)]`)를 **변수 스위치**로 바꿨다. 방향색 틴트가 같은
        배경 채널을 쓰기 때문에, 배경 선언이 둘이면 ≥992 에서 캐스케이드로 다툰다.
        그래서 배경 선언은 `bg-[var(--card-base)]` **하나뿐**이고, 992 에서 바뀌는 것은
        그 변수의 값이다. 아래 세 줄이 옛 한 줄과 같은 사실을 말한다.
    */
    expect(card.className).toContain('[--card-base:transparent]');
    expect(card.className).toContain('@min-[992px]/lc:[--card-base:var(--card)]');
    expect(card.className).toContain('bg-[var(--card-base)]');
    // 옛 뷰포트 분기가 한 톨도 남지 않았다.
    expect(card.className).not.toContain('min-[1280px]:');
    // 맨몸 크롬 유틸이 남아 있지 않다(모바일에서 그대로 걸린다).
    expect(card.className).not.toMatch(/(^|\s)border(\s|$)/);
    expect(card.className).not.toMatch(/(^|\s)bg-\[var\(--card\)\]/);
  });

  it('입력 높이가 양쪽 폭 모두 38px 이고 글꼴이 모바일 16px · 데스크톱 15px 이다', () => {
    render(<LimitChaserForm {...props()} />);

    const input = screen.getByLabelText(/매수가격/) as HTMLInputElement;
    const wrap = input.parentElement!;
    expect(wrap.className).toContain('h-[38px]');
    // 높이가 양쪽 폭에서 같아졌으므로 데스크톱 높이 override 가 남아 있으면 안 된다.
    expect(wrap.className).not.toMatch(/:h-\[/);
    /*
      ★ 16px 미만이면 iOS Safari 가 포커스 시 화면을 확대하고 **되돌리지 않는다**.
        데스크톱만 15px 로 올렸고 모바일 16px 은 그대로다 — 뒤에 오는 어떤 「통일」 변경도
        이 값을 내려서는 안 된다(T-gyz-05).
    */
    expect(input.className).toContain('text-[16px]');
    expect(input.className).toContain('@min-[992px]/lc:text-[15px]');
    expect(input.className).not.toContain('--t-caption');
  });

  it('체크박스가 양쪽 폭 모두 17px 이다', () => {
    render(<LimitChaserForm {...props()} />);

    const box = document.querySelector('input[type="checkbox"]')!;
    expect(box.className).toContain('size-[17px]');
    expect(box.className).not.toMatch(/:size-\[/);
  });

  it('행 라벨 · 체크박스 라벨 · 그룹 소제목 · 세그먼트 버튼 글꼴이 전부 13px 이다', () => {
    render(<LimitChaserForm {...props()} />);

    const rowLabel = document.querySelector('label[for="lc-buy-order-price"]')!;
    const checkLabel = document.querySelector('label[for="lc-cancel-qty"]')!;
    const groupTitle = screen.getByText('매수주문');
    const segButton = within(segment()).getByRole('button', { name: '매도잔량' });

    for (const el of [rowLabel, checkLabel, groupTitle, segButton]) {
      expect(el.className).toContain('text-[13px]');
      expect(el.className).not.toContain('text-[11px]');
      expect(el.className).not.toContain('text-[12px]');
      // 데스크톱에서 다시 작아지던 `--t-caption` override 도 없다.
      expect(el.className).not.toContain('--t-caption');
    }
  });

  it('입력 단위(원/주)가 모바일 13px · 데스크톱 12px 이다', () => {
    render(<LimitChaserForm {...props()} />);

    const input = screen.getByLabelText(/매수가격/) as HTMLInputElement;
    const unit = input.parentElement!.lastElementChild!;
    expect(unit.textContent).toBe('원');
    expect(unit.className).toContain('text-[13px]');
    expect(unit.className).toContain('@min-[992px]/lc:text-[12px]');
  });

  it('포커스·더티 표현이 테두리 한 겹뿐이다 — 링 그림자가 하나도 없다', () => {
    render(<LimitChaserForm {...props()} />);

    const input = screen.getByLabelText(/매수가격/) as HTMLInputElement;
    const wrap = input.parentElement!;
    expect(wrap.className).toContain('focus-within:border-[var(--ring)]');
    expect(wrap.className).not.toContain('shadow-');

    // 값을 바꾸면 더티 테두리 하나만 붙는다.
    setNumber(input, '140000');
    const dirtyWrap = (screen.getByLabelText(/매수가격/) as HTMLInputElement).parentElement!;
    expect(dirtyWrap.className).toContain('border-[var(--primary)]');
    expect(dirtyWrap.className).not.toContain('shadow-');

    // 비색 경로는 남는다 — 라벨의 `● ` 접두(WCAG 1.4.1).
    const label = document.querySelector('label[for="lc-buy-order-price"]')!;
    expect(label.textContent).toContain('●');
  });

  it('폼 전체에 2px 링 그림자 유틸이 하나도 없다', () => {
    render(<LimitChaserForm {...props()} />);

    expect(document.querySelectorAll('[class*="shadow-[0_0_0_2px"]')).toHaveLength(0);
  });

  it('입력에 포커스하면 값이 통째로 선택된다 — 바로 숫자를 치면 교체된다', () => {
    vi.useFakeTimers();
    try {
      render(<LimitChaserForm {...props()} />);
      const input = screen.getByLabelText(/매수가격/) as HTMLInputElement;

      fireEvent.focus(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);

      // iOS 대비 직후 1회 더 선택하는 경로도 터지지 않는다(`currentTarget` 캡처).
      input.setSelectionRange(3, 3);
      vi.runAllTimers();
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);

      // 클릭도 같은 동작이다.
      input.setSelectionRange(3, 3);
      fireEvent.click(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
    } finally {
      vi.useRealTimers();
    }
  });

  /* ---------------------------------------------------------------------
     quick-260912-mvo — Q-02 포커스 한 겹 · Q-03 세그먼트 2열 · Q-06 방향색 틴트
     --------------------------------------------------------------------- */

  it('Q-02 — `NumInput` 안쪽 입력이 전역 Double-Ring 을 해제하고, 래퍼가 테두리 채널을 갖는다', () => {
    render(<LimitChaserForm {...props()} />);

    const input = screen.getByLabelText(/매수가격/) as HTMLInputElement;
    expect(input.getAttribute('data-focus-ring')).toBe('seamless');
    /*
      ★ 링을 걷은 자리를 대신할 표시가 **같은 컨트롤에 실재해야** 한다. 둘은 한 쌍이고,
        한쪽만 남으면 포커스가 통째로 보이지 않는다(WCAG 2.4.7, T-mvo-01).
    */
    expect(input.parentElement!.className).toContain('focus-within:border-[var(--ring)]');
  });

  it('Q-02 — 체크박스에는 seamless 를 걸지 않는다 (전역 링이 유일한 포커스 표시다)', () => {
    render(<LimitChaserForm {...props()} />);

    const boxes = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box.getAttribute('data-focus-ring')).toBeNull();
    }
  });

  it('Q-03 — 「감시 대상」이 `Row` 와 같은 2열 그리드의 **오른쪽 칸**에 들어간다', () => {
    render(<LimitChaserForm {...props()} />);

    const group = segment();
    const wrap = group.parentElement!;

    // `Row`/`CheckRow` 와 **같은** 2열 그리드다.
    expect(wrap.className).toContain('grid-cols-[var(--lw)_minmax(0,1fr)]');
    // 행 간격은 래퍼가 갖고, 그룹 자신에게 남아 있지 않다(남으면 간격이 두 배가 된다).
    expect(wrap.className).toContain('mt-[var(--s-1)]');
    expect(group.className).not.toContain('mt-[var(--s-1)]');
    // 1열은 비어 있고 그룹은 **두 번째** 칸이다.
    expect(wrap.children).toHaveLength(2);
    expect(wrap.children[1]).toBe(group);
    expect(wrap.children[0]!.textContent).toBe('');
    // 접근성 이름·더티 테두리 분기는 그대로다.
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('감시 대상');
    expect(group.className).toContain('w-full');
    expect(group.className).toContain('border-[var(--border)]');
    fireEvent.click(within(group).getByRole('button', { name: '매수잔량' }));
    expect(segment().className).toContain('border-[var(--primary)]');
  });

  it('Q-06 — 매수/매도 카드가 방향색 5% 틴트를 **2열부터만** 갖는다 (폰 틴트 금지)', () => {
    render(<LimitChaserForm {...props()} />);

    const buy = document.querySelector<HTMLElement>('[data-side="buy"]')!;
    const sell = document.querySelector<HTMLElement>('[data-side="sell"]')!;
    expect(buy).not.toBeNull();
    expect(sell).not.toBeNull();

    expect(buy.className).toContain(
      '@min-[700px]/lc:bg-[color-mix(in_oklch,var(--up)_5%,var(--card-base))]',
    );
    expect(sell.className).toContain(
      '@min-[700px]/lc:bg-[color-mix(in_oklch,var(--down)_5%,var(--card-base))]',
    );

    /*
      ★ 폰(≤699)에는 틴트가 없어야 한다 — 탭 문구가 이미 어느 쪽인지 말한다.
        접두 없는 방향색 배경 유틸리티가 하나라도 있으면 폰에서 그대로 칠해진다.
        배경 선언은 `bg-[var(--card-base)]` **하나뿐**이라는 사실까지 함께 잠근다.
    */
    for (const card of [buy, sell]) {
      const bare = card.className
        .split(/\s+/)
        .filter((c) => c.startsWith('bg-'));
      expect(bare).toEqual(['bg-[var(--card-base)]']);
    }
  });
});

/* =========================================================================
   quick-260912-ok2 — ③ FAB 회피 여백 제거 · ⑤ 체크박스 행(색·정렬)
   ========================================================================= */
describe('quick-260912-ok2 — 액션 바 여백 · 체크박스 행', () => {
  /** 체크박스 하나를 켜서 더티를 만든다 — 액션 바는 더티일 때만 DOM 에 있다. */
  function renderDirty() {
    render(<LimitChaserForm {...props()} />);
    fireEvent.click(screen.getByText('취소잔량', { selector: 'label' }));
    const bar = actionBar() as HTMLElement | null;
    expect(bar).not.toBeNull();
    return bar!;
  }

  /*
    ★ ③ 회귀 잠금을 **렌더된 className** 으로 만든다 — 소스 grep 이 아니다.
      제거 사유를 파일 상단 주석에 적는 순간 그 주석이 옛 값(`pr-[128px]`)을 언급하게 되고,
      grep 게이트는 스스로 무효가 된다. 클래스 문자열은 주석을 보지 않는다.
  */
  it('③ 액션 바에 FAB 회피용 오른쪽 여백 예약이 없다', () => {
    const bar = renderDirty();
    const utils = bar.className.split(/\s+/);

    // 임의의 `pr-*` 예약이 하나도 없다 — 숫자만 바꿔 되살리는 우회를 함께 막는다.
    expect(utils.filter((c) => /^pr-/.test(c))).toEqual([]);
    // 좌우는 **한 유틸리티**로 대칭이다 — `pl-`/`pr-` 로 갈리면 「오른쪽만 조금 더」가 돌아온다.
    expect(utils.filter((c) => /^pl-/.test(c))).toEqual([]);
    expect(utils).toContain('px-[var(--s-4)]');
    // 하단 고정·`role="status"` 계약은 불변이다.
    expect(bar.getAttribute('role')).toBe('status');
    expect(bar.getAttribute('aria-live')).toBe('polite');
    expect(utils).toContain('fixed');
  });

  /*
    ★ ⑤ⓑ 색 — `CheckRow` 라벨이 `Row` 라벨보다 진했다. 브라우저 실측:
      CheckRow 라벨 `lab(5.26802 0 0)`(= --fg) vs Row 라벨 `lab(42 0 0)`(= --muted-fg).
      같은 카드 안에서 같은 위계의 라벨이 두 색으로 읽히면 체크박스 행만 강조로 보인다.
  */
  it('⑤ 비더티 `CheckRow` 라벨색이 `Row` 라벨과 같은 `--muted-fg` 다', () => {
    render(<LimitChaserForm {...props()} />);

    const checkLabel = document.querySelector<HTMLElement>('label[for="lc-cancel-qty"]')!;
    const rowLabel = document.querySelector<HTMLElement>('label[for="lc-buy-watch-qty"]')!;

    expect(rowLabel.className).toContain('text-[var(--muted-fg)]');
    expect(checkLabel.className).toContain('text-[var(--muted-fg)]');
    expect(checkLabel.className).not.toContain('text-[var(--fg)]');
    // 글자 크기 계약도 같은 값이다 — 색만 맞추고 크기가 갈리면 같은 오독이 남는다.
    expect(checkLabel.className).toContain('text-[13px]');
    expect(rowLabel.className).toContain('text-[13px]');
  });

  /*
    ★ ⑤ 더티 표현 3종은 **그대로 둔다.** 색만으로 더티를 말하면 WCAG 1.4.1 위반이고,
      이 화면은 실계좌 발주 설정이라 「바꾼 줄 몰랐다」가 곧 오발주다.
  */
  it('⑤ 더티 `CheckRow` 라벨은 `● ` + `--primary` + `font-semibold` 를 그대로 갖는다', () => {
    render(<LimitChaserForm {...props()} />);

    fireEvent.click(screen.getByText('취소잔량', { selector: 'label' }));

    const checkLabel = document.querySelector<HTMLElement>('label[for="lc-cancel-qty"]')!;
    expect(checkLabel.className).toContain('text-[var(--primary)]');
    expect(checkLabel.className).toContain('font-semibold');
    expect(checkLabel.textContent).toMatch(/^● /);
  });

  /*
    ★ ⑤ⓒ 정렬 — **고칠 것이 없다.** 브라우저 실측(390, `lc-buy-trade` 행):
        체크박스  top 543.38 · h 17   · center 551.88
        라벨 박스 top 542.13 · h 19.5 · center 551.88   → 박스 중심 차 **0.00px**
        글자 잉크 top 544.13 · h 15   · center 551.63   → 광학 중심 차 **0.25px**
        체크박스 margin 0/0(Tailwind preflight), 라벨 line-height 19.5px / font 13px.
      `items-center` 가 이미 두 상자의 중심을 정확히 맞추고 있고, 남은 0.25px 는 13px
      글자의 잉크 중심과 17px 상자 기하 중심의 차다 — 1px 미만이라 렌더에 나타나지 않는다.
      `mt-[1px]` 같은 매직 오프셋을 박으면 다음 폰트·크기 변경에서 조용히 **반대로** 틀어진다.
      그래서 여기서 잠그는 것은 오프셋이 아니라 **정렬 장치 자체의 존재**다.
  */
  it('⑤ 체크박스·라벨 묶음이 `items-center` 로 정렬된다 — 매직 오프셋이 없다 (실측 0.25px)', () => {
    render(<LimitChaserForm {...props()} />);

    const checkbox = document.querySelector<HTMLElement>('#lc-cancel-qty')!;
    const group = checkbox.parentElement!;

    expect(group.className).toContain('items-center');
    // 체크박스·라벨 어디에도 세로 오프셋 유틸리티가 없다.
    for (const el of [checkbox, group.querySelector('label')!]) {
      const utils = el.className.split(/\s+/);
      expect(utils.filter((c) => /^-?(mt|mb|translate-y|top)-/.test(c))).toEqual([]);
    }
    // 체크박스 크기 계약은 그대로다(17px + 축소 금지).
    expect(checkbox.className).toContain('size-[17px]');
    expect(checkbox.className).toContain('flex-none');
  });
});
