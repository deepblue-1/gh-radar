'use client';

import type { ReactNode } from 'react';

import type { LimitupDayRow, LimitupResultTag } from '@/lib/limitup-report';
import { CARD, ROW_DIVIDER } from '@/components/layout/page-layout';
import { cn } from '@/lib/utils';

import { LimitupSparkline } from './limitup-sparkline';

/**
 * 하루 격자 (UI-SPEC ④-3 · D-11 · D-12) — 그날 상한가 종목을 위에서 아래로 훑는 한 장(gh-trade D-20 「B 하루 격자」).
 *
 * - 행 순서 = gh-trade `_stocks`(`dayRowsOf` — 도달 먼저 → 첫 상한 체결, 없으면 첫 잠김 시작 → isin). 20행이 넘어도 접지 않는다.
 * - **같은 DOM, CSS 로만 배치 전환**(뷰포트 — R-8): < xl 2단 카드형(1줄 종목 … 결과 · 2줄 스파크 · 3줄 메타 flex-wrap) /
 *   xl 이상 8열 표(`152px 1fr 72px 40px 64px 72px 96px 128px`). 메타 묶음은 xl 에서 `contents` 로 풀려 각 칸이 열을 잡고,
 *   라벨은 `xl:sr-only` 로 남는다(데스크톱 머리줄은 장식이라 `aria-hidden`).
 * - 행 = `<ol>` 의 `<li>` 안 `<button type="button">` — 누르면 `#ev-{isin}` 사건 카드(28-13)로 스크롤한 뒤 그 카드 `h3`
 *   로 포커스를 옮긴다. 카드가 아직 없으면 아무것도 하지 않는다.
 * - 탐지 0 인 날 = 격자 자리 빈 상태 「이 날은 상한가 사건이 없어요」(E7 empty — 페이지는 정상).
 */

const COLS_XL = 'xl:grid-cols-[152px_1fr_72px_40px_64px_72px_96px_128px]';

const TAG_TONE: Record<LimitupResultTag, string> = {
  깨짐: 'bg-[var(--up-bg)] text-[var(--up)]',
  유지: 'bg-[var(--down-bg)] text-[var(--down)]',
  '잠김 없음': 'bg-[var(--muted)] text-[var(--muted-fg)]',
  미도달: 'bg-[var(--muted)] text-[var(--muted-fg)]',
};

/** 사건 카드로 스크롤 + h3 포커스(모션 절 — reduced-motion 이면 즉시). 카드가 없으면 no-op. */
export function scrollToEventCard(isin: string): void {
  const card = document.getElementById(`ev-${isin}`);
  if (!card) return;
  const reduce =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  card.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
}

function ResultTags({ tags, className }: { tags: readonly LimitupResultTag[]; className?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center gap-1', className)}>
      {tags.map((t) => (
        <span
          key={t}
          data-tag={t}
          className={cn(
            'inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap',
            TAG_TONE[t],
          )}
        >
          {t}
        </span>
      ))}
    </span>
  );
}

/** 메타 한 칸 — 폰: 「라벨 값」 · xl: 라벨 sr-only + 값이 자기 열을 잡는다. */
function Meta({
  label,
  value,
  col,
  mono = true,
  className,
  children,
}: {
  label: string;
  value: string;
  col: string;
  /** 시각 · 수 · 금액 · % 는 mono(tabular) — 창구 이름은 아니다. */
  mono?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-baseline gap-1 xl:row-start-1', col, className)}>
      <span className="shrink-0 text-[var(--muted-fg)] xl:sr-only">{label}</span>
      <span className={cn('min-w-0 truncate text-[var(--fg-2)]', mono && 'mono')} title={value}>
        {value}
      </span>
      {children}
    </span>
  );
}

export function LimitupDayGrid({ rows }: { rows: readonly LimitupDayRow[] }) {
  return (
    <section data-slot="limitup-day-grid" aria-labelledby="limitup-grid-title" className={cn(CARD, 'p-4')}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="limitup-grid-title" className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          하루 격자
        </h2>
        <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          상한가 매수잔량 금액 · 09:00~15:30
        </span>
      </div>

      {rows.length === 0 ? (
        <div data-slot="limitup-grid-empty" className="flex flex-col items-center gap-1 py-12 text-center">
          <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">이 날은 상한가 사건이 없어요</p>
          <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            탐지 종목이 0개인 날이에요. ‹ 로 이전 보고서를 볼 수 있어요
          </p>
        </div>
      ) : (
        <>
          <div
            aria-hidden="true"
            className={cn(
              'mt-3 hidden gap-x-2 border-b border-[var(--border-subtle)] px-2 pb-2 text-[length:var(--t-caption)] text-[var(--muted-fg)] xl:grid',
              COLS_XL,
            )}
          >
            <span>종목</span>
            <span>잔량 곡선</span>
            <span>첫 잠김</span>
            <span>잠김</span>
            <span>최대 잔량</span>
            <span>+60초 매도</span>
            <span>결과</span>
            <span>진입 매수 창구</span>
          </div>
          <ol data-slot="limitup-grid-rows" className="m-0 mt-1 list-none p-0 xl:mt-0">
            {rows.map((r) => (
              <li key={r.isin} className={cn(ROW_DIVIDER)}>
                <button
                  type="button"
                  data-isin={r.isin}
                  aria-label={`${r.label}${r.code ? ` ${r.code}` : ''} — 사건 카드로 이동`}
                  onClick={() => scrollToEventCard(r.isin)}
                  className={cn(
                    'grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-[var(--r)] px-2 py-3 text-left',
                    'hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
                    COLS_XL,
                  )}
                >
                  <span className="col-start-1 row-start-1 flex min-w-0 items-baseline xl:col-start-1">
                    <span
                      className="min-w-0 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]"
                      title={r.label}
                    >
                      {r.label}
                    </span>
                    {r.code && (
                      <span className="mono ml-1 shrink-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                        {r.code}
                      </span>
                    )}
                  </span>

                  <ResultTags
                    tags={r.tags}
                    className="col-start-2 row-start-1 justify-self-end xl:col-start-7 xl:justify-self-start"
                  />

                  <span className="col-span-2 row-start-2 block min-w-0 xl:col-span-1 xl:col-start-2 xl:row-start-1">
                    <LimitupSparkline summary={r.summary} locks={r.locks} />
                  </span>

                  <span className="col-span-2 row-start-3 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[length:var(--t-caption)] xl:contents">
                    <Meta label="첫 잠김" value={r.firstLock} col="xl:col-start-3" />
                    <Meta label="잠김" value={r.lockCount} col="xl:col-start-4" />
                    <Meta label="최대" value={r.maxQ} col="xl:col-start-5" />
                    <Meta label="+60초 매도" value={r.sell60} col="xl:col-start-6" />
                    <Meta label="창구" value={r.members} col="xl:col-start-8" mono={false} className="max-w-full">
                      {r.members !== '—' && (
                        <span
                          title="추정(분 단위)"
                          className="inline-flex h-4 shrink-0 items-center rounded-[4px] bg-[var(--muted)] px-1 text-[11px] font-semibold text-[var(--muted-fg)]"
                        >
                          추정
                        </span>
                      )}
                    </Meta>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
