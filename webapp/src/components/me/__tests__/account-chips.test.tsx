import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { accountChipLabelOf } from '@/lib/account-label';
import type { MeAccountChoice } from '@/lib/trading-layout';

import { MeAccountChips } from '../account-chips';

/**
 * Phase 32 D-20 · S13 — /me 탭 위 계좌 칩. radiogroup · roving tabindex ·
 * ←/→/↑/↓ · Home/End = 포커스 + 선택(WAI-ARIA radio · IN-02) · 잠금이면 포커스만 ·
 * Enter/Space/클릭도 고른다 · 빈 목록 = 줄 없음 · 부분별 렌더(상품명 · 번호 · 서버키).
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

/** 제어 하네스 — 소비처(me-client · 작업대)처럼 onChange 에서 상태를 바꾼다. 스파이도 함께 부른다. */
function Controlled({ initial, spy }: { initial: string; spy: (accountNo: string) => void }) {
  const [accountNo, setAccountNo] = useState(initial);
  return (
    <MeAccountChips
      choices={CHOICES}
      accountNo={accountNo}
      onChange={(next) => {
        spy(next);
        setAccountNo(next);
      }}
    />
  );
}

/** 포커스 칩 = 선택 칩 = 유일한 탭 정지점. */
function expectFocusedSelected(i: number) {
  expect(chips()[i]).toHaveFocus();
  expect(chips()[i]).toHaveAttribute('aria-checked', 'true');
  expect(chips().filter((c) => c.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  expect(chips().map((c) => c.tabIndex)).toEqual(chips().map((_, j) => (j === i ? 0 : -1)));
}

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

  it('→ 키는 이웃 칩으로 포커스 + 선택(onChange 1회) — IN-02', async () => {
    const { onChange } = setup();
    chips()[0].focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(chips()[1]).toHaveFocus();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('8765-4321');
  });

  it('제어 — → 세 번은 차례로 고르며 끝에서 처음으로 돈다 · 포커스 칩 = 선택 칩 = 탭 정지점', async () => {
    const spy = vi.fn();
    render(<Controlled initial="1234-5678" spy={spy} />);
    chips()[0].focus();
    await userEvent.keyboard('{ArrowRight}');
    expectFocusedSelected(1);
    await userEvent.keyboard('{ArrowRight}');
    expectFocusedSelected(2);
    await userEvent.keyboard('{ArrowRight}');
    expectFocusedSelected(0);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['8765-4321', '5555-0001', '1234-5678']);
  });

  it('제어 — ← 는 반대편으로 돈다 · ↓/↑ 는 →/← 와 같다', async () => {
    const spy = vi.fn();
    render(<Controlled initial="1234-5678" spy={spy} />);
    chips()[0].focus();
    await userEvent.keyboard('{ArrowLeft}');
    expectFocusedSelected(2);
    await userEvent.keyboard('{ArrowDown}');
    expectFocusedSelected(0);
    await userEvent.keyboard('{ArrowDown}');
    expectFocusedSelected(1);
    await userEvent.keyboard('{ArrowUp}');
    expectFocusedSelected(0);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['5555-0001', '1234-5678', '8765-4321', '1234-5678']);
  });

  it('제어 — End/Home 은 끝/처음 칩 포커스 + 선택', async () => {
    const spy = vi.fn();
    render(<Controlled initial="8765-4321" spy={spy} />);
    chips()[1].focus();
    await userEvent.keyboard('{End}');
    expectFocusedSelected(2);
    await userEvent.keyboard('{Home}');
    expectFocusedSelected(0);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['5555-0001', '1234-5678']);
  });

  it('계좌 1개 — → 는 같은 칩 · onChange 0회', async () => {
    const onChange = vi.fn();
    render(<MeAccountChips choices={[CHOICES[0]]} accountNo={CHOICES[0].accountNo} onChange={onChange} />);
    chips()[0].focus();
    await userEvent.keyboard('{ArrowRight}{End}{Home}');
    expect(chips()[0]).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Enter 가 포커스 칩을 고른다 · Space 도', async () => {
    const { onChange } = setup();
    chips()[2].focus();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('5555-0001');
    chips()[1].focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith('8765-4321');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('locked — 화살표 · End · Home 은 포커스만 · onChange 0회 · 선택 그대로', async () => {
    const { onChange } = setup({ locked: true, lockedTitle: '잠김' });
    chips()[0].focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(chips()[1]).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(chips()[2]).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(chips()[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(chips()[2]).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    expect(chips()[0]).toHaveAttribute('aria-checked', 'true');
    expect(chips()[2]).toHaveAttribute('aria-checked', 'false');
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

  it('locked — Space 0회 · 화살표 포커스 이동은 허용 · 줄 흐림(opacity .45) / 풀리면 다시 고른다', async () => {
    const onChange = vi.fn();
    const view = render(
      <MeAccountChips choices={CHOICES} accountNo={CHOICES[0].accountNo} onChange={onChange} locked lockedTitle="잠김" />,
    );
    const group = screen.getByRole('radiogroup', { name: 'My page 계좌' });
    expect(group.className).toContain('opacity-[.45]');
    chips()[0].focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(chips()[1]).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(onChange).not.toHaveBeenCalled();
    expect(chips()[0]).toHaveAttribute('aria-checked', 'true');

    view.rerender(<MeAccountChips choices={CHOICES} accountNo={CHOICES[0].accountNo} onChange={onChange} />);
    expect(group).not.toHaveAttribute('aria-disabled');
    expect(group).not.toHaveAttribute('title');
    expect(group.className).not.toContain('opacity-[.45]');
    await userEvent.click(chips()[1]);
    expect(onChange).toHaveBeenCalledWith(CHOICES[1].accountNo);
  });

  it('locked — 칩마다 aria-disabled="true" · 잠금 title · disabled 속성 없음 · roving 유지 (quick-261017-bwt)', () => {
    const LOCK = '저장 중에는 계좌를 바꿀 수 없어요';
    setup({ locked: true, lockedTitle: LOCK });
    const group = screen.getByRole('radiogroup', { name: 'My page 계좌' });
    expect(group).toHaveAttribute('aria-disabled', 'true');
    expect(group).toHaveAttribute('title', LOCK);
    for (const chip of chips()) {
      expect(chip).toHaveAttribute('aria-disabled', 'true');
      expect(chip).toHaveAttribute('title', LOCK);
      expect(chip).not.toHaveAttribute('disabled');
    }
    expect(chips().map((c) => c.tabIndex)).toEqual([0, -1, -1]);
  });

  it('잠금 아님 — 어느 칩에도 aria-disabled · title 없음(그룹 title 이 hover 에 보인다 · quick-261017-bwt)', () => {
    setup({ title: '작업대 계좌 스코프' });
    expect(screen.getByRole('radiogroup', { name: 'My page 계좌' })).toHaveAttribute('title', '작업대 계좌 스코프');
    for (const chip of chips()) {
      expect(chip).not.toHaveAttribute('aria-disabled');
      expect(chip).not.toHaveAttribute('title');
    }
  });

  it('잠금 → 풀림 rerender — 칩의 aria-disabled · title 이 사라진다 (quick-261017-bwt)', () => {
    const onChange = vi.fn();
    const view = render(
      <MeAccountChips choices={CHOICES} accountNo={CHOICES[0].accountNo} onChange={onChange} locked lockedTitle="잠김" />,
    );
    expect(chips().every((c) => c.getAttribute('aria-disabled') === 'true' && c.title === '잠김')).toBe(true);
    view.rerender(<MeAccountChips choices={CHOICES} accountNo={CHOICES[0].accountNo} onChange={onChange} />);
    for (const chip of chips()) {
      expect(chip).not.toHaveAttribute('aria-disabled');
      expect(chip).not.toHaveAttribute('title');
    }
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
