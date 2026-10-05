'use client';

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';

import { formatGroup, type LimitupDate, type LimitupEntryRow, type LimitupFactRow, type LimitupMarkRow } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import {
  entryWindowOf,
  factsSorted,
  laneEntryOf,
  laneLockOf,
  lockTagsOf,
  lockWindowOf,
  memberBarsOf,
  type MemberBar,
} from '@/lib/limitup-lanes';
import type { LimitupDayRow, LimitupResultTag } from '@/lib/limitup-report';
import { useLimitupGrid } from '@/lib/use-limitup-grid';
import { cn } from '@/lib/utils';

import { LimitupLane } from './limitup-lane';

/**
 * 사건 카드 — 종목마다 1장 (UI-SPEC ④-4 · D-11 · D-12 · gh-trade D-20 「A 사건 카드」).
 *
 * - `<section id="ev-{isin}" aria-labelledby>` · 머리 = 종목명 `h3`(`tabIndex={-1}` — 하루 격자 행을 누르면
 *   `scrollToEventCard` 가 이 h3 로 포커스를 옮긴다) + 「{코드} · 상한가 {N}」 + 잠김 태그(6개 넘으면 「+N」 · title).
 *   잠김이 없으면 결과 태그 1개(「잠김 없음」/「미도달」).
 * - 배치: < xl 한 열(레인 → 사실 문장 → 창구 비중) · xl 두 열 `2fr 1fr` · 간격 24px.
 * - 격자 파일은 카드가 화면 가까이 올 때(IntersectionObserver · rootMargin 400px · 스크롤 조상이 있으면 그 조상 기준)
 *   `useLimitupGrid` 로 받는다. 로딩 = 높이를 지킨 빈 면 + 「불러오는 중…」 · 실패 = 「곡선을 불러오지 못했어요」 +
 *   「다시 시도」. 사실 문장 · 창구 막대는 보고서 응답(서버 집계)이라 격자와 무관하게 그대로 보인다.
 * - 사실 문장은 `facts.text` 그대로(재조립 없음) · 출처 배지 = `facts.source` 글자 그대로.
 */

const ENTRY_H = 160;
const LOCK_H = 120;

const RESULT_TONE: Record<LimitupResultTag, string> = {
  깨짐: 'bg-[var(--up-bg)] text-[var(--up)]',
  유지: 'bg-[var(--down-bg)] text-[var(--down)]',
  '잠김 없음': 'bg-[var(--muted)] text-[var(--muted-fg)]',
  미도달: 'bg-[var(--muted)] text-[var(--muted-fg)]',
};

const TAG = 'inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap';
const CAPTION = 'text-[length:var(--t-caption)] text-[var(--muted-fg)]';
const FAINT = 'text-[length:var(--t-caption)] text-[var(--faint)]';
const SUBHEAD = 'text-[length:var(--t-sm)] font-semibold text-[var(--fg)]';

function SourceBadge({ children }: { children: string }) {
  return (
    <span
      data-slot="limitup-source"
      className="ml-1 inline-flex h-4 items-center rounded-[4px] bg-[var(--muted)] px-1 align-[1px] text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)]"
    >
      {children}
    </span>
  );
}

/** 스크롤 조상(실제로 넘치는 overflow auto/scroll) — 없으면 null(뷰포트). */
function scrollRootOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

/** 카드가 화면 근처(400px)에 한 번이라도 오면 true — 그 뒤로는 계속 true. IntersectionObserver 가 없으면 바로 true. */
function useNear(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { root: scrollRootOf(el), rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, ref]);
  return near;
}

function LaneSlot({
  height,
  state,
  onRetry,
}: {
  height: number;
  state: 'loading' | 'error';
  onRetry?: () => void;
}) {
  return (
    <div
      data-slot="limitup-lane-slot"
      data-state={state}
      style={{ height: height + 20 }}
      className="flex w-full flex-col items-center justify-center gap-1 rounded-[var(--r)] bg-[color-mix(in_oklab,var(--muted)_55%,transparent)]"
    >
      {state === 'loading' ? (
        <span className={FAINT}>불러오는 중…</span>
      ) : (
        <>
          <span className={FAINT}>곡선을 불러오지 못했어요</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-[length:var(--t-caption)] font-semibold text-[var(--accent-fg)] hover:underline"
            >
              다시 시도
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Bars({ bars, tone }: { bars: readonly MemberBar[]; tone: 'up' | 'down' }) {
  if (bars.length === 0) return <p className={cn(FAINT, 'mt-1')}>—</p>;
  return (
    <div
      data-slot="limitup-bars"
      data-tone={tone}
      className="mt-1 grid grid-cols-[72px_1fr_40px] items-center gap-x-2 gap-y-1"
    >
      {bars.map((b, i) => (
        <div key={i} className="contents">
          <span className="truncate text-[length:var(--t-caption)] text-[var(--fg)]" title={b.name}>
            {b.name}
          </span>
          <span className="block h-2 overflow-hidden rounded-[4px] bg-[var(--muted)]">
            <span
              data-slot="limitup-bar-fill"
              style={{ width: `${Math.min(Math.max(b.pct, 0), 100)}%` }}
              className={cn('block h-full rounded-[4px]', tone === 'up' ? 'bg-[var(--up)]' : 'bg-[var(--down)]')}
            />
          </span>
          <span className="mono text-right text-[length:var(--t-caption)] text-[var(--fg-2)]">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

export function LimitupEventCard({
  date,
  row,
  entry,
  facts,
  marks,
}: {
  date: LimitupDate;
  row: LimitupDayRow;
  entry: LimitupEntryRow | null;
  facts: readonly LimitupFactRow[];
  marks: readonly LimitupMarkRow[];
}) {
  const ref = useRef<HTMLElement>(null);
  const headingId = useId();
  const near = useNear(ref);
  const grid = useLimitupGrid({ date, isin: row.isin, enabled: near });

  const locks = row.locks;
  const upper = entry?.upper_px ?? locks.find((l) => l.upper_px != null)?.upper_px ?? null;
  const tags = useMemo(() => (locks.length > 0 ? lockTagsOf(locks) : null), [locks]);
  const entryWin = useMemo(() => entryWindowOf(entry, locks), [entry, locks]);
  const lockWin = useMemo(() => lockWindowOf(locks), [locks]);
  const entryLane = useMemo(
    () => (grid.grid ? laneEntryOf(grid.grid, entry, locks) : null),
    [grid.grid, entry, locks],
  );
  const lockLane = useMemo(
    () => (grid.grid ? laneLockOf(grid.grid, locks, marks) : null),
    [grid.grid, locks, marks],
  );
  const factLines = useMemo(() => factsSorted(facts), [facts]);
  const bars = useMemo(() => memberBarsOf(facts, locks), [facts, locks]);

  const slotState = grid.status === 'error' ? 'error' : 'loading';
  // 다시 시도는 첫 레인 자리에만(두 레인이 같은 격자 파일을 쓴다).
  const retryOnLock = entryWin === null;

  const head = [row.code, upper != null ? `상한가 ${formatGroup(upper)}` : null].filter(Boolean).join(' · ');

  return (
    <section
      ref={ref}
      id={`ev-${row.isin}`}
      aria-labelledby={headingId}
      data-slot="limitup-event-card"
      data-isin={row.isin}
      className={cn(CARD, 'scroll-mt-4 p-4')}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3
          id={headingId}
          tabIndex={-1}
          className="min-w-0 rounded-[4px] text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          {row.label}
        </h3>
        {head !== '' && <span className={cn(CAPTION, 'mono')}>{head}</span>}
        <span data-slot="limitup-lock-tags" className="flex flex-wrap items-center gap-1">
          {tags !== null ? (
            <>
              {tags.tags.map((t) => (
                <span
                  key={t.text}
                  data-tone={t.tone}
                  className={cn(
                    TAG,
                    t.tone === 'up' ? 'bg-[var(--up-bg)] text-[var(--up)]' : 'bg-[var(--down-bg)] text-[var(--down)]',
                  )}
                >
                  {t.text}
                </span>
              ))}
              {tags.more && (
                <span
                  data-slot="limitup-lock-more"
                  title={tags.more.title}
                  className={cn(TAG, 'bg-[var(--muted)] text-[var(--muted-fg)]')}
                >
                  {tags.more.text}
                </span>
              )}
            </>
          ) : (
            row.tags.slice(0, 1).map((t) => (
              <span key={t} data-tag={t} className={cn(TAG, RESULT_TONE[t])}>
                {t}
              </span>
            ))
          )}
        </span>
      </div>

      <div className="mt-3 grid min-w-0 gap-6 xl:grid-cols-[2fr_1fr]">
        {/* 왼쪽 — 레인 2개 */}
        <div className="flex min-w-0 flex-col gap-4">
          <div data-slot="limitup-lane-entry">
            {entryWin === null ? (
              <p className={FAINT}>진입 기준 시각이 없어요</p>
            ) : (
              <>
                <p className={cn(CAPTION, 'mb-2')}>
                  진입 10분 · {entryWin.range} — 가격(위) · 상한가까지 남은 매도벽 금액(아래)
                </p>
                {entryLane !== null ? (
                  <LimitupLane
                    lane={entryLane}
                    height={ENTRY_H}
                    ariaLabel={`${row.label} 진입 10분 ${entryLane.summary}`}
                  />
                ) : (
                  <LaneSlot height={ENTRY_H} state={slotState} onRetry={grid.retry} />
                )}
              </>
            )}
          </div>

          <div data-slot="limitup-lane-lock">
            {lockWin === null ? (
              <p className={FAINT}>잠김 구간이 없어요</p>
            ) : (
              <>
                <p className={cn(CAPTION, 'mb-2')}>
                  잠김 전 구간 · {lockWin.range} — 상한가 매수잔량 금액 · 큰 매도 ▼ · 취소 ✕ · 깨짐 ●
                </p>
                {lockLane !== null ? (
                  <LimitupLane
                    lane={lockLane}
                    height={LOCK_H}
                    ariaLabel={`${row.label} 잠김 전 구간 잔량 — ${lockLane.summary}`}
                  />
                ) : (
                  <LaneSlot
                    height={LOCK_H}
                    state={slotState}
                    onRetry={retryOnLock ? grid.retry : undefined}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* 오른쪽 — 사실 문장 · 창구 비중 */}
        <div className="flex min-w-0 flex-col gap-4">
          <div data-slot="limitup-facts">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h4 className={SUBHEAD}>사실 문장</h4>
              <span className={CAPTION}>배치 생성 · 해석 없음</span>
            </div>
            {factLines.length === 0 ? (
              <p className={cn(FAINT, 'mt-2')}>사실 문장이 없어요</p>
            ) : (
              <ul className="m-0 mt-1 list-none p-0">
                {factLines.map((f) => (
                  <li
                    key={f.key}
                    className="grid grid-cols-[72px_1fr] gap-2 py-1.5 [&+&]:border-t [&+&]:border-dashed [&+&]:border-[var(--border-subtle)]"
                  >
                    <span className="mono pt-px text-[length:var(--t-caption)] text-[var(--muted-fg)]">{f.clock}</span>
                    <span className="min-w-0 text-[length:var(--t-sm)] break-keep text-[var(--fg)]">
                      {f.text}
                      {f.source !== null && <SourceBadge>{f.source}</SourceBadge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div data-slot="limitup-members">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h4 className={SUBHEAD}>창구 비중</h4>
              <span className={CAPTION}>B9 1분 증분 배분</span>
              <SourceBadge>추정(분 단위)</SourceBadge>
            </div>
            <p className={cn(CAPTION, 'mt-2')}>진입 1분 매수</p>
            <Bars bars={bars.entry} tone="up" />
            {bars.sell !== null && (
              <>
                <p className={cn(CAPTION, 'mt-2')}>깨짐 전 1분 매도</p>
                <Bars bars={bars.sell} tone="down" />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
