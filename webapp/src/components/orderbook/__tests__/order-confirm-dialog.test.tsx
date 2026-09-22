import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Phase 18 Plan 07 Task 3 — 주문확인 다이얼로그 확장 계약 (TRADE-07, E12).
 *
 * 잠그는 것:
 *   ① 제목이 주문 성격(매수/매도/예약매수/예약매도/정정/취소)을 그대로 말한다
 *   ② 정정 「원주문」 행 · 예약 「조각 수」 행 + `--new-bg` 예약 줄 · 시간외종가 주문유형/가격 값
 *   ③ 기본 포커스는 **취소/닫기** — 실행 버튼에 포커스가 가면 Enter 한 번에 주문이 나간다
 *   ④ 확정 연타 → `onConfirm` 1회
 *   ⑤ `DialogTitle`·`DialogDescription` 이 언제나 존재(a11y)
 */

import {
  OFFHOURS_PRICE_LABEL,
  OrderConfirmDialog,
  type NewOrderConfirmDetail,
  type OrderConfirmDetail,
} from '../order-confirm-dialog';

const NEW_BUY: NewOrderConfirmDetail = {
  mode: 'new',
  side: 'B',
  stockName: '한미반도체',
  code: '042700',
  accountNo: '12345678-01',
  exchange: 'KRX',
  price: 128_500,
  qty: 10,
};

function open(detail: OrderConfirmDetail, onConfirm = vi.fn()) {
  const onOpenChange = vi.fn();
  render(<OrderConfirmDialog detail={detail} onOpenChange={onOpenChange} onConfirm={onConfirm} />);
  return { onOpenChange, onConfirm, dialog: screen.getByTestId('order-confirm-dialog') };
}

/** dt 라벨 → 바로 뒤 dd 텍스트. */
function summaryValue(dialog: HTMLElement, label: string): string | null {
  const dt = Array.from(dialog.querySelectorAll('dt')).find((el) => el.textContent === label);
  return dt?.nextElementSibling?.textContent ?? null;
}

describe('OrderConfirmDialog — 제목 변형', () => {
  it.each([
    [{ ...NEW_BUY }, '매수 주문을 넣을까요?', '매수 주문'],
    [{ ...NEW_BUY, side: 'S' as const }, '매도 주문을 넣을까요?', '매도 주문'],
    [{ ...NEW_BUY, buttonMode: 'queued' as const }, '예약매수 주문을 넣을까요?', '예약매수 주문'],
    [
      { ...NEW_BUY, side: 'S' as const, buttonMode: 'queued' as const },
      '예약매도 주문을 넣을까요?',
      '예약매도 주문',
    ],
  ])('신규 %# → 제목·확정 버튼이 라벨을 잇는다', (detail, title, confirm) => {
    open(detail);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: confirm })).toBeInTheDocument();
  });

  it('정정은 「정정 주문을 넣을까요?」 + 「원주문」 행이 추가된다', () => {
    const { dialog } = open({
      mode: 'modify',
      side: 'B',
      stockName: '한미반도체',
      code: '042700',
      accountNo: '12345678-01',
      exchange: 'NXT',
      orgOrderNo: '3407000064',
      orgPrice: 128_500,
      orgQty: 100,
      price: 128_000,
      qty: 60,
    });
    expect(screen.getByRole('heading', { name: '정정 주문을 넣을까요?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '정정 주문' })).toBeInTheDocument();
    expect(summaryValue(dialog, '원주문')).toBe('3407000064 · 매수 128,500 × 100');
    expect(summaryValue(dialog, '가격')).toBe('128,000원');
    expect(summaryValue(dialog, '수량')).toBe('60주');
    expect(summaryValue(dialog, '주문금액')).toBe('7,680,000원');
    // 요약 행 순서(UI-SPEC 원문): 종목 · 계좌 · 거래소 · 원주문 · 주문유형 · 가격 · 수량 · 주문금액
    expect(Array.from(dialog.querySelectorAll('dt')).map((d) => d.textContent)).toEqual([
      '종목',
      '계좌',
      '거래소',
      '원주문',
      '주문유형',
      '가격',
      '수량',
      '주문금액',
    ]);
  });

  it('취소(폼 경로)는 「미체결 주문을 취소할까요?」 + 「취소 수량」 행 + 경고 문구 + 확정 「취소 주문」', () => {
    const { dialog } = open({
      mode: 'cancel',
      orderNo: '3407000064',
      side: 'B',
      stockName: '한미반도체',
      price: 128_500,
      unfilledQty: 40,
      code: '042700',
      accountNo: '12345678-01',
      exchange: 'KRX',
      orderQty: 100,
    });
    expect(screen.getByRole('heading', { name: '미체결 주문을 취소할까요?' })).toBeInTheDocument();
    expect(summaryValue(dialog, '원주문')).toBe('3407000064 · 매수 128,500 × 100');
    expect(summaryValue(dialog, '취소 수량')).toBe('40주 (미체결 잔량 전부)');
    expect(within(dialog).getByText('취소 수량은 미체결 잔량 전부예요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소 주문' })).toBeInTheDocument();
  });
});

describe('OrderConfirmDialog — 예약 · 시간외종가 요약', () => {
  it('예약구간이면 「조각 수 {N} (서버 상한 {max})」 행과 예약 안내 줄이 붙는다', () => {
    const { dialog } = open({
      ...NEW_BUY,
      buttonMode: 'queued' as const,
      pieceCount: 5,
      maxPieces: 10,
      confirmNote: '예약: 증권사 보관 후 09:00 처리',
    });
    expect(summaryValue(dialog, '조각 수')).toBe('5 (서버 상한 10)');
    const note = within(dialog).getByTestId('order-confirm-queued-note');
    expect(note).toHaveTextContent('예약: 증권사 보관 후 09:00 처리');
    expect(note.className).toContain('--new-bg');
    expect(note.className).toContain('--new-bd');
  });

  it('조각 수가 없으면 「조각 수」 행도 예약 줄도 없다', () => {
    const { dialog } = open(NEW_BUY);
    expect(summaryValue(dialog, '조각 수')).toBeNull();
    expect(within(dialog).queryByTestId('order-confirm-queued-note')).toBeNull();
    expect(summaryValue(dialog, '주문유형')).toBe('지정가 · 보통');
  });

  it('시간외종가면 주문유형 「시간외종가 · 가격 0 (KRX 세션)」 · 가격 「참고 종가 {가격}원」 · 주문금액 「종가 확정 후」', () => {
    const { dialog } = open({
      ...NEW_BUY,
      price: 0,
      orderType: 'offhours' as const,
      referencePrice: 128_700,
    });
    expect(summaryValue(dialog, '주문유형')).toBe('시간외종가 · 가격 0 (KRX 세션)');
    expect(summaryValue(dialog, '가격')).toBe('참고 종가 128,700원');
    expect(summaryValue(dialog, '주문금액')).toBe('종가 확정 후');
    // 시간외종가 버튼 라벨은 창과 무관하게 매수/매도다.
    expect(screen.getByRole('heading', { name: '매수 주문을 넣을까요?' })).toBeInTheDocument();
  });
});

describe('OrderConfirmDialog — 오조작 방어 (한 글자도 완화하지 않는다)', () => {
  it('초기 포커스가 취소 버튼이다', async () => {
    open({ ...NEW_BUY, buttonMode: 'queued' as const, pieceCount: 5, maxPieces: 10 });
    await waitFor(() => expect(screen.getByRole('button', { name: '취소' })).toHaveFocus());
  });

  it('Escape 로 닫힌다(onOpenChange(false))', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = open(NEW_BUY);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('배경(overlay) 클릭으로 닫힌다', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = open(NEW_BUY);
    const overlay = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement;
    expect(overlay).not.toBeNull();
    await user.pointer({ keys: '[MouseLeft]', target: overlay });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('확정 버튼을 두 번 빠르게 눌러도 onConfirm 은 1회다', async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    open(NEW_BUY, onConfirm);
    const ok = screen.getByRole('button', { name: '매수 주문' });
    await user.click(ok);
    await user.click(ok);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
  });

  const A11Y_CASES: OrderConfirmDetail[] = [
    NEW_BUY,
    { ...NEW_BUY, orderType: 'offhours' as const, price: 0 },
    {
      mode: 'modify',
      side: 'S',
      stockName: 'A',
      code: '000001',
      accountNo: '1',
      exchange: 'KRX',
      orgOrderNo: '1',
      orgPrice: 1,
      orgQty: 1,
      price: 1,
      qty: 1,
    },
    { mode: 'cancel', orderNo: '1', side: 'S', stockName: 'A', price: 1, unfilledQty: 1 },
    {
      mode: 'cancel',
      orderNo: '1',
      side: 'S',
      stockName: 'A',
      price: 1,
      unfilledQty: 1,
      accountNo: '1',
      exchange: 'KRX',
    },
  ];
  it.each(A11Y_CASES.map((d) => [d] as const))('DialogTitle·DialogDescription 이 항상 있다 (%#)', (detail) => {
    open(detail);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  it('종목명은 ellipsis 없이 wrap 된다(확인 화면이므로 전체 노출)', () => {
    const { dialog } = open({ ...NEW_BUY, stockName: '아주아주긴종목이름을가진우선주' });
    const dd = Array.from(dialog.querySelectorAll('dt')).find((d) => d.textContent === '종목')!
      .nextElementSibling as HTMLElement;
    expect(dd.className).not.toMatch(/truncate|text-ellipsis/);
    expect(dd.className).toMatch(/break-/);
  });
});

describe('OrderConfirmDialog — 가격 0 원주문 표기 (CR-01 표시 정합)', () => {
  it('가격 0(시간외종가) 원주문 취소 요약의 「원주문」 줄은 숫자 0 이 아니라 「시간외종가」 · 취소 수량은 잔량 그대로', () => {
    const { dialog } = open({
      mode: 'cancel',
      orderNo: '3407000077',
      side: 'B',
      stockName: '한미반도체',
      price: 0,
      unfilledQty: 40,
      code: '042700',
      accountNo: '12345678-01',
      exchange: 'KRX',
      orderQty: 100,
    });
    expect(OFFHOURS_PRICE_LABEL).toBe('시간외종가');
    expect(summaryValue(dialog, '원주문')).toBe(`3407000077 · 매수 ${OFFHOURS_PRICE_LABEL} × 100`);
    expect(summaryValue(dialog, '원주문')).not.toMatch(/(^|\s)0 ×/);
    expect(summaryValue(dialog, '취소 수량')).toBe('40주 (미체결 잔량 전부)');
  });
});
