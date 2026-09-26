/**
 * Phase 20 Plan 03 Task 2 — 공용 키패드 바텀시트 `NumberPadSheet`.
 *
 * 잠그는 것 (D-13 · D-14c · D-15 · D-16 · D-17 · D-23 · D-05~D-07 · UI-SPEC §5 · 접근성 계약):
 *   ① body 포털 · role=dialog · aria-modal · 제목/설명
 *   ② 확정 버튼 = 「{필드명} 적용」(apply) / 「{필드명} 입력」(fill) — 단독 「확인」 없음
 *   ③ 첫 입력 대기(fresh) · 00 · 빈 값 잠금
 *   ④ 단위별 칩 · 시세 미수신 칩 비활성 · 조각 한도
 *   ⑤ 가격 검증 잠금(자동 보정 없음) · validate 문장
 *   ⑥ 반영 중 잠금(칩·키·닫기·Esc·바깥 누름) · 실패 · 다른 단말 · 감시 중 안내
 *   ⑦ 물리 키 · 포커스 복귀 · 접근성 이름
 *   ⑧ 금지: 스스로 전송하지 않는다 · 폭은 min() 한 식(뷰포트 브레이크포인트 0)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useRef } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NumberPadSheet, type NumberPadSheetProps } from '../number-pad-sheet';

type Overrides = Partial<Omit<NumberPadSheetProps, 'returnFocusRef'>>;

const BASE: Omit<NumberPadSheetProps, 'returnFocusRef' | 'onConfirm' | 'onClose'> = {
  open: true,
  title: '잔량',
  description: '잔량이 이 값보다 줄면 매수를 넣어요',
  unit: '주',
  purpose: 'apply',
  initialValue: 10_000,
  serverValue: 10_000,
  ctx: { current: 0, upper: 0 },
};

function Harness(p: NumberPadSheetProps & { rowLabel?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  return (
    <div data-testid="card">
      <button
        type="button"
        ref={(el) => {
          ref.current = el;
        }}
      >
        {p.rowLabel ?? '잔량 행'}
      </button>
      <NumberPadSheet {...p} returnFocusRef={ref} />
    </div>
  );
}

function setup(over: Overrides = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const props = { ...BASE, onConfirm, onClose, ...over } as NumberPadSheetProps;
  const user = userEvent.setup();
  const utils = render(<Harness {...props} />);
  const rerender = (next: Overrides) =>
    utils.rerender(<Harness {...({ ...props, ...next } as NumberPadSheetProps)} />);
  return { ...utils, user, onConfirm, onClose, rerender };
}

const sheet = () => document.querySelector('[data-slot="numpad-sheet"]') as HTMLElement | null;
const valueText = () => document.querySelector('[data-slot="numpad-value"]')?.textContent ?? null;
const statusLine = () => document.querySelector('[data-slot="numpad-status"]') as HTMLElement;
const confirmBtn = () => document.querySelector('[data-slot="numpad-confirm"]') as HTMLButtonElement;
const chip = (name: string) =>
  within(document.querySelector('[data-slot="numpad-chips"]') as HTMLElement).getByRole('button', { name });
const key = (name: string) =>
  within(screen.getByRole('group', { name: '숫자 키패드' })).getByRole('button', { name });

describe('NumberPadSheet — 구조 · 포털', () => {
  it('열리면 body 포털이고 렌더 컨테이너(카드 자리) 밖이다 · role=dialog · aria-modal · 제목 · 설명', () => {
    const { container } = setup();
    const el = sheet();
    expect(el).not.toBeNull();
    expect(document.body.contains(el)).toBe(true);
    expect(container.contains(el)).toBe(false);
    const dialog = screen.getByRole('dialog', { name: '잔량' });
    expect(dialog).toBe(el);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('잔량이 이 값보다 줄면 매수를 넣어요');
  });

  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    setup({ open: false });
    expect(sheet()).toBeNull();
  });

  it("purpose='apply' 확정 버튼은 「잔량 적용」 · 단독 「확인」 버튼 없음", () => {
    setup();
    expect(screen.getByRole('button', { name: '잔량 적용' })).toBe(confirmBtn());
    expect(screen.queryByRole('button', { name: '확인' })).toBeNull();
  });

  it("purpose='fill' · 제목 「가격」 → 「가격 입력」", () => {
    setup({ purpose: 'fill', title: '가격', unit: '원', initialValue: 98_100, serverValue: null });
    expect(screen.getByRole('button', { name: '가격 입력' })).toBe(confirmBtn());
    expect(screen.queryByRole('button', { name: '확인' })).toBeNull();
  });
});

describe('NumberPadSheet — 버퍼 · 첫 입력 대기(D-14c · D-16)', () => {
  it('열리자마자 현재 값이 선택 강조(fresh) 상태이고 첫 숫자 키가 값을 통째로 바꾼다', async () => {
    const { user } = setup();
    expect(valueText()).toBe('10,000');
    expect(document.querySelector('[data-slot="numpad-value"]')).toHaveAttribute('data-fresh', 'true');
    await user.click(key('5'));
    expect(valueText()).toBe('5');
    expect(document.querySelector('[data-slot="numpad-value"]')).toHaveAttribute('data-fresh', 'false');
  });

  it('「00」 첫 키 → 빈 값 → 확정 비활성 · 상태 줄 문구 없음', async () => {
    const { user } = setup();
    await user.click(key('0 두 번'));
    expect(valueText()).toBe('');
    expect(confirmBtn()).toBeDisabled();
    expect(statusLine().textContent).toBe('');
  });

  it('명시적 「0」 은 허용한다', async () => {
    const { user, onConfirm } = setup();
    await user.click(key('0'));
    expect(valueText()).toBe('0');
    expect(confirmBtn()).toBeEnabled();
    await user.click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledWith(0);
  });
});

describe('NumberPadSheet — 단축 칩(D-17)', () => {
  it('(주) 「+1,000」 on 10,000 → 11,000', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: '+1,000' }));
    expect(valueText()).toBe('11,000');
  });

  it('(원) 「현재가」 → 98,100 · 「상한가」 → 127,400', async () => {
    const { user } = setup({
      title: '매수가격',
      unit: '원',
      initialValue: 90_000,
      serverValue: 90_000,
      ctx: { current: 98_100, upper: 127_400 },
    });
    await user.click(screen.getByRole('button', { name: '현재가' }));
    expect(valueText()).toBe('98,100');
    await user.click(screen.getByRole('button', { name: '상한가' }));
    expect(valueText()).toBe('127,400');
  });

  it('(원) 시세 미수신(current 0) → 「현재가」 비활성', () => {
    setup({ title: '매수가격', unit: '원', initialValue: 90_000, ctx: { current: 0, upper: 127_400 } });
    expect(screen.getByRole('button', { name: '현재가' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '상한가' })).toBeEnabled();
  });

  it('(회, maxPieces 5) 칩 「10」 비활성', () => {
    setup({
      purpose: 'fill',
      title: '조각 수',
      unit: '회',
      initialValue: 3,
      serverValue: null,
      ctx: { current: 0, upper: 0, maxPieces: 5 },
    });
    expect(chip('10')).toBeDisabled();
    expect(chip('5')).toBeEnabled();
  });

  it('(만원) 칩 줄 = 1,000만원 · 5,000만원 · 1억원 더하기 · 전부 지우기 — 100 에서 「1,000만원 더하기」 → 1,100 (G-21-R3-3)', async () => {
    const { user } = setup({
      purpose: 'fill',
      title: '주문금액',
      unit: '만원',
      initialValue: 100,
      serverValue: null,
    });
    const names = within(document.querySelector('[data-slot="numpad-chips"]') as HTMLElement)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['1,000만원 더하기', '5,000만원 더하기', '1억원 더하기', '전부 지우기']);
    await user.click(chip('1,000만원 더하기'));
    expect(valueText()).toBe('1,100');
  });
});

describe('NumberPadSheet — 검증 잠금(D-15 · 자동 보정 없음)', () => {
  const PRICE: Overrides = {
    title: '매수가격',
    unit: '원',
    initialValue: 98_150,
    serverValue: 98_100,
    ctx: { current: 98_100, upper: 127_400 },
  };

  it('(원) 98,150 → 상태 줄 alert 「100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200」 + 확정 비활성 · 값은 그대로', () => {
    setup(PRICE);
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent(
      '100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200',
    );
    expect(confirmBtn()).toBeDisabled();
    expect(valueText()).toBe('98,150');
  });

  it('(원) 127,500 → 「상한가 127,400원을 넘을 수 없어요」', () => {
    setup({ ...PRICE, initialValue: 127_500 });
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent('상한가 127,400원을 넘을 수 없어요');
    expect(confirmBtn()).toBeDisabled();
    expect(valueText()).toBe('127,500');
  });

  it('validate 가 문장을 돌려주면 같은 자리(alert)에 그 문장 + 확정 비활성', async () => {
    const validate = vi.fn((v: number) => (v === 0 ? '매수주문 · 주문금액이 0원이에요' : null));
    const { user } = setup({ validate });
    expect(confirmBtn()).toBeEnabled();
    await user.click(key('0'));
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent('매수주문 · 주문금액이 0원이에요');
    expect(confirmBtn()).toBeDisabled();
  });
});

describe('NumberPadSheet — D-15a 호가 단위 잠금 강도(20-REVIEW WR-05)', () => {
  // ETF 25,005원 — 5원 단위가 유효할 수 있는 ETF 가격이지만 주식 표로는 50원 구간 위반이다.
  const ETF: Overrides = {
    title: '매수가격',
    unit: '원',
    initialValue: 25_005,
    serverValue: 25_000,
  };
  const SOFT = '주식 호가 단위(50원)와 달라요 · 가까운 값 25,000 / 25,050';

  it.each(['etp', 'unknown'] as const)(
    '%s → 호가 단위 위반은 잠그지 않는다 · 경고 한 줄(role=status) · 적용하면 그 값 그대로',
    async (tickRule) => {
      const { user, onConfirm } = setup({ ...ETF, ctx: { current: 25_000, upper: 32_500, tickRule } });
      const line = statusLine();
      expect(within(line).queryByRole('alert')).toBeNull();
      expect(within(line).getByRole('status')).toHaveTextContent(SOFT);
      expect(confirmBtn()).toBeEnabled();
      await user.click(confirmBtn());
      expect(onConfirm).toHaveBeenCalledWith(25_005);
    },
  );

  it('stock → 그대로 잠근다(D-15) · 경고 줄이 아니라 alert', () => {
    setup({ ...ETF, ctx: { current: 25_000, upper: 32_500, tickRule: 'stock' } });
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent(
      '50원 단위로 입력해 주세요 · 가까운 값 25,000 / 25,050',
    );
    expect(confirmBtn()).toBeDisabled();
  });

  it('etp 여도 상한가 초과는 잠근다', () => {
    setup({ ...ETF, initialValue: 32_550, ctx: { current: 25_000, upper: 32_500, tickRule: 'etp' } });
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent('상한가 32,500원을 넘을 수 없어요');
    expect(confirmBtn()).toBeDisabled();
  });
});

describe('NumberPadSheet — 전송 상태(D-05 · D-06 · D-07)', () => {
  it("status='busy' → 「반영 중…」 비활성 · 칩·키패드·「닫기」 비활성 · Esc 와 바깥 누름이 onClose 를 부르지 않는다", async () => {
    const { user, onClose } = setup({ status: 'busy' });
    expect(confirmBtn()).toHaveTextContent('반영 중…');
    expect(confirmBtn()).toBeDisabled();
    expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+1,000' })).toBeDisabled();
    for (const b of within(screen.getByRole('group', { name: '숫자 키패드' })).getAllByRole('button')) {
      expect(b).toBeDisabled();
    }
    await user.keyboard('{Escape}');
    const overlay = document.querySelector('[data-slot="numpad-overlay"]') as HTMLElement;
    await user.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet()).not.toBeNull();
  });

  it('반영 중에는 물리 숫자 키도 버퍼를 바꾸지 않는다', async () => {
    const { user } = setup({ status: 'busy' });
    await user.keyboard('7');
    expect(valueText()).toBe('10,000');
  });

  it('편집 중이면 Esc · 바깥 누름이 onClose 를 부른다', async () => {
    const { user, onClose } = setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("status='failed' + 「반영하지 못했어요」 → alert · 확정 「다시 시도」 활성 · 입력값 유지 · 누르면 같은 값으로 onConfirm", async () => {
    const { user, onConfirm, rerender } = setup();
    await user.click(key('5'));
    rerender({ status: 'busy' });
    rerender({ status: 'failed', failureText: '반영하지 못했어요' });
    expect(within(statusLine()).getByRole('alert')).toHaveTextContent('반영하지 못했어요');
    expect(confirmBtn()).toHaveTextContent('다시 시도');
    expect(confirmBtn()).toBeEnabled();
    expect(valueText()).toBe('5');
    await user.click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledWith(5);
  });

  it('열린 채 serverValue 가 10,000 → 12,000 이면 입력 버퍼 유지 · 「지금 12,000주」 · status 「다른 단말에서 바뀌었어요」', async () => {
    const { user, rerender } = setup();
    expect(document.querySelector('[data-slot="numpad-server"]')).toHaveTextContent('지금 10,000주');
    await user.click(key('7'));
    rerender({ serverValue: 12_000, initialValue: 12_000 });
    expect(valueText()).toBe('7');
    expect(document.querySelector('[data-slot="numpad-server"]')).toHaveTextContent('지금 12,000주');
    expect(within(statusLine()).getByRole('status')).toHaveTextContent('다른 단말에서 바뀌었어요');
  });

  it("purpose='fill' 이면 다른 단말 알림이 없다", () => {
    const { rerender } = setup({ purpose: 'fill', title: '수량' });
    rerender({ serverValue: 12_000 });
    expect(statusLine().textContent).toBe('');
  });

  it('armedNotice → status 「감시 중 — 적용하면 바로 반영돼요」 · 추가 확인 없이 onConfirm 한 번(D-05)', async () => {
    const { user, onConfirm } = setup({ armedNotice: true });
    expect(within(statusLine()).getByRole('status')).toHaveTextContent('감시 중 — 적용하면 바로 반영돼요');
    await user.click(key('5'));
    await user.click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(5);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('닫힌 뒤 다시 열면 그때의 initialValue 로 새로 시작한다(fresh)', async () => {
    const { user, rerender } = setup();
    await user.click(key('7'));
    rerender({ open: false });
    rerender({ open: true, initialValue: 20_000, serverValue: 20_000 });
    expect(valueText()).toBe('20,000');
    expect(statusLine().textContent).toBe('');
  });
});

describe('NumberPadSheet — 물리 키 · 포커스 · 접근성', () => {
  it("물리 키 '7' → Enter → onConfirm(7) · Backspace → 한 글자 지움", async () => {
    const { user, onConfirm } = setup();
    await user.keyboard('7');
    expect(valueText()).toBe('7');
    await user.keyboard('3');
    expect(valueText()).toBe('73');
    await user.keyboard('{Backspace}');
    expect(valueText()).toBe('7');
    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledWith(7);
  });

  it('열리면 초기 포커스는 시트 콘텐츠 컨테이너다', () => {
    setup();
    expect(document.activeElement).toBe(sheet());
  });

  it('「닫기」 → onClose · 닫힌 뒤 포커스가 returnFocusRef 요소(연 행)로 돌아간다', async () => {
    const { user, onClose, rerender } = setup();
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender({ open: false });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '잔량 행' })));
  });

  it('접근성 이름 — 키패드 그룹 「숫자 키패드」 · ⌫ 「한 글자 지우기」 · 「00」 「0 두 번」 · 「−1호가」 「1호가 내리기」', () => {
    setup({ title: '매수가격', unit: '원', initialValue: 90_000, ctx: { current: 98_100, upper: 127_400 } });
    const pad = screen.getByRole('group', { name: '숫자 키패드' });
    expect(within(pad).getAllByRole('button')).toHaveLength(12);
    expect(within(pad).getByRole('button', { name: '한 글자 지우기' })).toBeInTheDocument();
    expect(within(pad).getByRole('button', { name: '0 두 번' })).toHaveTextContent('00');
    expect(screen.getByRole('button', { name: '1호가 내리기' })).toHaveTextContent('−1호가');
    expect(screen.getByRole('button', { name: '1호가 올리기' })).toHaveTextContent('+1호가');
  });

  it('디스플레이는 aria-live=polite output 이다', () => {
    setup();
    const out = document.querySelector('[data-slot="numpad-display"]') as HTMLElement;
    expect(out.tagName).toBe('OUTPUT');
    expect(out).toHaveAttribute('aria-live', 'polite');
    expect(out).toHaveTextContent('10,000주');
  });
});

describe('NumberPadSheet — 금지 항목(소스 가드)', () => {
  const SRC = readFileSync(path.resolve(__dirname, '../number-pad-sheet.tsx'), 'utf8');

  it('스스로 전송하지 않는다 — relay·주문 경로를 import 하거나 부르지 않는다', () => {
    expect(SRC).not.toMatch(/\bsendOrder\b|\bsend\(|use-relay|relay-provider|useRelay/);
  });

  it('폭·위치는 min() 한 식 — 뷰포트 브레이크포인트 변형 0 · 입력칸 0', () => {
    expect(SRC).toContain('w-[min(440px,calc(100vw-20px))]');
    expect(SRC).not.toMatch(/(^|["'` ])(sm|md|lg|xl|2xl):/m);
    expect(SRC).not.toMatch(/<input/);
  });
});
