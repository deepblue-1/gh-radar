import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { LaunchServer } from '@gh-radar/shared';

import { radioKeyTargetOf } from '@/lib/radio-keys';

import { LaunchServerChips } from '../launch-server-chips';

/**
 * quick-261107-iep — `/admin/launch` 발사 서버 칩(목업 D). radiogroup 「발사 서버」 · 레지스트리 순 KB120 → 교보119 →
 * 교보112 · roving tabindex · ←/→/↑/↓ · Home/End = 포커스 + 선택(끝에서 반대편으로 돈다) · 같은 칩 재클릭 무시.
 * 키보드 목표 칩 계산 `radioKeyTargetOf` 는 My page 계좌 칩과 한 벌이다.
 */

const chips = () => screen.getAllByRole('radio');

function setup(gw: LaunchServer = 'KB120') {
  const onGw = vi.fn();
  render(<LaunchServerChips gw={gw} onGw={onGw} />);
  return { onGw };
}

/** 제어 하네스 — 부모(LaunchClient)처럼 onGw 에서 값을 바꾼다. 스파이도 함께 부른다. */
function Controlled({ initial, spy }: { initial: LaunchServer; spy: (gw: LaunchServer) => void }) {
  const [gw, setGw] = useState<LaunchServer>(initial);
  return (
    <LaunchServerChips
      gw={gw}
      onGw={(next) => {
        spy(next);
        setGw(next);
      }}
    />
  );
}

function expectFocusedSelected(i: number) {
  expect(chips()[i]).toHaveFocus();
  expect(chips()[i]).toHaveAttribute('aria-checked', 'true');
  expect(chips().filter((c) => c.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  expect(chips().map((c) => c.tabIndex)).toEqual(chips().map((_, j) => (j === i ? 0 : -1)));
}

describe('radioKeyTargetOf — radio group 화살표 문법 한 벌', () => {
  it('→/↓ +1 (끝에서 0) · ←/↑ −1 (0 에서 끝) · Home 0 · End 끝 · 그 밖 null', () => {
    expect(radioKeyTargetOf('ArrowRight', 0, 3)).toBe(1);
    expect(radioKeyTargetOf('ArrowDown', 2, 3)).toBe(0);
    expect(radioKeyTargetOf('ArrowLeft', 0, 3)).toBe(2);
    expect(radioKeyTargetOf('ArrowUp', 2, 3)).toBe(1);
    expect(radioKeyTargetOf('Home', 2, 3)).toBe(0);
    expect(radioKeyTargetOf('End', 0, 3)).toBe(2);
    expect(radioKeyTargetOf('Enter', 0, 3)).toBeNull();
    expect(radioKeyTargetOf('a', 1, 3)).toBeNull();
    expect(radioKeyTargetOf('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('LaunchServerChips (quick-261107-iep · 목업 D)', () => {
  it('radiogroup 「발사 서버」 · 칩 3개 KB120 → 교보119 → 교보112 · 선택 칩 하나', () => {
    setup();
    expect(screen.getByRole('radiogroup', { name: '발사 서버' })).toHaveAttribute('data-slot', 'launch-server-chips');
    expect(chips().map((c) => c.textContent)).toEqual(['KB120', '교보119', '교보112']);
    expect(chips().map((c) => c.getAttribute('data-gw'))).toEqual(['KB120', 'KYOBO119', 'KYOBO112']);
    expect(chips().every((c) => c.getAttribute('data-slot') === 'launch-server-chip')).toBe(true);
    expect(chips().map((c) => c.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
  });

  it('roving tabindex — 선택 칩만 0', () => {
    setup('KYOBO119');
    expect(chips().map((c) => c.tabIndex)).toEqual([-1, 0, -1]);
    expect(chips()[1]).toHaveAttribute('aria-checked', 'true');
  });

  it('다른 칩 클릭 → onGw(키) 1회 · 선택 칩 재클릭 0회', async () => {
    const user = userEvent.setup();
    const { onGw } = setup('KB120');
    await user.click(chips()[0]!);
    expect(onGw).not.toHaveBeenCalled();
    await user.click(chips()[2]!);
    expect(onGw).toHaveBeenCalledTimes(1);
    expect(onGw).toHaveBeenCalledWith('KYOBO112');
  });

  it('→ 세 번이면 한 바퀴(교보112 → KB120 으로 돈다) · 포커스 = 선택', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial="KB120" spy={spy} />);
    chips()[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expectFocusedSelected(1);
    await user.keyboard('{ArrowRight}');
    expectFocusedSelected(2);
    await user.keyboard('{ArrowRight}');
    expectFocusedSelected(0);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['KYOBO119', 'KYOBO112', 'KB120']);
  });

  it('← 는 처음에서 끝으로 · Home/End', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial="KB120" spy={spy} />);
    chips()[0]!.focus();
    await user.keyboard('{ArrowLeft}');
    expectFocusedSelected(2);
    await user.keyboard('{Home}');
    expectFocusedSelected(0);
    await user.keyboard('{End}');
    expectFocusedSelected(2);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['KYOBO112', 'KB120', 'KYOBO112']);
  });

  it('그 밖 키는 아무것도 하지 않는다', async () => {
    const user = userEvent.setup();
    const { onGw } = setup('KB120');
    chips()[0]!.focus();
    await user.keyboard('a');
    expect(onGw).not.toHaveBeenCalled();
    expect(chips()[0]).toHaveFocus();
  });
});
