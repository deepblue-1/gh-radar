import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { CandleUnitMenu } from '../candle-unit-menu';
import type { CandleUnitPref } from '@/lib/ticks/candle-prefs';
import type { CandleUnit } from '@/lib/ticks/candle-chart';

/**
 * Phase 42 · D-09 · D-23 · UI-SPEC S2 — 봉 단위 메뉴(버튼 + 펼침 목록).
 *
 * 깨지면: 봉 단위를 못 바꾸거나, 「자동」 일 때 지금 단위가 안 보이거나, 목록에서 Space 가 틱 재생을 켠다
 * (목록 줄이 BUTTON 이 아니면 window 키 가로채기가 Space 를 재생 키로 먹는다 — Pitfall 11).
 */

function mount(value: CandleUnitPref, current: CandleUnit = 5, phone = false) {
  const onChange = vi.fn();
  render(<CandleUnitMenu value={value} current={current} onChange={onChange} phone={phone} />);
  const button = document.querySelector<HTMLButtonElement>('[data-slot="candle-unit-button"]')!;
  return { onChange, button };
}

const list = () => screen.getByRole('radiogroup', { name: '봉 단위' });
const row = (name: RegExp) => within(list()).getByRole('radio', { name });

describe('CandleUnitMenu — 버튼 글자 · 펼침', () => {
  it('자동 · 지금 5분 → 「5분봉(자동)」 · aria-label · aria-haspopup=dialog · 누르면 펼쳐진다', () => {
    const { button } = mount('auto', 5);
    expect(button).not.toBeNull();
    expect(button.textContent).toBe('5분봉(자동)');
    expect(button).toHaveAttribute('aria-label', '봉 단위 — 5분봉(자동)');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const radios = within(list()).getAllByRole('radio');
    expect(radios).toHaveLength(7);
    // Pitfall 11 — 줄이 전부 BUTTON 이라 Space 는 버튼 몫(틱 재생 키를 건드리지 않는다).
    for (const r of radios) expect(r.tagName).toBe('BUTTON');
    expect(screen.getByText('보기 창에 맞춰 바뀌어요')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="candle-unit-list"]')).toBe(list());
  });

  it('자동이면 「자동」 줄 선택 · 지금 단위 줄에만 「지금」 꼬리표', () => {
    const { button } = mount('auto', 5);
    fireEvent.click(button);
    expect(row(/^자동/)).toHaveAttribute('aria-checked', 'true');
    for (const u of [1, 5, 10, 15, 30, 60]) {
      expect(row(new RegExp(`^${u}분봉`))).toHaveAttribute('aria-checked', 'false');
    }
    const tags = document.querySelectorAll('[data-slot="candle-unit-now"]');
    expect(tags).toHaveLength(1);
    expect(tags[0]).toHaveTextContent('지금');
    expect(row(/^5분봉/)).toContainElement(tags[0] as HTMLElement);
  });

  it('고정 15분 → 버튼 「15분봉」 · 「15분봉」 줄 선택 · 꼬리표 없음', () => {
    const { button } = mount(15, 15);
    expect(button).toHaveTextContent(/^15분봉$/);
    expect(button).toHaveAttribute('aria-label', '봉 단위 — 15분봉');
    fireEvent.click(button);
    expect(row(/^15분봉/)).toHaveAttribute('aria-checked', 'true');
    expect(row(/^자동/)).toHaveAttribute('aria-checked', 'false');
    expect(document.querySelector('[data-slot="candle-unit-now"]')).toBeNull();
  });
});

describe('CandleUnitMenu — 고르기 · 키보드', () => {
  it('「15분봉」 누름 → onChange(15) · 목록 닫힘 · 초점은 버튼', () => {
    const { button, onChange } = mount('auto', 5);
    fireEvent.click(button);
    fireEvent.click(row(/^15분봉/));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(15);
    expect(screen.queryByRole('radiogroup', { name: '봉 단위' })).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(button);
  });

  it('고정에서 「자동」 누름 → onChange(\'auto\')', () => {
    const { button, onChange } = mount(30, 30);
    fireEvent.click(button);
    fireEvent.click(row(/^자동/));
    expect(onChange).toHaveBeenCalledWith('auto');
    expect(screen.queryByRole('radiogroup', { name: '봉 단위' })).toBeNull();
  });

  it('열면 선택 줄에 초점 · ↓ 다음 줄 · ↑ 앞 줄(기본 동작 막힘) · Esc 닫힘', () => {
    const { button } = mount(10, 10);
    fireEvent.click(button);
    expect(document.activeElement).toBe(row(/^10분봉/));
    // fireEvent 는 preventDefault 되면 false 를 돌려준다.
    expect(fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })).toBe(false);
    expect(document.activeElement).toBe(row(/^15분봉/));
    expect(fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })).toBe(false);
    expect(fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })).toBe(false);
    expect(document.activeElement).toBe(row(/^5분봉/));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('radiogroup', { name: '봉 단위' })).toBeNull();
  });

  it('폰 = 버튼 h-8 · 목록 폭 200 · 줄 h-10 · 「자동」 줄 min-h-12', () => {
    const { button } = mount('auto', 5, true);
    expect(button.className).toContain('h-8');
    fireEvent.click(button);
    expect(document.querySelector('[data-slot="popover-content"]')!.className).toContain('w-[200px]');
    expect(row(/^60분봉/).className).toContain('h-10');
    expect(row(/^자동/).className).toContain('min-h-12');
  });

  it('데스크톱 = 버튼 h-6 · 목록 폭 184 · 줄 h-8 · 「자동」 줄 min-h-10', () => {
    const { button } = mount('auto', 5, false);
    expect(button.className).toContain('h-6');
    fireEvent.click(button);
    expect(document.querySelector('[data-slot="popover-content"]')!.className).toContain('w-[184px]');
    expect(row(/^60분봉/).className).toContain('h-8');
    expect(row(/^자동/).className).toContain('min-h-10');
  });
});
