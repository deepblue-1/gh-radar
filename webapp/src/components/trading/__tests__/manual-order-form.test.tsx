import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
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
/*
  18-34 — 잠금의 원천은 `RelayProvider.orderLocks` 다(②-4). 케이스가 바꿀 수 있는 모의 값이고,
  기본은 `EMPTY_RELAY_VALUE` 의 빈 Map 이다(`beforeEach` 에서 되돌린다).
*/
const lockMock = vi.hoisted(() => ({
  locks: null as null | ReadonlyMap<string, import('@/lib/relay-provider').OrderLockKind>,
}));
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  const { strategyKey } = await import('@/lib/limit-chaser');
  /**
   * Provider 등록 흉내 — 모의 `sendOrder` 가 신규 · 정정 timeout 을 돌려주기 **직전에** 그 요청의
   * 키를 `"result-unknown"` 으로 넣는다(취소는 넣지 않는다 — 사용자 결정 2). 진짜 규칙의 회귀는
   * `relay-provider.test.tsx` 「주문 잠금 수명」 이 진짜 Provider 로 잠근다.
   */
  const providerSend = async (req: import('@/lib/relay-provider').RelayOrderRequest) => {
    const res = (await sendOrderMock(req)) as RelayOrderResultMsg;
    if (res?.status === 'timeout' && req.kind !== 'cancel') {
      const next = new Map(lockMock.locks ?? actual.EMPTY_RELAY_VALUE.orderLocks);
      next.set(strategyKey(req.isin, req.accountNo, req.exchange), 'result-unknown');
      lockMock.locks = next;
    }
    return res;
  };
  return {
    ...actual,
    useRelayContext: () => ({
      ...actual.EMPTY_RELAY_VALUE,
      sendOrder: providerSend,
      orderLocks: lockMock.locks ?? actual.EMPTY_RELAY_VALUE.orderLocks,
    }),
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
import { mockPointer, restoreMatchMedia } from '@/lib/__tests__/match-media';
import {
  ManualOrderEntry,
  ManualOrderForm,
  MODIFY_REMAINING_CHANGED_TEXT,
  MODIFY_TARGET_CHANGED_TEXT,
  MODIFY_TARGET_GONE_TEXT,
  OFFHOURS_WINDOW_CLOSED_TEXT,
  RESULT_UNKNOWN_LOCKED_TEXT,
  canModify,
  cancelQtyAtConfirm,
  formOrderLockOf,
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
  lockMock.locks = null;
});

const FOOTNOTE = '정정·취소는 미체결 행을 선택하면 활성화돼요';

describe('ManualOrderForm — 4버튼 · 빈 폼 (D-20/D-21 · D-11, E5 empty)', () => {
  it('빈 폼: 매수·매도 48px 한 줄 + 정정·취소 38px 한 줄 · 정정·취소 disabled + 각주 · 매수·매도는 활성이다', () => {
    renderForm();
    const wrap = screen.getByTestId('manual-order-buttons');
    const buttons = within(wrap).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['매수', '매도', '정정', '취소']);
    const [buy, sell, modify, cancel] = buttons;
    // 두 줄 — 윗줄 매수 | 매도(매수가 왼쪽 · 3중 일치), 아랫줄 정정 | 취소.
    expect(buy.parentElement).toBe(sell.parentElement);
    expect(modify.parentElement).toBe(cancel.parentElement);
    expect(buy.parentElement).not.toBe(modify.parentElement);
    for (const rowEl of [buy.parentElement!, modify.parentElement!]) {
      expect(rowEl.className).toContain('grid-cols-2');
      expect(rowEl.className).toContain('gap-2');
    }
    for (const b of [buy, sell]) {
      expect(b.className).toContain('h-[48px]');
      expect(b.className).toContain('rounded-[14px]');
      expect(b.className).toContain('text-[var(--destructive-fg)]');
    }
    expect(buy.className).toContain('bg-[var(--up)]');
    expect(sell.className).toContain('bg-[var(--down)]');
    for (const b of [modify, cancel]) {
      expect(b.className).toContain('h-[38px]');
      expect(b.className).toContain('rounded-[10px]');
      expect(b.className).toContain('text-[15px]');
      expect(b.className).toContain('bg-[var(--muted)]');
      expect(b.className).toContain('text-[var(--muted-fg)]');
    }
    expect(btn('매수')).toBeEnabled();
    expect(btn('매도')).toBeEnabled();
    expect(btn('정정')).toBeDisabled();
    expect(btn('취소')).toBeDisabled();
    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument();
    // 값이 없으면 자리표시 · 주문금액 0원 (E5 empty).
    expect(priceInput()).toHaveAttribute('placeholder', '가격 입력');
    expect(qtyInput()).toHaveAttribute('placeholder', '수량 입력');
    expect(screen.getByText('0원')).toBeInTheDocument();
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

  it('응답 timeout → 「접수 응답이 늦어지고 있어요」 + 재확인 안내, 실패·재시도 표현이 없고 버튼이 잠긴다(Provider 키 잠금)', async () => {
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
    // 결과를 모르면 잠근다 — 재주문 경로를 주면 그 자리에서 중복 체결이 난다. 잠금은 Provider 가
    // 보낸 요청의 키로 들고(등록 흉내), 폼은 그 키를 읽어 잠근다(②-4 · 18-34).
    expect(lockMock.locks?.get(`${ISIN}:12345678-01:KRX`)).toBe('result-unknown');
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
  it('affordanceOf 가 queued 면 라벨이 「예약매수/예약매도」이고 조각 수 상자가 보인다(초기 5 · 회 · 스테퍼 없음 · ↑ 는 maxPieces 에서 멈춘다)', async () => {
    const user = userEvent.setup();
    renderForm({ queuedWindow: win({ open: true, maxPieces: 7 }) });
    expect(btn('예약매수')).toBeInTheDocument();
    expect(btn('예약매도')).toBeInTheDocument();
    const pieces = screen.getByLabelText('조각 수') as HTMLInputElement;
    expect(pieces.id).toBe(`mo-pieces-${ISIN}`);
    expect(pieces.value).toBe('5');
    const box = pieces.closest('[data-slot="ticket-box"]') as HTMLElement;
    expect(box).toHaveTextContent('예약구간 · KRX 만');
    expect(box).toHaveTextContent(/회$/);
    // −/+ 스테퍼는 없다(D-08 · 입력은 타이핑 · ↑↓ · 시트 칩).
    expect(screen.queryByRole('button', { name: '조각 늘리기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '조각 줄이기' })).toBeNull();
    for (let i = 0; i < 5; i += 1) fireEvent.keyDown(pieces, { key: 'ArrowUp' });
    expect(pieces.value).toBe('7'); // 상한 = 서버 maxPieces
    fireEvent.keyDown(pieces, { key: 'ArrowDown' });
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

describe('ManualOrderForm — 카드 주문유형 (D-31 · G-21-R3-10 · 스케치 008 ③ A)', () => {
  const CLOSED_NOTE = '시간외종가는 KRX · 시간외종가 창(G2/G3)에서만 고를 수 있어요';

  it('카드에도 주문유형 44px 행이 주문금액 바로 위에 있고 기본은 지정가다', () => {
    renderForm({ variant: 'card', queuedWindow: win({ g3Open: true }) });
    const select = screen.getByLabelText('주문유형') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('limit');
    const rowEl = select.parentElement as HTMLElement;
    expect(rowEl.className).toContain('min-h-[44px]');
    expect(rowEl.querySelector('[data-slot="mo-type-value"]')).toHaveTextContent('지정가 ›');
    // 채택안 A — 주문금액 행 바로 위(창 열림이라 사이에 안내 캡션도 없다).
    expect(rowEl.nextElementSibling).toHaveTextContent(/^주문금액/);
  });

  it('KRX · 창 열림 → 시간외종가 선택 가능 → 가격 잠김 · 「종가 확정 후」 · 전송 price 0 + krxSession', async () => {
    const user = userEvent.setup();
    renderForm({ variant: 'card', queuedWindow: win({ g2Open: true }), referenceClose: 128_700 });
    const opt = screen.getByRole('option', { name: '시간외종가' }) as HTMLOptionElement;
    expect(opt.disabled).toBe(false);
    await user.selectOptions(screen.getByLabelText('주문유형'), 'offhours');

    const locked = screen.getByLabelText('가격(시간외종가 · 잠김)') as HTMLInputElement;
    expect(locked).toBeDisabled();
    expect(locked.closest('[data-slot="ticket-box"]')).toHaveTextContent('참고 종가 128,700원');
    expect(screen.getByText('종가 확정 후')).toBeInTheDocument();
    expect(screen.queryByText(CLOSED_NOTE)).toBeNull();

    await user.type(qtyInput(), '10');
    await user.click(btn('매수'));
    const dialog = await screen.findByTestId('order-confirm-dialog');
    expect(summaryValue(dialog, '주문유형')).toBe('시간외종가 · 가격 0 (KRX 세션)');
    await user.click(within(dialog).getByRole('button', { name: '매수 주문' }));
    expect(sendOrderMock).toHaveBeenCalledWith({
      kind: 'new',
      isin: ISIN,
      accountNo: '12345678-01',
      exchange: 'KRX',
      side: 'B',
      qty: 10,
      price: 0,
      krxSession: 'G2',
    });
  });

  it.each([
    ['NXT · 창 열림', { exchange: 'NXT' as const, queuedWindow: win({ g3Open: true }) }],
    ['KRX · 창 닫힘', { exchange: 'KRX' as const, queuedWindow: win() }],
  ])('%s → 시간외종가 비활성 + 사유 title · 행 아래 안내 캡션', (_label, over) => {
    renderForm({ variant: 'card', ...over });
    const opt = screen.getByRole('option', { name: '시간외종가' }) as HTMLOptionElement;
    expect(opt.disabled).toBe(true);
    expect(opt.title).toBe(CLOSED_NOTE);
    const select = screen.getByLabelText('주문유형');
    expect(select).toHaveAttribute('title', CLOSED_NOTE);
    const note = screen.getByText(CLOSED_NOTE);
    expect(note.getAttribute('data-slot')).toBe('mo-type-note');
    // 채택안 A — 캡션은 주문유형 행 바로 아래 · 주문금액 행 바로 위.
    expect(select.parentElement!.nextElementSibling).toBe(note);
    expect(note.nextElementSibling).toHaveTextContent(/^주문금액/);
  });

  it('시간외종가 선택 중 창이 닫히면 지정가로 복귀 · 닫힌 창 렌더에서는 전송 차단', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderForm({ variant: 'card', queuedWindow: win({ g3Open: true }) });
    await user.selectOptions(screen.getByLabelText('주문유형'), 'offhours');
    expect(screen.getByLabelText('가격(시간외종가 · 잠김)')).toBeInTheDocument();
    rerender(<ManualOrderForm {...props} queuedWindow={win({ g3Open: false })} />);
    expect((screen.getByLabelText('주문유형') as HTMLSelectElement).value).toBe('limit');
    expect(priceInput()).toBeEnabled();
  });

  it('(가드) 복귀 효과 전 한 렌더 — 카드도 닫힌 창으로 시간외종가를 보내지 않는다', async () => {
    const user = userEvent.setup();
    affMock.override = { offHoursSelectable: true };
    renderForm({ variant: 'card', queuedWindow: win({ g2Open: false, g3Open: false }) });
    await user.type(priceInput(), '128500');
    await user.selectOptions(screen.getByLabelText('주문유형'), 'offhours');
    await user.type(qtyInput(), '10');
    await user.click(btn('매수'));
    expect(screen.getByTestId('manual-order-validation')).toHaveTextContent(OFFHOURS_WINDOW_CLOSED_TEXT);
    expect(screen.queryByTestId('order-confirm-dialog')).toBeNull();
    expect(sendOrderMock).not.toHaveBeenCalled();
  });
});

describe('ManualOrderForm — 주문유형 콤보 (D-23, 호가 탭 — 21-34 가 정리)', () => {

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
    // 힌트 자리에 「참고 종가 {종가}원」(UI-SPEC §8 1') · 입력 가능한 가격 상자는 없다.
    const box = locked.closest('[data-slot="ticket-box"]') as HTMLElement;
    expect(box).toHaveTextContent('참고 종가 128,700원');
    expect(screen.queryByPlaceholderText('가격 입력')).toBeNull();
    expect(screen.queryByTestId('manual-order-price-issue')).toBeNull();
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

describe('ManualOrderForm — 토스 상자 · 인라인 입력 (D-08 · D-10 · D-14c · D-15)', () => {
  const boxOf = (el: HTMLElement) => el.closest('[data-slot="ticket-box"]') as HTMLElement;

  it('가격·수량 상자: 라벨이 값 위 · --muted 면 radius 16 · 가격 힌트 · 단위 · 값 17/600', () => {
    renderForm();
    const price = priceInput();
    expect(price.id).toBe(`mo-price-${ISIN}`);
    expect(price).toHaveAttribute('inputmode', 'numeric');
    expect(price).toHaveAttribute('autocomplete', 'off');
    expect(price).toHaveAttribute('data-focus-ring', 'seamless');
    expect(price.className).toContain('text-[17px]');
    expect(price.className).toContain('font-semibold');
    const box = boxOf(price);
    expect(box.className).toContain('rounded-[16px]');
    expect(box.className).toContain('bg-[var(--muted)]');
    // 라벨이 값보다 먼저(위) 온다.
    const label = within(box).getByText('가격');
    expect(label.tagName).toBe('LABEL');
    expect(label.compareDocumentPosition(price) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box).toHaveTextContent('호가를 누르면 채워져요');
    expect(box).toHaveTextContent(/원$/);
    const qtyBox = boxOf(qtyInput());
    expect(qtyBox).toHaveTextContent(/^수량/);
    expect(qtyBox).toHaveTextContent(/주$/);
    // ± 호가 버튼 · 비율 버튼 · 매수/매도 세그먼트 + 단일 CTA 는 없다(CONTEXT Deferred).
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: /호가 (올리기|내리기)/ })).toBeNull();
  });

  it('포커스 = 값 전체 선택 (D-14c)', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(priceInput(), '98000');
    await user.click(qtyInput());
    await user.click(priceInput());
    expect(priceInput()).toHaveFocus();
    expect(priceInput().selectionStart).toBe(0);
    expect(priceInput().selectionEnd).toBe('98,000'.length);
  });

  it('↑/↓ — 가격은 한 호가(98,000 → 98,100 · 2,000 → 1,999) · 수량은 1 · Enter = blur (주문은 나가지 않는다)', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(priceInput(), '98000');
    fireEvent.keyDown(priceInput(), { key: 'ArrowUp' });
    expect(priceInput().value).toBe('98,100');
    await user.clear(priceInput());
    await user.type(priceInput(), '2000');
    fireEvent.keyDown(priceInput(), { key: 'ArrowDown' });
    expect(priceInput().value).toBe('1,999');
    await user.type(qtyInput(), '10');
    fireEvent.keyDown(qtyInput(), { key: 'ArrowUp' });
    expect(qtyInput().value).toBe('11');
    fireEvent.keyDown(qtyInput(), { key: 'ArrowDown' });
    fireEvent.keyDown(qtyInput(), { key: 'ArrowDown' });
    expect(qtyInput().value).toBe('9');
    qtyInput().focus();
    await user.keyboard('{Enter}');
    expect(qtyInput()).not.toHaveFocus();
    expect(screen.queryByTestId('order-confirm-dialog')).toBeNull();
    expect(sendOrderMock).not.toHaveBeenCalled();
  });

  it('가격 검증 줄 D-15a · etp — 호가 단위 위반은 명령형이 아니라 사실만 말한다 (WR-05)', async () => {
    const user = userEvent.setup();
    renderForm({ upperLimit: 32_500, tickRule: 'etp' });
    await user.type(priceInput(), '25005');
    expect(screen.getByTestId('manual-order-price-issue')).toHaveTextContent(
      '주식 호가 단위(50원)와 달라요 · 가까운 값 25,000 / 25,050',
    );
  });

  it('가격 검증 줄(D-15): 호가 단위 위반은 상자 아래 12.5px --destructive 한 줄 · 주문 버튼은 잠그지 않는다', async () => {
    const user = userEvent.setup();
    renderForm({ upperLimit: 127_400 });
    await user.type(priceInput(), '98150');
    const issue = screen.getByTestId('manual-order-price-issue');
    expect(issue).toHaveTextContent('100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200');
    expect(issue).toHaveAttribute('role', 'status');
    expect(issue.className).toContain('text-[12.5px]');
    expect(issue.className).toContain('text-[var(--destructive)]');
    // 값은 보정하지 않는다.
    expect(priceInput().value).toBe('98,150');
    await user.type(qtyInput(), '10');
    expect(btn('매수')).toBeEnabled();
    await user.click(btn('매수'));
    expect(await screen.findByTestId('order-confirm-dialog')).toBeInTheDocument();
    expect(sendOrderMock).not.toHaveBeenCalled();
  });

  it('가격 검증 줄: 상한가 초과 · 정상 값이면 줄 없음 · 상한가 모르면(0) 단위만 본다', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderForm({ upperLimit: 127_400 });
    await user.type(priceInput(), '130000');
    expect(screen.getByTestId('manual-order-price-issue')).toHaveTextContent(
      '상한가 127,400원을 넘을 수 없어요',
    );
    await user.clear(priceInput());
    await user.type(priceInput(), '98100');
    expect(screen.queryByTestId('manual-order-price-issue')).toBeNull();
    rerender(<ManualOrderForm {...props} upperLimit={undefined} />);
    await user.clear(priceInput());
    await user.type(priceInput(), '130000');
    expect(screen.queryByTestId('manual-order-price-issue')).toBeNull();
  });

  it('시간외종가면 가격 검증 줄이 없다', async () => {
    const user = userEvent.setup();
    renderForm({ variant: 'orderbook', queuedWindow: win({ g3Open: true }), upperLimit: 127_400 });
    await user.type(priceInput(), '98150');
    expect(screen.getByTestId('manual-order-price-issue')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('주문유형'), 'offhours');
    expect(screen.queryByTestId('manual-order-price-issue')).toBeNull();
  });

  it('주문금액 행: 44px · 「주문금액」 + 「{가격×수량}원」', async () => {
    const user = userEvent.setup();
    renderForm();
    await fill(user, '128500', '10');
    const amount = screen.getByText('1,285,000원');
    expect(amount.parentElement!.className).toContain('min-h-[44px]');
    expect(amount.parentElement).toHaveTextContent(/^주문금액/);
  });

  it('주문유형 행(호가 탭): 44px · 「주문유형」 + 「지정가 ›」 위에 투명 네이티브 select', async () => {
    const user = userEvent.setup();
    renderForm({ variant: 'orderbook', queuedWindow: win({ g3Open: true }) });
    const select = screen.getByLabelText('주문유형');
    expect(select.tagName).toBe('SELECT');
    expect(select.className).toContain('opacity-0');
    expect(select.className).toContain('absolute');
    const rowEl = select.parentElement as HTMLElement;
    expect(rowEl.className).toContain('min-h-[44px]');
    const shown = rowEl.querySelector('[data-slot="mo-type-value"]') as HTMLElement;
    expect(shown).toHaveTextContent('지정가 ›');
    await user.selectOptions(select, 'offhours');
    expect(shown).toHaveTextContent('시간외종가 ›');
  });

  it('미체결 행을 고르면 각주가 사라진다', () => {
    const { rerender, props } = renderForm();
    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument();
    rerender(<ManualOrderForm {...props} selectedUnfilled={unf()} />);
    expect(screen.queryByText(FOOTNOTE)).toBeNull();
  });

  it('원주문 칩: --muted · radius 12 · 13px · ✕ 히트 44', () => {
    renderForm({ selectedUnfilled: unf(), onClearSelection: vi.fn() });
    const chip = screen.getByTestId('manual-order-selchip');
    expect(chip.className).toContain('rounded-[12px]');
    expect(chip.className).toContain('bg-[var(--muted)]');
    expect(chip.className).toContain('text-[13px]');
    const x = btn('선택 해제');
    expect(x.className).toContain('min-h-11');
    expect(x.className).toContain('min-w-11');
  });

  it('소스 가드 — --primary 계열 토큰 · StepButton · UnitBox 가 없다(머리 ② 5 · D-08)', () => {
    const src = readFileSync(path.resolve(__dirname, '../card/manual-order-form.tsx'), 'utf8');
    expect(src).not.toMatch(/var\(--primary/);
    expect(src).not.toMatch(/function StepButton|function UnitBox/);
    expect(src).toMatch(/function TicketBox/);
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

  it('재스타일(D-09 · §9): 3탭 34px · 15/600 · 트랙 radius 12 · 「수동주문」 32px 13/600 · 덮은 뒤 키 줄 말줄임 + title', async () => {
    const user = userEvent.setup();
    renderEntry();
    const tabs = screen.getByRole('tablist', { name: '주문 진입' });
    expect(tabs.className).toContain('rounded-[12px]');
    expect(tabs.className).toContain('bg-[var(--muted)]');
    for (const t of within(tabs).getAllByRole('tab')) {
      expect(t.className).toContain('h-[34px]');
      expect(t.className).toContain('text-[15px]');
      expect(t.className).toContain('font-semibold');
      expect(t.textContent).toHaveLength(2);
    }
    const open = btn('수동주문');
    expect(open.className).toContain('h-8');
    expect(open.className).toContain('text-[13px]');
    expect(open.className).toContain('font-semibold');

    await user.click(open);
    const key = `${ISIN}:12345678-01:KRX`;
    const keyLine = screen.getByTitle(key);
    expect(keyLine.className).toContain('truncate');
    expect(keyLine).toHaveTextContent(`수동주문 · 키 ${key}`);
    expect(keyLine.className).toContain('text-[12px]');
    expect(btn('수동주문 닫기').className).toContain('size-8');
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

  it('다이얼로그를 연 뒤 다른 주문번호 행이 선택됨 → 확정 → 전송 0 · 「선택한 원주문이 바뀌었어요」 (GC-IN-06)', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderForm({ selectedUnfilled: row10() });
    await user.click(btn('정정'));
    await screen.findByTestId('order-confirm-dialog');
    rerender(
      <ManualOrderForm {...props} selectedUnfilled={unf({ orderNo: '3407000099', unfilledQty: 10 })} />,
    );
    await user.click(screen.getByRole('button', { name: '정정 주문' }));

    expect(sendOrderMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('order-confirm-dialog')).toBeNull());
    const status = screen.getByTestId('manual-order-validation');
    expect(status).toHaveTextContent(MODIFY_TARGET_CHANGED_TEXT);
    expect(status).not.toHaveTextContent(MODIFY_TARGET_GONE_TEXT);
    expect(MODIFY_TARGET_CHANGED_TEXT).toBe('선택한 원주문이 바뀌었어요 — 다시 확인해 주세요');
  });
});

describe('ManualOrderForm — 취소 확정 수량 = 현재 잔량으로 내림 (GC-WR-02 · D-21)', () => {
  const row10 = () => unf({ unfilledQty: 10, filledQty: 90 });
  const cancelReq = (qty: number) => ({
    kind: 'cancel',
    isin: ISIN,
    accountNo: '12345678-01',
    exchange: 'NXT',
    orgOrderNo: '3407000064',
    qty,
    price: 128_500,
  });

  it('cancelQtyAtConfirm — 같은 주문번호의 0 < 잔량 < 확인 수량일 때만 내린다', () => {
    const no = '3407000064';
    expect(cancelQtyAtConfirm(10, no, unf({ unfilledQty: 4 }))).toBe(4);
    // 올리지 않는다.
    expect(cancelQtyAtConfirm(10, no, unf({ unfilledQty: 12 }))).toBe(10);
    expect(cancelQtyAtConfirm(10, no, unf({ unfilledQty: 10 }))).toBe(10);
    // 막지 않는다 — 원주문이 사라졌거나 다른 행이면 확인한 수량 그대로.
    expect(cancelQtyAtConfirm(10, no, null)).toBe(10);
    expect(cancelQtyAtConfirm(10, no, unf({ orderNo: '3407000099', unfilledQty: 4 }))).toBe(10);
    expect(cancelQtyAtConfirm(10, no, unf({ unfilledQty: 0 }))).toBe(10);
  });

  it('잔량 10 · 「취소」 다이얼로그 → 같은 주문번호 잔량 4 로 갱신 → 확정 → qty 4 로 1회 전송', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderForm({ selectedUnfilled: row10() });
    await user.click(btn('취소'));
    await screen.findByTestId('order-confirm-dialog');
    rerender(<ManualOrderForm {...props} selectedUnfilled={unf({ unfilledQty: 4, filledQty: 96 })} />);
    await user.click(screen.getByRole('button', { name: '취소 주문' }));

    expect(sendOrderMock).toHaveBeenCalledTimes(1);
    expect(sendOrderMock).toHaveBeenCalledWith(cancelReq(4));
  });

  it('잔량 10 · 「취소」 다이얼로그 → 잔량 12 로 늘어남 → 확정 → qty 10 (올리지 않는다)', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderForm({ selectedUnfilled: row10() });
    await user.click(btn('취소'));
    await screen.findByTestId('order-confirm-dialog');
    rerender(<ManualOrderForm {...props} selectedUnfilled={unf({ unfilledQty: 12, filledQty: 88 })} />);
    await user.click(screen.getByRole('button', { name: '취소 주문' }));

    expect(sendOrderMock).toHaveBeenCalledTimes(1);
    expect(sendOrderMock).toHaveBeenCalledWith(cancelReq(10));
  });

  it('잔량 10 · 「취소」 다이얼로그 → 선택 해제(null) → 확정 → qty 10 으로 보낸다 (막지 않는다)', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderForm({ selectedUnfilled: row10() });
    await user.click(btn('취소'));
    await screen.findByTestId('order-confirm-dialog');
    rerender(<ManualOrderForm {...props} selectedUnfilled={null} />);
    await user.click(screen.getByRole('button', { name: '취소 주문' }));

    expect(sendOrderMock).toHaveBeenCalledTimes(1);
    expect(sendOrderMock).toHaveBeenCalledWith(cancelReq(10));
  });
});

describe('ManualOrderForm — 가격 0 원주문 선택 칩 표기 (CR-01 표시 정합)', () => {
  it('board G3 · price 0 행 선택 → 칩 둘째 줄이 「매수 시간외종가 × {수량}」 이고 「0」 이 없다', () => {
    renderForm({ selectedUnfilled: unf({ board: 'G3', price: 0, exchange: 'KRX' }) });
    const chip = screen.getByTestId('manual-order-selchip');
    expect(chip).toHaveTextContent(`매수 ${OFFHOURS_PRICE_LABEL} × 100`);
    expect(chip).not.toHaveTextContent(/매수 0 ×/);
  });

  it('board 빈 값(구 서버) · price 0 행 → 칩 「시간외종가」 · 정정 disabled + 사유 title · 취소 활성 (GC-IN-03)', () => {
    const row = unf({ board: '', price: 0, exchange: 'KRX' });
    expect(canModify(row)).toBe(false);
    renderForm({ selectedUnfilled: row });
    expect(screen.getByTestId('manual-order-selchip')).toHaveTextContent(
      `매수 ${OFFHOURS_PRICE_LABEL} × 100`,
    );
    expect(btn('정정')).toBeDisabled();
    expect(btn('정정')).toHaveAttribute('title', '시간외종가 주문은 정정할 수 없어요 · 취소 후 재등록');
    expect(btn('취소')).toBeEnabled();
  });

  it('가격 > 0 행은 칩이 기존 숫자 표기 그대로다', () => {
    renderForm({ selectedUnfilled: unf() });
    const chip = screen.getByTestId('manual-order-selchip');
    expect(chip).toHaveTextContent('매수 128,500 × 100');
    expect(chip).not.toHaveTextContent(OFFHOURS_PRICE_LABEL);
  });
});

describe('ManualOrderForm — 잠금 원천 = RelayProvider (R3-WR-02 · R3-IN-02)', () => {
  const KEY = `${ISIN}:12345678-01:KRX`;
  const lockWith = (entries: Array<[string, 'in-flight' | 'result-unknown']>) => {
    lockMock.locks = new Map(entries);
  };
  const allButtons = () => within(screen.getByTestId('manual-order-buttons')).getAllByRole('button');

  it('컨텍스트 result-unknown → 4버튼 disabled · 잠금 문구 · 「매수」 눌러도 다이얼로그 없음 · sendOrder 0', async () => {
    const user = userEvent.setup();
    lockWith([[KEY, 'result-unknown']]);
    renderForm({ selectedUnfilled: unf({ exchange: 'KRX' }) });
    for (const b of allButtons()) expect(b).toBeDisabled();
    expect(screen.getByTestId('manual-order-locked')).toHaveTextContent(RESULT_UNKNOWN_LOCKED_TEXT);
    expect(screen.queryByText('주문 전송 중…')).toBeNull();

    await user.click(btn('매수'));
    fireEvent.click(btn('매도'));
    expect(screen.queryByTestId('order-confirm-dialog')).toBeNull();
    expect(sendOrderMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('manual-order-form').textContent).not.toMatch(/실패/);
  });

  it('컨텍스트 in-flight(다른 표면이 전송 중) → 4버튼 disabled · 「주문 전송 중…」 · 잠금 문구 없음', () => {
    lockWith([[KEY, 'in-flight']]);
    renderForm();
    for (const b of allButtons()) expect(b).toBeDisabled();
    expect(screen.getByText('주문 전송 중…')).toBeInTheDocument();
    expect(screen.queryByTestId('manual-order-locked')).toBeNull();
    expect(screen.getByTestId('manual-order-form').textContent).not.toMatch(/실패/);
  });

  it('다른 키(다른 계좌 · 다른 거래소 · 다른 종목)의 잠금 → 이 폼은 열려 있다', () => {
    lockWith([
      [`${ISIN}:99999999-01:KRX`, 'result-unknown'],
      [`${ISIN}:12345678-01:NXT`, 'result-unknown'],
      ['KR7005930003:12345678-01:KRX', 'in-flight'],
    ]);
    renderForm();
    expect(btn('매수')).toBeEnabled();
    expect(btn('매도')).toBeEnabled();
    expect(screen.queryByTestId('manual-order-locked')).toBeNull();
    expect(screen.queryByText('주문 전송 중…')).toBeNull();
  });

  it('계좌가 빈 폼은 잠금을 읽지 않는다', () => {
    lockWith([[`${ISIN}::KRX`, 'result-unknown']]);
    renderForm({ accountNo: '' });
    expect(screen.queryByTestId('manual-order-locked')).toBeNull();
  });

  it('variant="orderbook"(호가 탭)도 같은 판정 · 같은 요소(manual-order-locked · 원문)', () => {
    lockWith([[KEY, 'result-unknown']]);
    renderForm({ variant: 'orderbook' });
    for (const b of allButtons()) expect(b).toBeDisabled();
    const lock = screen.getByTestId('manual-order-locked');
    expect(lock).toHaveAttribute('role', 'status');
    expect(lock.textContent).toBe(RESULT_UNKNOWN_LOCKED_TEXT);
  });

  it('신규 timeout 은 배너가 있으면 잠금 문구를 겹쳐 보이지 않는다 · 어떤 문구에도 「실패」 없음', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(
      accepted({ status: 'timeout', orderNo: '', resultCode: -1, message: '' }),
    );
    renderForm();
    await fill(user, '128500', '10');
    await user.click(btn('매수'));
    await user.click(await screen.findByRole('button', { name: '매수 주문' }));
    await screen.findByTestId('manual-order-result');
    expect(lockMock.locks?.get(KEY)).toBe('result-unknown');
    for (const b of allButtons()) expect(b).toBeDisabled();
    expect(screen.queryByTestId('manual-order-locked')).toBeNull();
    expect(screen.getByTestId('manual-order-form').textContent).not.toMatch(/실패/);
    expect(RESULT_UNKNOWN_LOCKED_TEXT).not.toMatch(/실패/);
  });

  /*
    아래는 18-35 에서 옛 제어형(상위 prop) describe 가 지키던 성질을 옮긴 것이다 — 요청 키 · 취소
    제외 · 접수/거부 무잠금 · 종목 전환. 잠금의 유일한 원천은 컨텍스트다.
  */
  const TIMEOUT = () => accepted({ status: 'timeout', orderNo: '', resultCode: -1, message: '' });

  it('정정 timeout → 원주문 **행의** 키(NXT)가 잠긴다 — 폼 키(KRX)가 아니다 · 폼(KRX)의 4버튼도 잠긴다 — 같은 원주문을 곧바로 다시 정정할 수 없다 (R4-WR-01)', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(TIMEOUT());
    renderForm({ selectedUnfilled: unf() });
    await user.clear(qtyInput());
    await user.type(qtyInput(), '30');
    await user.click(btn('정정'));
    await user.click(await screen.findByRole('button', { name: '정정 주문' }));
    await screen.findByTestId('manual-order-result');
    expect(sendOrderMock).toHaveBeenCalledTimes(1);
    expect([...(lockMock.locks ?? new Map()).entries()]).toEqual([
      [`${ISIN}:12345678-01:NXT`, 'result-unknown'],
    ]);
    // R4-WR-01 — 폼 키(KRX)만 읽으면 여기서 4버튼이 다시 열렸다.
    for (const b of allButtons()) expect(b).toBeDisabled();
    expect(screen.getByTestId('manual-order-result')).toHaveAttribute('data-kind', 'unknown');
    // 배너가 있으면 잠금 문구를 겹쳐 보이지 않는다.
    expect(screen.queryByTestId('manual-order-locked')).toBeNull();
    fireEvent.click(btn('정정'));
    expect(screen.queryByTestId('order-confirm-dialog')).toBeNull();
    expect(sendOrderMock).toHaveBeenCalledTimes(1);
  });

  it('교차 거래소 정정 timeout 뒤 선택이 풀려도 매수 · 매도는 잠긴 채다 — 다른 종목 · 다른 계좌는 독립 (R4-WR-01)', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(TIMEOUT());
    const { rerender } = renderForm({ variant: 'orderbook', selectedUnfilled: unf() });
    await user.clear(qtyInput());
    await user.type(qtyInput(), '30');
    await user.click(btn('정정'));
    await user.click(await screen.findByRole('button', { name: '정정 주문' }));
    await screen.findByTestId('manual-order-result');

    // 칩 ✕ · 원주문이 미체결에서 사라짐 — 선택 해제.
    rerender(<ManualOrderForm {...baseProps({ variant: 'orderbook', selectedUnfilled: null })} />);
    expect(btn('매수')).toBeDisabled();
    expect(btn('매도')).toBeDisabled();
    expect(screen.getByTestId('manual-order-result')).toHaveAttribute('data-kind', 'unknown');

    // 다른 종목 — 18-34 종목 전환 의미 그대로(독립 키).
    rerender(<ManualOrderForm {...baseProps({ variant: 'orderbook', isin: 'KR7005930003' })} />);
    expect(btn('매수')).toBeEnabled();

    // 원래 종목(선택 없음) — 배너는 종목 전환에서 리셋됐고 잠금 문구가 선다.
    rerender(<ManualOrderForm {...baseProps({ variant: 'orderbook' })} />);
    expect(btn('매수')).toBeDisabled();
    expect(screen.getByTestId('manual-order-locked')).toHaveTextContent(RESULT_UNKNOWN_LOCKED_TEXT);

    // 다른 계좌 — 교차 거래소 방향으로만 넓힌다.
    rerender(
      <ManualOrderForm {...baseProps({ variant: 'orderbook', accountNo: '99999999-01' })} />,
    );
    expect(btn('매수')).toBeEnabled();
  });

  it('선택 행 키 단독 — 다른 표면이 잠근 NXT 키의 원주문을 고르면 폼(KRX)이 잠긴다 · 선택 해제면 18-34 대로 열린다 (R4-WR-01)', () => {
    const NXT_KEY = `${ISIN}:12345678-01:NXT`;
    lockWith([[NXT_KEY, 'result-unknown']]);
    const { rerender } = renderForm({ selectedUnfilled: unf() });
    for (const b of allButtons()) expect(b).toBeDisabled();
    expect(screen.getByTestId('manual-order-locked')).toHaveTextContent(RESULT_UNKNOWN_LOCKED_TEXT);

    rerender(<ManualOrderForm {...baseProps({ selectedUnfilled: null })} />);
    expect(btn('매수')).toBeEnabled();
    expect(btn('매도')).toBeEnabled();
    expect(screen.queryByTestId('manual-order-locked')).toBeNull();

    lockWith([[NXT_KEY, 'in-flight']]);
    rerender(<ManualOrderForm {...baseProps({ selectedUnfilled: unf() })} />);
    for (const b of allButtons()) expect(b).toBeDisabled();
    expect(screen.getByText('주문 전송 중…')).toBeInTheDocument();
    expect(screen.queryByTestId('manual-order-locked')).toBeNull();
  });

  it('formOrderLockOf — 결과 모름이 진행 중보다 우선 · null 은 건너뛴다 · 렌더도 잠금 문구가 이긴다', () => {
    const k1 = `${ISIN}:12345678-01:KRX`;
    const k2 = `${ISIN}:12345678-01:NXT`;
    const map = new Map<string, 'in-flight' | 'result-unknown'>([
      [k1, 'in-flight'],
      [k2, 'result-unknown'],
    ]);
    expect(formOrderLockOf(map, [k1, k2])).toBe('result-unknown');
    expect(formOrderLockOf(map, [k2, k1])).toBe('result-unknown');
    expect(formOrderLockOf(map, [null, k1])).toBe('in-flight');
    expect(formOrderLockOf(map, [])).toBeUndefined();
    expect(formOrderLockOf(map, [null])).toBeUndefined();
    expect(formOrderLockOf(map, ['KR7005930003:12345678-01:KRX'])).toBeUndefined();

    lockWith([
      [k1, 'in-flight'],
      [k2, 'result-unknown'],
    ]);
    renderForm({ selectedUnfilled: unf() });
    for (const b of allButtons()) expect(b).toBeDisabled();
    expect(screen.getByTestId('manual-order-locked')).toHaveTextContent(RESULT_UNKNOWN_LOCKED_TEXT);
    expect(screen.queryByText('주문 전송 중…')).toBeNull();
  });

  it('취소는 읽을 키로 남지 않는다 — 교차 거래소 취소 timeout 뒤 다른 표면이 NXT 를 잠가도 선택 해제면 열린다 (R4-WR-01)', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(TIMEOUT());
    const { rerender } = renderForm({ selectedUnfilled: unf() });
    await user.click(btn('취소'));
    await user.click(await screen.findByRole('button', { name: '취소 주문' }));
    await screen.findByTestId('manual-order-result');
    expect(lockMock.locks).toBeNull();

    // 다른 표면이 같은 원주문 키(NXT)를 결과 모름으로 잠갔다.
    lockWith([[`${ISIN}:12345678-01:NXT`, 'result-unknown']]);
    rerender(<ManualOrderForm {...baseProps({ selectedUnfilled: null })} />);
    expect(btn('매수')).toBeEnabled();
    expect(btn('매도')).toBeEnabled();
  });

  it('취소 timeout → 잠금 등록 0 · 배너만 · 버튼 잠기지 않음 (R3-IN-01 · 사용자 결정 2)', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(TIMEOUT());
    renderForm({ selectedUnfilled: unf() });
    await user.click(btn('취소'));
    await user.click(await screen.findByRole('button', { name: '취소 주문' }));
    const banner = await screen.findByTestId('manual-order-result');
    expect(banner).toHaveAttribute('data-kind', 'unknown');
    expect(banner).toHaveTextContent('접수 응답이 늦어지고 있어요');
    // 취소 재시도는 무해하다 — 어느 표면의 버튼도 잠그지 않는다.
    expect(lockMock.locks).toBeNull();
    expect(screen.queryByTestId('manual-order-locked')).toBeNull();
    for (const name of ['매수', '매도', '취소']) expect(btn(name)).toBeEnabled();
  });

  it('접수 · 거부는 잠금을 등록하지 않는다 — 버튼이 다시 열린다', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValueOnce(accepted());
    sendOrderMock.mockResolvedValueOnce(
      accepted({ status: 'rejected', orderNo: '', resultCode: 7, message: '주문가능수량 초과' }),
    );
    renderForm();
    await fill(user, '128500', '10');
    await user.click(btn('매수'));
    await user.click(await screen.findByRole('button', { name: '매수 주문' }));
    await screen.findByTestId('manual-order-result');
    await user.click(btn('매도'));
    await user.click(await screen.findByRole('button', { name: '매도 주문' }));
    await waitFor(() =>
      expect(screen.getByTestId('manual-order-result')).toHaveAttribute('data-kind', 'rejected'),
    );
    expect(lockMock.locks).toBeNull();
    expect(btn('매수')).toBeEnabled();
    expect(screen.queryByTestId('manual-order-locked')).toBeNull();
  });

  it('컨텍스트 키 잠금(호가 탭) — 다른 종목으로 바꾸면 그 키는 잠기지 않고, 원래 종목으로 돌아오면 다시 잠겨 있다', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(TIMEOUT());
    const { rerender } = renderForm({ variant: 'orderbook' });
    await fill(user, '128500', '10');
    await user.click(btn('매수'));
    await user.click(await screen.findByRole('button', { name: '매수 주문' }));
    await screen.findByTestId('manual-order-result');
    expect(btn('매수')).toBeDisabled();
    // 배너가 있는 폼은 잠금 문구를 겹쳐 보이지 않는다.
    expect(screen.queryByTestId('manual-order-locked')).toBeNull();

    rerender(<ManualOrderForm {...baseProps({ variant: 'orderbook', isin: 'KR7005930003' })} />);
    expect(btn('매수')).toBeEnabled();
    expect(screen.queryByTestId('manual-order-result')).toBeNull();
    expect(screen.queryByTestId('manual-order-locked')).toBeNull();

    // 원래 종목으로 돌아오면 Provider 키 잠금을 다시 읽는다 — 배너는 없고 잠금 문구가 선다.
    rerender(<ManualOrderForm {...baseProps({ variant: 'orderbook' })} />);
    expect(btn('매수')).toBeDisabled();
    expect(screen.getByTestId('manual-order-locked')).toHaveTextContent(RESULT_UNKNOWN_LOCKED_TEXT);
  });
});

describe('D-10 시트 입력(터치) — 값만 채운다 (D-10 · D-15 · D-17 · D-23)', () => {
  beforeEach(() => mockPointer(true));
  afterEach(restoreMatchMedia);

  const chips = () => document.querySelector('[data-slot="numpad-chips"]') as HTMLElement;
  const chipLabels = () => within(chips()).getAllByRole('button').map((b) => b.textContent);
  const chip = (label: string) =>
    within(chips())
      .getAllByRole('button')
      .find((b) => b.textContent === label) as HTMLButtonElement;
  const padKey = (name: string) =>
    within(screen.getByRole('group', { name: '숫자 키패드' })).getByRole('button', { name });
  const confirmBtn = () =>
    document.querySelector('[data-slot="numpad-confirm"]') as HTMLButtonElement;
  const statusLine = () => document.querySelector('[data-slot="numpad-status"]') as HTMLElement;
  const display = () => document.querySelector('[data-slot="numpad-value"]')?.textContent ?? null;
  async function press(user: ReturnType<typeof userEvent.setup>, digits: string) {
    for (const d of digits) await user.click(padKey(d));
  }
  /** 시트 확정만으로는 주문이 나가지 않는다 — 모든 시트 케이스의 공통 단언(T-20-09). */
  const expectNoOrder = () => {
    expect(sendOrderMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('order-confirm-dialog')).toBeNull();
  };

  it('입력칸이 없고 상자가 aria-haspopup="dialog" 버튼이다 — 빈 값이면 이름 「가격」 · 자리표시 「가격 입력」', () => {
    renderForm();
    expect(document.getElementById(`mo-price-${ISIN}`)).toBeNull();
    expect(document.getElementById(`mo-qty-${ISIN}`)).toBeNull();
    const price = btn('가격');
    expect(price).toHaveAttribute('aria-haspopup', 'dialog');
    expect(price).toHaveTextContent('가격 입력');
    expect(btn('수량')).toHaveAttribute('aria-haspopup', 'dialog');
    expect(price.closest('[data-slot="ticket-box"]')).not.toBeNull();
    expectNoOrder();
  });

  it('가격 상자 → 시트 제목 「가격」 · 설명 · 칩 4개 · 「현재가」 → 「가격 입력」 → 닫힘 · 98,100 · 전송 0 · 포커스 복귀', async () => {
    const user = userEvent.setup();
    renderForm({ currentPrice: 98_100, upperLimit: 127_400 });
    await user.click(btn('가격'));
    const dialog = screen.getByRole('dialog', { name: '가격' });
    expect(dialog).toHaveAccessibleDescription('호가를 누르면 채워져요');
    expect(confirmBtn()).toHaveTextContent('가격 입력');
    expect(chipLabels()).toEqual(['−1호가', '+1호가', '현재가', '상한가']);
    // 「지금 ○○」 · 다른 단말 알림 · 감시 중 안내가 없다(serverValue 없음).
    expect(document.querySelector('[data-slot="numpad-server"]')).toBeNull();
    await user.click(chip('현재가'));
    expect(display()).toBe('98,100');
    await user.click(confirmBtn());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '가격' })).toBeNull());
    const filled = btn('가격 98,100원');
    expect(filled).toHaveTextContent('98,100');
    await waitFor(() => expect(filled).toHaveFocus());
    expectNoOrder();
  });

  it('98150 입력 → 「가격 입력」 잠금 + 호가 단위 문구(보정 없음)', async () => {
    const user = userEvent.setup();
    renderForm({ currentPrice: 98_100, upperLimit: 127_400 });
    await user.click(btn('가격'));
    await press(user, '98150');
    expect(display()).toBe('98,150');
    expect(confirmBtn()).toBeDisabled();
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent(
      '100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200',
    );
    expectNoOrder();
  });

  it.each(['etp', 'unknown'] as const)(
    'D-15a · %s — ETF 25005 → 「가격 입력」 잠그지 않음 · 경고 한 줄 · 채우면 상자 25,005 · 주문 0 (WR-05)',
    async (tickRule) => {
      const user = userEvent.setup();
      renderForm({ currentPrice: 25_000, upperLimit: 32_500, tickRule });
      await user.click(btn('가격'));
      await press(user, '25005');
      expect(display()).toBe('25,005');
      expect(within(statusLine()).queryByRole('alert')).toBeNull();
      expect(within(statusLine()).getByRole('status')).toHaveTextContent(
        '주식 호가 단위(50원)와 달라요 · 가까운 값 25,000 / 25,050',
      );
      expect(confirmBtn()).toBeEnabled();
      await user.click(confirmBtn());
      await waitFor(() => expect(screen.queryByRole('dialog', { name: '가격' })).toBeNull());
      expect(btn('가격 25,005원')).toHaveTextContent('25,005');
      expectNoOrder();
    },
  );

  it('D-15a · stock — ETF 가격이라도 주식 분류면 잠근다 · etp 여도 상한가 초과는 잠근다 (WR-05)', async () => {
    const user = userEvent.setup();
    const { unmount } = renderForm({ currentPrice: 25_000, upperLimit: 32_500, tickRule: 'stock' });
    await user.click(btn('가격'));
    await press(user, '25005');
    expect(confirmBtn()).toBeDisabled();
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent('50원 단위로 입력해 주세요');
    unmount();
    renderForm({ currentPrice: 25_000, upperLimit: 32_500, tickRule: 'etp' });
    await user.click(btn('가격'));
    await press(user, '32550');
    expect(confirmBtn()).toBeDisabled();
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent('상한가 32,500원을 넘을 수 없어요');
    expectNoOrder();
  });

  it('currentPrice 0 → 칩 「현재가」 비활성 · 상한가 모르면 「상한가」 비활성', async () => {
    const user = userEvent.setup();
    renderForm({ currentPrice: 0 });
    await user.click(btn('가격'));
    expect(chip('현재가')).toBeDisabled();
    expect(chip('상한가')).toBeDisabled();
    expectNoOrder();
  });

  it('칩 「상한가」 는 같은 카드 상한가를 쓴다 → 127,400 입력', async () => {
    const user = userEvent.setup();
    renderForm({ currentPrice: 98_100, upperLimit: 127_400 });
    await user.click(btn('가격'));
    await user.click(chip('상한가'));
    await user.click(confirmBtn());
    await waitFor(() => expect(btn('가격 127,400원')).toBeInTheDocument());
    expectNoOrder();
  });

  it('수량 상자 → 「수량 입력」 · 칩 +100 · +1,000 · +10,000 · 지우기 · 「+1,000」 → 1,000 입력', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(btn('수량'));
    const dialog = screen.getByRole('dialog', { name: '수량' });
    expect(dialog).toHaveAccessibleDescription('주문 수량이에요');
    expect(confirmBtn()).toHaveTextContent('수량 입력');
    expect(chipLabels()).toEqual(['+100', '+1,000', '+10,000', '지우기']);
    await user.click(chip('+1,000'));
    await user.click(confirmBtn());
    await waitFor(() => expect(btn('수량 1,000주')).toBeInTheDocument());
    expectNoOrder();
  });

  it('조각 수 상자(예약구간 ∧ KRX · maxPieces 5) → 「조각 수 입력」 · 설명 · 칩 1 3 5 10 · 「10」 비활성 · 0 이면 잠금 · 3 → 3회', async () => {
    const user = userEvent.setup();
    renderForm({ queuedWindow: win({ open: true, maxPieces: 5 }) });
    await user.click(btn('조각 수 5회'));
    const dialog = screen.getByRole('dialog', { name: '조각 수' });
    expect(dialog).toHaveAccessibleDescription('나눠서 넣는 횟수예요 · 최대 5회');
    expect(confirmBtn()).toHaveTextContent('조각 수 입력');
    expect(chipLabels()).toEqual(['1', '3', '5', '10']);
    expect(chip('10')).toBeDisabled();
    expect(chip('5')).toBeEnabled();
    await press(user, '0');
    expect(confirmBtn()).toBeDisabled();
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent('1회 이상 입력해 주세요');
    await press(user, '7');
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent('최대 5회까지 나눌 수 있어요');
    await user.click(chip('3'));
    await user.click(confirmBtn());
    await waitFor(() => expect(btn('조각 수 3회')).toBeInTheDocument());
    expectNoOrder();
  });

  it('시간외종가면 가격 상자는 버튼이 아니다 — 눌러도 시트가 없다', async () => {
    const user = userEvent.setup();
    renderForm({ variant: 'orderbook', queuedWindow: win({ g3Open: true }), referenceClose: 128_700 });
    await user.selectOptions(screen.getByLabelText('주문유형'), 'offhours');
    expect(screen.queryByRole('button', { name: /^가격/ })).toBeNull();
    const locked = screen.getByLabelText('가격(시간외종가 · 잠김)');
    fireEvent.click(locked);
    expect(screen.queryByRole('dialog')).toBeNull();
    expectNoOrder();
  });

  it('시트로 채운 뒤 「매수」 → 기존 확인 다이얼로그 → 확정 시 sendOrder 1회(가격·수량 = 시트 값)', async () => {
    const user = userEvent.setup();
    renderForm({ currentPrice: 128_500, upperLimit: 156_000 });
    await user.click(btn('가격'));
    await press(user, '128500');
    await user.click(confirmBtn());
    await waitFor(() => expect(btn('가격 128,500원')).toBeInTheDocument());
    await user.click(btn('수량'));
    await user.click(chip('+100'));
    await user.click(confirmBtn());
    await waitFor(() => expect(btn('수량 100주')).toBeInTheDocument());
    expectNoOrder();

    await user.click(btn('매수'));
    const dialog = await screen.findByTestId('order-confirm-dialog');
    expect(sendOrderMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: '매수 주문' }));
    expect(sendOrderMock).toHaveBeenCalledTimes(1);
    expect(sendOrderMock).toHaveBeenCalledWith({
      kind: 'new',
      isin: ISIN,
      accountNo: '12345678-01',
      exchange: 'KRX',
      side: 'B',
      qty: 100,
      price: 128_500,
    });
  });

  it('호가 사다리 가격 선택은 시트 모드에서도 가격 상자를 채운다 · 시트는 그 값으로 열린다(첫 입력 대기)', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderForm();
    rerender(<ManualOrderForm {...props} selectedPrice={{ price: 98_100, seq: 1 }} />);
    await user.click(btn('가격 98,100원'));
    expect(display()).toBe('98,100');
    await press(user, '9');
    expect(display()).toBe('9');
    expectNoOrder();
  });

  it('「닫기」 는 값을 바꾸지 않는다 · 전송 0', async () => {
    const user = userEvent.setup();
    renderForm({ selectedPrice: { price: 98_100, seq: 1 } });
    await user.click(btn('가격 98,100원'));
    await press(user, '5');
    await user.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(btn('가격 98,100원')).toBeInTheDocument();
    expectNoOrder();
  });

  it('시트 모드에서도 가격 검증 줄은 보인다(사다리로 채운 값) · 주문 버튼은 잠그지 않는다', () => {
    renderForm({ upperLimit: 127_400, selectedPrice: { price: 98_150, seq: 1 } });
    expect(btn('가격 98,150원')).toBeInTheDocument();
    expect(screen.getByTestId('manual-order-price-issue')).toHaveTextContent(
      '100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200',
    );
    expect(btn('매수')).toBeEnabled();
    expectNoOrder();
  });
});
