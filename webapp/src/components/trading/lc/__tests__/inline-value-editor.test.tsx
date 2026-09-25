import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { InlineValueEditor, type InlineValueEditorProps } from '../inline-value-editor';

/**
 * Phase 20 Plan 05 Task 1 — 인라인 편집기 단독 계약 (D-14 · D-14a · D-14c · D-15 · UI-SPEC §6 · E4).
 *
 * 편집기를 `SettingRow` 없이 **단독**으로 그린다 — 행 배선(Tab 이동 · 한 번 클릭 전환 · 옮긴 뒤 실패)은
 * `inline-navigation.test.tsx` 가 폼 수준에서 잠근다.
 *
 * 잠그는 규칙:
 *   ① 마운트 즉시 포커스 + 전체 선택 — 첫 입력이 값을 덮는다(D-14c)
 *   ② ↑/↓ = 원은 한 호가 · 그 밖은 1 · 하한 0 · 캐럿 이동 없음(D-14)
 *   ③ Enter/Tab 에서 호가 단위·상한가·무장 불가 위반이면 저장 거부 + 이유 말풍선 · 자동 보정 없음(D-15)
 *   ④ 위반 값을 둔 채 포커스 이탈 = 취소(A6) · 빈 값 저장 = 0(E4 empty)
 *   ⑤ 반영 중 = readOnly · aria-busy · opacity .6 · sr-only 「반영 중…」 · 재저장 0(E4 loading)
 *   ⑥ 실패 문구 = 말풍선 · 다음 Enter 가 재시도(E4 error · D-06)
 *   ⑦ Tab/Shift+Tab = 저장 뒤 이동 콜백(D-14 · A5)
 *   ⑧ 9자리 상한(E4 long-text) · 안내 문구·저장 버튼 없음(D-14a)
 */

const onSave = vi.fn();
const onCancel = vi.fn();
const onNavigate = vi.fn();
const onDismiss = vi.fn();

function props(over: Partial<InlineValueEditorProps> = {}): InlineValueEditorProps {
  return {
    id: 'lc-test',
    label: '매수가격',
    unit: '원',
    initialValue: 127_400,
    onSave,
    onCancel,
    onNavigate,
    onDismiss,
    ...over,
  };
}

const input = (): HTMLInputElement => document.querySelector<HTMLInputElement>('#lc-test')!;
/** 키 하나 — `fireEvent` 는 `preventDefault` 되면 false 를 돌려준다. */
function key(k: string, init: Partial<KeyboardEventInit> = {}): boolean {
  let notPrevented = true;
  act(() => {
    notPrevented = fireEvent.keyDown(input(), { key: k, ...init });
  });
  return notPrevented;
}
function type(value: string): void {
  act(() => {
    fireEvent.change(input(), { target: { value } });
  });
}
function blur(): void {
  act(() => {
    fireEvent.blur(input());
  });
}
const alertText = (): string | null => screen.queryByRole('alert')?.textContent ?? null;

beforeEach(() => {
  onSave.mockReset();
  onCancel.mockReset();
  onNavigate.mockReset();
  onDismiss.mockReset();
});

describe('① 들어가자마자 전체 선택 (D-14c)', () => {
  it('마운트 즉시 입력 포커스 + 값 전체 선택', () => {
    render(<InlineValueEditor {...props()} />);
    expect(document.activeElement).toBe(input());
    expect(input().value).toBe('127,400');
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe(input().value.length);
  });

  it('첫 입력이 값을 덮어쓴다 — 「5」 한 글자면 버퍼는 「5」', async () => {
    const user = userEvent.setup();
    render(<InlineValueEditor {...props({ unit: '건', initialValue: 3 })} />);
    await user.keyboard('5');
    expect(input().value).toBe('5');
  });
});

describe('② ↑/↓ 스텝 (D-14)', () => {
  it('(원) 127,400 ↑ → 「127,500」 · 캐럿 이동 없음(preventDefault)', () => {
    render(<InlineValueEditor {...props()} />);
    expect(key('ArrowUp')).toBe(false);
    expect(input().value).toBe('127,500');
  });

  it('(원) 2,000 ↓ → 「1,999」 — 내릴 때는 v−1 의 호가 단위다', () => {
    render(<InlineValueEditor {...props({ initialValue: 2_000 })} />);
    expect(key('ArrowDown')).toBe(false);
    expect(input().value).toBe('1,999');
  });

  it('(주) 10,000 ↑ → 「10,001」 — 원 밖은 1 씩', () => {
    render(<InlineValueEditor {...props({ unit: '주', initialValue: 10_000 })} />);
    key('ArrowUp');
    expect(input().value).toBe('10,001');
  });

  it('(주) 0 ↓ → 「0」 — 하한 0 · preventDefault', () => {
    render(<InlineValueEditor {...props({ unit: '주', initialValue: 0 })} />);
    expect(key('ArrowDown')).toBe(false);
    expect(input().value).toBe('0');
  });

  it('↑↓ 는 버퍼만 바꾸고 저장하지 않는다 — 저장은 Enter 뿐 (T-20-10)', () => {
    render(<InlineValueEditor {...props()} />);
    key('ArrowUp');
    key('ArrowUp');
    expect(onSave).not.toHaveBeenCalled();
    key('Enter');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toBe(127_600);
  });
});

describe('③ 가격·무장 검증 — 저장 거부 + 이유 · 자동 보정 없음 (D-15)', () => {
  it('(원 · 상한 127,400) 「98150」 Enter → 저장 0 · 「100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200」 · 포커스 유지', () => {
    render(<InlineValueEditor {...props({ upperLimit: 127_400 })} />);
    type('98150');
    key('Enter');
    expect(onSave).not.toHaveBeenCalled();
    expect(alertText()).toBe('100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200');
    expect(document.activeElement).toBe(input());
    // 보정하지 않는다 — 버퍼는 사용자가 친 그대로다.
    expect(input().value).toBe('98,150');
    expect(input()).toHaveAttribute('aria-invalid', 'true');
  });

  it('(원 · 상한 127,400) 「127500」 Enter → 「상한가 127,400원을 넘을 수 없어요」', () => {
    render(<InlineValueEditor {...props({ upperLimit: 127_400 })} />);
    type('127500');
    key('Enter');
    expect(onSave).not.toHaveBeenCalled();
    expect(alertText()).toBe('상한가 127,400원을 넘을 수 없어요');
  });

  it('`validate` 가 문장을 돌려주면(무장 불가) Enter → 저장 0 + 그 문장', () => {
    const reason = '매수주문 · 시세를 받지 못해 매수가격이 0 이에요. 매수가격을 입력하면 켤 수 있어요.';
    render(<InlineValueEditor {...props({ validate: (v) => (v === 0 ? reason : null) })} />);
    type('0');
    key('Enter');
    expect(onSave).not.toHaveBeenCalled();
    expect(alertText()).toBe(reason);
  });

  it('이유를 본 뒤 값을 고치면 이유가 걷히고 Enter 가 저장한다', () => {
    render(<InlineValueEditor {...props({ upperLimit: 127_400 })} />);
    type('98150');
    key('Enter');
    expect(alertText()).not.toBeNull();
    type('98100');
    expect(alertText()).toBeNull();
    key('Enter');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toBe(98_100);
  });

  it('검증 이유와 실패 문구가 함께 있으면 검증 이유가 먼저다', () => {
    render(<InlineValueEditor {...props({ upperLimit: 127_400, failureText: '반영하지 못했어요 · Enter 로 다시 시도해 주세요' })} />);
    type('127500');
    key('Enter');
    expect(alertText()).toBe('상한가 127,400원을 넘을 수 없어요');
  });
});

describe('④ 포커스 이탈 · 빈 값 (A6 · E4 empty)', () => {
  it('위반 값을 둔 채 포커스 이탈 → onCancel 1회 · onSave 0 (A6)', () => {
    render(<InlineValueEditor {...props({ upperLimit: 127_400 })} />);
    type('98150');
    blur();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('정상 값 포커스 이탈 → onSave(값, "blur")', () => {
    render(<InlineValueEditor {...props({ upperLimit: 127_400 })} />);
    type('98100');
    blur();
    expect(onSave).toHaveBeenCalledWith(98_100, 'blur');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('빈 값 Enter → onSave(0) — 서버 계약상 빈 값 = 0', () => {
    render(<InlineValueEditor {...props({ unit: '주', initialValue: 10_000 })} />);
    type('');
    key('Enter');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toBe(0);
  });

  it('Esc → onCancel · 저장 0', () => {
    render(<InlineValueEditor {...props()} />);
    type('130000');
    key('Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('⑤ 반영 중 (E4 loading)', () => {
  it('busy → readOnly · aria-busy · 값 opacity-60 · sr-only 「반영 중…」(화면 문구 없음)', () => {
    render(<InlineValueEditor {...props({ busy: true })} />);
    expect(input().readOnly).toBe(true);
    expect(input()).toHaveAttribute('aria-busy', 'true');
    expect(input().className).toContain('opacity-60');
    const live = screen.getByText('반영 중…');
    expect(live.className).toContain('sr-only');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('busy 면 타이핑·↑↓ 를 무시하고 포커스 이탈이 다시 저장하지 않는다', () => {
    render(<InlineValueEditor {...props({ busy: true })} />);
    type('999');
    key('ArrowUp');
    expect(input().value).toBe('127,400');
    blur();
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('⑥ 실패 재시도 (E4 error · D-06)', () => {
  it('failureText → alert 말풍선 · 다음 Enter 가 onSave 를 다시 부른다(재시도)', () => {
    const { rerender } = render(<InlineValueEditor {...props()} />);
    type('130000');
    key('Enter');
    expect(onSave).toHaveBeenCalledTimes(1);
    rerender(<InlineValueEditor {...props({ failureText: '반영하지 못했어요 · Enter 로 다시 시도해 주세요' })} />);
    expect(alertText()).toBe('반영하지 못했어요 · Enter 로 다시 시도해 주세요');
    expect(document.activeElement).toBe(input());
    key('Enter');
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1]![0]).toBe(130_000);
  });
});

describe('⑦ Tab / Shift+Tab (D-14 · A5)', () => {
  it('Tab → onSave(값, "tab") 뒤 onNavigate("next") · preventDefault', () => {
    render(<InlineValueEditor {...props({ unit: '주', initialValue: 10_000 })} />);
    type('9000');
    expect(key('Tab')).toBe(false);
    expect(onSave).toHaveBeenCalledWith(9_000, 'tab');
    expect(onNavigate).toHaveBeenCalledWith('next');
    expect(onSave.mock.invocationCallOrder[0]!).toBeLessThan(onNavigate.mock.invocationCallOrder[0]!);
  });

  it('Shift+Tab → onSave 뒤 onNavigate("prev") · preventDefault', () => {
    render(<InlineValueEditor {...props({ unit: '주', initialValue: 10_000 })} />);
    expect(key('Tab', { shiftKey: true })).toBe(false);
    expect(onSave).toHaveBeenCalledWith(10_000, 'tab');
    expect(onNavigate).toHaveBeenCalledWith('prev');
  });

  it('위반 값이면 Tab 도 저장·이동 없이 이유만 보인다', () => {
    render(<InlineValueEditor {...props({ upperLimit: 127_400 })} />);
    type('98150');
    expect(key('Tab')).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(alertText()).toBe('100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200');
  });

  it('이미 저장한 버퍼(반영 중)에서 Tab 은 다시 저장하지 않고 이동만 한다', () => {
    const { rerender } = render(<InlineValueEditor {...props()} />);
    type('130000');
    key('Enter');
    rerender(<InlineValueEditor {...props({ busy: true })} />);
    key('Tab');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('next');
  });
});

describe('CR-01 — 필드 범위(relay 스키마) 밖 값은 저장하지 않는다 · 빈 값(=0)도 검사한다', () => {
  it('매도비율(1~100) 칸을 비우고 Enter — 0 을 보내지 않고 「1% 이상 입력해 주세요」', () => {
    render(<InlineValueEditor {...props({ label: '매도비율', unit: '%', initialValue: 100, min: 1, max: 100 })} />);
    type('');
    key('Enter');
    expect(onSave).not.toHaveBeenCalled();
    expect(alertText()).toBe('1% 이상 입력해 주세요');
  });

  it('잔량추적(1~90) 91 은 Enter/Tab 모두 저장 거부 · 90 은 저장', () => {
    render(<InlineValueEditor {...props({ label: '잔량추적', unit: '%', initialValue: 50, min: 1, max: 90 })} />);
    type('91');
    key('Enter');
    key('Tab');
    expect(onSave).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(alertText()).toBe('최대 90%까지 입력할 수 있어요');
    type('90');
    key('Enter');
    expect(onSave).toHaveBeenCalledWith(90, 'enter');
  });

  it('호가변경(0~255) 256 을 둔 채 포커스 이탈 = 취소(A6) · 전송 없음', () => {
    render(<InlineValueEditor {...props({ label: '호가변경', unit: '건', initialValue: 3, min: 0, max: 255 })} />);
    type('256');
    blur();
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('범위가 0 을 허용하는 필드(호가변경)는 빈 값 저장 = 0 그대로다', () => {
    render(<InlineValueEditor {...props({ label: '호가변경', unit: '건', initialValue: 3, min: 0, max: 255 })} />);
    type('');
    key('Enter');
    expect(onSave).toHaveBeenCalledWith(0, 'enter');
  });
});

describe('⑧ 9자리 · 무안내 (E4 long-text · D-14a)', () => {
  it('10번째 숫자 입력은 무시한다 — 9자리 상한', () => {
    render(<InlineValueEditor {...props({ unit: '주', initialValue: 0 })} />);
    type('123456789');
    expect(input().value).toBe('123,456,789');
    type('1234567890');
    expect(input().value).toBe('123,456,789');
  });

  it('입력칸은 9ch · nowrap 이고 편집기 DOM 에 버튼 · 「Enter」「Esc」「저장」 안내가 없다', () => {
    const { container } = render(<InlineValueEditor {...props()} />);
    expect(input().className).toContain('w-[9ch]');
    expect((input().parentElement as HTMLElement).className).toContain('whitespace-nowrap');
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.textContent).not.toContain('Enter');
    expect(container.textContent).not.toContain('Esc');
    expect(container.textContent).not.toContain('저장');
  });
});

describe('③-2 D-15a — ETP·분류 불명은 호가 단위 위반을 경고만 한다 (20-REVIEW WR-05)', () => {
  const SOFT = '주식 호가 단위(50원)와 달라요 · 가까운 값 25,000 / 25,050';
  const statusText = (): string | null => screen.queryByRole('status')?.textContent ?? null;

  it.each(['etp', 'unknown'] as const)(
    '%s — 「25005」 입력 중 경고 말풍선(role=status · aria-invalid 없음) → Enter 저장 25,005',
    (tickRule) => {
      render(<InlineValueEditor {...props({ upperLimit: 32_500, tickRule })} />);
      type('25005');
      expect(alertText()).toBeNull();
      expect(statusText()).toBe(SOFT);
      expect(input()).not.toHaveAttribute('aria-invalid');
      key('Enter');
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[0]![0]).toBe(25_005);
    },
  );

  it('etp — 위반 값을 둔 채 포커스 이탈도 저장이다(취소 아님)', () => {
    render(<InlineValueEditor {...props({ upperLimit: 32_500, tickRule: 'etp' })} />);
    type('25005');
    blur();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith(25_005, 'blur');
  });

  it('stock — 그대로 잠근다(D-15)', () => {
    render(<InlineValueEditor {...props({ upperLimit: 32_500, tickRule: 'stock' })} />);
    type('25005');
    key('Enter');
    expect(onSave).not.toHaveBeenCalled();
    expect(alertText()).toBe('50원 단위로 입력해 주세요 · 가까운 값 25,000 / 25,050');
  });

  it('etp 여도 상한가 초과는 잠근다', () => {
    render(<InlineValueEditor {...props({ upperLimit: 32_500, tickRule: 'etp' })} />);
    type('32550');
    key('Enter');
    expect(onSave).not.toHaveBeenCalled();
    expect(alertText()).toBe('상한가 32,500원을 넘을 수 없어요');
  });
});
