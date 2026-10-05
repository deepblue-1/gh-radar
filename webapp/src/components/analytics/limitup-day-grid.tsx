'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import type { LimitupDayRow, LimitupResultTag } from '@/lib/limitup-report';
import { CARD, ROW_DIVIDER } from '@/components/layout/page-layout';
import { cn } from '@/lib/utils';

import { LimitupSparkline } from './limitup-sparkline';

/**
 * 상한가 종목 리스트 + 그 자리 펼침 (UI-SPEC ④-3 · D-11 · D-12 · quick-261005-vk1 D-03 · 스케치 011 채택안 A).
 *
 * - 행 = 첫 상한가 체결이 있는 종목만(`dayRowsOf` — 미도달은 페이지가 KPI 아래 한 줄로만 말한다) · 순서 = gh-trade
 *   `_stocks`(첫 상한 체결 시각 → 첫 잠김 시작 → isin). 20행이 넘어도 접지 않는다.
 * - **아코디언(한 번에 하나)**: 행을 누르면 그 행 바로 아래에 `renderDetail(row)`(사건 카드)가 선다. 다른 행을 누르면 그
 *   행만 열리고, 같은 행을 다시 누르면 접힌다. 기본 = 첫 행 펼침 — 보고서는 읽으러 오는 화면이라 첫 화면에 사건 카드 하나가
 *   바로 보여야 하고, 비용은 격자 파일 1건(옛 화면도 상단 카드를 진입 즉시 받았다)이다. 날짜가 바뀌면 부모가 `key=date` 로
 *   이 컴포넌트를 새로 만들어 새 날짜 첫 행이 열린다.
 * - 위쪽 열린 카드가 접히며 새로 연 행이 앱 머리 위로 밀려 올라가면(점프) 그 행을 `scrollIntoView({block:'start'})` 로
 *   되돌린다(reduced-motion 이면 즉시). 포커스는 행 버튼에 그대로 둔다.
 * - **같은 DOM, CSS 로만 배치 전환**(뷰포트 — R-8): < xl 2단 카드형(1줄 종목 … 결과 · 2줄 스파크 전폭 · 3줄 메타 flex-wrap ·
 *   chevron 숨김) / xl 이상 8열 표. 메타 묶음은 xl 에서 `contents` 로 풀려 각 칸이 열을 잡고, 라벨은 `xl:sr-only` 로 남는다
 *   (데스크톱 머리줄은 장식이라 `aria-hidden`).
 * - 열(스케치 011 리스트 + 한 열 예외): 종목(이름 + 「{코드} · 상한가 {N}원」) · 결과 · 첫 상한가 · 잔량 스파크 · 최대 잔량 ·
 *   +60초 매도 · 직전 1분 매수 1위(사실 `member_entry_buy` — 추정 칩) · chevron. ★ +60초 매도는 스케치 리스트에 없지만
 *   다른 곳에 안 나오는 유일한 지표라 열로 남긴다. 첫 잠김 · 잠김 수 열은 첫 상한가 열과 펼친 카드의 잠김 사실이 대신한다.
 * - 접근 이름 「{종목명} {코드} — 사건 카드」(`aria-label` · 열림 상태는 `aria-expanded` 가 말한다) · 열렸을 때만
 *   `aria-controls="ev-{isin}"`. button 의 자식은 presentational 이라 행 값을 한 문장(`rowDescription`)으로 엮은 sr-only
 *   조각을 `aria-describedby` 로 잇는다(WR-A05). 보이는 칸들을 직접 잇지 않는 까닭: 인라인 칸 글자가 띄어쓰기 없이 붙어
 *   「최대23.4억+60초 매도4%」 처럼 읽힌다.
 * - 목록 0 인 날 = 리스트 자리 빈 상태(E7 empty — 페이지는 정상).
 */

const COLS_XL = 'xl:grid-cols-[minmax(0,168px)_96px_72px_minmax(0,1fr)_72px_72px_minmax(0,148px)_16px]';

const TAG_TONE: Record<LimitupResultTag, string> = {
  깨짐: 'bg-[var(--up-bg)] text-[var(--up)]',
  유지: 'bg-[var(--down-bg)] text-[var(--down)]',
  '잠김 없음': 'bg-[var(--muted)] text-[var(--muted-fg)]',
};

/** 행 버튼 id — 펼친 사건 카드가 `aria-labelledby` 로 가리킨다. */
export function rowButtonId(isin: string): string {
  return `limitup-row-${isin}`;
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

/** 행 값 설명(WR-A05) — 「결과 깨짐, 첫 상한가 09:06:01, 최대 27.5억, +60초 매도 37%, 직전 1분 매수 1위 한국증권 54.4% (추정)」. */
export function rowDescription(r: LimitupDayRow): string {
  const top = r.entryTop === '—' ? r.entryTop : `${r.entryTop} (추정)`;
  return [
    `결과 ${r.tags.join(' · ')}`,
    `첫 상한가 ${r.firstUpper}`,
    `최대 ${r.maxQ}`,
    `+60초 매도 ${r.sell60}`,
    `직전 1분 매수 1위 ${top}`,
  ].join(', ');
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

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function LimitupDayGrid({
  rows,
  renderDetail,
}: {
  rows: readonly LimitupDayRow[];
  /** 열린 행 바로 아래에 그릴 상세(사건 카드). */
  renderDetail?: (row: LimitupDayRow) => ReactNode;
}) {
  const [openIsin, setOpenIsin] = useState<string | null>(() => rows[0]?.isin ?? null);
  // 사용자가 연 행 — 레이아웃이 정해진 뒤 머리 위로 숨었으면 되돌린다(첫 렌더의 기본 펼침은 대상 아님).
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
    <section data-slot="limitup-day-grid" aria-labelledby="limitup-grid-title" className={cn(CARD, 'p-4')}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="limitup-grid-title" className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          상한가 종목
        </h2>
        <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          첫 상한가 시각 순 · 잔량 곡선 09:00~15:30
        </span>
      </div>

      {rows.length === 0 ? (
        <div data-slot="limitup-grid-empty" className="flex flex-col items-center gap-1 py-12 text-center">
          <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">이 날은 상한가 사건이 없어요</p>
          <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            상한가에 닿은 종목이 없는 날이에요. ‹ 로 이전 보고서를 볼 수 있어요
          </p>
        </div>
      ) : (
        <>
          <div
            aria-hidden="true"
            className={cn(
              'mt-3 hidden gap-x-3 border-b border-[var(--border-subtle)] px-2 pb-2 text-[length:var(--t-caption)] whitespace-nowrap text-[var(--muted-fg)] xl:grid',
              COLS_XL,
            )}
          >
            <span>종목</span>
            <span>결과</span>
            <span>첫 상한가</span>
            <span>잔량 (09:00~15:30)</span>
            <span>최대 잔량</span>
            <span>+60초 매도</span>
            <span>직전 1분 매수 1위</span>
            <span />
          </div>
          <ol ref={listRef} data-slot="limitup-grid-rows" className="m-0 mt-1 list-none p-0 xl:mt-0">
            {rows.map((r) => {
              const open = openIsin === r.isin;
              return (
                <li key={r.isin} data-open={open ? 'true' : undefined} className={cn(ROW_DIVIDER)}>
                  <button
                    type="button"
                    id={rowButtonId(r.isin)}
                    data-isin={r.isin}
                    aria-label={`${r.label}${r.code ? ` ${r.code}` : ''} — 사건 카드`}
                    aria-describedby={`limitup-row-desc-${r.isin}`}
                    aria-expanded={open}
                    aria-controls={open ? `ev-${r.isin}` : undefined}
                    onClick={() => toggle(r.isin)}
                    className={cn(
                      'grid min-h-11 w-full scroll-mt-[calc(4.5rem+var(--app-safe-top))] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-[var(--r)] px-2 py-3 text-left',
                      'hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
                      open && 'bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
                      COLS_XL,
                    )}
                  >
                    <span className="col-start-1 row-start-1 flex min-w-0 flex-col xl:col-start-1">
                      <span
                        className="min-w-0 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]"
                        title={r.label}
                      >
                        {r.label}
                      </span>
                      {(r.code || r.upper) && (
                        <span className="mono min-w-0 truncate text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                          {[r.code, r.upper !== null ? `상한가 ${r.upper}` : null].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>

                    <ResultTags
                      tags={r.tags}
                      className="col-start-2 row-start-1 justify-self-end xl:col-start-2 xl:justify-self-start"
                    />

                    <span className="col-span-2 row-start-2 block min-w-0 xl:col-span-1 xl:col-start-4 xl:row-start-1">
                      <LimitupSparkline summary={r.summary} locks={r.locks} />
                    </span>

                    <span className="col-span-2 row-start-3 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[length:var(--t-caption)] xl:contents">
                      <Meta label="첫 상한가" value={r.firstUpper} col="xl:col-start-3" />
                      <Meta label="최대" value={r.maxQ} col="xl:col-start-5" />
                      <Meta label="+60초 매도" value={r.sell60} col="xl:col-start-6" />
                      <Meta
                        label="직전 1분 매수"
                        value={r.entryTop}
                        col="xl:col-start-7"
                        mono={false}
                        className="max-w-full"
                      >
                        {r.entryTop !== '—' && (
                          <span
                            title="추정(분 단위)"
                            className="inline-flex h-4 shrink-0 items-center rounded-[4px] bg-[var(--muted)] px-1 text-[11px] font-semibold text-[var(--muted-fg)]"
                          >
                            추정
                          </span>
                        )}
                      </Meta>
                    </span>

                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        'hidden size-4 text-[var(--muted-fg)] transition-transform duration-200 motion-reduce:transition-none xl:col-start-8 xl:row-start-1 xl:block',
                        open && 'rotate-180',
                      )}
                    />
                    <span id={`limitup-row-desc-${r.isin}`} className="sr-only">
                      {rowDescription(r)}
                    </span>
                  </button>
                  {open && renderDetail?.(r)}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
