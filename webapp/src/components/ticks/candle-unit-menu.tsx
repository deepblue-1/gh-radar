'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CANDLE_UNITS, candleUnitLabelOf, type CandleUnit } from '@/lib/ticks/candle-chart';
import type { CandleUnitPref } from '@/lib/ticks/candle-prefs';
import { cn } from '@/lib/utils';

/**
 * 봉 단위 메뉴 — 「5분봉(자동) ▾」 버튼 + 버튼 아래로 펼쳐지는 목록 (Phase 42 · D-09 · D-23 · UI-SPEC S2 · 채택 목업 A).
 *
 * - 목록 = 「자동」(+ 「보기 창에 맞춰 바뀌어요」) → 구분선 → 「1분봉」 ~ 「60분봉」. 선택 줄 앞 ✓ + 600.
 *   자동이면 지금 쓰는 단위 줄 끝에 「지금」 꼬리표 · 고정이면 그 단위 줄 ✓ · 꼬리표 없음. 폰과 PC 모양이 같다(치수만 다름).
 * - 기기 기본 고르기 창(select 요소)은 쓰지 않는다(D-23 기각안 — 기기마다 모양이 다르고 「지금」 을 목록 안에 못 보인다).
 * - 줄은 전부 `<button role="radio">` — Space · Enter 는 버튼 몫이라 window 의 틱 재생 키 가로채기(use-tick-cursor ·
 *   INPUT · BUTTON 은 건너뜀)를 건드리지 않는다(Pitfall 11). ↑ ↓ 는 줄 사이 초점만 옮기고 기본 동작(스크롤)을 막는다.
 * - 고르면 `onChange` → 닫기 → 초점은 버튼. 저장(`useCandleUnitPref`)과 차트 결선은 42-10 몫 — 이 부품은 값과 콜백만 받는다.
 */

export interface CandleUnitMenuProps {
  /** 사용자가 고른 값 — 「자동」 또는 고정 단위. */
  value: CandleUnitPref;
  /** 지금 차트가 쓰는 단위(자동이면 보기 창으로 고른 단위 · 고정이면 그 단위). */
  current: CandleUnit;
  onChange: (unit: CandleUnitPref) => void;
  /** 측정 폭이 폰인가(차트가 넘긴다) — 치수만 바뀐다. */
  phone: boolean;
  className?: string;
}

export function CandleUnitMenu({ value, current, onChange, phone, className }: CandleUnitMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const auto = value === 'auto';
  const label = candleUnitLabelOf(current, auto);

  // 고르면 닫고 초점은 버튼으로 — 바로 옮긴다(Radix 의 닫힘 뒤 초점 복귀는 한 틱 늦다). Esc 는 Radix 기본이 버튼으로 돌린다.
  const pick = (next: CandleUnitPref) => {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  };

  // ↑ ↓ — 줄 사이 초점 이동(끝에서 돌아간다) · 기본 동작(스크롤) 막음. Enter · Space 는 버튼 기본 동작(click).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next = at < 0 ? (step > 0 ? 0 : rows.length - 1) : (at + step + rows.length) % rows.length;
    rows[next]?.focus();
  };

  const rowCls = (on: boolean) =>
    cn(
      'flex w-full items-center gap-1 rounded-[10px] px-2 text-left text-[var(--fg)] outline-none',
      'hover:bg-[var(--muted)] focus-visible:bg-[var(--muted)]',
      phone ? 'text-[14px]' : 'text-[12px]',
      on ? 'font-semibold' : 'font-normal',
    );
  const checkSlot = (on: boolean) => (
    <span className="flex w-4 shrink-0 justify-center">
      {on && <Check aria-hidden="true" className="size-3.5" />}
    </span>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={buttonRef}
          type="button"
          data-slot="candle-unit-button"
          aria-label={`봉 단위 — ${label}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            'inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap text-[var(--fg)]',
            phone ? 'h-8 pl-3 pr-2 text-[12px]' : 'h-6 pl-2 pr-1 text-[11px]',
            open ? 'bg-[var(--raised-2)]' : 'bg-[var(--muted)]',
            className,
          )}
        >
          {label}
          <ChevronDown aria-hidden="true" className="size-3 text-[var(--muted-fg)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        aria-label="봉 단위"
        onOpenAutoFocus={(e) => {
          // 처음 초점 = 선택된 줄(radiogroup 관례).
          e.preventDefault();
          listRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
        }}
        className={cn('gap-0 rounded-[14px] bg-[var(--popover)] p-1', phone ? 'w-[200px]' : 'w-[184px]')}
      >
        <div
          ref={listRef}
          role="radiogroup"
          aria-label="봉 단위"
          data-slot="candle-unit-list"
          onKeyDown={onKeyDown}
        >
          <button
            type="button"
            role="radio"
            aria-checked={auto}
            tabIndex={auto ? 0 : -1}
            onClick={() => pick('auto')}
            className={cn(rowCls(auto), 'py-1', phone ? 'min-h-12' : 'min-h-10')}
          >
            {checkSlot(auto)}
            <span className="flex flex-col">
              <span>자동</span>
              <span className={cn('font-normal text-[var(--muted-fg)]', phone ? 'text-[12px]' : 'text-[11px]')}>
                보기 창에 맞춰 바뀌어요
              </span>
            </span>
          </button>
          <div aria-hidden="true" className="mx-2 my-1 h-px bg-[var(--border-subtle)]" />
          {CANDLE_UNITS.map((u) => {
            const on = !auto && value === u;
            return (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => pick(u)}
                className={cn(rowCls(on), phone ? 'h-10' : 'h-8')}
              >
                {checkSlot(on)}
                <span className="flex-1">{u}분봉</span>
                {auto && u === current && (
                  <span
                    data-slot="candle-unit-now"
                    className={cn(
                      'rounded bg-[var(--muted)] px-1 font-semibold text-[var(--muted-fg)]',
                      phone ? 'text-[12px]' : 'text-[11px]',
                    )}
                  >
                    지금
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
