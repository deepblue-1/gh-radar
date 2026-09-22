import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { RelayOrderResultMsg, RelayQueuedWindowMsg, RelayUnfilled } from '@gh-radar/shared';

/**
 * Phase 18 Plan 07 — 수동주문 폼 계약 (TRADE-07, D-19~D-23 · D-27, E11).
 *
 * 이 파일이 잠그는 것은 「보기」가 아니라 **오주문으로 이어지는 규칙**이다.
 *   ① 4버튼 한 줄 — 미선택이면 정정·취소 disabled (D-20/D-21)
 *   ② 확인 다이얼로그 없이 나가는 경로 0건 · 기본 포커스 취소 (T-18-30)
 *   ③ 응답 전 재클릭 무효 · `timeout` ≠ 실패 · 재시도 권유 없음 (T-18-31)
 *   ④ 라벨·조각 입력은 `affordanceOf` 반환 그대로 · 조각 수는 스테퍼가 보일 때만 싣는다 (T-18-34)
 *   ⑤ 시간외종가(호가 탭 전용) — price 0 + krxSession · 정정 비활성
 *   ⑥ 적응형 진입(<700 3탭 / ≥700 덮기) — 옵션 값 보존
 *
 * ★ 스텁 경계는 `useRelayContext().sendOrder` 하나다(`order-panel.test.tsx` 와 같은 판단).
 *   그 Promise 는 어떤 경로에서도 reject 하지 않으므로 rejection 시나리오가 없다.
 */

const sendOrderMock = vi.fn();
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, sendOrder: sendOrderMock }),
  };
});

/*
  WR-01 경합 창 재현용 — `affordanceOf` 만 케이스가 켤 때 덮는다(기본은 실제 구현).
  복귀 효과가 돌기 전 한 렌더(시간외종가 선택 가능인데 `g2Open`·`g3Open` 은 둘 다 false)는
  RTL `act` 가 효과를 먼저 흘려 `rerender` 로는 재현되지 않는다 — 그래서 판정 원천을 고정한다.
*/
const affMock = vi.hoisted(() => ({
  override: null as null | Partial<import('@/lib/queued-window').ManualOrderAffordance>,
}));
vi.mock('@/lib/queued-window', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queued-window')>();
  return {
    ...actual,
    affordanceOf: (...args: Parameters<typeof actual.affordanceOf>) => {
      const real = actual.affordanceOf(...args);
      return affMock.override ? { ...real, ...affMock.override } : real;
    },
  };
});

import { OFFHOURS_PRICE_LABEL } from '@/components/orderbook/order-confirm-dialog';
import {
  ManualOrderEntry,
  ManualOrderForm,
  MODIFY_REMAINING_CHANGED_TEXT,
  MODIFY_TARGET_GONE_TEXT,
  OFFHOURS_WINDOW_CLOSED_TEXT,
  canModify,
  modifyQtyClampedText,
  modifyQtyOverRemainingText,
  unfilledSelectBlockReason,
  type ManualOrderFormProps,
} from '../card/manual-order-form';

const ISIN = 'KR7042700005';

function win(over: Partial<RelayQueuedWindowMsg> = {}): RelayQueuedWindowMsg {
  return {
    t: 'queued.window',
    open: false,
    maxPieces: 10,
    preopenOpen: false,
    g2Open: false,
    g3Open: false,
    nxtPreopenOpen: false,
    ...over,
  };
}

function accepted(over: Partial<RelayOrderResultMsg> = {}): RelayOrderResultMsg {
  return {
    t: 'order.result',
    rid: 'rid-1',
    orderNo: '0000135842',
    resultCode: 0,
    message: '정상처리',
    status: 'accepted',
    ...over,
  };
}

function baseProps(over: Partial<ManualOrderFormProps> = {}): ManualOrderFormProps {
  return {
    variant: 'card',
    isin: ISIN,
    code: '042700',
    name: '한미반도체',
    accountNo: '12345678-01',
    exchange: 'KRX',
    queuedWindow: win(),
    status: 'ready',
    ...over,
  };
}

function renderForm(over: Partial<ManualOrderFormProps> = {}) {
  const props = baseProps(over);
  const view = render(<ManualOrderForm {...props} />);
  return { ...view, props };
}

const btn = (name: string) => screen.getByRole('button', { name });
const priceInput = () => screen.getByLabelText('가격') as HTMLInputElement;
const qtyInput = () => screen.getByLabelText('수량') as HTMLInputElement;

async function fill(user: ReturnType<typeof userEvent.setup>, price: string, qty: string) {
  if (price) await user.type(priceInput(), price);
  if (qty) await user.type(qtyInput(), qty);
}

beforeEach(() => {
  sendOrderMock.mockReset();
  sendOrderMock.mockResolvedValue(accepted());
  affMock.override = null;
});

describe('ManualOrderForm — 4버튼 · 빈 폼 (D-20/D-21, E11 empty)', () => {
  it('빈 폼: 4버튼이 한 줄에 있고 정정·취소는 disabled, 매수·매도는 활성이다', () => {
    renderForm();
    const row = screen.getByTestId('manual-order-buttons');
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '매수',
      '매도',
      '정정',
      '취소',
    ]);
    expect(row.className).toContain('grid-cols-[repeat(4,minmax(0,1fr))]');
    expect(btn('매수')).toBeEnabled();
    expect(btn('매도')).toBeEnabled();
    expect(btn('정정')).toBeDisabled();
    expect(btn('취소')).toBeDisabled();
  });

  it('계좌 행 · 가격 ± · 비율 버튼 · 「호가 사다리를 누르면…」 안내가 없다 (D-20 다이어트)', () => {
    renderForm();
    expect(screen.queryByLabelText('계좌')).toBeNull();
    expect(screen.queryByRole('button', { name: '호가 한 단계 올리기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '호가 한 단계 내리기' })).toBeNull();
    expect(screen.queryByText(/%$/)).toBeNull();
    expect(screen.queryByText(/클릭하면 여기에 채워져요/)).toBeNull();
  });

  it('가격 공란으로 「매수」 → 다이얼로그 전에 검증 문구가 인라인으로 뜨고 전송이 없다', async () => {
    const user = userEvent.setup();
    renderForm();
    await fill(user, '', '10');
    await user.click(btn('매수'));
    const status = screen.getByTestId('manual-order-validation');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent('주문 가격을 확인해 주세요.');
    expect(screen.queryByTestId('order-confirm-dialog')).toBeNull();
    expect(sendOrderMock).not.toHaveBeenCalled();
  });
});

describe('ManualOrderForm — 확인 다이얼로그 · 중복 제출 가드 (T-18-30/31)', () => {
  it('유효한 값으로 「매수」 → 확인 다이얼로그가 열리고 기본 포커스가 취소 버튼이다', async () => {
    const user = userEvent.setup();
    renderForm();
    await fill(user, '128500', '10');
    await user.click(btn('매수'));
    const dialog = await screen.findByTestId('order-confirm-dialog');
    expect(within(dialog).getByRole('heading', { name: '매수 주문을 넣을까요?' })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus());
    expect(sendOrderMock).not.toHaveBeenCalled();
  });

  it('확정 → sendOrder 1회 · 응답 전 4버튼 disabled · 재클릭해도 두 번째 전송이 없다', async () => {
    const user = userEvent.setup();
    let resolve: (r: RelayOrderResultMsg) => void = () => {};
    sendOrderMock.mockImplementation(() => new Promise((r) => (resolve = r)));
    renderForm();
    await fill(user, '128500', '10');
    await user.click(btn('매수'));
    await user.click(await screen.findByRole('button', { name: '매수 주문' }));

    expect(sendOrderMock).toHaveBeenCalledTimes(1);
    expect(sendOrderMock).toHaveBeenCalledWith({
      kind: 'new',
      isin: ISIN,
      accountNo: '12345678-01',
      exchange: 'KRX',
      side: 'B',
      qty: 10,
      price: 128_500,
    });
    for (const name of ['매수', '매도', '정정', '취소']) expect(btn(name)).toBeDisabled();
    expect(screen.getByText('주문 전송 중…')).toBeInTheDocument();

    await user.click(btn('매수'));
    expect(screen.queryByTestId('order-confirm-dialog')).toBeNull();
    expect(sendOrderMock).toHaveBeenCalledTimes(1);

    await act(async () => resolve(accepted()));
    const banner = await screen.findByTestId('manual-order-result');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveTextContent('주문이 접수됐어요 · 주문번호 0000135842');
  });

  it('응답 timeout → 「접수 응답이 늦어지고 있어요」 + 재확인 안내, 실패·재시도 표현이 없고 버튼이 잠긴다', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(
      accepted({ status: 'timeout', orderNo: '', resultCode: -1, message: '' }),
    );
    renderForm();
    await fill(user, '128500', '10');
    await user.click(btn('매도'));
    await user.click(await screen.findByRole('button', { name: '매도 주문' }));

    const banner = await screen.findByTestId('manual-order-result');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveTextContent('접수 응답이 늦어지고 있어요');
    expect(banner).toHaveTextContent('미체결 목록에서 접수 여부를 확인');
    expect(banner.textContent).not.toMatch(/실패|재시도|다시 시도/);
    // 결과를 모르면 잠근다 — 재주문 경로를 주면 그 자리에서 중복 체결이 난다.
    expect(btn('매수')).toBeDisabled();
    expect(btn('매도')).toBeDisabled();
  });

  it('응답 rejected → 「주문이 거부됐어요 · {message}」 원문 그대로(파싱 없이 표시만)', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(
      accepted({ status: 'rejected', orderNo: '', resultCode: 7, message: '주문가능수량 초과' }),
    );
    renderForm();
    await fill(user, '128500', '10');
    await user.click(btn('매수'));
    await user.click(await screen.findByRole('button', { name: '매수 주문' }));
    const banner = await screen.findByTestId('manual-order-result');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveTextContent('주문이 거부됐어요 · 주문가능수량 초과');
    expect(btn('매수')).toBeEnabled();
  });
});

describe('ManualOrderForm — 77 연결 (D-22)', () => {
  it('affordanceOf 가 queued 면 라벨이 「예약매수/예약매도」이고 조각 스테퍼가 보인다(초기 5 · 상한 maxPieces)', async () => {
    const user = userEvent.setup();
    renderForm({ queuedWindow: win({ open: true, maxPieces: 7 }) });
    expect(btn('예약매수')).toBeInTheDocument();
    expect(btn('예약매도')).toBeInTheDocument();
    const pieces = screen.getByLabelText('조각 수') as HTMLInputElement;
    expect(pieces.value).toBe('5');
    expect(screen.getByText('/ 최대 7')).toBeInTheDocument();
    const inc = btn('조각 늘리기');
    for (let i = 0; i < 5; i += 1) await user.click(inc);
    expect(pieces.value).toBe('7'); // 상한 = 서버 maxPieces
    await user.click(btn('조각 줄이기'));
    expect(pieces.value).toBe('6');

    await fill(user, '128500', '10');
    await user.click(btn('예약매수'));
    const dialog = await screen.findByTestId('order-confirm-dialog');
    expect(within(dialog).getByRole('heading', { name: '예약매수 주문을 넣을까요?' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '예약매수 주문' }));
    expect(sendOrderMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'new', pieceCount: 6 }));
  });

  it('조각 스테퍼가 보이지 않으면(NXT · open) 요청에 조각 수가 실리지 않는다', async () => {
    const user = userEvent.setup();
    renderForm({ exchange: 'NXT', queuedWindow: win({ open: true, maxPieces: 7 }) });
    expect(screen.queryByLabelText('조각 수')).toBeNull();
    await fill(user, '128500', '10');
    await user.click(btn('매수'));
    await user.click(await screen.findByRole('button', { name: '매수 주문' }));
    expect(sendOrderMock).toHaveBeenCalledTimes(1);
    expect(sendOrderMock.mock.calls[0][0]).not.toHaveProperty('pieceCount');
    expect(sendOrderMock.mock.calls[0][0]).not.toHaveProperty('krxSession');
  });

  it('장전(preopenOpen ∧ KRX) → 예약 라벨 · 조각 숨김 · 예약 안내 줄', () => {
    renderForm({ queuedWindow: win({ preopenOpen: true }) });
    expect(btn('예약매수')).toBeInTheDocument();
    expect(screen.queryByLabelText('조각 수')).toBeNull();
    expect(screen.getByText('예약: 증권사 보관 후 09:00 처리')).toBeInTheDocument();
  });
});

describe('ManualOrderForm — 주문유형 콤보 (D-23, 호가 탭 전용)', () => {
  it('카드 variant 에는 주문유형 콤보가 없다', () => {
    renderForm({ variant: 'card', queuedWindow: win({ g3Open: true }) });
    expect(screen.queryByLabelText('주문유형')).toBeNull();
  });

  it('창이 닫혀 있으면 시간외종가 옵션이 disabled + title 사유', () => {
    renderForm({ variant: 'orderbook' });
    const opt = screen.getByRole('option', { name: '시간외종가' }) as HTMLOptionElement;
    expect(opt.disabled).toBe(true);
    expect(opt.title).toBe('시간외종가는 KRX · 시간외종가 창(G2/G3)에서만 고를 수 있어요');
  });

  it('시간외종가 선택 → 가격 잠금 「—」 · 참고 종가 · 정정 비활성 · price 0 + krxSession 송신', async () => {
    const user = userEvent.setup();
    renderForm({ variant: 'orderbook', queuedWindow: win({ g3Open: true }), referenceClose: 128_700 });
    await user.selectOptions(screen.getByLabelText('주문유형'), 'offhours');

    const locked = screen.getByLabelText('가격(시간외종가 · 잠김)') as HTMLInputElement;
    expect(locked).toBeDisabled();
    expect(locked.value).toBe('—');
    expect(screen.getByText('참고 종가')).toBeInTheDocument();
    expect(screen.getByText('128,700')).toBeInTheDocument();
    expect(screen.getByText('가격 0 · krx_session 으로 전송 · 정정 불가(취소 후 재등록)')).toBeInTheDocument();
    expect(screen.getByText('종가 확정 후')).toBeInTheDocument();
    expect(btn('정정')).toBeDisabled();

    await user.type(qtyInput(), '10');
    await user.click(btn('매수'));
    await user.click(await screen.findByRole('button', { name: '매수 주문' }));
    expect(sendOrderMock).toHaveBeenCalledWith({
      kind: 'new',
      isin: ISIN,
      accountNo: '12345678-01',
      exchange: 'KRX',
      side: 'B',
      qty: 10,
      price: 0,
      krxSession: 'G3',
    });
  });

  it('창이 닫히면 시간외종가 → 지정가로 복귀한다', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderForm({ variant: 'orderbook', queuedWindow: win({ g2Open: true }) });
    await user.selectOptions(screen.getByLabelText('주문유형'), 'offhours');
    expect(screen.getByLabelText('가격(시간외종가 · 잠김)')).toBeInTheDocument();
    rerender(<ManualOrderForm {...props} queuedWindow={win({ g2Open: false })} />);
    expect((screen.getByLabelText('주문유형') as HTMLSelectElement).value).toBe('limit');
    expect(priceInput()).toBeEnabled();
  });

  it('호가 탭 각주는 새 문장이고 옛 「정정 미지원」 문장이 없다', () => {
    renderForm({ variant: 'orderbook' });
    expect(screen.getByText('신규 매수/매도와 정정·취소 · 시간외종가는 정정 불가(취소 후 재등록)')).toBeInTheDocument();
    expect(screen.queryByText(/정정은 취소 후 다시 주문해 주세요/)).toBeNull();
  });
});

describe('ManualOrderForm — 호가 사다리 가격 셀 클릭 (D-20)', () => {
  it('가격 선택 이벤트가 가격 입력을 채우고, 값 없는 셀(0)은 no-op 이다', () => {
    const { rerender, props } = renderForm({ selectedPrice: { price: 128_500, seq: 1 } });
    expect(priceInput().value).toBe('128,500');
    rerender(<ManualOrderForm {...props} selectedPrice={{ price: 0, seq: 2 }} />);
    expect(priceInput().value).toBe('128,500');
    rerender(<ManualOrderForm {...props} selectedPrice={{ price: 129_000, seq: 3 }} />);
    expect(priceInput().value).toBe('129,000');
  });
});

describe('ManualOrderEntry — 적응형 진입 (D-19)', () => {
  function Options() {
    const [v, setV] = useState('');
    return <input aria-label="옵션 값" value={v} onChange={(e) => setV(e.target.value)} />;
  }

  function renderEntry(onOptionsTab = vi.fn()) {
    render(
      <ManualOrderEntry
        keyLabel={`${ISIN}:12345678-01:KRX`}
        onOptionsTab={onOptionsTab}
        options={<Options />}
        form={<ManualOrderForm {...baseProps()} />}
      />,
    );
    return { onOptionsTab };
  }

  it('<700: 「매수 | 매도 | 수동」 3탭이고 탭 줄은 700 이상에서 숨는다(컨테이너 쿼리)', async () => {
    const user = userEvent.setup();
    const { onOptionsTab } = renderEntry();
    const tabs = screen.getByRole('tablist', { name: '주문 진입' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['매수', '매도', '수동']);
    expect(tabs.className).toContain('@min-[700px]/lc:hidden');

    const optionsPane = screen.getByTestId('manual-entry-options');
    const formPane = screen.getByTestId('manual-entry-form');
    expect(formPane.className).toMatch(/(^|\s)hidden(\s|$)/);

    await user.click(within(tabs).getByRole('tab', { name: '수동' }));
    expect(within(tabs).getByRole('tab', { name: '수동' })).toHaveAttribute('aria-selected', 'true');
    expect(optionsPane.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(formPane.className).not.toMatch(/(^|\s)hidden(\s|$)/);

    await user.click(within(tabs).getByRole('tab', { name: '매도' }));
    expect(onOptionsTab).toHaveBeenLastCalledWith('sell');
    expect(optionsPane.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it('≥700: 「수동주문」 버튼이 옵션을 덮고 헤더에 키 줄 · ✕/Escape 로 닫히며 옵션 값이 보존된다', async () => {
    const user = userEvent.setup();
    renderEntry();
    await user.type(screen.getByLabelText('옵션 값'), '120');

    await user.click(btn('수동주문'));
    const optionsPane = screen.getByTestId('manual-entry-options');
    const formPane = screen.getByTestId('manual-entry-form');
    expect(optionsPane.className).toContain('@min-[700px]/lc:hidden');
    expect(formPane.className).toContain('@min-[700px]/lc:block');
    expect(screen.getByText(`키 ${ISIN}:12345678-01:KRX`)).toBeInTheDocument();

    await user.click(btn('수동주문 닫기'));
    expect(optionsPane.className).toContain('@min-[700px]/lc:block');
    await waitFor(() => expect(btn('수동주문')).toHaveFocus());
    expect((screen.getByLabelText('옵션 값') as HTMLInputElement).value).toBe('120');

    await user.click(btn('수동주문'));
    fireEvent.keyDown(priceInput(), { key: 'Escape' });
    expect(screen.getByTestId('manual-entry-options').className).toContain('@min-[700px]/lc:block');
    await waitFor(() => expect(btn('수동주문')).toHaveFocus());
    expect((screen.getByLabelText('옵션 값') as HTMLInputElement).value).toBe('120');
  });
});

function unf(over: Partial<RelayUnfilled> = {}): RelayUnfilled {
  return {
    orderNo: '3407000064',
    orgOrderNo: '',
    isin: ISIN,
    side: 'B',
    price: 128_500,
    orderQty: 100,
    filledQty: 60,
    unfilledQty: 40,
    exchange: 'NXT',
    orderTime: '093012',
    queuedStatus: '',
    pendingStatus: '',
    board: '',
    pendingCancelSent: false,
    name: '한미반도체',
    code: '042700',
    ...over,
  };
}

describe('ManualOrderForm — 미체결 행 선택 → 정정/취소 (D-21)', () => {
  it('선택하면 칩 「원주문 {No}」 + 「{매수|매도} {가격} × {수량}」 이 뜨고 가격·수량이 채워진다', () => {
    renderForm({ selectedUnfilled: unf(), onClearSelection: vi.fn() });
    const chip = screen.getByTestId('manual-order-selchip');
    expect(chip).toHaveTextContent('원주문 3407000064');
    expect(chip).toHaveTextContent('매수 128,500 × 100');
    expect(priceInput().value).toBe('128,500');
    // 정정·취소 대상은 미체결 잔량이다.
    expect(qtyInput().value).toBe('40');
    expect(btn('정정')).toBeEnabled();
    expect(btn('취소')).toBeEnabled();
  });

  it('칩 ✕(선택 해제)로 해제하면 칩이 사라지고 값은 유지된다', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [sel, setSel] = useState<RelayUnfilled | null>(unf());
      return (
        <ManualOrderForm
          {...baseProps()}
          selectedUnfilled={sel}
          onClearSelection={() => setSel(null)}
        />
      );
    }
    render(<Harness />);
    await user.click(btn('선택 해제'));
    expect(screen.queryByTestId('manual-order-selchip')).toBeNull();
    expect(priceInput().value).toBe('128,500');
    expect(qtyInput().value).toBe('40');
    expect(btn('정정')).toBeDisabled();
    expect(btn('취소')).toBeDisabled();
  });

  it('선택 없음 → 정정·취소 disabled', () => {
    renderForm({ selectedUnfilled: null });
    expect(btn('정정')).toBeDisabled();
    expect(btn('취소')).toBeDisabled();
  });

  it.each(['G2', 'G3'])('board %s(시간외종가 원주문) → 정정 disabled + 사유 title, 취소는 활성', (board) => {
    renderForm({ selectedUnfilled: unf({ board }) });
    expect(btn('정정')).toBeDisabled();
    expect(btn('정정')).toHaveAttribute('title', '시간외종가 주문은 정정할 수 없어요 · 취소 후 재등록');
    expect(btn('취소')).toBeEnabled();
  });

  it('queuedStatus 가 있는 예약 Q-ID 행 → 정정 disabled, 취소 활성', () => {
    renderForm({ selectedUnfilled: unf({ orderNo: 'Q154041001', queuedStatus: '예약대기' }) });
    expect(btn('정정')).toBeDisabled();
    expect(btn('정정')).toHaveAttribute('title', '예약 주문은 정정할 수 없어요 · 취소 후 재등록');
    expect(btn('취소')).toBeEnabled();
  });

  it('pendingCancelSent 행은 선택 자체가 막힌다 — 칩 없음 · 정정·취소 disabled', () => {
    const row = unf({ pendingCancelSent: true });
    expect(unfilledSelectBlockReason(row)).toBe('취소가 이미 나간 주문이에요');
    renderForm({ selectedUnfilled: row });
    expect(screen.queryByTestId('manual-order-selchip')).toBeNull();
    expect(btn('정정')).toBeDisabled();
    expect(btn('취소')).toBeDisabled();
  });

  it('orderNo 가 빈 행(접수 전)은 선택 불가 + 사유', () => {
    const row = unf({ orderNo: '' });
    expect(unfilledSelectBlockReason(row)).toBe('접수 전(주문번호 없음)은 선택할 수 없어요');
    expect(unfilledSelectBlockReason(unf())).toBeNull();
    renderForm({ selectedUnfilled: row });
    expect(screen.queryByTestId('manual-order-selchip')).toBeNull();
    expect(btn('취소')).toBeDisabled();
  });

  it('canModify — 잠금 3조건 + 주문번호 없음을 한 함수가 판정한다', () => {
    expect(canModify(unf())).toBe(true);
    expect(canModify(unf({ board: 'G2' }))).toBe(false);
    expect(canModify(unf({ board: 'G3' }))).toBe(false);
    expect(canModify(unf({ queuedStatus: '예약대기' }))).toBe(false);
    expect(canModify(unf({ pendingCancelSent: true }))).toBe(false);
    expect(canModify(unf({ orderNo: '' }))).toBe(false);
  });

  it('「취소」 → 확인 다이얼로그(제목·경고·「취소 주문」) → 확정 시 qty = 미체결 잔량 전부', async () => {
    const user = userEvent.setup();
    renderForm({ selectedUnfilled: unf() });
    // 사용자가 수량을 줄여도 취소는 잔량 전부다 — 부분 취소 경로는 없다.
    await user.clear(qtyInput());
    await user.type(qtyInput(), '5');
    await user.click(btn('취소'));
    const dialog = await screen.findByTestId('order-confirm-dialog');
    expect(within(dialog).getByRole('heading', { name: '미체결 주문을 취소할까요?' })).toBeInTheDocument();
    expect(within(dialog).getByText('취소 수량은 미체결 잔량 전부예요.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '취소 주문' }));
    expect(sendOrderMock).toHaveBeenCalledTimes(1);
    expect(sendOrderMock).toHaveBeenCalledWith({
      kind: 'cancel',
      isin: ISIN,
      accountNo: '12345678-01',
      exchange: 'NXT',
      orgOrderNo: '3407000064',
      qty: 40,
      price: 128_500,
    });
  });

  it('「정정」 → 확인 다이얼로그 → sendOrder({kind:"modify"}) 1회 · side 는 원주문 승계', async () => {
    const user = userEvent.setup();
    renderForm({ selectedUnfilled: unf({ side: 'S' }) });
    await user.clear(priceInput());
    await user.type(priceInput(), '129000');
    await user.clear(qtyInput());
    await user.type(qtyInput(), '30');
    await user.click(btn('정정'));
    const dialog = await screen.findByTestId('order-confirm-dialog');
    expect(within(dialog).getByRole('heading', { name: '정정 주문을 넣을까요?' })).toBeInTheDocument();
    expect(sendOrderMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: '정정 주문' }));
    expect(sendOrderMock).toHaveBeenCalledTimes(1);
    expect(sendOrderMock).toHaveBeenCalledWith({
      kind: 'modify',
      isin: ISIN,
      accountNo: '12345678-01',
      // 거래소·방향은 원주문을 승계한다(카드의 거래소 KRX 가 아니다).
      exchange: 'NXT',
      orgOrderNo: '3407000064',
      side: 'S',
      qty: 30,
      price: 129_000,
    });
  });

  it('시간외종가 선택 중에는 원주문이 있어도 정정이 비활성이다', async () => {
    const user = userEvent.setup();
    renderForm({ variant: 'orderbook', queuedWindow: win({ g2Open: true }), selectedUnfilled: unf() });
    expect(btn('정정')).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('주문유형'), 'offhours');
    expect(btn('정정')).toBeDisabled();
    expect(btn('취소')).toBeEnabled();
  });
});

/** 확인 다이얼로그 요약의 dt 라벨 → 바로 뒤 dd 텍스트. */
function summaryValue(dialog: HTMLElement, label: string): string | null {
  const dt = Array.from(dialog.querySelectorAll('dt')).find((el) => el.textContent === label);
  return dt?.nextElementSibling?.textContent ?? null;
}

describe('ManualOrderForm — 시간외종가 세션 가드 · 다이얼로그 = 요청 (WR-01 · D-23 · D-20)', () => {
  it('시간외종가 선택 · 창(g2/g3) 둘 다 닫힌 렌더에서 「매수」 → 다이얼로그 없음 · 문구 · 전송 0 (지정가로 떨어지지 않는다)', async () => {
    const user = userEvent.setup();
    // 복귀 효과가 돌기 전 한 렌더 — 콤보는 아직 시간외종가 선택 가능인데 서버 플래그는 닫혔다.
    affMock.override = { offHoursSelectable: true };
    renderForm({ variant: 'orderbook', queuedWindow: win({ g2Open: false, g3Open: false }) });
    // 숨겨질 옛 지정가 — 수정 전 코드는 이 값으로 지정가 주문을 만들었다.
    await user.type(priceInput(), '128500');
    await user.selectOptions(screen.getByLabelText('주문유형'), 'offhours');
    await user.type(qtyInput(), '10');
    await user.click(btn('매수'));

    const status = screen.getByTestId('manual-order-validation');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent(OFFHOURS_WINDOW_CLOSED_TEXT);
    expect(screen.queryByTestId('order-confirm-dialog')).toBeNull();
    expect(sendOrderMock).not.toHaveBeenCalled();
  });

  it('시간외종가 선택 · 거래소 NXT 렌더에서 「매수」 → 같은 문구 · 전송 0 (NXT 에 krxSession 이 실리지 않는다)', async () => {
    const user = userEvent.setup();
    affMock.override = { offHoursSelectable: true };
    renderForm({ variant: 'orderbook', exchange: 'NXT', queuedWindow: win({ g3Open: true }) });
    await user.type(priceInput(), '128500');
    await user.selectOptions(screen.getByLabelText('주문유형'), 'offhours');
    await user.type(qtyInput(), '10');
    await user.click(btn('매수'));

    expect(screen.getByTestId('manual-order-validation')).toHaveTextContent(OFFHOURS_WINDOW_CLOSED_TEXT);
    expect(screen.queryByTestId('order-confirm-dialog')).toBeNull();
    expect(sendOrderMock).not.toHaveBeenCalled();
  });

  it('창 열림(g3Open) · KRX 에서 「매수」 → 다이얼로그 주문유형 시간외종가 · 확정 요청 price 0 + krxSession G3', async () => {
    const user = userEvent.setup();
    renderForm({ variant: 'orderbook', queuedWindow: win({ g3Open: true }) });
    await user.type(priceInput(), '128500');
    await user.selectOptions(screen.getByLabelText('주문유형'), 'offhours');
    await user.type(qtyInput(), '10');
    await user.click(btn('매수'));

    const dialog = await screen.findByTestId('order-confirm-dialog');
    expect(summaryValue(dialog, '주문유형')).toBe('시간외종가 · 가격 0 (KRX 세션)');
    await user.click(within(dialog).getByRole('button', { name: '매수 주문' }));
    expect(sendOrderMock).toHaveBeenCalledTimes(1);
    expect(sendOrderMock.mock.calls[0][0]).toMatchObject({ kind: 'new', price: 0, krxSession: 'G3' });
  });

  it('지정가에서 「매수」 → 다이얼로그 주문유형 지정가 · 요청에 krxSession 없음', async () => {
    const user = userEvent.setup();
    renderForm({ variant: 'orderbook', queuedWindow: win({ g3Open: true }) });
    await fill(user, '128500', '10');
    await user.click(btn('매수'));

    const dialog = await screen.findByTestId('order-confirm-dialog');
    expect(summaryValue(dialog, '주문유형')).toBe('지정가 · 보통');
    await user.click(within(dialog).getByRole('button', { name: '매수 주문' }));
    expect(sendOrderMock).toHaveBeenCalledTimes(1);
    expect(sendOrderMock.mock.calls[0][0]).toMatchObject({ kind: 'new', price: 128_500 });
    expect(sendOrderMock.mock.calls[0][0]).not.toHaveProperty('krxSession');
  });
});

describe('ManualOrderForm — 정정 수량 ≤ 미체결 잔량 (WR-06 · D-21)', () => {
  const row10 = () => unf({ unfilledQty: 10, filledQty: 90 });
  const row6 = () => unf({ unfilledQty: 6, filledQty: 94 });

  it('잔량 10 · 수량 12 로 「정정」 → 다이얼로그 없음 · 잔량 초과 문구 · 전송 0', async () => {
    const user = userEvent.setup();
    renderForm({ selectedUnfilled: row10() });
    expect(qtyInput().value).toBe('10');
    await user.clear(qtyInput());
    await user.type(qtyInput(), '12');
    await user.click(btn('정정'));

    const status = screen.getByTestId('manual-order-validation');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent(modifyQtyOverRemainingText(10));
    expect(modifyQtyOverRemainingText(10)).toBe('정정 수량은 미체결 잔량(10주) 이하여야 해요');
    expect(screen.queryByTestId('order-confirm-dialog')).toBeNull();
    expect(sendOrderMock).not.toHaveBeenCalled();
  });

  it('잔량 10 → 같은 주문번호 잔량 6 으로 갱신 → 수량 칸이 6 으로 내려가고 고지가 뜬다', () => {
    const { rerender, props } = renderForm({ selectedUnfilled: row10() });
    expect(qtyInput().value).toBe('10');
    rerender(<ManualOrderForm {...props} selectedUnfilled={row6()} />);
    expect(qtyInput().value).toBe('6');
    const status = screen.getByTestId('manual-order-validation');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent(modifyQtyClampedText(6));
    expect(modifyQtyClampedText(6)).toBe('미체결 잔량이 6주로 줄어 정정 수량을 맞췄어요');
  });

  it('잔량 10 · 수량 4 입력 → 잔량 6 으로 갱신 → 수량 4 그대로 · 고지 없음(올리지도 않는다)', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderForm({ selectedUnfilled: row10() });
    await user.clear(qtyInput());
    await user.type(qtyInput(), '4');
    rerender(<ManualOrderForm {...props} selectedUnfilled={row6()} />);
    expect(qtyInput().value).toBe('4');
    expect(screen.queryByTestId('manual-order-validation')).toBeNull();
  });

  it('수량 10 정정 다이얼로그를 연 뒤 잔량 6 으로 갱신 → 확정 → 전송 0 · 재확인 문구', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderForm({ selectedUnfilled: row10() });
    await user.click(btn('정정'));
    await screen.findByTestId('order-confirm-dialog');
    rerender(<ManualOrderForm {...props} selectedUnfilled={row6()} />);
    await user.click(screen.getByRole('button', { name: '정정 주문' }));

    expect(sendOrderMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('order-confirm-dialog')).toBeNull());
    expect(screen.getByTestId('manual-order-validation')).toHaveTextContent(MODIFY_REMAINING_CHANGED_TEXT);
    expect(MODIFY_REMAINING_CHANGED_TEXT).toBe('미체결 잔량이 바뀌었어요 — 정정 수량을 다시 확인해 주세요');
  });

  it('다이얼로그를 연 뒤 선택 행이 사라짐(null) → 확정 → 전송 0 · 「원주문이 더 이상 미체결이 아니에요」', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderForm({ selectedUnfilled: row10() });
    await user.click(btn('정정'));
    await screen.findByTestId('order-confirm-dialog');
    rerender(<ManualOrderForm {...props} selectedUnfilled={null} />);
    await user.click(screen.getByRole('button', { name: '정정 주문' }));

    expect(sendOrderMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('order-confirm-dialog')).toBeNull());
    expect(screen.getByTestId('manual-order-validation')).toHaveTextContent(MODIFY_TARGET_GONE_TEXT);
    expect(MODIFY_TARGET_GONE_TEXT).toBe('원주문이 더 이상 미체결이 아니에요');
  });
});

describe('ManualOrderForm — 가격 0 원주문 선택 칩 표기 (CR-01 표시 정합)', () => {
  it('board G3 · price 0 행 선택 → 칩 둘째 줄이 「매수 시간외종가 × {수량}」 이고 「0」 이 없다', () => {
    renderForm({ selectedUnfilled: unf({ board: 'G3', price: 0, exchange: 'KRX' }) });
    const chip = screen.getByTestId('manual-order-selchip');
    expect(chip).toHaveTextContent(`매수 ${OFFHOURS_PRICE_LABEL} × 100`);
    expect(chip).not.toHaveTextContent(/매수 0 ×/);
  });

  it('가격 > 0 행은 칩이 기존 숫자 표기 그대로다', () => {
    renderForm({ selectedUnfilled: unf() });
    const chip = screen.getByTestId('manual-order-selchip');
    expect(chip).toHaveTextContent('매수 128,500 × 100');
    expect(chip).not.toHaveTextContent(OFFHOURS_PRICE_LABEL);
  });
});
