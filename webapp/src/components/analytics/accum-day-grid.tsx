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
  hasDayAvgOf,
  isCarry,
  isDimRow,
  metaLineOf,
  prevDayOf,
  reasonLineOf,
  regCellOf,
  stateLabelOf,
  type AccumMetaItem,
  type AccumTag,
} from '@/lib/accum-report';
import { TONE_TEXT, fmtEok, fmtPnl, fmtRate, isNum, pnlOf, toneOf } from '@/lib/teamflow-report';
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
 *     3줄 메타 「팀 순매수 · 하루 · (손익) · 등록→종료」(`metaLineOf` + 손익은 pnl 있을 때만). 결과 보조줄 · 평단/등록가 줄은 숨김.
 *   - xl 8열: 종목 · 상태(배지 묶음 + 사유 줄 nowrap) · 결과(태그 + 「고가」 보조줄) · 팀 순매수(+ 「평단 · 등록가」 truncate) ·
 *     하루 순매수(값만 — D-10) · 팀 당일 손익(±억 2자리 + 아랫줄 수익률 · pnl 없음 「—」 — teamflow 팀 손익 칸 동형 · 2026-10-21) ·
 *     등록·종료 2줄(`regCellOf`) · 셰브론. 메타 묶음은 xl 에서 `contents` 로 풀리고 라벨은 `xl:sr-only`
 *     (등록 항목은 xl 에서 숨기고 등록·종료 칸이 대신한다).
 * - 흐린 행(D-11): `isDimRow`(종료 이월 탈락 · 만료) 면 행 버튼 `data-dim="true"` · 종목 · 결과 · 금액 · 등록 칸만 `opacity-60`
 *   (`dimOf` — 배지 묶음 · 사유 줄은 정상 농도: 흐림의 뜻을 말하는 줄이 가장 흐리면 대비가 AA 밖 · 34 UI 리뷰) ·
 *   행 hover · focus-visible · 열림 때 1 · 150ms · reduced-motion 즉시. 장중 청산은 정상 농도 · 상세(열린 영역)는 흐리지 않는다.
 * - 상태 배지 라벨은 자체 라벨(`stateLabelOf` — 3 「종료」) · shared `ACCUM_STATE_LABELS` 를 쓰지 않는다.
 * - 치수 불변: `min-h-11` · 패딩 8/12 · `gap-x-3` · `gap-y-1.5` · `scroll-mt-[calc(4.5rem+var(--app-safe-top))]`.
 * - 열린 행 바로 아래에만 `AccumDetail` 을 마운트한다(접으면 언마운트 · 받은 상세는 캐시에 남는다 — D-06).
 * - 당일 축 날짜(`dayAxis` · quick-261026-01h · 스케치 018)만 — 캡션 「… 그 안 당일 순매수 큰 순」 · 머리 4열 「당일 순매수」/
 *   「(등록 후 · 아래 누적)」 · 4열 칸 = 당일(`accum-today` · 부호 색 · 값 없음 「—」 --faint) + xl 아랫줄 「누적 {pos} · 누적 평단 N」
 *   (`accum-cum-sub`) · 폰 메타 「당일 · 누적(`accum-pos` · xl 숨김) · 하루 · 손익 · 등록」 · sr 설명 당일 문장 · 이월 행이고 전날 매수나
 *   매도가 있으면 상세에 「전날」 줄(`prev` = prev_date + prev 2키). dayAxis 가 아니면 DOM · 글자가 지금과 같다(재생성 전 날짜).
 *   그날 pos_day_avg_px 열이 실렸으면(hasDayAvgOf · quick-261026-0ty) 상세 KPI 에 당일 평단.
 */

const COLS_XL = 'xl:grid-cols-[minmax(0,176px)_minmax(152px,1fr)_104px_160px_112px_96px_88px_16px]';

const CAPTION = '매집중 → 매도중 → 종료 · 그 안 팀 순매수(등록 후) 큰 순';
const CAPTION_DAY = '매집중 → 매도중 → 종료 · 그 안 당일 순매수 큰 순';

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

/**
 * 흐린 행의 흐릴 칸 클래스(D-11 · `group` = 행 버튼) — 메타 묶음은 xl 에서 `contents` 라 불투명도가 안 먹으므로 그 자식에 단다.
 * 열리면 흐리지 않는다.
 */
function dimOf(dim: boolean, open: boolean): string | undefined {
  if (!dim) return undefined;
  return cn(
    'transition-opacity duration-150 motion-reduce:transition-none',
    !open && 'opacity-60 group-hover:opacity-100 group-focus-visible:opacity-100',
  );
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

export function AccumDayGrid({
  date,
  rows,
  dayAxis = false,
  prevDate = null,
}: {
  date: string;
  rows: readonly AccumReportRow[];
  /** 당일 축 날짜(`dayAxisOf`) — 4열 · 메타 · 캡션 · 상세가 당일 순매수 주인공(quick-261026-01h). */
  dayAxis?: boolean;
  /** 목록 봉투 prev_date — 상세 「전날」 줄 날짜. */
  prevDate?: string | null;
}) {
  // quick-261026-0ty — 당일 평단 열이 실린 당일 축 날짜(날짜 단위 판정)
  const dayAvg = dayAxis && hasDayAvgOf(rows);
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
        <span className="text-[length:var(--t-caption)] break-keep text-[var(--muted-fg)]">
          {dayAxis ? CAPTION_DAY : CAPTION}
        </span>
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
        {dayAxis ? (
          <span className="flex flex-col">
            <span>당일 순매수</span>
            <span>(등록 후 · 아래 누적)</span>
          </span>
        ) : (
          <span className="flex flex-col">
            <span>팀 순매수</span>
            <span>(등록 후)</span>
          </span>
        )}
        <span className="flex flex-col">
          <span>하루 순매수</span>
          <span>(등록 전 포함)</span>
        </span>
        <span>팀 당일 손익</span>
        <span>등록 · 종료</span>
        <span />
      </div>
      <ol ref={listRef} data-slot="accum-list" className="m-0 mt-1 list-none p-0 xl:mt-0">
        {rows.map((r) => {
          const open = openIsin === r.isin;
          const dim = isDimRow(r);
          const dimCls = dimOf(dim, open);
          const label = labelOf(r);
          const sub = r.short_code ? [r.short_code, r.market].filter(Boolean).join(' · ') : null;
          const tag = accumTagOf(r);
          const reason = reasonLineOf(r);
          // 당일 축 = [당일, 누적, 하루, 등록] · 아니면 [팀 순매수, 하루, 등록]
          const meta = metaLineOf(r, dayAxis);
          const [lead, cumItem] = dayAxis ? [meta[0]!, meta[1]!] : [meta[0]!, null];
          const day = meta[meta.length - 2] as AccumMetaItem;
          const reg = meta[meta.length - 1] as AccumMetaItem;
          const avg = `평단 ${fmtPx(r.pos_avg_px)} · 등록가 ${fmtPx(r.pos_reg_px)}`;
          const cumSub = cumItem === null ? '' : `누적 ${cumItem.value} · 누적 평단 ${fmtPx(r.pos_avg_px)}`;
          const [regTop, regBottom] = regCellOf(r);
          const carry = typeof r.carry_days === 'number' && r.carry_days > 0 ? r.carry_days : 0;
          const cycle = typeof r.cycle === 'number' && Number.isFinite(r.cycle) && r.cycle > 1 ? r.cycle : null;
          const pnl = pnlOf(r);
          const pnlTotal = pnl ? fmtEok(pnl.total_val, { signed: true, digits: 2 }) : null;
          // 상세 「전날」 줄 — 당일 축 · 이월 행 · prev_date 있음 · 전날 매수나 매도가 있을 때만
          const prevDay = dayAxis && carry > 0 && prevDate ? prevDayOf(r) : null;
          const prev =
            prevDay !== null && prevDate && (prevDay.buyKrw > 0 || prevDay.sellKrw > 0)
              ? { date: prevDate, ...prevDay }
              : null;
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
                  'group grid min-h-11 w-full scroll-mt-[calc(4.5rem+var(--app-safe-top))] grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-x-3 gap-y-1.5 rounded-[var(--r)] px-2 py-3 text-left',
                  'hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
                  open && 'bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
                  COLS_XL,
                )}
              >
                {/* 종목 — 이름(name · null 이면 short_code · 말줄임) / 코드 · 시장(market null 이면 코드만) */}
                <span className={cn('col-start-1 row-start-1 flex min-w-0 flex-col xl:col-start-1', dimCls)}>
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
                <span
                  className={cn(
                    'col-start-2 row-start-1 flex min-w-0 flex-col items-end gap-0.5 justify-self-end xl:col-start-3 xl:items-start xl:justify-self-start',
                    dimCls,
                  )}
                >
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

                {/* 메타 — < xl 3줄(라벨 + 값 · flex-wrap) · xl 에서는 contents 로 풀려 4 · 5열(손익 · 등록 항목은 xl 숨김 → 6 · 7열 칸) */}
                <span className="col-span-3 row-start-3 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[length:var(--t-caption)] xl:contents">
                  {cumItem === null ? (
                    <span
                      className={cn(
                        'inline-flex min-w-0 items-baseline gap-1 xl:col-start-4 xl:row-start-1 xl:flex xl:flex-col xl:items-start xl:gap-0',
                        dimCls,
                      )}
                    >
                      <span className="shrink-0 text-[var(--muted-fg)] xl:sr-only">{lead.label}</span>
                      <span
                        data-slot="accum-pos"
                        title={lead.value}
                        className={cn(
                          'mono min-w-0 truncate xl:text-[length:var(--t-sm)] xl:font-semibold',
                          metaTone(lead.tone),
                        )}
                      >
                        {lead.value}
                      </span>
                      <span
                        data-slot="accum-avg"
                        title={avg}
                        className="mono hidden max-w-full min-w-0 truncate text-[length:var(--t-caption)] text-[var(--muted-fg)] xl:block"
                      >
                        {avg}
                      </span>
                    </span>
                  ) : (
                    <>
                      {/* 당일 축 — 4열 = 당일(큰 숫자) + xl 아랫줄 누적 · 누적 평단 */}
                      <span
                        className={cn(
                          'inline-flex min-w-0 items-baseline gap-1 xl:col-start-4 xl:row-start-1 xl:flex xl:flex-col xl:items-start xl:gap-0',
                          dimCls,
                        )}
                      >
                        <span className="shrink-0 text-[var(--muted-fg)] xl:sr-only">{lead.label}</span>
                        <span
                          data-slot="accum-today"
                          title={lead.value}
                          className={cn(
                            'mono min-w-0 truncate xl:text-[length:var(--t-sm)] xl:font-semibold',
                            metaTone(lead.tone),
                          )}
                        >
                          {lead.value}
                        </span>
                        <span
                          data-slot="accum-cum-sub"
                          title={cumSub}
                          className="mono hidden max-w-full min-w-0 truncate text-[length:var(--t-caption)] text-[var(--muted-fg)] xl:block"
                        >
                          {cumSub}
                        </span>
                      </span>
                      {/* 누적 — 폰 메타만(xl 은 4열 아랫줄이 말한다) */}
                      <span className={cn('inline-flex min-w-0 items-baseline gap-1 xl:hidden', dimCls)}>
                        <span className="shrink-0 text-[var(--muted-fg)]">{cumItem.label}</span>
                        <span
                          data-slot="accum-pos"
                          title={cumItem.value}
                          className={cn('mono min-w-0 truncate', metaTone(cumItem.tone))}
                        >
                          {cumItem.value}
                        </span>
                      </span>
                    </>
                  )}

                  <span className={cn('inline-flex min-w-0 items-baseline gap-1 xl:col-start-5 xl:row-start-1', dimCls)}>
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

                  {pnl && (
                    <span
                      data-slot="accum-pnl-meta"
                      className={cn('inline-flex min-w-0 items-baseline gap-1 xl:hidden', dimCls)}
                    >
                      <span className="shrink-0 text-[var(--muted-fg)]">손익</span>
                      <span className={cn('mono min-w-0 truncate', TONE_TEXT[toneOf(pnl.total_val, 2)])}>
                        {fmtPnl(pnl)}
                      </span>
                    </span>
                  )}

                  <span data-slot="accum-meta-reg" className={cn('min-w-0 truncate xl:hidden', dimCls)}>
                    {reg.label !== null && (
                      <>
                        <span className="text-[var(--muted-fg)]">{reg.label}</span>{' '}
                      </>
                    )}
                    <span className="mono text-[var(--fg-2)]">{reg.value}</span>
                  </span>
                </span>

                {/* 팀 당일 손익 — xl 6열만(< xl 은 메타 줄 「손익」) · pnl 없음 「—」 */}
                <span
                  data-slot="accum-pnl-cell"
                  className={cn('hidden min-w-0 flex-col xl:col-start-6 xl:row-start-1 xl:flex', dimCls)}
                >
                  {pnl ? (
                    <>
                      <span
                        data-slot="accum-pnl-total"
                        title={pnlTotal!}
                        className={cn(
                          'mono min-w-0 truncate text-[length:var(--t-sm)] font-semibold',
                          TONE_TEXT[toneOf(pnl.total_val, 2)],
                        )}
                      >
                        {pnlTotal}
                      </span>
                      <span
                        data-slot="accum-pnl-ret"
                        className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]"
                      >
                        {isNum(pnl.ret) ? fmtRate(pnl.ret * 100) : '—'}
                      </span>
                    </>
                  ) : (
                    <span className="mono text-[length:var(--t-sm)] text-[var(--faint)]">—</span>
                  )}
                </span>

                {/* 등록 · 종료 — xl 7열만(< xl 은 메타 줄 「등록 … → …」) */}
                <span
                  data-slot="accum-reg"
                  className={cn('hidden min-w-0 flex-col xl:col-start-7 xl:row-start-1 xl:flex', dimCls)}
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
                    'col-start-3 row-start-1 size-4 shrink-0 justify-self-end text-[var(--muted-fg)] transition-transform duration-200 motion-reduce:transition-none xl:col-start-8 xl:row-start-1',
                    open && 'rotate-180',
                  )}
                />
                <span id={`accum-row-desc-${r.isin}`} className="sr-only">
                  {accumRowDescriptionOf(r, dayAxis)}
                </span>
              </button>
              {open && (
                <AccumDetail
                  date={date}
                  isin={r.isin}
                  labelledBy={accumRowButtonId(r.isin)}
                  dayAxis={dayAxis}
                  dayAvg={dayAvg}
                  prev={prev}
                />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
