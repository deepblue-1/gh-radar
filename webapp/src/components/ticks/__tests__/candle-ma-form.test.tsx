import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { CandleMaChips } from '../candle-ma-chips';
import { CandleMaForm, maFormStateOf } from '../candle-ma-form';
import {
  DEFAULT_MA_CONFIG,
  addMaLine,
  removeMaLine,
  toggleMaLine,
  type MaConfig,
  type MaLine,
} from '@/lib/ticks/candle-prefs';
import type { MaSpec } from '@/lib/ticks/candle-ma';

/**
 * Phase 42 · D-10 · D-22 · UI-SPEC S3 — 이동평균 칩 · 「＋」(6개 상한) · 더하기 한 장 양식(팝오버 ↔ 시트).
 *
 * 깨지면: 이동평균을 더하거나 지울 수 없거나, 틀린 기간 · 같은 선 · 7번째 선이 들어간다.
 */

const FULL_TITLE = '이동평균은 6개까지예요 — 하나를 지우면 더할 수 있어요';
const RANGE_MSG = '기간은 2 ~ 240 사이 숫자로 넣어 주세요';

/** 이 케이스의 뷰포트 폭 — `(min-width: 768px)` 참/거짓(push-alert-bell 테스트와 같은 꼴). */
function setWide(wide: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === '(min-width: 768px)' ? wide : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
const originalMatchMedia = window.matchMedia;

beforeEach(() => setWide(true));
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

function line(n: number, color: number, over: Partial<MaLine> = {}): MaLine {
  return { base: 'bar', n, kind: 'sma', on: true, color, ...over };
}
const SIX: MaConfig = {
  v: 1,
  lines: [240, 120, 60, 30, 10, 3].map((n, i) => line(n, i + 1, i === 1 ? { kind: 'ema' } : {})),
};

/** 칩 — 부모처럼 구성을 쥐고 다시 그린다. */
function ChipsHarness({ initial, phone, spy }: { initial: MaConfig; phone: boolean; spy: (c: MaConfig) => void }) {
  const [cfg, setCfg] = useState(initial);
  return (
    <CandleMaChips
      config={cfg}
      phone={phone}
      onChange={(c) => {
        spy(c);
        setCfg(c);
      }}
    />
  );
}
function mountChips(initial: MaConfig = DEFAULT_MA_CONFIG, phone = false) {
  const spy = vi.fn();
  render(<ChipsHarness initial={initial} phone={phone} spy={spy} />);
  return spy;
}
const plus = () => document.querySelector<HTMLButtonElement>('[data-slot="candle-ma-add"]')!;

/** 양식 — 열림을 쥔 부모 + 「＋」 대신 평범한 버튼. */
function FormHarness({ config, onAdd }: { config: MaConfig; onAdd: (s: MaSpec) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <CandleMaForm
      open={open}
      onOpenChange={setOpen}
      config={config}
      onAdd={onAdd}
      trigger={
        <button type="button" data-testid="opener">
          ＋
        </button>
      }
    />
  );
}
function openForm(config: MaConfig = DEFAULT_MA_CONFIG) {
  const onAdd = vi.fn();
  render(<FormHarness config={config} onAdd={onAdd} />);
  fireEvent.click(screen.getByTestId('opener'));
  return onAdd;
}
const period = () => document.querySelector<HTMLInputElement>('[data-slot="candle-ma-form"] input')!;
const confirmBtn = () => within(document.querySelector('[data-slot="candle-ma-form"]') as HTMLElement).getByRole('button', { name: /더하기$/ });
const seg = (group: string, name: string) =>
  within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name });

describe('maFormStateOf — 순수 검증', () => {
  it('빈 칸 → 오류 없음 · spec 없음 / 1 · 241 → range', () => {
    expect(maFormStateOf({ base: 'bar', nText: '1', kind: 'sma' }, DEFAULT_MA_CONFIG).error).toBe('range');
    expect(maFormStateOf({ base: 'bar', nText: '', kind: 'sma' }, DEFAULT_MA_CONFIG)).toEqual({ spec: null, error: null, name: null });
    expect(maFormStateOf({ base: 'bar', nText: '241', kind: 'ema' }, DEFAULT_MA_CONFIG).error).toBe('range');
    expect(maFormStateOf({ base: 'bar', nText: '241', kind: 'ema' }, DEFAULT_MA_CONFIG).spec).toBeNull();
  });

  it('기본 구성에 봉 · 20 · 단순 → dup 「단순 20」 / 일 · 60 → 「일 60」 단순(지수로 들어와도 단순)', () => {
    expect(maFormStateOf({ base: 'bar', nText: '20', kind: 'sma' }, DEFAULT_MA_CONFIG)).toEqual({ spec: null, error: 'dup', name: '단순 20' });
    // 꺼진 칩도 같은 선이다.
    const off = toggleMaLine(DEFAULT_MA_CONFIG, 'bar:sma:5');
    expect(maFormStateOf({ base: 'bar', nText: '5', kind: 'sma' }, off).error).toBe('dup');
    expect(maFormStateOf({ base: 'day', nText: '60', kind: 'sma' }, DEFAULT_MA_CONFIG)).toEqual({
      spec: { base: 'day', n: 60, kind: 'sma' },
      error: null,
      name: '일 60',
    });
    expect(maFormStateOf({ base: 'day', nText: '60', kind: 'ema' }, DEFAULT_MA_CONFIG).spec).toEqual({ base: 'day', n: 60, kind: 'sma' });
    expect(maFormStateOf({ base: 'bar', nText: '20', kind: 'ema' }, DEFAULT_MA_CONFIG).name).toBe('지수 20');
  });
});

describe('CandleMaChips — 칩 · 켜고 끄기 · 지우기 · 상한', () => {
  it('기본 구성 → 「단순 5」 · 「단순 20」 켜짐 · 색 줄 --ma-1 · --ma-2 · 더한 순서', () => {
    mountChips();
    const group = screen.getByRole('group', { name: '이동평균' });
    const chips = group.querySelectorAll('[data-slot="candle-ma-chip"]');
    expect(chips).toHaveLength(2);
    const t5 = screen.getByRole('button', { name: '단순 5' });
    const t20 = screen.getByRole('button', { name: '단순 20' });
    expect(t5).toHaveAttribute('aria-pressed', 'true');
    expect(t20).toHaveAttribute('aria-pressed', 'true');
    expect(t5.querySelector('i')!.className).toContain('bg-[var(--ma-1)]');
    expect(t20.querySelector('i')!.className).toContain('bg-[var(--ma-2)]');
    expect(chips[0]).toContainElement(t5);
    expect(chips[1]).toContainElement(t20);
  });

  it('켜기 칸 누름 → 그 선만 on:false(색 번호 그대로) · 꺼진 칩 = 400 · 색 줄 .35', () => {
    const spy = mountChips();
    fireEvent.click(screen.getByRole('button', { name: '단순 5' }));
    expect(spy).toHaveBeenCalledWith(toggleMaLine(DEFAULT_MA_CONFIG, 'bar:sma:5'));
    const t5 = screen.getByRole('button', { name: '단순 5' });
    expect(t5).toHaveAttribute('aria-pressed', 'false');
    expect(t5.closest('[data-slot="candle-ma-chip"]')!.className).toContain('font-normal');
    expect(t5.querySelector('i')!.className).toContain('opacity-35');
    expect(t5.querySelector('i')!.className).toContain('bg-[var(--ma-1)]');
  });

  it('× 「단순 5 지우기」 → 확인창 없이 그 선 없는 구성', () => {
    const spy = mountChips();
    fireEvent.click(screen.getByRole('button', { name: '단순 5 지우기' }));
    expect(spy).toHaveBeenCalledWith(removeMaLine(DEFAULT_MA_CONFIG, 'bar:sma:5'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: '단순 5' })).toBeNull();
    expect(screen.getByRole('button', { name: '단순 20' })).toBeInTheDocument();
  });

  it('칩 0개 — 데스크톱 「이동평균」 머리 글자 + 「＋」 · 폰 「＋ 이동평균」 한 버튼', () => {
    const empty: MaConfig = { v: 1, lines: [] };
    mountChips(empty, false);
    const group = screen.getByRole('group', { name: '이동평균' });
    expect(within(group).getByText('이동평균')).toBeInTheDocument();
    expect(plus().textContent).toBe('＋');
    expect(plus()).toHaveAccessibleName('이동평균 더하기');
  });

  it('칩 0개 폰 → 「＋ 이동평균」 · 머리 글자 없음', () => {
    mountChips({ v: 1, lines: [] }, true);
    expect(plus().textContent).toBe('＋ 이동평균');
    expect(screen.queryByText('이동평균', { selector: 'span' })).toBeNull();
  });

  it('칩 6개 → 「＋」 aria-disabled · title · 불투명도 .4 · 눌러도 창이 안 열린다', () => {
    const spy = mountChips(SIX, false);
    expect(plus()).toHaveAttribute('aria-disabled', 'true');
    expect(plus()).toHaveAttribute('title', FULL_TITLE);
    expect(plus().className).toContain('opacity-40');
    expect(plus()).not.toBeDisabled(); // 초점 · title 이 남게 disabled 가 아니라 aria-disabled
    fireEvent.click(plus());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[data-slot="candle-ma-form"]')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('「＋」 → 「단순 60」 더하기 → 새 칩이 켜진 채 맨 뒤 · 창 닫힘 · 초점 「＋」', async () => {
    const spy = mountChips();
    fireEvent.click(plus());
    fireEvent.change(period(), { target: { value: '60' } });
    fireEvent.keyDown(period(), { key: 'Enter' });
    expect(spy).toHaveBeenCalledWith(addMaLine(DEFAULT_MA_CONFIG, { base: 'bar', n: 60, kind: 'sma' }));
    const chips = document.querySelectorAll('[data-slot="candle-ma-chip"]');
    expect(chips).toHaveLength(3);
    const last = within(chips[2] as HTMLElement).getByRole('button', { name: '단순 60' });
    expect(last).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-slot="candle-ma-form"]')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(plus()));
  });
});

describe('CandleMaForm — 한 장 양식', () => {
  it('열면 봉 · 빈 칸 · 단순 · 확인 「더하기」 꺼짐 · 첫 초점 기간 칸 → 15 → 「단순 15 더하기」 · Enter 로 더하고 닫힘', () => {
    const onAdd = openForm();
    expect(seg('기준', '봉')).toHaveAttribute('aria-checked', 'true');
    expect(seg('종류', '단순')).toHaveAttribute('aria-checked', 'true');
    expect(period().value).toBe('');
    expect(period()).toHaveAttribute('placeholder', '20');
    expect(period()).toHaveAttribute('inputmode', 'numeric');
    expect(period()).toHaveAccessibleName('기간(봉 개수)');
    expect(document.activeElement).toBe(period());
    expect(confirmBtn().textContent).toBe('더하기');
    expect(confirmBtn()).toBeDisabled();
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.change(period(), { target: { value: '15' } });
    expect(confirmBtn().textContent).toBe('단순 15 더하기');
    expect(confirmBtn()).not.toBeDisabled();
    fireEvent.keyDown(period(), { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith({ base: 'bar', n: 15, kind: 'sma' });
    expect(document.querySelector('[data-slot="candle-ma-form"]')).toBeNull();
  });

  it('숫자만 · 앞 0 지움 · 세 자리까지', () => {
    openForm();
    fireEvent.change(period(), { target: { value: 'a1b' } });
    expect(period().value).toBe('1');
    fireEvent.change(period(), { target: { value: '0007' } });
    expect(period().value).toBe('7');
    fireEvent.change(period(), { target: { value: '1234' } });
    expect(period().value).toBe('123');
  });

  it('범위 밖 → aria-invalid + 오류 줄 · 같은 선 → 「이미 있는 선이에요 — 단순 20」 · 둘 다 꺼짐 · 입력 유지 · Enter 무시', () => {
    const onAdd = openForm();
    fireEvent.change(period(), { target: { value: '1' } });
    expect(period()).toHaveAttribute('aria-invalid', 'true');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(RANGE_MSG);
    expect(period()).toHaveAttribute('aria-describedby', alert.id);
    expect(confirmBtn()).toBeDisabled();
    fireEvent.keyDown(period(), { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();
    expect(period().value).toBe('1');

    fireEvent.change(period(), { target: { value: '20' } });
    expect(screen.getByRole('alert').textContent).toBe('이미 있는 선이에요 — 단순 20');
    expect(confirmBtn()).toBeDisabled();
    expect(confirmBtn().textContent).toBe('더하기');
  });

  it('「일」 → 「지수」 칸 꺼짐 · 안내 줄 · 칸 뒤 글자 「일」 · 접근 이름 「기간(거래일 수)」', () => {
    const onAdd = openForm();
    fireEvent.click(seg('종류', '지수'));
    expect(seg('종류', '지수')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(seg('기준', '일'));
    expect(seg('종류', '지수')).toBeDisabled();
    expect(seg('종류', '단순')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('일 기준은 단순 평균만 있어요')).toBeInTheDocument();
    expect(period()).toHaveAccessibleName('기간(거래일 수)');
    expect(within(period().parentElement as HTMLElement).getByText('일')).toBeInTheDocument();
    fireEvent.change(period(), { target: { value: '60' } });
    fireEvent.click(confirmBtn());
    expect(onAdd).toHaveBeenCalledWith({ base: 'day', n: 60, kind: 'sma' });
  });

  it('뷰포트 768 이상 = 팝오버(「취소」 + 확인) · 미만 = 바텀 시트(손잡이 · 제목 · 확인 하나 전폭)', () => {
    openForm();
    const pop = document.querySelector('[data-slot="popover-content"]') as HTMLElement;
    expect(pop).toContainElement(document.querySelector('[data-slot="candle-ma-form"]') as HTMLElement);
    expect(pop.className).toContain('w-[272px]');
    expect(within(pop).getByRole('button', { name: '취소' })).toBeInTheDocument();
    fireEvent.click(within(pop).getByRole('button', { name: '취소' }));
    expect(document.querySelector('[data-slot="candle-ma-form"]')).toBeNull();
  });

  it('뷰포트 768 미만 = 바텀 시트 — 제목 「이동평균 더하기」 · 「취소」 없음 · 확인 h-11 전폭 · 첫 초점 시트', () => {
    setWide(false);
    openForm();
    const sheet = screen.getByRole('dialog', { name: '이동평균 더하기' });
    expect(sheet).toHaveAttribute('data-slot', 'sheet-content');
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
    expect(within(sheet).queryByRole('button', { name: '취소' })).toBeNull();
    expect(confirmBtn().className).toContain('h-11');
    expect(confirmBtn().className).toContain('w-full');
    expect(document.activeElement).toBe(sheet);
  });
});
