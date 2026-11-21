import { describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, screen } from '@testing-library/react';
import {
  SETTLEMENT_ACCOUNTS,
  type SettlementAccKey,
  type SettlementAccountView,
} from '@gh-radar/shared';

import { ReflectBox, REFLECT_TEXT, defaultReflectOn, reflectPreviewLines } from '../reflect-box';
import { accLabel, ledgerFlowParts, ledgerKindLabel, personName } from '../settlement-format';

/**
 * Phase 44 — 「예수금에도 반영」 상자(⑩ · 44-07 T1).
 *
 * 잠그는 것(UI-SPEC ⑩ · 「문구 정본 — ⑨ 확인 · ⑩ 예수금 상자」 · 「플랜 단계 보강」 1원 미만):
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | 한 계좌 | kbG 8억 4,500만 · −1억 | 「KB 정근형 예수금 8억 4,500만 → 7억 4,500만」(새 값 600) |
 * | 미설정 | kyG null · +2,000만 | 「교보 정근형 예수금 미설정 → 2,000만」 |
 * | 1원 미만 | kbG 5,000만 · −1억 | belowOne · 「… 5,000만 → 0 이하라 보내지 않아요」(warn) |
 * | 두 계좌 | 옮김 kyH → kbG | SETTLEMENT_ACCOUNTS 순서로 두 줄 |
 * | 못 읽음(IN-08) | kbG stale | stale · 「… — 매매 서버에서 못 읽어 지금은 보내지 못해요」(warn) |
 * | 꺼짐 | on false | 「예수금은 그대로 둬요」 · 미리 보기 · 장중 줄 없음 |
 * | 장중 | on + marketHours | 「체결과 겹치면 어긋날 수 있어요」 |
 * | 스위치 | 클릭 | 접근 이름 「예수금에도 반영」 · onToggle(false) |
 * | 기본값(D-11) | 오늘 / 지난 날짜 | true / false |
 * | 흐름 글자 | 출자 · 옮김 · 수익 출금 | 사람 → 계좌 · 계좌 → 계좌 · 계좌 → 사람 |
 */

// 실패 메시지에 DOM 덤프를 붙이지 않는다 — 한 줄 메시지라 TAP 보고(RED 증거)가 깨지지 않는다.
configure({
  getElementError: (message) => {
    const e = new Error(message ?? '');
    e.name = 'TestingLibraryElementError';
    return e;
  },
});

function accountsWith(budgets: Partial<Record<SettlementAccKey, number | null>>): SettlementAccountView[] {
  return SETTLEMENT_ACCOUNTS.map((def) => {
    const b = def.key in budgets ? (budgets[def.key] ?? null) : 500_000_000;
    return {
      accKey: def.key,
      label: def.label,
      owner: def.owner,
      pool: def.pool,
      state: b === null ? 'unset' : 'known',
      budgetKrw: b,
      readAt: b === null ? null : '2026-11-20T05:32:00.000Z',
      mismatch: false,
    };
  });
}

describe('reflectPreviewLines', () => {
  it('한 계좌 감소 — 옛 값 · 새 값 · belowOne false', () => {
    const lines = reflectPreviewLines({ kbG: -100_000_000 }, accountsWith({ kbG: 845_000_000 }));
    expect(lines).toEqual([
      { accKey: 'kbG', label: 'KB 정근형', fromKrw: 845_000_000, toKrw: 745_000_000, belowOne: false, stale: false },
    ]);
  });

  it('미설정 계좌에 더하면 from 은 null · to 는 0 에서 더한 값', () => {
    const lines = reflectPreviewLines({ kyG: 20_000_000 }, accountsWith({ kyG: null }));
    expect(lines).toEqual([
      { accKey: 'kyG', label: '교보 정근형', fromKrw: null, toKrw: 20_000_000, belowOne: false, stale: false },
    ]);
  });

  it('새 예수금이 1원 미만이면 belowOne true', () => {
    const lines = reflectPreviewLines({ kbG: -100_000_000 }, accountsWith({ kbG: 50_000_000 }));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.belowOne).toBe(true);
    expect(lines[0]!.toKrw).toBe(-50_000_000);
  });

  it('새 예수금이 정확히 1원이면 보낸다(belowOne false) · 0 원이면 막는다', () => {
    expect(reflectPreviewLines({ kbG: -99 }, accountsWith({ kbG: 100 }))[0]!.belowOne).toBe(false);
    expect(reflectPreviewLines({ kbG: -100 }, accountsWith({ kbG: 100 }))[0]!.belowOne).toBe(true);
  });

  it('두 계좌 증감은 SETTLEMENT_ACCOUNTS 순서로 두 줄 · 0 인 계좌는 빠진다', () => {
    const lines = reflectPreviewLines(
      { kyH: 400_000_000, kbG: -400_000_000, kbH: 0 },
      accountsWith({ kbG: 845_000_000, kyH: 300_000_000 }),
    );
    expect(lines.map((l) => l.accKey)).toEqual(['kbG', 'kyH']);
    expect(lines[1]!.toKrw).toBe(700_000_000);
  });

  it('증감이 없으면 빈 배열', () => {
    expect(reflectPreviewLines({}, accountsWith({}))).toEqual([]);
  });
});

describe('defaultReflectOn (D-11)', () => {
  it('거래 날짜가 오늘이면 켜짐', () => {
    expect(defaultReflectOn('2026-11-20', '2026-11-20')).toBe(true);
  });
  it('지난 날짜면 꺼짐', () => {
    expect(defaultReflectOn('2026-11-19', '2026-11-20')).toBe(false);
  });
});

describe('ReflectBox', () => {
  // 테스트 안에서 만든다 — describe 본문에서 부르면 RED 때 파일 수집이 통째로 실패한다.
  const oneLine = () => reflectPreviewLines({ kbG: -100_000_000 }, accountsWith({ kbG: 845_000_000 }));

  it('켜짐 — 미리 보기 줄 「KB 정근형 예수금 8억 4,500만 → 7억 4,500만」 · 새 값 600', () => {
    const { container } = render(
      <ReflectBox on onToggle={() => {}} lines={oneLine()} marketHours={false} />,
    );
    const line = container.querySelector('[data-slot="reflect-line"]');
    expect(line?.textContent).toBe('KB 정근형 예수금 8억 4,500만 → 7억 4,500만');
    const strong = line?.querySelector('b');
    expect(strong?.textContent).toBe('7억 4,500만');
    expect(strong?.className).toContain('font-semibold');
    expect(screen.queryByText(REFLECT_TEXT.off)).toBeNull();
  });

  it('미설정이던 계좌 — 「교보 정근형 예수금 미설정 → 2,000만」', () => {
    const lines = reflectPreviewLines({ kyG: 20_000_000 }, accountsWith({ kyG: null }));
    const { container } = render(<ReflectBox on onToggle={() => {}} lines={lines} marketHours={false} />);
    expect(container.querySelector('[data-slot="reflect-line"]')?.textContent).toBe(
      '교보 정근형 예수금 미설정 → 2,000만',
    );
  });

  it('(IN-08) 못 읽어 마지막 값을 보이는(stale) 계좌 — 경고 색 「KB 정근형 예수금 8억 4,500만 — 매매 서버에서 못 읽어 지금은 보내지 못해요」', () => {
    const accounts = accountsWith({ kbG: 845_000_000 }).map((a) => (a.accKey === 'kbG' ? { ...a, state: 'stale' as const } : a));
    const lines = reflectPreviewLines({ kbG: -100_000_000 }, accounts);
    expect(lines[0]).toMatchObject({ accKey: 'kbG', fromKrw: 845_000_000, stale: true });
    const { container } = render(<ReflectBox on onToggle={() => {}} lines={lines} marketHours={false} />);
    const line = container.querySelector('[data-slot="reflect-line"]');
    expect(line?.textContent).toBe('KB 정근형 예수금 8억 4,500만 — 매매 서버에서 못 읽어 지금은 보내지 못해요');
    expect(line?.className).toContain('text-[var(--led-latent)]');
  });

  it('1원 미만 — 경고 색 「KB 정근형 예수금 5,000만 → 0 이하라 보내지 않아요」', () => {
    const lines = reflectPreviewLines({ kbG: -100_000_000 }, accountsWith({ kbG: 50_000_000 }));
    const { container } = render(<ReflectBox on onToggle={() => {}} lines={lines} marketHours={false} />);
    const line = container.querySelector('[data-slot="reflect-line"]');
    expect(line?.textContent).toBe('KB 정근형 예수금 5,000만 → 0 이하라 보내지 않아요');
    expect(line?.className).toContain('text-[var(--led-latent)]');
  });

  it('두 계좌 — 두 줄(첫 줄 mt-2 · 다음 줄 mt-1)', () => {
    const lines = reflectPreviewLines(
      { kbG: -400_000_000, kyH: 400_000_000 },
      accountsWith({ kbG: 845_000_000, kyH: 300_000_000 }),
    );
    const { container } = render(<ReflectBox on onToggle={() => {}} lines={lines} marketHours={false} />);
    const rows = container.querySelectorAll('[data-slot="reflect-line"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toBe('KB 정근형 예수금 8억 4,500만 → 4억 4,500만');
    expect(rows[1]!.textContent).toBe('교보 김현중 예수금 3억 → 7억');
    expect(rows[0]!.className).toContain('mt-2');
    expect(rows[1]!.className).toContain('mt-1');
  });

  it('켜짐인데 바뀌는 계좌가 없으면 줄 없음 · 「그대로 둬요」 도 없음', () => {
    const { container } = render(<ReflectBox on onToggle={() => {}} lines={[]} marketHours />);
    expect(container.querySelectorAll('[data-slot="reflect-line"]')).toHaveLength(0);
    expect(screen.queryByText(REFLECT_TEXT.off)).toBeNull();
    // 보낼 것이 없으면 스위치 줄만 — 장중 줄도 없다(E10 empty).
    expect(screen.queryByText(REFLECT_TEXT.market)).toBeNull();
  });

  it('꺼짐 — 「예수금은 그대로 둬요」 · 미리 보기 · 장중 줄 없음', () => {
    const { container } = render(<ReflectBox on={false} onToggle={() => {}} lines={oneLine()} marketHours />);
    expect(screen.getByText('예수금은 그대로 둬요')).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="reflect-line"]')).toHaveLength(0);
    expect(screen.queryByText('체결과 겹치면 어긋날 수 있어요')).toBeNull();
  });

  it('켜짐 + 장중 → 「체결과 겹치면 어긋날 수 있어요」(warn) / 장 밖 → 없음', () => {
    const { rerender } = render(<ReflectBox on onToggle={() => {}} lines={oneLine()} marketHours />);
    const warn = screen.getByText('체결과 겹치면 어긋날 수 있어요');
    expect(warn.className).toContain('text-[var(--led-latent)]');
    rerender(<ReflectBox on onToggle={() => {}} lines={oneLine()} marketHours={false} />);
    expect(screen.queryByText('체결과 겹치면 어긋날 수 있어요')).toBeNull();
  });

  it('스위치 — 접근 이름 「예수금에도 반영」 · 누르면 onToggle(false) · 미리 보기 aria-live polite', () => {
    const onToggle = vi.fn();
    const { container } = render(<ReflectBox on onToggle={onToggle} lines={oneLine()} marketHours={false} />);
    const sw = screen.getByRole('switch', { name: '예수금에도 반영' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('disabled 면 스위치가 눌리지 않는다', () => {
    const onToggle = vi.fn();
    render(<ReflectBox on onToggle={onToggle} lines={oneLine()} marketHours={false} disabled />);
    const sw = screen.getByRole('switch', { name: '예수금에도 반영' });
    expect((sw as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sw);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('settlement-format', () => {
  it('ledgerFlowParts — 출자 = 사람 → 받은 계좌', () => {
    expect(ledgerFlowParts({ kind: 'contribute', who: 'H', fromAcc: null, toAcc: 'kbG' })).toEqual({
      from: '김현중',
      to: 'KB 정근형',
    });
  });
  it('ledgerFlowParts — 계좌 옮김 = 보낸 계좌 → 받은 계좌', () => {
    expect(ledgerFlowParts({ kind: 'move', who: null, fromAcc: 'kbG', toAcc: 'kyH' })).toEqual({
      from: 'KB 정근형',
      to: '교보 김현중',
    });
  });
  it('ledgerFlowParts — 수익 출금 = 뺀 계좌 → 사람', () => {
    expect(ledgerFlowParts({ kind: 'withdraw_profit', who: 'J', fromAcc: 'kbH', toAcc: null })).toEqual({
      from: 'KB 김현중',
      to: '심쥬니',
    });
  });
  it('accLabel · personName · ledgerKindLabel — shared 상수 글자', () => {
    expect(accLabel('kyG')).toBe('교보 정근형');
    expect(personName('G')).toBe('정근형');
    expect(ledgerKindLabel('withdraw_principal')).toBe('원금 회수');
  });
});
