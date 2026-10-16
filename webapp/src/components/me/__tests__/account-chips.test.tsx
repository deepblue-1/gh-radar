import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { accountChipLabelOf } from '@/lib/account-label';
import type { MeAccountChoice } from '@/lib/trading-layout';

import { MeAccountChips } from '../account-chips';

/**
 * Phase 32 D-20 · S13 — /me 탭 위 계좌 칩. radiogroup · roving tabindex(←/→ 는 포커스만 · Home/End) ·
 * Enter/Space/클릭이 고른다 · 잠금 · 빈 목록 = 줄 없음 · 부분별 렌더(상품명 · 번호 · 서버키).
 */

const CHOICES: MeAccountChoice[] = [
  { accountNo: '1234-5678', name: '김알렉스', serverKey: 'KB120' },
  { accountNo: '8765-4321', name: '', serverKey: 'KYOBO119' },
  { accountNo: '5555-0001', name: '위탁CMA' },
];

function setup(props: Partial<Parameters<typeof MeAccountChips>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <MeAccountChips choices={CHOICES} accountNo="1234-5678" onChange={onChange} {...props} />,
  );
  return { onChange, ...utils };
}

const chips = () => screen.getAllByRole('radio');

describe('P32 MeAccountChips (D-20 · S13)', () => {
  it('radiogroup 이름 「My page 계좌」 · 칩 수 · 선택 칩 하나', () => {
    setup();
    expect(screen.getByRole('radiogroup', { name: 'My page 계좌' })).toBeInTheDocument();
    expect(chips()).toHaveLength(3);
    expect(chips().filter((c) => c.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    expect(chips()[0]).toHaveAttribute('aria-checked', 'true');
    expect(chips()[0]).toHaveAttribute('data-slot', 'me-account-chip');
    expect(chips()[0]).toHaveAttribute('data-account-no', '1234-5678');
  });

  it('칩 접근 이름 = accountChipLabelOf', () => {
    setup();
    CHOICES.forEach((c, i) => expect(chips()[i]).toHaveAccessibleName(accountChipLabelOf(c)));
    expect(chips()[0]).toHaveAccessibleName('김알렉스 1234-5678 KB120');
  });

  it('roving tabindex — 선택 칩만 0', () => {
    setup({ accountNo: '8765-4321' });
    expect(chips().map((c) => c.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('선택이 목록에 없으면 첫 칩이 탭 정지점 · 선택 칩 없음', () => {
    setup({ accountNo: '' });
    expect(chips().map((c) => c.tabIndex)).toEqual([0, -1, -1]);
    expect(chips().every((c) => c.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('다른 칩 클릭 → onChange 1회', async () => {
    const { onChange } = setup();
    await userEvent.click(chips()[2]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('5555-0001');
  });

  it('선택 칩 재클릭 → onChange 0회', async () => {
    const { onChange } = setup();
    await userEvent.click(chips()[0]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('→ 키는 포커스만 옮기고 onChange 0회 · 끝에서 처음으로 돈다', async () => {
    const { onChange } = setup();
    chips()[0].focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(chips()[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(chips()[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(chips()[2]).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Enter 가 포커스 칩을 고른다 · Space 도', async () => {
    const { onChange } = setup();
    chips()[0].focus();
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('8765-4321');
    await userEvent.keyboard('{ArrowRight} ');
    expect(onChange).toHaveBeenLastCalledWith('5555-0001');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('Home/End 는 처음/끝 칩 포커스', async () => {
    const { onChange } = setup({ accountNo: '8765-4321' });
    chips()[1].focus();
    await userEvent.keyboard('{End}');
    expect(chips()[2]).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(chips()[0]).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('locked — 클릭 · Enter 0회 + aria-disabled · title', async () => {
    const { onChange } = setup({ locked: true, lockedTitle: '저장 중에는 계좌를 바꿀 수 없어요' });
    const group = screen.getByRole('radiogroup', { name: 'My page 계좌' });
    expect(group).toHaveAttribute('aria-disabled', 'true');
    expect(group).toHaveAttribute('title', '저장 중에는 계좌를 바꿀 수 없어요');
    await userEvent.click(chips()[2]);
    chips()[1].focus();
    await userEvent.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('빈 목록 = 렌더 없음(높이 0)', () => {
    const { container } = render(<MeAccountChips choices={[]} accountNo="" onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('서버키 없는 계좌는 data-part="server" 0 · 상품명 없는 계좌는 번호만(+서버키)', () => {
    setup();
    const [a, b, c] = chips();
    expect(a.querySelector('[data-part="name"]')).toHaveTextContent('김알렉스');
    expect(a.querySelector('[data-part="no"]')).toHaveTextContent('1234-5678');
    expect(a.querySelector('[data-part="server"]')).toHaveTextContent('KB120');
    expect(b.querySelector('[data-part="name"]')).toBeNull();
    expect(b.querySelector('[data-part="no"]')).toHaveTextContent('8765-4321');
    expect(c.querySelector('[data-part="server"]')).toBeNull();
  });
});
