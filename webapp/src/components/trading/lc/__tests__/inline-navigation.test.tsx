import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RelayLcSetMsg, RelayLimitChaser, RelayLimitChaserInput } from '@gh-radar/shared';

/**
 * Phase 20 Plan 05 Task 2 — 폼 수준 인라인 내비게이션 (D-14 · D-14b · UI-SPEC §6 · A5 · A-P3).
 *
 * 잠그는 규칙:
 *   ① Tab / Shift+Tab = 저장 뒤 **같은 그룹**의 다음/이전 값 행 — 감시대상 · 값 없는 체크 행 · 기준선
 *      행은 건너뛰고, 그룹 끝이면 저장 후 편집 종료(`lcNavigableRows` 순서)
 *   ② D-14b 한 번 클릭 전환 — 편집 중 다른 값 행을 **한 번** 누르면 앞 값이 저장되고 그 행이 곧바로
 *      편집 모드다(pointerdown 캡처 기록 → blur 저장 뒤 이어받기)
 *   ③ 앞 행이 반영 중이어도 다음 행 편집은 열린다 — 확정 전송만 직렬화된다(D-14b 가 E4 loading 의
 *      「다른 행 클릭 무시」보다 우선)
 *   ④ 옮긴 뒤 도착한 실패는 앞 행에 링 + 말풍선으로 서고 포커스를 뺏지 않는다 · 값 글자는 서버 값 ·
 *      다시 누르면 실패한 입력값으로 열린다 · Esc 로 걷힌다(A-P3)
 *
 * ★ `userEvent` 로 실제 포인터 순서(pointerdown → mousedown → 포커스 이동/blur → mouseup → click)를
 *   재현한다 — `fireEvent.click` 은 blur 를 만들지 않아 D-14b 를 검증하지 못한다.
 * ★ 스텁 경계는 `limit-chaser-form.test.tsx` 와 같다(`useRelayContext` 의 `send` 하나).
 */

const sendMock = vi.fn();
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, send: sendMock }),
  };
});

import { LimitChaserForm, type LimitChaserFormProps } from '../../limit-chaser-form';

const ISIN = 'KR7086520004';
const ACCOUNT = '37728502101';
const INLINE_FAILED = '반영하지 못했어요 · Enter 로 다시 시도해 주세요';

function sentConfigs(): RelayLimitChaserInput[] {
  return sendMock.mock.calls
    .map(([msg]) => msg as RelayLcSetMsg)
    .filter((msg) => msg?.t === 'lc.set')
    .map((msg) => msg.cfg);
}

/** 매수만 켜진 살아 있는 전략 — `floor(50만원 / 130,000) = 3주` 라 무장 가능. */
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
    sellOrderQty: 76,
    sellQtyTrackBaseline: 41_200,
    sellEntryLatched: false,
    cancelQtyTrackBaseline: 0,
    cancelEntryLatched: false,
    buyEntryLatched: false,
    ...over,
  };
}

function props(over: Partial<LimitChaserFormProps> = {}): LimitChaserFormProps {
  return { isin: ISIN, accountNo: ACCOUNT, exchange: 'KRX', server: echo(), ...over };
}

/** 값 행(또는 체크 값 행의 값 버튼) — 편집 중이면 편집 래퍼다. */
const row = (id: string): HTMLElement => document.querySelector(`[data-lc-field="${id}"]`) as HTMLElement;
const rowText = (id: string): string | null =>
  document.querySelector(`[data-lc-field="${id}"] [data-slot="lc-row-value"]`)?.textContent ?? null;
const input = (id: string): HTMLInputElement | null => document.querySelector<HTMLInputElement>(`#${id}`);
/** 지금 열린 인라인 입력의 id — 없으면 null. */
const editingId = (): string | null =>
  document.querySelector<HTMLInputElement>('[data-slot="limit-chaser-form"] input')?.id ?? null;

function type(el: HTMLInputElement, value: string): void {
  act(() => {
    fireEvent.change(el, { target: { value } });
  });
}
function key(el: HTMLElement, k: string, init: Partial<KeyboardEventInit> = {}): void {
  act(() => {
    fireEvent.keyDown(el, { key: k, ...init });
  });
}

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockReturnValue(true);
});

describe('① Tab / Shift+Tab — 같은 그룹 안 값 행만 (D-14 · A5)', () => {
  it('매수주문: 비교가격 → Tab → 잔량(감시대상 건너뜀) → Tab → 체결 값 → Tab → 편집 종료 · 바꾸지 않은 행은 전송 0', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-watch-price'));
    expect(editingId()).toBe('lc-buy-watch-price');
    key(input('lc-buy-watch-price')!, 'Tab');
    expect(editingId()).toBe('lc-buy-watch-qty');
    key(input('lc-buy-watch-qty')!, 'Tab');
    expect(editingId()).toBe('lc-buy-min-trade-qty');
    key(input('lc-buy-min-trade-qty')!, 'Tab');
    expect(editingId()).toBeNull();
    expect(sentConfigs()).toHaveLength(0);
  });

  it('Tab 은 바꾼 행만 보낸다 — 비교가격 131000 Tab = 1회(buyWatchPrice) · 잔량 그대로 Tab = 추가 0', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-watch-price'));
    type(input('lc-buy-watch-price')!, '131000');
    key(input('lc-buy-watch-price')!, 'Tab');
    expect(sentConfigs()).toHaveLength(1);
    expect(sentConfigs()[0]!.buyWatchPrice).toBe(131_000);
    expect(editingId()).toBe('lc-buy-watch-qty');
    key(input('lc-buy-watch-qty')!, 'Tab');
    expect(sentConfigs()).toHaveLength(1);
  });

  it('Shift+Tab: 잔량 → 비교가격 · 그룹 첫 행에서 Shift+Tab = 편집 종료', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-watch-qty'));
    key(input('lc-buy-watch-qty')!, 'Tab', { shiftKey: true });
    expect(editingId()).toBe('lc-buy-watch-price');
    key(input('lc-buy-watch-price')!, 'Tab', { shiftKey: true });
    expect(editingId()).toBeNull();
  });

  it('가격 섹션: 매수가격 Tab → 주문금액 → Tab = 종료(다른 그룹으로 넘어가지 않는다)', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-order-price'));
    key(input('lc-buy-order-price')!, 'Tab');
    expect(editingId()).toBe('lc-buy-order-amount');
    key(input('lc-buy-order-amount')!, 'Tab');
    expect(editingId()).toBeNull();
  });

  it('그룹 끝에서 편집이 끝나면 포커스는 그 행으로 돌아온다', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-order-amount'));
    key(input('lc-buy-order-amount')!, 'Tab');
    expect(editingId()).toBeNull();
    expect(document.activeElement).toBe(row('lc-buy-order-amount'));
  });

  it('매도주문: 비교가격 → 호가잔량 → 잔량추적 → 체결 → 종료 (체크 값 행의 값만 · 기준선 행 건너뜀)', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props({ tab: 'sell', server: echo({ sellEntryLatched: true }) })} />);
    await user.click(row('lc-sell-watch-price'));
    const order: (string | null)[] = [editingId()];
    for (let i = 0; i < 4; i += 1) {
      const id = editingId();
      if (id === null) break;
      key(input(id)!, 'Tab');
      order.push(editingId());
    }
    expect(order).toEqual([
      'lc-sell-watch-price',
      'lc-sell-watch-qty',
      'lc-sell-qty-track-ratio',
      'lc-sell-min-trade-qty',
      null,
    ]);
  });

  it('위반 값(호가 단위)이면 Tab 도 저장·이동 없이 이유만 보인다 (D-15)', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props({ upperLimit: 169_000 })} />);
    await user.click(row('lc-buy-order-price'));
    type(input('lc-buy-order-price')!, '98150');
    key(input('lc-buy-order-price')!, 'Tab');
    expect(editingId()).toBe('lc-buy-order-price');
    expect(sentConfigs()).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent('100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200');
  });
});

describe('② 한 번 클릭 전환 (D-14b)', () => {
  it('매수가격 150000 입력 중 주문금액 행을 **한 번** 클릭 → lc.set 1회(150000) · 주문금액 포커스 + 전체 선택', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-order-price'));
    type(input('lc-buy-order-price')!, '150000');
    await user.click(row('lc-buy-order-amount'));
    expect(sentConfigs()).toHaveLength(1);
    expect(sentConfigs()[0]!.buyOrderPrice).toBe(150_000);
    const amount = input('lc-buy-order-amount');
    expect(amount).not.toBeNull();
    expect(document.activeElement).toBe(amount);
    expect(amount!.selectionStart).toBe(0);
    expect(amount!.selectionEnd).toBe(amount!.value.length);
    expect(input('lc-buy-order-price')).toBeNull();
  });

  it('click 이 떨어져도(pointerdown 기록 + blur 저장만) 그 행이 편집을 이어받는다 — 캡처 기록이 보험이다', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-order-price'));
    type(input('lc-buy-order-price')!, '150000');
    // 브라우저에서 blur 재렌더가 click 대상을 떼어낸 경우를 흉내 낸다 — click 이벤트 없이 끝난다.
    act(() => {
      fireEvent.pointerDown(row('lc-buy-order-amount'));
    });
    act(() => {
      fireEvent.blur(input('lc-buy-order-price')!);
    });
    expect(sentConfigs()).toHaveLength(1);
    expect(sentConfigs()[0]!.buyOrderPrice).toBe(150_000);
    expect(editingId()).toBe('lc-buy-order-amount');
  });

  it('체크 버튼 pointerdown 은 기록하지 않는다 — blur 뒤 편집 종료', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-watch-qty'));
    act(() => {
      fireEvent.pointerDown(screen.getByRole('checkbox', { name: '매수주문 체결' }));
    });
    act(() => {
      fireEvent.blur(input('lc-buy-watch-qty')!);
    });
    expect(editingId()).toBeNull();
  });

  it('값을 바꾸지 않았으면 전송 0 으로 옮겨 간다 — 다른 그룹 행도 한 번이다', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-order-price'));
    await user.click(row('lc-sweep-tick'));
    expect(editingId()).toBe('lc-sweep-tick');
    expect(sentConfigs()).toHaveLength(0);
  });

  it('위반 값을 둔 채 다른 행을 누르면 앞 값은 취소(A6)되고 그 행이 열린다', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props({ upperLimit: 169_000 })} />);
    await user.click(row('lc-buy-order-price'));
    type(input('lc-buy-order-price')!, '98150');
    await user.click(row('lc-buy-order-amount'));
    expect(sentConfigs()).toHaveLength(0);
    expect(editingId()).toBe('lc-buy-order-amount');
    expect(rowText('lc-buy-order-price')).toBe('130,000원');
  });

  it('편집 중 체크 버튼을 누르면 편집기는 열리지 않고 그 체크가 제 동작을 한다', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-watch-qty'));
    await user.click(screen.getByRole('checkbox', { name: '매수주문 체결' }));
    expect(editingId()).toBeNull();
    expect(sentConfigs()).toHaveLength(1);
    expect(sentConfigs()[0]!.buyTradeQtyEnabled).toBe(true);
  });
});

describe('③ 반영 중에도 다음 행 편집이 열린다 — 확정만 직렬화 (D-14b · UI-SPEC §6)', () => {
  it('매수가격 Enter(반영 중) → 주문금액 한 번 클릭 = 편집 열림 · 앞 행 aria-busy', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-order-price'));
    type(input('lc-buy-order-price')!, '150000');
    key(input('lc-buy-order-price')!, 'Enter');
    expect(input('lc-buy-order-price')!.readOnly).toBe(true);
    await user.click(row('lc-buy-order-amount'));
    expect(editingId()).toBe('lc-buy-order-amount');
    expect(row('lc-buy-order-price')).toHaveAttribute('aria-busy', 'true');
    expect(sentConfigs()).toHaveLength(1);
  });

  it('직렬화: 매수가격 반영 중 주문금액 20 Enter → 전송 1회 유지 → 매수가격 에코 + 답 증가 → 2회', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-order-price'));
    type(input('lc-buy-order-price')!, '150000');
    key(input('lc-buy-order-price')!, 'Enter');
    await user.click(row('lc-buy-order-amount'));
    type(input('lc-buy-order-amount')!, '20');
    key(input('lc-buy-order-amount')!, 'Enter');
    expect(sentConfigs()).toHaveLength(1);

    const next = echo({ buyOrderPrice: 150_000 });
    rerender(<LimitChaserForm {...props({ server: next, serverAnswerSeq: 0 })} />);
    rerender(<LimitChaserForm {...props({ server: next, serverAnswerSeq: 1 })} />);
    expect(sentConfigs()).toHaveLength(2);
    expect(sentConfigs()[1]!.buyOrderAmount).toBe(20);
    expect(sentConfigs()[1]!.buyOrderPrice).toBe(150_000);
  });

  it('매수가격 편집 중 ↑ → 「130,100」 (130,000 은 100원 호가 구간)', async () => {
    const user = userEvent.setup();
    render(<LimitChaserForm {...props()} />);
    await user.click(row('lc-buy-order-price'));
    key(input('lc-buy-order-price')!, 'ArrowUp');
    expect(input('lc-buy-order-price')!.value).toBe('130,100');
    expect(sentConfigs()).toHaveLength(0);
  });
});

describe('④ 옮긴 뒤 도착한 실패 (A-P3 · D-06 · T-20-14)', () => {
  async function failAfterMove() {
    const user = userEvent.setup();
    const srv = echo();
    const view = render(<LimitChaserForm {...props({ server: srv })} />);
    await user.click(row('lc-buy-order-price'));
    type(input('lc-buy-order-price')!, '150000');
    key(input('lc-buy-order-price')!, 'Tab');
    expect(editingId()).toBe('lc-buy-order-amount');
    // 거부 — 답 신호만 오르고 서버 값은 그대로다.
    view.rerender(<LimitChaserForm {...props({ server: srv, serverAnswerSeq: 1 })} />);
    return { user, ...view };
  }

  it('앞 행에 `--destructive` 링 + alert 「반영하지 못했어요 · Enter 로 다시 시도해 주세요」 · 값 글자는 서버 값 · 포커스는 그대로', async () => {
    await failAfterMove();
    expect(screen.getByText(INLINE_FAILED).closest('[role="alert"]')).not.toBeNull();
    expect(rowText('lc-buy-order-price')).toBe('130,000원');
    expect(row('lc-buy-order-price').className).toContain('var(--destructive)');
    expect(document.activeElement).toBe(input('lc-buy-order-amount'));
    // 새로 연 행은 영향이 없다.
    expect(input('lc-buy-order-amount')).not.toHaveAttribute('aria-invalid');
    expect(sentConfigs()).toHaveLength(1);
  });

  it('실패한 행을 다시 누르면 실패한 입력값 「150,000」으로 열리고 Esc 로 말풍선이 걷힌다 · 재전송 0', async () => {
    const { user } = await failAfterMove();
    await user.click(row('lc-buy-order-price'));
    expect(input('lc-buy-order-price')!.value).toBe('150,000');
    key(input('lc-buy-order-price')!, 'Escape');
    expect(input('lc-buy-order-price')).toBeNull();
    expect(screen.queryByText(INLINE_FAILED)).toBeNull();
    expect(rowText('lc-buy-order-price')).toBe('130,000원');
    expect(sentConfigs()).toHaveLength(1);
  });
});
