'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import type { TeamflowRow } from '@gh-radar/shared';

import { ROW_DIVIDER } from '@/components/layout/page-layout';
import { TONE_TEXT, fmtEok, tagOf, toneOf, type TeamflowTag } from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

import { TeamflowDetail } from './teamflow-detail';

/**
 * 팀 매집 탐지 종목 목록 + 그 자리 펼침 (Phase 33 · UI-SPEC T3 · D-08 · D-14).
 *
 * `limitup-day-grid.tsx` 의 아코디언 문법을 복제한다(일반화하지 않는다 — 열 · 기본 펼침이 다르다).
 * - **기본 전부 접힘**(D-08 — 상한가 보고서는 첫 행 펼침): 한 번에 하나 · 같은 행 다시 누름 = 접힘 · 다른 행 = 그 행만.
 *   날짜가 바뀌면 부모가 `key=date` 로 새로 만든다(전부 접힘으로 시작).
 * - 위쪽 상세가 접히며 새로 연 행이 앱 머리 위로 밀려 올라가면 `scrollIntoView({block:'start'})`(reduced-motion = 즉시) —
 *   `pendingScroll` 규칙. 포커스는 행 버튼에 남는다.
 * - 행 버튼 aria: `id = teamflow-row-{isin}` · `data-isin` · `aria-expanded` · 열렸을 때만 `aria-controls="tf-{isin}"` ·
 *   접근 이름 「{종목명} {코드} — 팀 매집 상세」 · `aria-describedby` = sr-only 행 설명(button 자식은 presentational).
 * - 같은 DOM · CSS 로만 배치 전환(뷰포트): < xl 카드형(1줄 종목 … 결과 태그 · 셰브론 / 2줄 메타) · xl 7열
 *   (종목 · 결과 · 팀 순매수 · 20% 아래/위 · 매수 중 팀 · 미니막대 · 셰브론 — 4~6열 칸과 열 머리는 33-03 이 덧붙인다).
 * - 열린 행 바로 아래에만 `TeamflowDetail` 을 마운트한다(접으면 언마운트 → 상세 안 토글 상태도 초기화).
 */

const COLS_XL = 'xl:grid-cols-[minmax(0,168px)_104px_80px_minmax(0,148px)_72px_minmax(0,1fr)_16px]';

const TAG_TONE: Record<TeamflowTag['kind'], string> = {
  limit: 'bg-[var(--up-bg)] text-[var(--up)]',
  below: 'bg-[var(--muted)] text-[var(--fg-2)]',
};

/** 행 버튼 id — 펼친 상세가 `aria-labelledby` 로 가리킨다. */
export function teamflowRowButtonId(isin: string): string {
  return `teamflow-row-${isin}`;
}

/** 종목 표시 이름 — name 이 없으면 6자 코드(그것도 없으면 isin). */
function labelOf(r: TeamflowRow): string {
  return r.name ?? r.short_code ?? r.isin;
}

/** 행 값 설명 — 「결과 상한가 11:50, 팀 순매수 +4.1억」(33-03 이 20% 아래/위 · 매수 중 팀을 덧붙인다). */
function rowDescriptionOf(r: TeamflowRow, tag: TeamflowTag): string {
  return [`결과 ${tag.text}`, `팀 순매수 ${fmtEok(r.team_net_val, { signed: true })}`].join(', ');
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function TeamflowDayGrid({ rows }: { rows: readonly TeamflowRow[] }) {
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
    <ol ref={listRef} data-slot="teamflow-list" className="m-0 mt-1 list-none p-0">
      {rows.map((r) => {
        const open = openIsin === r.isin;
        const tag = tagOf(r);
        const label = labelOf(r);
        const sub = r.short_code ? [r.short_code, r.market].filter(Boolean).join(' · ') : null;
        const net = fmtEok(r.team_net_val, { signed: true });
        return (
          <li key={r.isin} data-open={open ? 'true' : undefined} className={cn(ROW_DIVIDER)}>
            <button
              type="button"
              id={teamflowRowButtonId(r.isin)}
              data-isin={r.isin}
              aria-label={`${[r.name, r.short_code].filter(Boolean).join(' ') || r.isin} — 팀 매집 상세`}
              aria-describedby={`teamflow-row-desc-${r.isin}`}
              aria-expanded={open}
              aria-controls={open ? `tf-${r.isin}` : undefined}
              onClick={() => toggle(r.isin)}
              className={cn(
                'grid min-h-11 w-full scroll-mt-[calc(4.5rem+var(--app-safe-top))] grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-x-3 gap-y-1.5 rounded-[var(--r)] px-2 py-3 text-left',
                'hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
                open && 'bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
                COLS_XL,
              )}
            >
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

              <span className="col-start-2 row-start-1 justify-self-end xl:col-start-2 xl:justify-self-start">
                <span
                  data-slot="teamflow-tag"
                  data-kind={tag.kind}
                  className={cn(
                    'inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap',
                    TAG_TONE[tag.kind],
                  )}
                >
                  {tag.kind === 'limit' && tag.text !== '상한가' ? (
                    <>
                      상한가&nbsp;<span className="mono">{tag.text.slice('상한가 '.length)}</span>
                    </>
                  ) : (
                    <span className={tag.kind === 'below' ? 'mono' : undefined}>{tag.text}</span>
                  )}
                </span>
              </span>

              <span className="col-span-3 row-start-2 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[length:var(--t-caption)] xl:contents">
                <span className="inline-flex min-w-0 items-baseline gap-1 xl:col-start-3 xl:row-start-1">
                  <span className="shrink-0 text-[var(--muted-fg)] xl:sr-only">팀 순매수</span>
                  <span
                    data-slot="teamflow-net"
                    className={cn(
                      'mono min-w-0 truncate xl:text-[length:var(--t-sm)] xl:font-semibold',
                      TONE_TEXT[toneOf(r.team_net_val)],
                    )}
                  >
                    {net}
                  </span>
                </span>
              </span>

              <ChevronDown
                aria-hidden="true"
                data-slot="teamflow-row-chevron"
                className={cn(
                  'col-start-3 row-start-1 size-4 shrink-0 justify-self-end text-[var(--muted-fg)] transition-transform duration-200 motion-reduce:transition-none xl:col-start-7 xl:row-start-1',
                  open && 'rotate-180',
                )}
              />
              <span id={`teamflow-row-desc-${r.isin}`} className="sr-only">
                {rowDescriptionOf(r, tag)}
              </span>
            </button>
            {open && <TeamflowDetail row={r} labelledBy={teamflowRowButtonId(r.isin)} />}
          </li>
        );
      })}
    </ol>
  );
}
