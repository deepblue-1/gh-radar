import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RelayAccount, RelayOrderResultMsg } from '@gh-radar/shared';

/**
 * Phase 15 Plan 18 / Phase 16 Plan 10 — 주문 패널 계약 검증
 * (RELAY-02 · TRADE-03, T-15-14 · T-15-48 · T-15-52 · D-02).
 *
 * 이 파일이 잠그는 것은 "보기"가 아니라 **오주문으로 이어지는 규칙**이다.
 *   ① 색·위치·문구 3중 일치 + 단일 제출 버튼 (②)
 *   ② 호가 클릭이 매매 구분을 **바꾸지 않는다** (③)
 *   ③ 확인 다이얼로그 필수 + 기본 포커스 취소 (⑧⑨⑩)
 *   ④ 제출 후 재활성 금지 · 중복 제출 가드 (⑪)
 *   ⑤ **결과 모름 ≠ 실패** — 재주문 경로를 열지 않는다 (⑭)
 *   ⑥ 주문 키는 **ISIN** 이다 (⑪ · D-02/D-28) — 단축코드를 보내면 relay 가 못 푼다
 *
 * ★ 스텁 경계는 `useRelayContext` 하나다. 주문은 wss 단일 경로이고(D-02) 패널이 바깥과
 *   맺는 계약은 `sendOrder(req) => Promise<RelayOrderResultMsg>` 뿐이다.
 *   그 Promise 는 **어떤 경로에서도 reject 하지 않는다** — 그래서 이 파일에 rejection
 *   시나리오가 없다. 있으면 존재하지 않는 경로를 검증하는 것이 된다.
 */

const sendOrderMock = vi.fn();
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, sendOrder: sendOrderMock }),
  };
});

import { OrderPanel, type OrderPanelProps } from '../order-panel';

const ISIN = 'KR7042700005';

const ACCOUNTS: RelayAccount[] = [
  { accountNo: '12345678-01', name: '위탁종합' },
  { accountNo: '12345678-02', name: 'CMA' },
];

/** 사다리 클릭 1회. `seq` 가 곧 "몇 번째 클릭인가" 다 — 같은 가격이어도 새 이벤트다. */
function pick(price: number, seq = 1) {
  return { price, seq };
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

function baseProps(over: Partial<OrderPanelProps> = {}): OrderPanelProps {
  return {
    code: '042700',
    isin: ISIN,
    name: '한미반도체',
    accounts: ACCOUNTS,
    selectedAccountNo: '12345678-01',
    onAccountChange: vi.fn(),
    exchange: 'KRX',
    selectedPrice: pick(98_400),
    tick: 100,
    sellableQty: 90,
    status: 'ready',
    ...over,
  };
}

function renderPanel(over: Partial<OrderPanelProps> = {}) {
  const props = baseProps(over);
  const view = render(<OrderPanel {...props} />);
  return { ...view, props };
}

/** 수량을 채워 제출 가능 상태로 만든다(가격은 `selectedPrice` 가 채운다). */
async function fillQty(user: ReturnType<typeof userEvent.setup>, qty: string) {
  await user.type(screen.getByLabelText('수량'), qty);
}

beforeEach(() => {
  sendOrderMock.mockReset();
  sendOrderMock.mockResolvedValue(accepted());
});

describe('OrderPanel — 매매 구분 · 단일 제출 버튼', () => {
  it('① 기본 탭이 매수이고 제출 버튼 문구가 `매수 주문` 이다', () => {
    renderPanel();
    expect(screen.getByRole('tab', { name: '매수' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '매수 주문' })).toBeInTheDocument();
  });

  it('② 매도 탭을 고르면 제출 버튼이 `매도 주문` 으로 바뀌고 제출 버튼은 끝까지 하나뿐이다', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('tab', { name: '매도' }));

    expect(screen.getByRole('button', { name: '매도 주문' })).toBeInTheDocument();
    // 매수/매도 버튼을 나란히 두지 않는다 — 인접 오클릭 차단(오조작 방지 ②).
    expect(screen.queryByRole('button', { name: '매수 주문' })).toBeNull();
  });

  it('③ 사다리 가격이 바뀌어도 매매 구분은 자동 전환되지 않는다 (T-15-52)', () => {
    const { rerender, props } = renderPanel({ selectedPrice: pick(98_400) });
    expect(screen.getByLabelText('가격')).toHaveValue('98,400');

    // 매도호가를 클릭한 상황 — 가격만 바뀐다.
    rerender(<OrderPanel {...props} selectedPrice={pick(99_200, 2)} />);

    expect(screen.getByLabelText('가격')).toHaveValue('99,200');
    expect(screen.getByRole('tab', { name: '매수' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '매수 주문' })).toBeInTheDocument();
  });
});

describe('OrderPanel — 가격 · 수량', () => {
  it('③-b 같은 호가를 다시 클릭하면 손으로 고친 가격을 덮어쓴다 (seq 증가)', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderPanel({ selectedPrice: pick(98_400), tick: 100 });

    // 사용자가 입력칸을 직접 고친 상태.
    const price = screen.getByLabelText('가격');
    await user.clear(price);
    await user.type(price, '97000');
    expect(price).toHaveValue('97,000');

    // 아까와 **같은 호가**를 다시 클릭 — 값은 같고 seq 만 오른다.
    rerender(<OrderPanel {...props} selectedPrice={pick(98_400, 2)} />);

    expect(screen.getByLabelText('가격')).toHaveValue('98,400');
  });


  it('④ 스텝퍼 ＋ 는 호가 단위만큼 올린다', async () => {
    const user = userEvent.setup();
    renderPanel({ selectedPrice: pick(98_400), tick: 100 });

    await user.click(screen.getByRole('button', { name: '호가 한 단계 올리기' }));

    expect(screen.getByLabelText('가격')).toHaveValue('98,500');
  });

  it('⑤ 직접 입력 후 blur 시 가장 가까운 호가 단위로 스냅하고 힌트를 교체한다', async () => {
    const user = userEvent.setup();
    renderPanel({ selectedPrice: null, tick: 100 });

    const price = screen.getByLabelText('가격');
    await user.type(price, '98450');
    await user.tab();

    expect(price).toHaveValue('98,500');
    expect(
      screen.getByText('호가 단위(100원)에 맞춰 98,500원으로 맞췄어요'),
    ).toBeInTheDocument();
  });

  it('⑥ 비율 버튼은 매도 탭에만 있다 (매수는 주문가능금액이 없어 근거가 없다)', async () => {
    const user = userEvent.setup();
    renderPanel();

    for (const label of ['10%', '25%', '50%', '100%']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }

    await user.click(screen.getByRole('tab', { name: '매도' }));

    for (const label of ['10%', '25%', '50%', '100%']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('⑦ 50% 는 매도가능수량의 절반(내림)을 수량에 채운다', async () => {
    const user = userEvent.setup();
    renderPanel({ sellableQty: 90 });

    await user.click(screen.getByRole('tab', { name: '매도' }));
    await user.click(screen.getByRole('button', { name: '50%' }));

    expect(screen.getByLabelText('수량')).toHaveValue('45');
  });
});

describe('OrderPanel — 확인 다이얼로그 (되돌릴 수 없는 액션)', () => {
  it('⑧ 제출을 눌러도 주문은 나가지 않고 확인 다이얼로그가 먼저 열린다', async () => {
    const user = userEvent.setup();
    renderPanel();
    await fillQty(user, '100');

    await user.click(screen.getByRole('button', { name: '매수 주문' }));

    expect(await screen.findByText('매수 주문을 넣을까요?')).toBeInTheDocument();
    expect(sendOrderMock).not.toHaveBeenCalled();
  });

  it('⑨ 다이얼로그 기본 포커스는 실행 버튼이 아니라 취소 버튼이다', async () => {
    const user = userEvent.setup();
    renderPanel();
    await fillQty(user, '100');
    await user.click(screen.getByRole('button', { name: '매수 주문' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '취소' })).toHaveFocus();
    });
  });

  it('⑩ 다이얼로그가 서버에 금액·수량 한도가 없다는 사실을 고지한다 (D-20)', async () => {
    const user = userEvent.setup();
    renderPanel();
    await fillQty(user, '100');
    await user.click(screen.getByRole('button', { name: '매수 주문' }));

    expect(
      await screen.findByText('가격·수량을 다시 확인해 주세요. 서버에는 금액·수량 한도가 없어요.'),
    ).toBeInTheDocument();
  });

  it('⑪ 확인은 한 번만 나간다 — 연타해도 호출 1회, 그 사이 버튼은 `주문 전송 중…`', async () => {
    const user = userEvent.setup();
    let resolve: ((v: RelayOrderResultMsg) => void) | undefined;
    sendOrderMock.mockImplementation(
      () =>
        new Promise<RelayOrderResultMsg>((r) => {
          resolve = r;
        }),
    );

    renderPanel();
    await fillQty(user, '100');
    await user.click(screen.getByRole('button', { name: '매수 주문' }));

    const confirmButton = await screen.findByRole('button', { name: '매수 주문' });
    await user.click(confirmButton);
    await user.click(confirmButton); // 연타

    expect(sendOrderMock).toHaveBeenCalledTimes(1);
    expect(sendOrderMock).toHaveBeenCalledWith({
      kind: 'new',
      // ★ 6자 단축코드가 아니라 12자 ISIN 이다 (D-02/D-28). 단축코드를 보내면 relay 가
      //   종목을 못 풀어 「이 종목은 지금 주문할 수 없습니다」로 거부된다.
      isin: ISIN,
      accountNo: '12345678-01',
      exchange: 'KRX',
      side: 'B',
      qty: 100,
      price: 98_400,
    });
    expect(sendOrderMock.mock.calls[0][0]).not.toHaveProperty('code');

    const submit = await screen.findByRole('button', { name: '주문 전송 중…' });
    expect(submit).toBeDisabled();

    resolve?.(accepted());
    await screen.findByRole('status');
  });
});

describe('OrderPanel — 결과 3분기 (접수 / 결과 모름 / 거부)', () => {
  it('⑫ 접수 응답은 중립 배너(role="status")에 주문번호를 싣는다', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(accepted());
    renderPanel();
    await fillQty(user, '100');
    await user.click(screen.getByRole('button', { name: '매수 주문' }));
    await user.click(await screen.findByRole('button', { name: '매수 주문' }));

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('주문이 접수됐어요 · 주문번호 0000135842');
  });

  it('⑬ 거부 응답은 경보 배너(role="alert")로 사유와 코드를 밝히고 재시도를 막지 않는다', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(
      accepted({ status: 'rejected', resultCode: -204, message: '호가 단위가 맞지 않습니다', orderNo: '' }),
    );
    renderPanel();
    await fillQty(user, '100');
    await user.click(screen.getByRole('button', { name: '매수 주문' }));
    await user.click(await screen.findByRole('button', { name: '매수 주문' }));

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('주문이 거부됐어요 · 호가 단위가 맞지 않습니다');
    expect(banner).toHaveTextContent('코드 -204');
    // 거부는 「나가지 않았음이 확실」하다 — 결과 모름과 달리 제출을 다시 연다.
    expect(banner).toHaveTextContent('주문은 나가지 않았어요');
    expect(screen.getByRole('button', { name: '매수 주문' })).toBeEnabled();
  });

  it('⑭ `status:"timeout"` 은 실패가 아니다 — "실패" 문구 없이 안내하고 재주문을 막는다 (T-15-48 / S-8)', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(
      accepted({
        status: 'timeout',
        orderNo: '',
        resultCode: -1,
        message: '주문 결과를 확인하지 못했습니다. 미체결 목록을 확인해 주세요.',
      }),
    );
    renderPanel();
    await fillQty(user, '100');
    await user.click(screen.getByRole('button', { name: '매수 주문' }));
    await user.click(await screen.findByRole('button', { name: '매수 주문' }));

    const banner = await screen.findByTestId('order-result-unknown');
    expect(banner).toHaveTextContent('접수 응답이 늦어지고 있어요');
    expect(banner).toHaveTextContent(
      '주문이 이미 나갔을 수 있어요. 미체결 목록에서 접수 여부를 확인한 뒤 다시 주문해 주세요.',
    );
    // 거부와 같은 톤을 쓰지 않는다 — role="alert" 가 아니라 role="status" 다.
    expect(banner).toHaveAttribute('role', 'status');
    // 화면 어디에도 "실패"라고 쓰지 않는다.
    expect(document.body.textContent).not.toContain('실패');
    // 재주문 경로를 열지 않는다 — 이 버튼이 다시 열리면 중복 체결이 난다.
    expect(screen.getByRole('button', { name: '매수 주문' })).toBeDisabled();
  });

  it('⑮ 거부 사유는 relay/게이트웨이 문구를 **그대로** 보여 준다 (다음 행동이 그 문구에 있다)', async () => {
    /*
      wss 이관 전에는 server 가 준 에러 코드 7종으로 안내를 갈랐다. 이제 사유는 프레임의
      `message` 한 줄이고 relay 가 다음 행동까지 담아 보낸다 — 화면이 그 문구를 고쳐 쓰면
      실제 원인과 안내가 어긋난다. 그래서 제목은 사유 원문이고, 보조 줄은 모든 거부에
      대해 참인 사실(「나가지 않았다」) 하나만 말한다.
    */
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(
      accepted({
        status: 'rejected',
        orderNo: '',
        resultCode: -1,
        message: '실시간 세션이 없습니다. 호가창을 먼저 열어 주세요.',
      }),
    );
    renderPanel();
    await fillQty(user, '100');
    await user.click(screen.getByRole('button', { name: '매수 주문' }));
    await user.click(await screen.findByRole('button', { name: '매수 주문' }));

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(
      '주문이 거부됐어요 · 실시간 세션이 없습니다. 호가창을 먼저 열어 주세요.',
    );
    expect(banner).toHaveTextContent('주문은 나가지 않았어요');
  });
});

describe('OrderPanel — 세션 상태 게이트', () => {
  it('⑯ `unauthorized` 에서는 패널 자체를 렌더하지 않는다 (주문 진입점 미노출)', () => {
    const { container } = renderPanel({ status: 'unauthorized' });
    expect(container).toBeEmptyDOMElement();
  });

  it('⑰ 연결 진행 중에는 제출 버튼이 비활성이고 문구가 상태를 말한다', async () => {
    const user = userEvent.setup();
    renderPanel({ status: 'declaring' });
    await fillQty(user, '100');

    const submit = screen.getByRole('button', { name: '연결 중…' });
    expect(submit).toBeDisabled();
  });

  it('⑱ 재접속 중에는 `재접속 중…` 으로 막는다', () => {
    renderPanel({ status: 'reconnecting' });
    expect(screen.getByRole('button', { name: '재접속 중…' })).toBeDisabled();
  });

  it('⑲ 하단 안내가 정정 경로가 없다는 사실을 상시 노출한다 (D-21)', () => {
    renderPanel();
    expect(
      screen.getByText('신규 매수/매도와 취소만 지원해요 · 정정은 취소 후 다시 주문해 주세요'),
    ).toBeInTheDocument();
    expect(screen.getByText('지정가 · 보통')).toBeInTheDocument();
  });
});
