'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import type { TeamflowRow } from '@gh-radar/shared';

import { ROW_DIVIDER } from '@/components/layout/page-layout';
import {
  TONE_TEXT,
  bandSlotsOf,
  fmtEok,
  fmtPnl,
  fmtRate,
  fmtShare,
  isHotShare,
  isNum,
  pnlOf,
  rowDescriptionOf,
  tagOf,
  toneOf,
  type TeamflowTag,
} from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

import { TeamflowBandStrip } from './teamflow-band-strip';
import { TeamflowDetail } from './teamflow-detail';

/**
 * 팀 매집 탐지 종목 목록 + 그 자리 펼침 (Phase 33 · UI-SPEC T3 · T4 · D-08 · D-09 · D-11 · D-14).
 *
 * `limitup-day-grid.tsx` 의 아코디언 문법을 복제한다(일반화하지 않는다 — 열 · 기본 펼침이 다르다).
 * - **기본 전부 접힘**(D-08 — 상한가 보고서는 첫 행 펼침): 한 번에 하나 · 같은 행 다시 누름 = 접힘 · 다른 행 = 그 행만.
 *   날짜가 바뀌면 부모가 `key=date` 로 새로 만든다(전부 접힘으로 시작).
 * - 위쪽 상세가 접히며 새로 연 행이 앱 머리 위로 밀려 올라가면 `scrollIntoView({block:'start'})`(reduced-motion = 즉시) —
 *   `pendingScroll` 규칙. 포커스는 행 버튼에 남는다.
 * - 행 버튼 aria: `id = teamflow-row-{isin}` · `data-isin` · `aria-expanded` · 열렸을 때만 `aria-controls="tf-{isin}"` ·
 *   접근 이름 「{종목명} {코드} — 팀 매집 상세」 · `aria-describedby` = sr-only 행 설명(`rowDescriptionOf` —
 *   button 자식은 presentational 이라 보이는 칸을 직접 잇지 않는다).
 * - 같은 DOM · CSS 로만 배치 전환(뷰포트 — UI-SPEC T3): < xl 카드형(1줄 종목 … 결과 태그 · 셰브론 / 2줄 미니막대 전폭 /
 *   3줄 메타 「팀 순매수 · (손익) · 20% 아래 · 매수 중 팀」) · xl 8열(종목 · 결과(태그 + 미도달 보조줄 「고가 +NN.N%」) · 팀 순매수 ·
 *   팀 손익(±억 2자리 + 아랫줄 수익률 · pnl 없음 「—」 — quick 261018-j17) · 20% 아래/위 두 줄 · 매수 중 팀 · 미니막대 · 셰브론) +
 *   `aria-hidden` 열 머리. < xl 메타 「손익」 항목은 pnl 이 있을 때만(옛 행 메타 줄 불변). 메타 묶음은 xl 에서 `contents` 로 풀리고
 *   라벨은 `xl:sr-only`(20% 칸 라벨은 xl 에서도 보인다 — 두 줄을 가르는 글자). 셰브론은 폰에서도 보인다.
 * - 치수 불변: `min-h-11` · 패딩 8/12 · `gap-x-3` · `gap-y-1.5` · `scroll-mt-[calc(4.5rem+var(--app-safe-top))]` · 열 템플릿.
 * - 열린 행 바로 아래에만 `TeamflowDetail` 을 마운트한다(접으면 언마운트 → 상세 안 토글 상태도 초기화).
 */

const COLS_XL = 'xl:grid-cols-[minmax(0,168px)_104px_80px_96px_minmax(0,148px)_72px_minmax(0,1fr)_16px]';

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

/** 금액 칸 글자 색 — 부호 색(반올림 0 = `--fg-2`) · null 「—」 = `--faint`. */
function amountTone(won: number | null): string {
  return won === null ? 'text-[var(--faint)]' : TONE_TEXT[toneOf(won)];
}

/** 매수 중 팀 글자 — ≥ 30% `--team` 600 · 미만 `--fg-2` 400 · null 「—」 `--faint`. */
function shareTone(share: number | null): string {
  if (share === null) return 'text-[var(--faint)]';
  return isHotShare(share) ? 'font-semibold text-[var(--team)]' : 'text-[var(--fg-2)]';
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
    <>
      <div
        aria-hidden="true"
        data-slot="teamflow-list-head"
        className={cn(
          'mt-3 hidden gap-x-3 border-b border-[var(--border-subtle)] px-2 pb-2 text-[length:var(--t-caption)] whitespace-nowrap text-[var(--muted-fg)] xl:grid',
          COLS_XL,
        )}
      >
        <span>종목</span>
        <span>결과</span>
        <span>팀 순매수</span>
        <span>팀 손익</span>
        <span>20% 아래 / 위</span>
        <span>매수 중 팀</span>
        <span>구간별 순매수</span>
        <span />
      </div>
      <ol ref={listRef} data-slot="teamflow-list" className="m-0 mt-1 list-none p-0 xl:mt-0">
        {rows.map((r) => {
          const open = openIsin === r.isin;
          const tag = tagOf(r);
          const label = labelOf(r);
          const sub = r.short_code ? [r.short_code, r.market].filter(Boolean).join(' · ') : null;
          const net = fmtEok(r.team_net_val, { signed: true });
          const below20 = fmtEok(r.below20_net_val, { signed: true });
          const above20 = fmtEok(r.above20_net_val, { signed: true });
          // D-09 — 결과 보조줄은 미도달 · high_rate 있을 때만(sr 설명 `rowDescriptionOf` 와 같은 `isNum` 판정 · IN-04)
          const high = tag.kind === 'below' && isNum(r.high_rate) ? fmtRate(r.high_rate) : null;
          const pnl = pnlOf(r.payload);
          const pnlTotal = pnl ? fmtEok(pnl.total_val, { signed: true, digits: 2 }) : null;
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

                {/* 결과 — 태그 + (xl) 보조줄 「고가 +29.1%」 */}
                <span className="col-start-2 row-start-1 flex min-w-0 flex-col items-end gap-0.5 justify-self-end xl:col-start-2 xl:items-start xl:justify-self-start">
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
                  {high !== null && (
                    <span
                      data-slot="teamflow-high"
                      className="hidden text-[length:var(--t-caption)] whitespace-nowrap text-[var(--muted-fg)] xl:block"
                    >
                      고가 <span className="mono">{high}</span>
                    </span>
                  )}
                </span>

                {/* 팀 손익 — xl 4열만(< xl 은 메타 줄 「손익」) · pnl 없음 「—」 */}
                <span
                  data-slot="teamflow-pnl-cell"
                  className="hidden min-w-0 flex-col xl:col-start-4 xl:row-start-1 xl:flex"
                >
                  {pnl ? (
                    <>
                      <span
                        data-slot="teamflow-pnl-total"
                        title={pnlTotal!}
                        className={cn(
                          'mono min-w-0 truncate text-[length:var(--t-sm)] font-semibold',
                          TONE_TEXT[toneOf(pnl.total_val, 2)],
                        )}
                      >
                        {pnlTotal}
                      </span>
                      <span
                        data-slot="teamflow-pnl-ret"
                        className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]"
                      >
                        {isNum(pnl.ret) ? fmtRate(pnl.ret * 100) : '—'}
                      </span>
                    </>
                  ) : (
                    <span className="mono text-[length:var(--t-sm)] text-[var(--faint)]">—</span>
                  )}
                </span>

                {/* 미니막대 — < xl 2줄 전폭 · xl 7열 */}
                <span className="col-span-3 row-start-2 block min-w-0 xl:col-span-1 xl:col-start-7 xl:row-start-1">
                  <TeamflowBandStrip slots={bandSlotsOf(r.payload?.bands ?? [])} />
                </span>

                {/* 메타 — < xl 3줄(라벨 + 값 · flex-wrap) · xl 에서는 contents 로 풀려 3 · 5 · 6열(손익 항목은 xl 숨김) */}
                <span className="col-span-3 row-start-3 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[length:var(--t-caption)] xl:contents">
                  <span className="inline-flex min-w-0 items-baseline gap-1 xl:col-start-3 xl:row-start-1">
                    <span className="shrink-0 text-[var(--muted-fg)] xl:sr-only">팀 순매수</span>
                    <span
                      data-slot="teamflow-net"
                      title={net}
                      className={cn(
                        'mono min-w-0 truncate xl:text-[length:var(--t-sm)] xl:font-semibold',
                        amountTone(r.team_net_val),
                      )}
                    >
                      {net}
                    </span>
                  </span>

                  {pnl && (
                    <span
                      data-slot="teamflow-pnl-meta"
                      className="inline-flex min-w-0 items-baseline gap-1 xl:hidden"
                    >
                      <span className="shrink-0 text-[var(--muted-fg)]">손익</span>
                      <span className={cn('mono min-w-0 truncate', TONE_TEXT[toneOf(pnl.total_val, 2)])}>
                        {fmtPnl(pnl)}
                      </span>
                    </span>
                  )}

                  <span className="flex min-w-0 flex-col xl:col-start-5 xl:row-start-1">
                    <span className="inline-flex min-w-0 items-baseline gap-1">
                      <span className="shrink-0 text-[var(--muted-fg)]">20% 아래</span>
                      <span
                        data-slot="teamflow-below20"
                        title={below20}
                        className={cn('mono min-w-0 truncate', amountTone(r.below20_net_val))}
                      >
                        {below20}
                      </span>
                    </span>
                    <span className="hidden min-w-0 items-baseline gap-1 xl:inline-flex">
                      <span className="shrink-0 text-[var(--muted-fg)]">20%~상한</span>
                      <span
                        data-slot="teamflow-above20"
                        title={above20}
                        className={cn('mono min-w-0 truncate', amountTone(r.above20_net_val))}
                      >
                        {above20}
                      </span>
                    </span>
                  </span>

                  <span className="inline-flex min-w-0 items-baseline gap-1 xl:col-start-6 xl:row-start-1">
                    <span className="shrink-0 text-[var(--muted-fg)] xl:sr-only">매수 중 팀</span>
                    <span
                      data-slot="teamflow-share"
                      className={cn('mono min-w-0 truncate xl:text-[length:var(--t-sm)]', shareTone(r.team_buy_share))}
                    >
                      {fmtShare(r.team_buy_share)}
                    </span>
                  </span>
                </span>

                <ChevronDown
                  aria-hidden="true"
                  data-slot="teamflow-row-chevron"
                  className={cn(
                    'col-start-3 row-start-1 size-4 shrink-0 justify-self-end text-[var(--muted-fg)] transition-transform duration-200 motion-reduce:transition-none xl:col-start-8 xl:row-start-1',
                    open && 'rotate-180',
                  )}
                />
                <span id={`teamflow-row-desc-${r.isin}`} className="sr-only">
                  {rowDescriptionOf(r)}
                </span>
              </button>
              {open && <TeamflowDetail row={r} labelledBy={teamflowRowButtonId(r.isin)} />}
            </li>
          );
        })}
      </ol>
    </>
  );
}
