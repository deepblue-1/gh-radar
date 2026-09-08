import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  RelayAccount,
  RelayAccountState,
  RelayOrderResultMsg,
} from '@gh-radar/shared';

/**
 * Phase 15 Plan 18 / Phase 16 Plan 10 — 계좌 패널 계약 검증 (RELAY-02 · TRADE-03).
 *
 * 잠그는 규칙:
 *   - 미체결 잔량 0 행에는 취소 버튼이 **없다**(③) — 반드시 거부되는 버튼은 오조작을 부른다
 *   - 취소도 확인 다이얼로그를 거치고 기본 포커스는 닫기다(④)
 *   - 취소 수량은 **미체결 잔량 전부**이고 원주문번호가 실린다(⑤)
 *   - 취소 버튼은 채움이 아니라 테두리다(⑥) — `--destructive` == `--up` 충돌
 *   - 계좌번호는 마스킹 없이 전체 표시한다(⑪, D2)
 *   - **결과 모름은 그 주문의 취소 버튼을 다시 열지 않는다**(⑦)
 *   - **취소 키는 그 행의 ISIN 이다**(⑭, D-02/D-28) — 화면에 열린 종목을 쓰면 오취소
 *   - **계좌 전용 모드**(종목 축 없음)에서도 미체결·잔고가 그려진다(⑯, D-21)
 *   - **모바일 2줄 카드 행**(`.rlist`)에서 신축 항목은 종목명 하나뿐이다(⑰, UI-SPEC C7)
 *
 * ★ 스텁 경계 — `@/lib/relay-provider` 의 `useRelayContext` 하나다 (D-02).
 *   패널이 바깥과 맺는 계약은 `sendOrder(req) => Promise<RelayOrderResultMsg>` 뿐이고,
 *   그 Promise 는 **어떤 경로에서도 reject 하지 않는다**. 그래서 이 파일에는 rejection
 *   시나리오가 없다 — 있으면 존재하지 않는 경로를 검증하게 된다.
 *
 * ★ jsdom 에는 CSS 가 없다 — `표(≥1280)`와 `카드 행(<1280)` **두 벌이 모두 DOM 에 있다**.
 *   그래서 조회는 반드시 어느 트리인지 좁혀서 한다(아래 스코프 헬퍼). 좁히지 않으면
 *   같은 버튼이 2건 잡혀 `getByRole` 이 터진다.
 */

const sendOrderMock = vi.fn();
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, sendOrder: sendOrderMock }),
  };
});

import { AccountPanel, type AccountPanelProps } from '../account-panel';

const ISIN = 'KR7042700005';
const OTHER_ISIN = 'KR7007660005';

const ACCOUNTS: RelayAccount[] = [
  { accountNo: '12345678-01', name: '위탁종합' },
  { accountNo: '12345678-02', name: 'CMA' },
];

function accountState(over: Partial<RelayAccountState> = {}): RelayAccountState {
  return {
    t: 'acct',
    a: '12345678-01',
    snap: true,
    rm: [],
    st: '13:42:11',
    hold: [
      { isin: ISIN, qty: 120, sellableQty: 90, avgPrice: 91_250 },
      { isin: OTHER_ISIN, qty: 200, sellableQty: 200, avgPrice: 44_100 },
    ],
    unf: [
      {
        orderNo: '0000135742',
        orgOrderNo: '',
        isin: ISIN,
        side: 'B',
        price: 98_000,
        orderQty: 50,
        filledQty: 20,
        unfilledQty: 30,
        exchange: 'KRX',
      },
      {
        orderNo: '0000135801',
        orgOrderNo: '',
        isin: ISIN,
        side: 'S',
        price: 99_200,
        orderQty: 20,
        filledQty: 0,
        unfilledQty: 20,
        exchange: 'NXT',
      },
      {
        orderNo: '0000135655',
        orgOrderNo: '',
        isin: ISIN,
        side: 'B',
        price: 97_500,
        orderQty: 100,
        filledQty: 100,
        unfilledQty: 0,
        exchange: 'KRX',
      },
    ],
    ...over,
  };
}

function baseProps(over: Partial<AccountPanelProps> = {}): AccountPanelProps {
  return {
    accounts: ACCOUNTS,
    selectedAccountNo: '12345678-01',
    onAccountChange: vi.fn(),
    account: accountState(),
    code: '042700',
    name: '한미반도체',
    isin: ISIN,
    currentPrice: 98_400,
    status: 'ready',
    ...over,
  };
}

function renderPanel(over: Partial<AccountPanelProps> = {}) {
  return render(<AccountPanel {...baseProps(over)} />);
}

// ---------------------------------------------------------------------------
// 스코프 헬퍼 — 표 트리와 카드 트리를 갈라 본다(파일 상단 ★)
// ---------------------------------------------------------------------------

function section(name: 'account-unfilled' | 'account-holdings'): HTMLElement {
  return screen.getByTestId(name);
}

/** 미체결/잔고 표(데스크톱 ≥1280) 자체. 없으면(빈 상태) null. */
function tableOf(name: 'account-unfilled' | 'account-holdings'): HTMLElement {
  const table = section(name).querySelector('[data-slot="table"]');
  if (table === null) throw new Error(`${name} 에 표가 없습니다`);
  return table as HTMLElement;
}

/** 미체결 표의 본문 행(헤더 제외). */
function unfilledRows(): HTMLElement[] {
  return within(tableOf('account-unfilled'))
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('columnheader').length === 0);
}

/** 모바일 카드 행(<1280). `data-slot` 이 E2E 앵커와 같은 문자열이다(S-9). */
function unfilledCards(): HTMLElement[] {
  return Array.from(
    section('account-unfilled').querySelectorAll('[data-slot="account-unfilled-row"]'),
  );
}

function holdingCards(): HTMLElement[] {
  return Array.from(
    section('account-holdings').querySelectorAll('[data-slot="account-holding-row"]'),
  );
}

/**
 * 그 주문번호의 취소 버튼 **전부**(표 + 카드). 개수는 렌더 트리 수라는 구현 세부이므로
 * 단언하지 않고 **있다/없다**만 본다.
 */
function cancelButtons(orderNo: string): HTMLElement[] {
  return screen.queryAllByRole('button', { name: `주문번호 ${orderNo} 취소` });
}

function orderResult(over: Partial<RelayOrderResultMsg> = {}): RelayOrderResultMsg {
  return {
    t: 'order.result',
    rid: 'rid-1',
    orderNo: '0000135742',
    resultCode: 0,
    message: '정상처리',
    status: 'accepted',
    ...over,
  };
}

beforeEach(() => {
  sendOrderMock.mockReset();
  sendOrderMock.mockResolvedValue(orderResult());
});

describe('AccountPanel — 미체결 표', () => {
  it('① 미체결 3건이면 3행이 뜨고 탭 라벨이 건수를 말한다', () => {
    renderPanel();
    expect(unfilledRows()).toHaveLength(3);
    // 같은 3건이 카드 트리에도 있다(브레이크포인트로 하나만 보인다).
    expect(unfilledCards()).toHaveLength(3);
    expect(screen.getByRole('tab', { name: '미체결 (3)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '잔고 (2)' })).toBeInTheDocument();
  });

  it('② 기본 탭은 미체결이다 (주문 → 취소 동선이 우선)', () => {
    renderPanel();
    expect(screen.getByRole('tab', { name: '미체결 (3)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: '잔고 (2)' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('③ 미체결 잔량 0 행에는 취소 버튼을 렌더하지 않는다 (D-21)', () => {
    renderPanel();
    // 잔량이 남은 2건만 취소 가능하다.
    expect(cancelButtons('0000135742').length).toBeGreaterThan(0);
    expect(cancelButtons('0000135801').length).toBeGreaterThan(0);
    expect(cancelButtons('0000135655')).toHaveLength(0);
  });

  it('④ 취소도 확인 다이얼로그를 거치고 기본 포커스는 닫기다', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(cancelButtons('0000135742')[0]);

    expect(await screen.findByText('미체결 주문을 취소할까요?')).toBeInTheDocument();
    expect(screen.getByText('취소 수량은 미체결 잔량 전부예요.')).toBeInTheDocument();
    expect(sendOrderMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();
    });
  });

  it('⑤ 확인하면 그 행의 ISIN + 원주문번호 + 미체결 잔량 전부로 wss 취소가 나간다 (D-02)', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(cancelButtons('0000135742')[0]);
    await user.click(await screen.findByRole('button', { name: '✕ 주문 취소' }));

    await waitFor(() => expect(sendOrderMock).toHaveBeenCalledTimes(1));
    expect(sendOrderMock).toHaveBeenCalledWith({
      kind: 'cancel',
      // ★ 6자 단축코드가 아니라 12자 ISIN 이다 (D-28 — 브라우저는 종목 키를 유도하지 않는다).
      isin: ISIN,
      accountNo: '12345678-01',
      exchange: 'KRX',
      orgOrderNo: '0000135742',
      qty: 30,
      price: 98_000,
    });
    // 단축코드는 요청에 실리지 않는다 — 실리면 두 종목 키가 공존하게 된다.
    expect(sendOrderMock.mock.calls[0][0]).not.toHaveProperty('code');
  });

  it('⑥ 취소 버튼은 채움이 아니라 테두리다 (--destructive == --up 충돌)', () => {
    renderPanel();
    for (const cancel of cancelButtons('0000135742')) {
      expect(cancel).toHaveAttribute('data-variant', 'outline');
      expect(cancel.className).toContain('border-[var(--destructive)]');
      expect(cancel.className).toContain('text-[var(--destructive)]');
      // 채움 배경이 붙으면 매수 버튼과 구분되지 않는다.
      expect(cancel.className).not.toContain('bg-[var(--destructive)]');
    }
  });

  it('⑦ 결과를 모르는 취소가 나가면 그 주문번호의 취소 버튼을 다시 열지 않는다', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(
      orderResult({ status: 'timeout', orderNo: '', resultCode: -1, message: '결과 미확인' }),
    );
    renderPanel();

    await user.click(cancelButtons('0000135742')[0]);
    await user.click(await screen.findByRole('button', { name: '✕ 주문 취소' }));

    const banner = await screen.findByTestId('cancel-result-unknown');
    expect(banner).toHaveTextContent('취소 응답이 늦어지고 있어요');
    expect(banner).toHaveAttribute('role', 'status');
    // 표에서도 카드에서도 사라져야 한다 — 한쪽만 잠기면 모바일에서 두 번 눌린다.
    expect(cancelButtons('0000135742')).toHaveLength(0);
    // 다른 주문의 취소는 여전히 가능하다.
    expect(cancelButtons('0000135801').length).toBeGreaterThan(0);
  });

  it('⑦-a 거부는 사유와 코드를 밝히고 그 버튼을 잠그지 않는다 (다시 시도해도 안전)', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(
      orderResult({ status: 'rejected', resultCode: -204, message: '취소할 수량이 없습니다' }),
    );
    renderPanel();

    await user.click(cancelButtons('0000135742')[0]);
    await user.click(await screen.findByRole('button', { name: '✕ 주문 취소' }));

    const banner = await screen.findByTestId('cancel-result-rejected');
    expect(banner).toHaveTextContent('주문 취소가 거부됐어요 · 취소할 수량이 없습니다');
    expect(banner).toHaveTextContent('코드 -204');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(cancelButtons('0000135742').length).toBeGreaterThan(0);
  });
});

describe('AccountPanel — 잔고 표 · 빈 상태 · 계좌', () => {
  it('⑧ 잔고 탭의 평가손익·수익률은 방향색으로 렌더한다', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('tab', { name: '잔고 (2)' }));

    // (98,400 - 91,250) × 120 = +858,000 / +7.84%
    const table = tableOf('account-holdings');
    expect(within(table).getByText('+858,000')).toHaveClass('text-[var(--up)]');
    expect(within(table).getByText('+7.84%')).toHaveClass('text-[var(--up)]');
  });

  it('⑨ 현재가를 모르는 보유 종목의 평가손익은 지어내지 않고 — 로 둔다', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('tab', { name: '잔고 (2)' }));

    const otherRow = within(tableOf('account-holdings')).getByText(OTHER_ISIN).closest('tr');
    expect(otherRow).not.toBeNull();
    expect(within(otherRow as HTMLElement).getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('⑩ 비어 있으면 미체결·잔고 각각의 빈 상태 문구를 보여준다', () => {
    renderPanel({ account: accountState({ hold: [], unf: [] }) });

    expect(screen.getByText('미체결 주문이 없어요')).toBeInTheDocument();
    expect(
      screen.getByText('주문을 넣으면 여기에 표시되고, 여기서 바로 취소할 수 있어요.'),
    ).toBeInTheDocument();
    expect(screen.getByText('보유 종목이 없어요')).toBeInTheDocument();
    expect(screen.getByText('체결된 주문이 있으면 잔고에 반영돼요.')).toBeInTheDocument();
  });

  it('⑪ 계좌번호는 마스킹 없이 전체 표시한다 (D2)', () => {
    renderPanel();
    const select = screen.getByLabelText('계좌');

    expect(select).toHaveValue('12345678-01');
    expect(screen.getByRole('option', { name: '12345678-01 · 위탁종합' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '12345678-02 · CMA' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('****');
  });

  it('⑫ 세션이 준비되지 않으면 취소 버튼을 비활성한다', () => {
    renderPanel({ status: 'reconnecting' });
    for (const cancel of cancelButtons('0000135742')) expect(cancel).toBeDisabled();
  });

  // ----------------------------------------------------------
  // relay 가 채운 종목명 · 취소 키 (2026-09-08 D-02 갱신)
  //
  // 게이트웨이는 잔고·미체결에 이름을 싣지 않는다. relay 가 `stocks.isin` 으로 풀어
  // `name`/`code` 를 실어 준다. 그러나 **취소 키는 ISIN** 이라 `code` 유무는 취소 가능
  // 여부와 무관하다 — 예전의 「코드 없으면 취소 불가」 제약은 폐기됐다.
  // ----------------------------------------------------------

  it('⑬ relay 가 채운 종목명을 잔고·미체결에 표시한다 (ISIN 원문 대신)', () => {
    renderPanel({
      account: accountState({
        hold: [
          { isin: ISIN, qty: 120, sellableQty: 90, avgPrice: 91_250 },
          {
            isin: OTHER_ISIN,
            qty: 200,
            sellableQty: 200,
            avgPrice: 44_100,
            name: '이수페타시스',
            code: '007660',
          },
        ],
        unf: [
          {
            orderNo: '0000135742',
            orgOrderNo: '',
            isin: OTHER_ISIN,
            side: 'B',
            price: 44_000,
            orderQty: 50,
            filledQty: 0,
            unfilledQty: 50,
            exchange: 'KRX',
            name: '이수페타시스',
            code: '007660',
          },
        ],
      }),
    });

    // 미체결·잔고 양쪽 × 표·카드 두 벌이므로 getAllBy 로 받는다.
    expect(screen.getAllByText('이수페타시스').length).toBeGreaterThan(0);
    expect(screen.queryByText(OTHER_ISIN)).toBeNull();
  });

  it('⑭ 다른 종목의 미체결은 **그 행의 ISIN** 으로 취소된다 (화면에 열린 종목이 아니다)', async () => {
    const user = userEvent.setup();
    renderPanel({
      account: accountState({
        unf: [
          {
            orderNo: '0000199999',
            orgOrderNo: '',
            isin: OTHER_ISIN,
            side: 'S',
            price: 44_000,
            orderQty: 10,
            filledQty: 0,
            unfilledQty: 10,
            exchange: 'NXT',
            name: '이수페타시스',
            code: '007660',
          },
        ],
      }),
    });

    await user.click(cancelButtons('0000199999')[0]);
    // 확인 다이얼로그에도 **그 행의** 종목명이 떠야 한다(표에도 같은 이름이 있으므로
    // 다이얼로그 안으로 범위를 좁혀서 본다).
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/이수페타시스/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '✕ 주문 취소' }));

    await waitFor(() => expect(sendOrderMock).toHaveBeenCalledTimes(1));
    // 화면에 열린 종목(KR7042700005)이 아니라 그 행의 ISIN 으로 나간다.
    expect(sendOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isin: OTHER_ISIN,
        exchange: 'NXT',
        orgOrderNo: '0000199999',
        qty: 10,
      }),
    );
  });

  it('⑮ 단축코드를 못 푼 다른 종목 행도 ISIN 으로 취소된다 (버튼을 잠그지 않는다)', async () => {
    const user = userEvent.setup();
    renderPanel({
      account: accountState({
        unf: [
          {
            orderNo: '0000188888',
            orgOrderNo: '',
            isin: OTHER_ISIN,
            side: 'B',
            price: 44_000,
            orderQty: 10,
            filledQty: 0,
            unfilledQty: 10,
            exchange: 'KRX',
            // name/code 없음 — 마스터에 아직 없는 ISIN
          },
        ],
      }),
    });

    // 이름을 못 풀면 ISIN 원문을 보여 주되, 취소는 막지 않는다.
    expect(screen.getAllByText(OTHER_ISIN).length).toBeGreaterThan(0);
    expect(cancelButtons('0000188888').length).toBeGreaterThan(0);
    // 사실이 아닌 제약을 광고하지 않는다(옛 안내 문구는 폐기됐다).
    expect(screen.queryByText(/그 종목 페이지에서 취소할 수 있어요/)).toBeNull();

    await user.click(cancelButtons('0000188888')[0]);
    await user.click(await screen.findByRole('button', { name: '✕ 주문 취소' }));
    await waitFor(() => expect(sendOrderMock).toHaveBeenCalledTimes(1));
    expect(sendOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ isin: OTHER_ISIN, orgOrderNo: '0000188888' }),
    );
  });
});

// ===========================================================================
// Phase 16 Plan 10 — 3표면 공용화 (계좌 전용 모드 · 모바일 카드 행)
// ===========================================================================

describe('AccountPanel — 계좌 전용 모드 (D-21 / My page)', () => {
  /** 종목 축(`code`/`name`/`isin`/`currentPrice`)을 **전부** 뺀 렌더. */
  function renderAccountOnly(over: Partial<AccountPanelProps> = {}) {
    return render(
      <AccountPanel
        selectedAccountNo="12345678-02"
        account={accountState()}
        status="ready"
        {...over}
      />,
    );
  }

  it('⑯ 종목 축 없이도 미체결·잔고가 예외 없이 그려진다', () => {
    expect(() => renderAccountOnly()).not.toThrow();

    expect(unfilledRows()).toHaveLength(3);
    expect(unfilledCards()).toHaveLength(3);
    expect(holdingCards()).toHaveLength(2);
    expect(screen.getByTestId('account-panel')).toHaveAttribute('data-mode', 'account');
  });

  it('⑯-a 계좌 셀렉터가 없고 계좌번호를 전체 표시한다 (S-5 · 세로 반복이 계좌 구분이다)', () => {
    renderAccountOnly();

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.getByTestId('account-panel-account-no')).toHaveTextContent('12345678-02');
    expect(document.body.textContent).not.toContain('****');
  });

  it('⑯-b 탭이 없고 미체결·잔고가 함께 보인다 (My page 는 둘을 같이 본다)', () => {
    renderAccountOnly();

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: '미체결' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '잔고' })).toBeInTheDocument();
  });

  it('⑯-c 현재가를 하나도 모르므로 평가·손익을 지어내지 않는다 (⑤)', () => {
    renderAccountOnly();

    for (const card of holdingCards()) {
      // 평가 · 현재 · 손익 · 손익률 4곳이 전부 —
      expect(within(card).getAllByText('—').length).toBeGreaterThanOrEqual(4);
    }
  });

  it('⑯-d 취소는 계좌 전용 모드에서도 그 행의 ISIN 으로 나간다', async () => {
    const user = userEvent.setup();
    renderAccountOnly();

    await user.click(cancelButtons('0000135742')[0]);
    await user.click(await screen.findByRole('button', { name: '✕ 주문 취소' }));

    await waitFor(() => expect(sendOrderMock).toHaveBeenCalledTimes(1));
    expect(sendOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'cancel', isin: ISIN, accountNo: '12345678-02' }),
    );
  });
});

describe('AccountPanel — 모바일 2줄 카드 행 (UI-SPEC C7 / R6)', () => {
  /**
   * ★ 이 케이스가 잠그는 것은 「보기」가 아니라 **잘림**이다.
   *   카드 행에서 신축 가능한 항목이 둘 이상이면 긴 종목명이 숫자를 밀어내고,
   *   `min-w-0` 이 없으면 콘텐츠 최소폭 아래로 줄지 않아 가로로 넘친다.
   *   실측 폭 단언은 E2E(`orderbook.spec.ts`)가 맡고, 여기서는 그 전제인
   *   **클래스 구성**을 잠근다(jsdom 에는 레이아웃이 없다).
   */
  it('⑰ 신축 항목은 종목명 하나뿐이고 나머지는 flex-none 이다', () => {
    renderPanel();

    const card = unfilledCards()[0];
    const lines = Array.from(card.children) as HTMLElement[];
    expect(lines).toHaveLength(2); // 정확히 2줄이다

    for (const line of lines) {
      expect(line.className).toContain('min-w-0');
      const growers = Array.from(line.children).filter((el) =>
        el.className.includes('flex-1'),
      );
      // 신축은 0개(②줄) 또는 1개(①줄 종목명)뿐이다.
      expect(growers.length).toBeLessThanOrEqual(1);
      for (const grower of growers) {
        expect(grower.className).toContain('min-w-0');
        expect(grower.className).toContain('truncate');
      }
      // 신축이 아닌 항목은 전부 flex-none 이어야 밀려나지 않는다.
      for (const child of Array.from(line.children)) {
        if (child.className.includes('flex-1')) continue;
        expect(child.className).toContain('flex-none');
      }
    }
  });

  it('⑰-a 카드 행이 UI-SPEC 이 정한 값을 그 순서로 담는다', () => {
    renderPanel();

    const card = unfilledCards()[0];
    // ①줄 종목명 · 구분 · 주문번호 / ②줄 주문가 · 미체결 잔량/주문량 · 취소
    expect(card).toHaveTextContent('한미반도체');
    expect(card).toHaveTextContent('▲ 매수');
    expect(card).toHaveTextContent('0000135742');
    expect(card).toHaveTextContent('98,000');
    expect(card).toHaveTextContent('30/50');
    expect(within(card).getByRole('button', { name: '주문번호 0000135742 취소' })).toBeVisible();

    const hold = holdingCards()[0];
    expect(hold).toHaveTextContent('한미반도체');
    expect(hold).toHaveTextContent('120'); // 보유
    expect(hold).toHaveTextContent('90'); // 매도가능
    expect(hold).toHaveTextContent('91,250'); // 평단
    expect(hold).toHaveTextContent('98,400'); // 현재
    expect(hold).toHaveTextContent('+858,000');
  });

  it('⑰-b 출처 태그는 prop 으로 들어온 화면 컨텍스트다 (없으면 태그가 없다)', () => {
    const { unmount } = renderPanel();
    expect(document.querySelectorAll('[data-slot="account-origin-tag"]')).toHaveLength(0);
    unmount();

    renderPanel({ originTag: '상따' });
    // 미체결 3행 × (표 + 카드) 두 벌
    expect(document.querySelectorAll('[data-slot="account-origin-tag"]').length).toBe(6);
    expect(within(unfilledCards()[0]).getByText('상따')).toBeInTheDocument();
  });
});
