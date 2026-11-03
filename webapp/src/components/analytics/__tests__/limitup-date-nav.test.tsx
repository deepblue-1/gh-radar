import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { LimitupDateNav } from '../limitup-date-nav';

/**
 * 날짜 알약 달력(2026-11-03 · 스케치 021 A) — 깨지면 날짜를 누를 수 없거나, 자료 없는 날을 고를 수 있거나, 고른 뒤 닫히지 않는다.
 */
const DATES = ['20261103', '20261030', '20261029', '20260930'];

function setup(props: Partial<Parameters<typeof LimitupDateNav>[0]> = {}) {
  const onGo = vi.fn();
  const r = render(<LimitupDateNav date="20261030" prev="20261029" next="20261103" onGo={onGo} dates={DATES} {...props} />);
  return { ...r, onGo };
}

describe('LimitupDateNav — 달력', () => {
  it('dates 없으면 글자만(버튼 아님)', () => {
    setup({ dates: undefined });
    expect(screen.queryByRole('button', { name: /날짜 고르기/ })).toBeNull();
    expect(document.querySelector('[data-slot="limitup-date"]')?.textContent).toBe('10/30 (금)');
  });

  it('누르면 보는 날짜의 달 · 자료 있는 날만 누를 수 있음 · 고른 날 aria-current', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '날짜 고르기 — 10/30 (금)' }));
    expect(document.querySelector('[data-slot="date-calendar-month"]')?.textContent).toBe('2026년 10월');
    const btn = (ymd: string) => document.querySelector(`[data-ymd="${ymd}"]`) as HTMLButtonElement;
    expect(btn('20261029').disabled).toBe(false);
    expect(btn('20261028').disabled).toBe(true);
    expect(btn('20261031').disabled).toBe(true);
    expect(btn('20261030').getAttribute('aria-current')).toBe('date');
  });

  it('날을 고르면 onGo 후 닫힘 · 달 이동은 목록 범위까지 · 「최신」', () => {
    const { onGo } = setup();
    fireEvent.click(screen.getByRole('button', { name: /날짜 고르기/ }));
    fireEvent.click(document.querySelector('[data-ymd="20261029"]')!);
    expect(onGo).toHaveBeenCalledWith('20261029');
    expect(document.querySelector('[data-slot="date-calendar"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /날짜 고르기/ }));
    const prevM = screen.getByRole('button', { name: '이전 달' }) as HTMLButtonElement;
    fireEvent.click(prevM);
    expect(document.querySelector('[data-slot="date-calendar-month"]')?.textContent).toBe('2026년 9월');
    expect(prevM.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '최신' }));
    expect(onGo).toHaveBeenLastCalledWith('20261103');
  });
});
