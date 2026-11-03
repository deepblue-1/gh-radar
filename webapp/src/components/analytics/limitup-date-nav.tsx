'use client';

import { useMemo, useState } from 'react';

import type { LimitupDate } from '@gh-radar/shared';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { kstDateKey } from '@/lib/breakout-list';
import { monthCellsOf, shiftYm, ymRangeOf } from '@/lib/date-calendar';
import { fmtYmdLabel } from '@/lib/limitup-report';
import { cn } from '@/lib/utils';

/**
 * 보고서 날짜 알약 ‹ 「10/02 (금)」 › (UI-SPEC ④-1 · D-11).
 *
 * 이동 단위는 **적재된 보고서 날짜 목록**이다(주말 · 휴장일을 건너뛴다) — `prev` · `next` 는 호출부가
 * `dateNavOf(dates, d)` 로 정한다. 끝에서는 진짜 `disabled`.
 * 가운데 글자는 `?d` 에서 즉시 그린다 — 로딩 중에도 알약은 그대로다(E5).
 *
 * **달력(2026-11-03 사용자 요청 · 스케치 021 A 「월 달력」 채택):** `dates` 를 주면 가운데 글자가 버튼(▾)이 되고 누르면 한 달
 * 달력 팝오버가 열린다 — 목록에 있는 날만 누를 수 있고(그 밖은 흐림 · disabled) 고른 날은 파란 원 · 오늘은 점 · 달 이동 ‹ › 는
 * 목록이 걸친 달까지 · 아래 「최신」 = 목록 최댓값. 날을 고르면 `onGo` 후 닫힌다. 열 때마다 보는 날짜의 달로 돌아온다.
 * 상한가 · 팀 매집 · 매집감지 보고서 · 틱뷰어 · 런치 주문 탭이 모두 이 알약을 쓴다.
 */
export interface LimitupDateNavProps {
  /** 지금 보는 날짜 — 아직 모르면(최신 로딩 중) null → 「—」. */
  date: LimitupDate | null;
  prev: LimitupDate | null;
  next: LimitupDate | null;
  onGo: (d: LimitupDate) => void;
  /** 고를 수 있는 날짜 목록(달력) — 없거나 비면 달력 없이 글자만. */
  dates?: readonly LimitupDate[];
  /** ‹ › 접근성 이름 — 기본 「이전 보고서」 · 「다음 보고서」(틱뷰어는 「이전 날짜」 · 「다음 날짜」). */
  prevLabel?: string;
  nextLabel?: string;
}

const ARROW =
  'grid size-8 place-items-center rounded-full text-[length:var(--t-sm)] text-[var(--muted-fg)] hover:bg-[var(--raised-2)] disabled:text-[var(--faint)] disabled:hover:bg-transparent';
const LABEL = 'mono px-2 text-[length:var(--t-sm)] font-semibold whitespace-nowrap text-[var(--fg)]';
const WEEK = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function LimitupDateNav({
  date,
  prev,
  next,
  onGo,
  dates,
  prevLabel = '이전 보고서',
  nextLabel = '다음 보고서',
}: LimitupDateNavProps) {
  const text = date === null ? '—' : fmtYmdLabel(date);
  return (
    <div data-slot="limitup-date-nav" className="inline-flex items-center rounded-full bg-[var(--muted)] p-1">
      <button
        type="button"
        aria-label={prevLabel}
        disabled={prev === null}
        onClick={() => prev !== null && onGo(prev)}
        className={ARROW}
      >
        ‹
      </button>
      {dates !== undefined && dates.length > 0 ? (
        <DateCalendar date={date} dates={dates} onGo={onGo} text={text} />
      ) : (
        <span data-slot="limitup-date" className={LABEL}>
          {text}
        </span>
      )}
      <button
        type="button"
        aria-label={nextLabel}
        disabled={next === null}
        onClick={() => next !== null && onGo(next)}
        className={ARROW}
      >
        ›
      </button>
    </div>
  );
}

function DateCalendar({
  date,
  dates,
  onGo,
  text,
}: {
  date: LimitupDate | null;
  dates: readonly LimitupDate[];
  onGo: (d: LimitupDate) => void;
  text: string;
}) {
  const has = useMemo(() => new Set(dates), [dates]);
  const range = useMemo(() => ymRangeOf(dates)!, [dates]);
  const latest = useMemo(() => dates.reduce((a, b) => (b > a ? b : a)), [dates]);
  const [open, setOpen] = useState(false);
  const [ym, setYm] = useState(range.max);
  const today = kstDateKey();

  const onOpenChange = (v: boolean) => {
    if (v) setYm((date ?? latest).slice(0, 6));
    setOpen(v);
  };
  const go = (d: LimitupDate) => {
    setOpen(false);
    if (d !== date) onGo(d);
  };

  const navBtn =
    'grid size-7 place-items-center rounded-full text-[var(--fg-2)] hover:bg-[var(--muted)] disabled:text-[var(--faint)] disabled:hover:bg-transparent';
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="limitup-date-trigger"
          aria-label={`날짜 고르기 — ${text}`}
          className={cn(LABEL, 'inline-flex items-center gap-1 rounded-full py-1 hover:bg-[var(--raised-2)]', open && 'bg-[var(--raised-2)]')}
        >
          <span data-slot="limitup-date">{text}</span>
          <span aria-hidden="true" className="text-[10px] text-[var(--muted-fg)]">
            ▾
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-slot="date-calendar"
        align="end"
        sideOffset={6}
        className="w-[296px] gap-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--popover)] p-3 text-[var(--popover-fg)] ring-0"
      >
        <div className="mb-1.5 flex items-center justify-between">
          <button type="button" aria-label="이전 달" disabled={ym <= range.min} onClick={() => setYm(shiftYm(ym, -1))} className={navBtn}>
            ‹
          </button>
          <span data-slot="date-calendar-month" className="text-[14px] font-bold">
            {`${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`}
          </span>
          <button type="button" aria-label="다음 달" disabled={ym >= range.max} onClick={() => setYm(shiftYm(ym, 1))} className={navBtn}>
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 text-center" aria-hidden="true">
          {WEEK.map((w, i) => (
            <div
              key={w}
              className={cn(
                'py-1 text-[11px] text-[var(--muted-fg)]',
                i === 0 && 'text-[var(--up)]',
                i === 6 && 'text-[var(--down)]',
              )}
            >
              {w}
            </div>
          ))}
        </div>
        <div role="group" aria-label={`${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`} className="grid grid-cols-7 text-center">
          {monthCellsOf(ym).map((d, i) =>
            d === null ? (
              <div key={`b${i}`} className="h-9" />
            ) : (
              <div key={d} className="grid h-9 place-items-center">
                <button
                  type="button"
                  data-ymd={d}
                  aria-label={fmtYmdLabel(d)}
                  aria-current={d === date ? 'date' : undefined}
                  disabled={!has.has(d)}
                  onClick={() => go(d)}
                  className={cn(
                    'relative size-[34px] rounded-full text-[13px] tabular-nums text-[var(--fg)] hover:bg-[var(--muted)] disabled:text-[var(--faint)] disabled:hover:bg-transparent',
                    d === date && 'bg-[var(--primary)] font-bold text-[var(--primary-fg)] hover:bg-[var(--primary)]',
                  )}
                >
                  {Number(d.slice(6, 8))}
                  {d === today && (
                    <span
                      data-slot="date-calendar-today"
                      aria-hidden="true"
                      className={cn(
                        'absolute bottom-[3px] left-1/2 size-1 -translate-x-1/2 rounded-full',
                        d === date ? 'bg-[var(--primary-fg)]' : 'bg-[var(--primary)]',
                      )}
                    />
                  )}
                </button>
              </div>
            ),
          )}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2">
          <small className="text-[11.5px] text-[var(--muted-fg)]">자료 있는 날만 고를 수 있어요</small>
          <button
            type="button"
            onClick={() => go(latest)}
            className="rounded-full bg-[var(--muted)] px-3 py-1 text-[12.5px] font-semibold text-[var(--fg)] hover:bg-[var(--raised-2)]"
          >
            최신
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
