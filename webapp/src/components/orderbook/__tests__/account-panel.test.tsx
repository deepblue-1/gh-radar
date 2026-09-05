import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CreateOrderResponse,
  RelayAccount,
  RelayAccountState,
} from '@gh-radar/shared';

/**
 * Phase 15 Plan 18 — 계좌 패널 계약 검증 (RELAY-02, T-15-53 · T-15-54).
 *
 * 잠그는 규칙:
 *   - 미체결 잔량 0 행에는 취소 버튼이 **없다**(③) — 반드시 거부되는 버튼은 오조작을 부른다
 *   - 취소도 확인 다이얼로그를 거치고 기본 포커스는 닫기다(④)
 *   - 취소 수량은 **미체결 잔량 전부**이고 원주문번호가 실린다(⑤)
 *   - 취소 버튼은 채움이 아니라 테두리다(⑥) — `--destructive` == `--up` 충돌
 *   - 계좌번호는 마스킹 없이 전체 표시한다(⑨, D2)
 */

const createOrderMock = vi.fn();
vi.mock('@/lib/orders-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/orders-api')>();
  return { ...actual, createOrder: (...args: unknown[]) => createOrderMock(...args) };
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

/** 미체결 표의 본문 행. jsdom 에는 CSS 가 없어 두 섹션이 동시에 존재하므로 스코프한다. */
function unfilledRows(): HTMLElement[] {
  const section = screen.getByTestId('account-unfilled');
  return within(section)
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('columnheader').length === 0);
}

function acceptedResponse(over: Partial<CreateOrderResponse> = {}): CreateOrderResponse {
  return { orderNo: '0000135742', resultCode: 0, message: '정상처리', status: 'accepted', ...over };
}

beforeEach(() => {
  createOrderMock.mockReset();
  createOrderMock.mockResolvedValue(acceptedResponse());
});

describe('AccountPanel — 미체결 표', () => {
  it('① 미체결 3건이면 3행이 뜨고 탭 라벨이 건수를 말한다', () => {
    renderPanel();
    expect(unfilledRows()).toHaveLength(3);
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
    expect(screen.getByRole('button', { name: '주문번호 0000135742 취소' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '주문번호 0000135801 취소' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '주문번호 0000135655 취소' })).toBeNull();
  });

  it('④ 취소도 확인 다이얼로그를 거치고 기본 포커스는 닫기다', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: '주문번호 0000135742 취소' }));

    expect(await screen.findByText('미체결 주문을 취소할까요?')).toBeInTheDocument();
    expect(screen.getByText('취소 수량은 미체결 잔량 전부예요.')).toBeInTheDocument();
    expect(createOrderMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();
    });
  });

  it('⑤ 확인하면 원주문번호 + 미체결 잔량 전부로 취소가 나간다', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: '주문번호 0000135742 취소' }));
    await user.click(await screen.findByRole('button', { name: '✕ 주문 취소' }));

    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
    expect(createOrderMock).toHaveBeenCalledWith({
      code: '042700',
      accountNo: '12345678-01',
      exchange: 'KRX',
      side: 'B',
      orderType: 'C',
      orgOrderNo: '0000135742',
      qty: 30,
      price: 98_000,
    });
  });

  it('⑥ 취소 버튼은 채움이 아니라 테두리다 (--destructive == --up 충돌)', () => {
    renderPanel();
    const cancel = screen.getByRole('button', { name: '주문번호 0000135742 취소' });

    expect(cancel).toHaveAttribute('data-variant', 'outline');
    expect(cancel.className).toContain('border-[var(--destructive)]');
    expect(cancel.className).toContain('text-[var(--destructive)]');
    // 채움 배경이 붙으면 매수 버튼과 구분되지 않는다.
    expect(cancel.className).not.toContain('bg-[var(--destructive)]');
  });

  it('⑦ 결과를 모르는 취소가 나가면 그 주문번호의 취소 버튼을 다시 열지 않는다', async () => {
    const user = userEvent.setup();
    createOrderMock.mockResolvedValue(
      acceptedResponse({ status: 'timeout', orderNo: '', message: '결과 미확인' }),
    );
    renderPanel();

    await user.click(screen.getByRole('button', { name: '주문번호 0000135742 취소' }));
    await user.click(await screen.findByRole('button', { name: '✕ 주문 취소' }));

    const banner = await screen.findByTestId('cancel-result-unknown');
    expect(banner).toHaveTextContent('취소 응답이 늦어지고 있어요');
    expect(banner).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('button', { name: '주문번호 0000135742 취소' })).toBeNull();
    // 다른 주문의 취소는 여전히 가능하다.
    expect(screen.getByRole('button', { name: '주문번호 0000135801 취소' })).toBeInTheDocument();
  });
});

describe('AccountPanel — 잔고 표 · 빈 상태 · 계좌', () => {
  it('⑧ 잔고 탭의 평가손익·수익률은 방향색으로 렌더한다', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('tab', { name: '잔고 (2)' }));

    // (98,400 - 91,250) × 120 = +858,000 / +7.84%
    expect(screen.getByText('+858,000')).toHaveClass('text-[var(--up)]');
    expect(screen.getByText('+7.84%')).toHaveClass('text-[var(--up)]');
  });

  it('⑨ 현재가를 모르는 보유 종목의 평가손익은 지어내지 않고 — 로 둔다', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('tab', { name: '잔고 (2)' }));

    const holdings = screen.getByTestId('account-holdings');
    const otherRow = within(holdings).getByText(OTHER_ISIN).closest('tr');
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
    expect(screen.getByRole('button', { name: '주문번호 0000135742 취소' })).toBeDisabled();
  });
});
