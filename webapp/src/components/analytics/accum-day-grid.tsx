'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import type { AccumReportRow } from '@gh-radar/shared';

import { ROW_DIVIDER } from '@/components/layout/page-layout';
import {
  ACCUM_DROP_TITLE,
  accumRowDescriptionOf,
  accumTagOf,
  fmtPx,
  isCarry,
  isDimRow,
  metaLineOf,
  reasonLineOf,
  regCellOf,
  stateLabelOf,
  type AccumMetaItem,
  type AccumTag,
} from '@/lib/accum-report';
import { TONE_TEXT } from '@/lib/teamflow-report';
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
 *   `aria-describedby="accum-row-desc-{isin}"` = sr-only 행 설명(`accumRowDescriptionOf` — button 자식은 presentational 이라
 *   보이는 칸을 직접 잇지 않는다).
 * - 카드 머리 = 소제목 「매집감지 종목」 + 캡션(정렬 규칙) → (xl) `aria-hidden` 열 머리(2줄 머리 · 괄호 줄) → `ol`.
 * - 같은 DOM · CSS 로만 배치 전환(뷰포트 — UI-SPEC A3):
 *   - < xl 카드형 3줄: 1줄 [종목] … [결과 태그] [셰브론] / 2줄 배지 묶음(상태 → 이월 D+n → 사이클 n · flex-wrap) + 종료 행 사유 줄 /
 *     3줄 메타 「팀 순매수 · 하루 · 등록→종료」(`metaLineOf`). 결과 보조줄 · 평단/등록가 줄은 숨김.
 *   - xl 7열: 종목 · 상태(배지 묶음 + 사유 줄 nowrap) · 결과(태그 + 「고가」 보조줄) · 팀 순매수(+ 「평단 · 등록가」 truncate) ·
 *     하루 순매수(값만 — D-10) · 등록·종료 2줄(`regCellOf`) · 셰브론. 메타 묶음은 xl 에서 `contents` 로 풀리고 라벨은 `xl:sr-only`
 *     (등록 항목은 xl 에서 숨기고 등록·종료 칸이 대신한다).
 * - 흐린 행(D-11): `isDimRow`(종료 이월 탈락 · 만료) 면 행 버튼 `opacity-60` + `data-dim="true"` · hover · focus-visible · 열림 때 1 ·
 *   150ms · reduced-motion 즉시. 장중 청산은 정상 농도 · 상세(열린 영역)는 흐리지 않는다.
 * - 상태 배지 라벨은 자체 라벨(`stateLabelOf` — 3 「종료」) · shared `ACCUM_STATE_LABELS` 를 쓰지 않는다.
 * - 치수 불변: `min-h-11` · 패딩 8/12 · `gap-x-3` · `gap-y-1.5` · `scroll-mt-[calc(4.5rem+var(--app-safe-top))]`.
 * - 열린 행 바로 아래에만 `AccumDetail` 을 마운트한다(접으면 언마운트 · 받은 상세는 캐시에 남는다 — D-06).
 */

const COLS_XL = 'xl:grid-cols-[minmax(0,176px)_minmax(152px,1fr)_104px_160px_112px_88px_16px]';

const CAPTION = '매집중 → 매도중 → 종료 · 그 안 팀 순매수(등록 후) 큰 순';

const BADGE =
  'inline-flex h-5 items-center rounded-[4px] border border-transparent px-1.5 text-[11px] font-semibold whitespace-nowrap';

/** 상태 배지 색(UI-SPEC Color) — 1 팀 축 · 2 매도 축 · 3(및 그 밖) 중립 + 1px 테두리. */
function stateTone(state: number | null): string {
  if (state === 1) return 'bg-[var(--team-bg)] text-[var(--team)]';
  if (state === 2) return 'bg-[var(--accum-sell-bg)] text-[var(--accum-sell)]';
  return 'border-[var(--border-subtle)] bg-[var(--muted)] text-[var(--muted-fg)]';
}

const TAG_TONE: Record<AccumTag['kind'], string> = {
  limit: 'bg-[var(--up-bg)] text-[var(--up)]',
  rate: 'bg-[var(--muted)] text-[var(--fg-2)]',
  none: 'bg-[var(--muted)] text-[var(--fg-2)]',
};

/** 금액 글자 색 — 부호 색(반올림 0 = `--fg-2`) · 값 없음 「—」 = `--faint`. */
function metaTone(tone: AccumMetaItem['tone']): string {
  if (tone === undefined) return 'text-[var(--fg-2)]';
  return tone === 'none' ? 'text-[var(--faint)]' : TONE_TEXT[tone];
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
    <>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="accum-list-title" className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          매집감지 종목
        </h2>
        <span className="text-[length:var(--t-caption)] break-keep text-[var(--muted-fg)]">{CAPTION}</span>
      </div>
      <div
        aria-hidden="true"
        data-slot="accum-list-head"
        className={cn(
          'mt-3 hidden items-end gap-x-3 border-b border-[var(--border-subtle)] px-2 pb-2 text-[length:var(--t-caption)] whitespace-nowrap text-[var(--muted-fg)] xl:grid',
          COLS_XL,
        )}
      >
        <span>종목</span>
        <span>상태</span>
        <span>결과</span>
        <span className="flex flex-col">
          <span>팀 순매수</span>
          <span>(등록 후)</span>
        </span>
        <span className="flex flex-col">
          <span>하루 순매수</span>
          <span>(등록 전 포함)</span>
        </span>
        <span>등록 · 종료</span>
        <span />
      </div>
      <ol ref={listRef} data-slot="accum-list" className="m-0 mt-1 list-none p-0 xl:mt-0">
        {rows.map((r) => {
          const open = openIsin === r.isin;
          const dim = isDimRow(r);
          const label = labelOf(r);
          const sub = r.short_code ? [r.short_code, r.market].filter(Boolean).join(' · ') : null;
          const tag = accumTagOf(r);
          const reason = reasonLineOf(r);
          const [pos, day, reg] = metaLineOf(r) as [AccumMetaItem, AccumMetaItem, AccumMetaItem];
          const avg = `평단 ${fmtPx(r.pos_avg_px)} · 등록가 ${fmtPx(r.pos_reg_px)}`;
          const [regTop, regBottom] = regCellOf(r);
          const carry = typeof r.carry_days === 'number' && r.carry_days > 0 ? r.carry_days : 0;
          const cycle = typeof r.cycle === 'number' && Number.isFinite(r.cycle) && r.cycle > 1 ? r.cycle : null;
          return (
            <li key={r.isin} data-open={open ? 'true' : undefined} className={cn(ROW_DIVIDER)}>
              <button
                type="button"
                id={accumRowButtonId(r.isin)}
                data-isin={r.isin}
                data-dim={dim ? 'true' : undefined}
                aria-label={`${[r.name, r.short_code].filter(Boolean).join(' ') || r.isin} — 매집감지 상세`}
                aria-describedby={`accum-row-desc-${r.isin}`}
                aria-expanded={open}
                aria-controls={open ? `ac-${r.isin}` : undefined}
                onClick={() => toggle(r.isin)}
                className={cn(
                  'grid min-h-11 w-full scroll-mt-[calc(4.5rem+var(--app-safe-top))] grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-x-3 gap-y-1.5 rounded-[var(--r)] px-2 py-3 text-left',
                  'hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
                  open && 'bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
                  dim &&
                    'opacity-60 transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none',
                  dim && open && 'opacity-100',
                  COLS_XL,
                )}
              >
                {/* 종목 — 이름(name · null 이면 short_code · 말줄임) / 코드 · 시장(market null 이면 코드만) */}
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

                {/* 상태 — 배지 묶음(상태 → 이월 → 사이클) + 종료 행 사유 줄 · < xl 2줄 전폭 · xl 2열 */}
                <span className="col-span-3 row-start-2 flex min-w-0 flex-col gap-1 xl:col-span-1 xl:col-start-2 xl:row-start-1">
                  <span data-slot="accum-badges" className="flex min-w-0 flex-wrap gap-1">
                    <span data-slot="accum-state" className={cn(BADGE, stateTone(r.state))}>
                      {stateLabelOf(r.state)}
                    </span>
                    {carry > 0 && (
                      <span
                        data-slot="accum-carry"
                        className={cn(BADGE, 'bg-[var(--accum-carry-bg)] text-[var(--accum-carry)]')}
                      >
                        이월 D+{carry}
                      </span>
                    )}
                    {cycle !== null && (
                      <span data-slot="accum-cycle" className={cn(BADGE, 'bg-[var(--muted)] text-[var(--muted-fg)]')}>
                        사이클 {cycle}
                      </span>
                    )}
                  </span>
                  {reason !== null && (
                    <span
                      data-slot="accum-reason"
                      title={r.end_reason === 2 ? ACCUM_DROP_TITLE : undefined}
                      className="text-[length:var(--t-caption)] break-keep text-[var(--muted-fg)] xl:whitespace-nowrap"
                    >
                      {reason}
                    </span>
                  )}
                </span>

                {/* 결과 — 태그 + (xl) 보조줄 「고가 +NN.N%」(상한가 아닐 때만) */}
                <span className="col-start-2 row-start-1 flex min-w-0 flex-col items-end gap-0.5 justify-self-end xl:col-start-3 xl:items-start xl:justify-self-start">
                  <span
                    data-slot="accum-tag"
                    data-kind={tag.kind}
                    className={cn(
                      'inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap',
                      TAG_TONE[tag.kind],
                    )}
                  >
                    {tag.kind === 'limit' && tag.text !== '상한가' ? (
                      <>
                        상한가 <span className="mono">{tag.text.slice('상한가 '.length)}</span>
                      </>
                    ) : (
                      <span className={tag.kind === 'limit' ? undefined : 'mono'}>{tag.text}</span>
                    )}
                  </span>
                  {tag.sub !== null && (
                    <span
                      data-slot="accum-high"
                      className="hidden text-[length:var(--t-caption)] whitespace-nowrap text-[var(--muted-fg)] xl:block"
                    >
                      고가 <span className="mono">{tag.sub.slice('고가 '.length)}</span>
                    </span>
                  )}
                </span>

                {/* 메타 — < xl 3줄(라벨 + 값 · flex-wrap) · xl 에서는 contents 로 풀려 4 · 5열(등록 항목은 xl 숨김 → 6열 칸) */}
                <span className="col-span-3 row-start-3 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[length:var(--t-caption)] xl:contents">
                  <span className="inline-flex min-w-0 items-baseline gap-1 xl:col-start-4 xl:row-start-1 xl:flex xl:flex-col xl:items-start xl:gap-0">
                    <span className="shrink-0 text-[var(--muted-fg)] xl:sr-only">{pos.label}</span>
                    <span
                      data-slot="accum-pos"
                      title={pos.value}
                      className={cn(
                        'mono min-w-0 truncate xl:text-[length:var(--t-sm)] xl:font-semibold',
                        metaTone(pos.tone),
                      )}
                    >
                      {pos.value}
                    </span>
                    <span
                      data-slot="accum-avg"
                      title={avg}
                      className="mono hidden max-w-full min-w-0 truncate text-[length:var(--t-caption)] text-[var(--muted-fg)] xl:block"
                    >
                      {avg}
                    </span>
                  </span>

                  <span className="inline-flex min-w-0 items-baseline gap-1 xl:col-start-5 xl:row-start-1">
                    <span className="shrink-0 text-[var(--muted-fg)] xl:sr-only">{day.label}</span>
                    <span
                      data-slot="accum-day"
                      title={day.value}
                      className={cn(
                        'mono min-w-0 truncate xl:text-[length:var(--t-sm)] xl:font-semibold',
                        metaTone(day.tone),
                      )}
                    >
                      {day.value}
                    </span>
                  </span>

                  <span data-slot="accum-meta-reg" className="min-w-0 truncate xl:hidden">
                    {reg.label !== null && (
                      <>
                        <span className="text-[var(--muted-fg)]">{reg.label}</span>{' '}
                      </>
                    )}
                    <span className="mono text-[var(--fg-2)]">{reg.value}</span>
                  </span>
                </span>

                {/* 등록 · 종료 — xl 6열만(< xl 은 메타 줄 「등록 … → …」) */}
                <span
                  data-slot="accum-reg"
                  className="hidden min-w-0 flex-col xl:col-start-6 xl:row-start-1 xl:flex"
                >
                  <span
                    className={cn(
                      'mono truncate text-[length:var(--t-sm)]',
                      isCarry(r) ? 'text-[var(--muted-fg)]' : 'text-[var(--fg-2)]',
                    )}
                  >
                    {regTop}
                  </span>
                  <span className="truncate text-[length:var(--t-caption)] text-[var(--muted-fg)]">{regBottom}</span>
                </span>

                <ChevronDown
                  aria-hidden="true"
                  data-slot="accum-row-chevron"
                  className={cn(
                    'col-start-3 row-start-1 size-4 shrink-0 justify-self-end text-[var(--muted-fg)] transition-transform duration-200 motion-reduce:transition-none xl:col-start-7 xl:row-start-1',
                    open && 'rotate-180',
                  )}
                />
                <span id={`accum-row-desc-${r.isin}`} className="sr-only">
                  {accumRowDescriptionOf(r)}
                </span>
              </button>
              {open && <AccumDetail date={date} isin={r.isin} labelledBy={accumRowButtonId(r.isin)} />}
            </li>
          );
        })}
      </ol>
    </>
  );
}
