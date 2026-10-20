'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import type { AccumReportRow } from '@gh-radar/shared';

import { ROW_DIVIDER } from '@/components/layout/page-layout';
import { stateLabelOf } from '@/lib/accum-report';
import { cn } from '@/lib/utils';

import { AccumDetail } from './accum-detail';

/**
 * 매집감지 종목 목록 + 그 자리 펼침 (Phase 34 · UI-SPEC A3 · A4 · D-08).
 *
 * `teamflow-day-grid.tsx` 의 아코디언 문법을 복제한다(일반화하지 않는다 — 열 · 상세 로드 방식이 다르다).
 * - **기본 전부 접힘**(D-08): 한 번에 하나 · 같은 행 다시 누름 = 접힘 · 다른 행 = 그 행만.
 *   날짜가 바뀌면 부모가 `key=date` 로 새로 만든다(전부 접힘으로 시작).
 * - 위쪽 상세가 접히며 새로 연 행이 앱 머리 위로 밀려 올라가면 `scrollIntoView({block:'start'})`(reduced-motion = 즉시) —
 *   `pendingScroll` 규칙. 포커스는 행 버튼에 남는다.
 * - 행 버튼 aria: `id = accum-row-{isin}` · `data-isin` · `aria-expanded` · 열렸을 때만 `aria-controls="ac-{isin}"` ·
 *   접근 이름 「{종목명} {코드} — 매집감지 상세」(name null 이면 short_code).
 * - 행 그리드는 **최종 7열 템플릿**(xl: 종목 · 상태 · 결과 · 팀 순매수 · 하루 순매수 · 등록·종료 · 셰브론)을 지금 둔다.
 *   이 파일(34-13)은 종목 · 상태 배지 · 셰브론만 채운다 — 결과 · 금액 · 등록·종료 칸 · 열 머리 · sr 설명은 34-04 가 더한다.
 *   < xl 은 카드형(1줄 종목 … 셰브론 / 2줄 배지 묶음).
 * - 치수 불변: `min-h-11` · 패딩 8/12 · `gap-x-3` · `gap-y-1.5` · `scroll-mt-[calc(4.5rem+var(--app-safe-top))]`.
 * - 열린 행 바로 아래에만 `AccumDetail` 을 마운트한다(접으면 언마운트 · 받은 상세는 캐시에 남는다 — D-06).
 */

const COLS_XL = 'xl:grid-cols-[minmax(0,176px)_minmax(152px,1fr)_104px_160px_112px_88px_16px]';

const BADGE =
  'inline-flex h-5 items-center rounded-[4px] border border-transparent px-1.5 text-[11px] font-semibold whitespace-nowrap';

/** 상태 배지 색(UI-SPEC Color) — 1 팀 축 · 2 매도 축 · 3(및 그 밖) 중립 + 1px 테두리. */
function stateTone(state: number | null): string {
  if (state === 1) return 'bg-[var(--team-bg)] text-[var(--team)]';
  if (state === 2) return 'bg-[var(--accum-sell-bg)] text-[var(--accum-sell)]';
  return 'border-[var(--border-subtle)] bg-[var(--muted)] text-[var(--muted-fg)]';
}

/** 행 버튼 id — 펼친 상세가 `aria-labelledby` 로 가리킨다. */
export function accumRowButtonId(isin: string): string {
  return `accum-row-${isin}`;
}

/** 종목 표시 이름 — name 이 없으면 6자 코드(그것도 없으면 isin). */
function labelOf(r: AccumReportRow): string {
  return r.name ?? (r.short_code || r.isin);
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function AccumDayGrid({ date, rows }: { date: string; rows: readonly AccumReportRow[] }) {
  // D-08 — 기본 전부 접힘
  const [openIsin, setOpenIsin] = useState<string | null>(null);
  const pendingScroll = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useLayoutEffect(() => {
    const isin = pendingScroll.current;
    pendingScroll.current = null;
    if (isin === null || isin !== openIsin) return;
    const btn = listRef.current?.querySelector<HTMLElement>(`button[data-isin="${isin}"]`);
    if (!btn) return;
    const offset = Number.parseFloat(getComputedStyle(btn).scrollMarginTop) || 0;
    if (btn.getBoundingClientRect().top < offset) {
      btn.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  }, [openIsin]);

  const toggle = (isin: string) => {
    if (openIsin === isin) {
      setOpenIsin(null);
      return;
    }
    pendingScroll.current = isin;
    setOpenIsin(isin);
  };

  return (
    <ol ref={listRef} data-slot="accum-list" className="m-0 mt-1 list-none p-0">
      {rows.map((r) => {
        const open = openIsin === r.isin;
        const label = labelOf(r);
        const sub = r.short_code ? [r.short_code, r.market].filter(Boolean).join(' · ') : null;
        return (
          <li key={r.isin} data-open={open ? 'true' : undefined} className={cn(ROW_DIVIDER)}>
            <button
              type="button"
              id={accumRowButtonId(r.isin)}
              data-isin={r.isin}
              aria-label={`${[r.name, r.short_code].filter(Boolean).join(' ') || r.isin} — 매집감지 상세`}
              aria-expanded={open}
              aria-controls={open ? `ac-${r.isin}` : undefined}
              onClick={() => toggle(r.isin)}
              className={cn(
                'grid min-h-11 w-full scroll-mt-[calc(4.5rem+var(--app-safe-top))] grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-x-3 gap-y-1.5 rounded-[var(--r)] px-2 py-3 text-left',
                'hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
                open && 'bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
                COLS_XL,
              )}
            >
              {/* 종목 — 이름(name · null 이면 short_code) / 코드 · 시장(market null 이면 코드만) */}
              <span className="col-start-1 row-start-1 flex min-w-0 flex-col xl:col-start-1">
                <span
                  className="min-w-0 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]"
                  title={label}
                >
                  {label}
                </span>
                {sub && (
                  <span className="mono min-w-0 truncate text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                    {sub}
                  </span>
                )}
              </span>

              {/* 상태 — 배지 묶음(< xl 2줄 전폭 · xl 2열). 이월 · 사이클 배지와 사유 줄은 34-04 */}
              <span className="col-span-3 row-start-2 flex min-w-0 flex-wrap gap-1 xl:col-span-1 xl:col-start-2 xl:row-start-1">
                <span data-slot="accum-state" className={cn(BADGE, stateTone(r.state))}>
                  {stateLabelOf(r.state)}
                </span>
              </span>

              <ChevronDown
                aria-hidden="true"
                data-slot="accum-row-chevron"
                className={cn(
                  'col-start-3 row-start-1 size-4 shrink-0 justify-self-end text-[var(--muted-fg)] transition-transform duration-200 motion-reduce:transition-none xl:col-start-7 xl:row-start-1',
                  open && 'rotate-180',
                )}
              />
            </button>
            {open && <AccumDetail date={date} isin={r.isin} labelledBy={accumRowButtonId(r.isin)} />}
          </li>
        );
      })}
    </ol>
  );
}
