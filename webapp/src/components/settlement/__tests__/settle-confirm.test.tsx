import { describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { CONFIRM_TEXT, SettleConfirm, cancelConfirmText, deleteConfirmText } from '../settle-confirm';
import type { ReflectLine } from '../reflect-box';

/**
 * Phase 44 — 「거래 지우기」 · 「정산 취소」 확인 창(⑨ · 44-07 T2).
 *
 * 잠그는 것(UI-SPEC ⑨ · Copywriting Contract Destructive confirmation · 「문구 정본 — ⑨」 · E9):
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | 지우기 문단 | 9/13 옮김 kbG → kyH 4억 | 「9/13 · KB 정근형 → 교보 김현중 · 계좌 옮김 **4억**」 + 「이 거래를 지워요. …」 |
 * | 취소 문단 | 11/19 p1 +10억 4,900만 · 바로 출금 2건 | 「11/19 현중 · 근형 정산 **+10억 4,900만** 을 취소해요. … 2건도 함께 사라져요.」 |
 * | 취소 문단 0건 | outCount 0 | 마지막 문장 없음 |
 * | 창 | open | role alertdialog · × 없음 · 「닫기」(secondary) · 확정(destructive) |
 * | 상자 | reflect null / 있음 | 스위치 없음 / ReflectBox |
 * | 비행 중 | busy | 두 버튼 비활성 · 확정 aria-busy · Esc 로 안 닫힘 |
 * | 실패 | error | role alert 줄 |
 * | 확정 잠금 | confirmDisabled | 확정만 비활성 |
 */

// 실패 메시지에 DOM 덤프를 붙이지 않는다 — 한 줄 메시지라 TAP 보고(RED 증거)가 깨지지 않는다.
configure({
  getElementError: (message) => {
    const e = new Error(message ?? '');
    e.name = 'TestingLibraryElementError';
    return e;
  },
});

const NOW = '2026-11-20T05:00:00.000Z';

const MOVE_ROW = {
  txDate: '2026-09-13',
  kind: 'move' as const,
  who: null,
  fromAcc: 'kbG' as const,
  toAcc: 'kyH' as const,
  amountKrw: 400_000_000,
};

const SETTLE = {
  pool: 'p1' as const,
  profitKrw: 1_049_000_000,
  createdAt: '2026-11-19T05:30:00.000Z',
};

function renderNode(node: ReactNode) {
  return render(<div data-testid="host">{node}</div>);
}

const LINE: ReflectLine = { accKey: 'kbG', label: 'KB 정근형', fromKrw: 745_000_000, toKrw: 845_000_000, belowOne: false, stale: false };

interface Overrides {
  reflect?: { on: boolean; onToggle: (n: boolean) => void; lines: ReflectLine[]; marketHours: boolean } | null;
  busy?: boolean;
  error?: string | null;
  confirmDisabled?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
}

function renderConfirm(o: Overrides = {}) {
  const onClose = o.onClose ?? vi.fn();
  const onConfirm = o.onConfirm ?? vi.fn();
  render(
    <SettleConfirm
      open
      title={CONFIRM_TEXT.deleteTitle}
      body={deleteConfirmText(MOVE_ROW, NOW)}
      confirmLabel={CONFIRM_TEXT.delete}
      reflect={o.reflect ?? null}
      busy={o.busy ?? false}
      error={o.error ?? null}
      confirmDisabled={o.confirmDisabled ?? false}
      onClose={onClose}
      onConfirm={onConfirm}
    />,
  );
  return { onClose, onConfirm };
}

describe('deleteConfirmText', () => {
  it('「9/13 · KB 정근형 → 교보 김현중 · 계좌 옮김 4억」 · 금액 굵게 · 둘째 문단 흐림', () => {
    renderNode(deleteConfirmText(MOVE_ROW, NOW));
    const ps = screen.getByTestId('host').querySelectorAll('p');
    expect(ps).toHaveLength(2);
    expect(ps[0]!.textContent).toBe('9/13 · KB 정근형 → 교보 김현중 · 계좌 옮김 4억');
    expect(ps[0]!.querySelector('b')?.textContent).toBe('4억');
    expect(ps[1]!.textContent).toBe('이 거래를 지워요. 넣은 돈 · 몫 계산에서 빠져요.');
    expect(ps[1]!.className).toContain('text-[var(--muted-fg)]');
  });

  it('출자 — 「사람 → 계좌」 흐름', () => {
    renderNode(
      deleteConfirmText(
        { txDate: '2026-10-02', kind: 'contribute', who: 'H', fromAcc: null, toAcc: 'kbG', amountKrw: 59_500_000 },
        NOW,
      ),
    );
    expect(screen.getByTestId('host').querySelector('p')?.textContent).toBe('10/2 · 김현중 → KB 정근형 · 출자 5,950만');
  });
});

describe('cancelConfirmText', () => {
  it('바로 출금 2건 — 세 문장', () => {
    renderNode(cancelConfirmText(SETTLE, 2, NOW));
    const host = screen.getByTestId('host');
    expect(host.textContent).toBe(
      '11/19 현중 · 근형 정산 +10억 4,900만 을 취소해요. 이 수익은 「정산 전 수익」 으로 돌아가요. 그날 「바로 출금」 2건도 함께 사라져요.',
    );
    expect(host.querySelector('b')?.textContent).toBe('+10억 4,900만');
  });

  it('바로 출금 0건 — 마지막 문장 없음', () => {
    renderNode(cancelConfirmText(SETTLE, 0, NOW));
    expect(screen.getByTestId('host').textContent).toBe(
      '11/19 현중 · 근형 정산 +10억 4,900만 을 취소해요. 이 수익은 「정산 전 수익」 으로 돌아가요.',
    );
  });

  it('날짜는 정산 createdAt 의 KST 날짜 — UTC 11/19 16:00 은 KST 11/20', () => {
    renderNode(cancelConfirmText({ ...SETTLE, pool: 'p2', createdAt: '2026-11-19T16:00:00.000Z' }, 0, NOW));
    expect(screen.getByTestId('host').textContent?.startsWith('11/20 쥬니 정산 ')).toBe(true);
  });
});

describe('SettleConfirm', () => {
  it('alertdialog · 제목 · × 없음 · 「닫기」(secondary) · 확정(destructive)', () => {
    renderConfirm();
    const dlg = screen.getByRole('alertdialog');
    expect(dlg.getAttribute('data-slot')).toBe('settle-confirm');
    expect(screen.getByText('거래 지우기')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    const close = screen.getByRole('button', { name: '닫기' });
    const ok = screen.getByRole('button', { name: '지우기' });
    expect(close.getAttribute('data-variant')).toBe('secondary');
    expect(ok.getAttribute('data-variant')).toBe('destructive');
  });

  it('하단 구분선은 hairline --border-subtle(색 없는 border-t 가 currentColor 로 그려지지 않게 · 44-UI-REVIEW 4)', () => {
    renderConfirm();
    const footer = screen.getByRole('alertdialog').querySelector('[data-slot="dialog-footer"]');
    expect(footer?.className).toContain('border-t');
    expect(footer?.className).toContain('border-[var(--border-subtle)]');
  });

  it('확정 · 닫기 누르면 onConfirm · onClose', () => {
    const { onClose, onConfirm } = renderConfirm();
    fireEvent.click(screen.getByRole('button', { name: '지우기' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reflect null 이면 상자 없음', () => {
    renderConfirm({ reflect: null });
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('reflect 있으면 「예수금에도 반영」 상자 · 되돌릴 값 미리 보기', () => {
    const onToggle = vi.fn();
    renderConfirm({ reflect: { on: true, onToggle, lines: [LINE], marketHours: false } });
    const sw = screen.getByRole('switch', { name: '예수금에도 반영' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('7억 4,500만')).toBeTruthy();
    fireEvent.click(sw);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('busy — 두 버튼 비활성 · 확정 aria-busy · Esc 로 닫히지 않음 · 스위치 잠김', () => {
    const { onClose } = renderConfirm({
      busy: true,
      reflect: { on: true, onToggle: vi.fn(), lines: [LINE], marketHours: false },
    });
    const close = screen.getByRole('button', { name: '닫기' }) as HTMLButtonElement;
    const ok = screen.getByRole('button', { name: '지우기' }) as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    expect(ok.disabled).toBe(true);
    expect(ok.getAttribute('aria-busy')).toBe('true');
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('busy 아니면 Esc = 닫기', () => {
    const { onClose } = renderConfirm();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('error — role alert 줄', () => {
    renderConfirm({ error: `${CONFIRM_TEXT.deleteFailed} · 서버 오류` });
    expect(screen.getByRole('alert').textContent).toBe('지우지 못했어요 · 서버 오류');
  });

  it('confirmDisabled — 확정만 비활성 · 닫기는 그대로', () => {
    renderConfirm({ confirmDisabled: true });
    expect((screen.getByRole('button', { name: '지우기' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '닫기' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('정산 취소 문구 · 실패 문구 상수', () => {
    expect(CONFIRM_TEXT.cancelTitle).toBe('정산 취소');
    expect(CONFIRM_TEXT.cancel).toBe('정산 취소');
    expect(CONFIRM_TEXT.cancelFailed).toBe('정산을 취소하지 못했어요');
    expect(CONFIRM_TEXT.close).toBe('닫기');
  });
});
