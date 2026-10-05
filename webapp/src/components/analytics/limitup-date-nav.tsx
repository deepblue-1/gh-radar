'use client';

import type { LimitupDate } from '@gh-radar/shared';

import { fmtYmdLabel } from '@/lib/limitup-report';

/**
 * 보고서 날짜 알약 ‹ 「10/02 (금)」 › (UI-SPEC ④-1 · D-11).
 *
 * 이동 단위는 **적재된 보고서 날짜 목록**이다(주말 · 휴장일을 건너뛴다) — `prev` · `next` 는 호출부가
 * `dateNavOf(dates, d)` 로 정한다. 끝에서는 진짜 `disabled`. 달력 피커는 두지 않는다(재량 행사 「없음」).
 * 가운데 글자는 `?d` 에서 즉시 그린다 — 로딩 중에도 알약은 그대로다(E5).
 */
export interface LimitupDateNavProps {
  /** 지금 보는 날짜 — 아직 모르면(최신 로딩 중) null → 「—」. */
  date: LimitupDate | null;
  prev: LimitupDate | null;
  next: LimitupDate | null;
  onGo: (d: LimitupDate) => void;
}

const ARROW =
  'grid size-8 place-items-center rounded-full text-[16px] text-[var(--muted-fg)] hover:bg-[var(--raised-2)] disabled:text-[var(--faint)] disabled:hover:bg-transparent';

export function LimitupDateNav({ date, prev, next, onGo }: LimitupDateNavProps) {
  return (
    <div data-slot="limitup-date-nav" className="inline-flex items-center rounded-full bg-[var(--muted)] p-1">
      <button
        type="button"
        aria-label="이전 보고서"
        disabled={prev === null}
        onClick={() => prev !== null && onGo(prev)}
        className={ARROW}
      >
        ‹
      </button>
      <span
        data-slot="limitup-date"
        className="mono px-2 text-[length:var(--t-sm)] font-semibold whitespace-nowrap text-[var(--fg)]"
      >
        {date === null ? '—' : fmtYmdLabel(date)}
      </span>
      <button
        type="button"
        aria-label="다음 보고서"
        disabled={next === null}
        onClick={() => next !== null && onGo(next)}
        className={ARROW}
      >
        ›
      </button>
    </div>
  );
}
