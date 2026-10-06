'use client';

import { useMemo, useState } from 'react';

import type { LimitupDate, LimitupEntryRow, LimitupFactRow, LimitupMarkRow } from '@gh-radar/shared';

import {
  entryWindowOf,
  eventsOf,
  laneEntryOf,
  laneLockOf,
  lockRiskRowsOf,
  lockWindowOf,
  memberBarsOf,
  storyOf,
  type LockRiskRow,
  type MemberBar,
  type MemberBarGroup,
} from '@/lib/limitup-lanes';
import { kstClock, type LimitupDayRow } from '@/lib/limitup-report';
import { useLimitupGrid } from '@/lib/use-limitup-grid';
import { cn } from '@/lib/utils';

import { LimitupLane, eventBandHeight } from './limitup-lane';

/**
 * 사건 카드 — 리스트 행 아래 펼침 (UI-SPEC ④-4 · D-11 · D-12 · quick-261005-vk1 D-03/D-04 · 스케치 011 채택안 A).
 *
 * - 종목 리스트(`LimitupDayGrid`)가 열린 행 바로 아래에 이 카드를 그린다(한 번에 하나).
 *   `<section id="ev-{isin}" aria-labelledby={행 버튼 id}>` — 외피(CARD) · 종목 머리는 리스트 행이 대신한다.
 * - 세로 순서: 한 줄 요약(`storyOf` — 「20% 도달 → 첫 상한가 → 깨짐/유지」 + 상한가 직전 1분 매수 1위) →
 *   [왼쪽] 레인 「상한가 도달까지」 · 「잠김 구간」 → (값이 있으면) 요약 칩 줄 · 캡션 — 스케치 012-A · quick-261006-ide →
 *   창구 막대(상한가 직전 1분 매수 · 깨짐 직전 1분 매도 — 창 range ·
 *   1분 단위 배분이라 추정) / [오른쪽 340px] 사실 문장. < xl 한 열(레인 열 → 사실 문장).
 * - 번호 연결: `eventsOf` 한 배열이 레인 마커(라벨 띠 배지 · 점)와 사실 문장 앞 배지를 함께 만든다. 카드의 `hl` 하나를
 *   두 레인과 사실 목록이 나눠 써서, 마커/문장 어느 쪽에 마우스를 올려도 같은 번호가 함께 강조된다(데스크톱).
 * - 사실 문장 = 원문에서 앞 시각 「HH:MM:SS.mmm 」 만 뗀 것(시각 칸과 중복) · 창구 사실은 머리만 「상한가 직전 1분 매수
 *   창구 (from~to): 」 로 바꾼다(D-04 승인 범위) · 출처 배지 = `facts.source` 글자 그대로.
 * - 카드는 열렸을 때만 마운트되므로 격자 파일을 바로 받는다(`useLimitupGrid`). 로딩 = 높이를 지킨 빈 면 + 「불러오는 중…」 ·
 *   실패 = 「곡선을 불러오지 못했어요」 + 「다시 시도」. 요약 · 사실 문장 · 창구 막대는 보고서 응답이라 격자와 무관하게 보인다.
 */

const ENTRY_H = 160;
const LOCK_H = 120;
/** 로딩 자리 높이 — 띠 1줄 + 플롯 + 눈금. */
const SLOT_EXTRA = eventBandHeight(1) + 20;

const CAPTION = 'text-[length:var(--t-caption)] text-[var(--muted-fg)]';
const FAINT = 'text-[length:var(--t-caption)] text-[var(--faint)]';
const SUBHEAD = 'text-[length:var(--t-sm)] font-semibold text-[var(--fg)]';
const LANE_HEAD = 'mb-1.5 flex flex-wrap items-baseline gap-x-2';

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
      style={{ height: height + SLOT_EXTRA }}
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

/** 요약 칩 바탕 — 한 줄 요약 상자와 같은 면(새 토큰 없음). */
const CHIP = 'inline-flex items-baseline gap-x-1.5 rounded-full bg-[color-mix(in_oklab,var(--muted)_55%,transparent)] px-2.5 py-1 text-[12px] text-[var(--fg-2)]';
const CHIP_LABEL = 'text-[11px] text-[var(--muted-fg)]';

/**
 * 「잠김 구간」 요약 칩 줄(스케치 012-A) — 잠김마다 한 줄: 「누적 매도 X」 · 「취소 X」(값 --down) · 「위험도 +3초 a% · … ·
 * 깨짐/끝 3초 전 d%」(값 기본색 — 판정 기준이 아닌 비율이라 신호등 색 금지). 위험도 칩은 시점 조각 사이에서만 줄바꿈되고
 * (조각마다 nowrap), 구분 「·」 은 앞 조각 꼬리라 둘째 줄이 「·」 로 시작하지 않는다.
 */
function LockRiskChips({ rows }: { rows: readonly LockRiskRow[] }) {
  return (
    <div data-slot="limitup-lock-risk" className="mb-2 flex min-w-0 flex-col gap-1.5">
      {rows.map((r) => (
        <div
          key={r.lockId}
          data-slot="limitup-lock-risk-row"
          data-lock-id={r.lockId}
          className="flex min-w-0 flex-wrap items-center gap-1.5"
        >
          {r.prefix !== null && <span className={cn(CAPTION, 'whitespace-nowrap')}>{r.prefix}</span>}
          <span data-slot="limitup-lock-risk-chip" data-kind="sell" className={cn(CHIP, 'whitespace-nowrap')}>
            <span className={CHIP_LABEL}>누적 매도</span>
            <b className="mono font-semibold text-[var(--down)]">{r.sell}</b>
          </span>
          <span data-slot="limitup-lock-risk-chip" data-kind="cancel" className={cn(CHIP, 'whitespace-nowrap')}>
            <span className={CHIP_LABEL}>취소</span>
            <b className="mono font-semibold text-[var(--down)]">{r.cancel}</b>
          </span>
          <span data-slot="limitup-lock-risk-chip" data-kind="risk" className={cn(CHIP, 'min-w-0 flex-wrap')}>
            <span className={CHIP_LABEL}>위험도</span>
            {r.risks.map((k, i) => (
              // 구분 「·」 은 앞 조각 꼬리에 붙인다 — 줄바꿈된 둘째 줄이 「·」 로 시작하지 않게.
              <span key={k.label} className="whitespace-nowrap">
                {k.label} <b className="mono font-semibold text-[var(--fg)]">{k.value}</b>
                {i < r.risks.length - 1 && <span className="ml-1.5 text-[var(--faint)]">·</span>}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function Bars({ bars, tone }: { bars: readonly MemberBar[]; tone: 'up' | 'down' }) {
  if (bars.length === 0) return <p className={cn(FAINT, 'mt-1')}>—</p>;
  return (
    <div
      data-slot="limitup-bars"
      data-tone={tone}
      className={cn(
        'mt-1 grid items-center gap-x-2 gap-y-1',
        // 금액 칸은 금액 키가 있는 날짜에만 — 옛 날짜는 기존 3칸 그대로.
        bars.some((b) => b.amount !== null) ? 'grid-cols-[72px_1fr_40px_64px]' : 'grid-cols-[72px_1fr_40px]',
      )}
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
          {bars.some((x) => x.amount !== null) && (
            <span data-slot="limitup-bar-amount" className="mono text-right text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              {b.amount ?? '—'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function MemberGroup({
  title,
  group,
  tone,
}: {
  title: string;
  group: MemberBarGroup;
  tone: 'up' | 'down';
}) {
  return (
    <div className="min-w-0" data-group={tone === 'up' ? 'entry' : 'sell'}>
      <h4 className="m-0 text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">{title}</h4>
      <p className={cn(CAPTION, 'mono')}>
        {group.range ?? '—'}
        {group.total !== null ? ` · 전체 ${group.total} · 1분 배분 추정` : ' · 1분 단위 배분이라 추정'}
      </p>
      <Bars bars={group.bars} tone={tone} />
    </div>
  );
}

export function LimitupEventCard({
  date,
  row,
  labelledBy,
  entry,
  facts,
  marks,
}: {
  date: LimitupDate;
  row: LimitupDayRow;
  /** 이 카드를 연 리스트 행 버튼 id — 카드 영역의 접근 이름. */
  labelledBy?: string;
  entry: LimitupEntryRow | null;
  facts: readonly LimitupFactRow[];
  marks: readonly LimitupMarkRow[];
}) {
  // 카드는 리스트 행이 열렸을 때만 마운트된다 — 격자 파일은 바로 받는다.
  const grid = useLimitupGrid({ date, isin: row.isin, enabled: true });
  const [hl, setHl] = useState<number | null>(null);

  const locks = row.locks;
  const events = useMemo(() => eventsOf(entry, locks, facts), [entry, locks, facts]);
  const story = useMemo(() => storyOf(entry, locks, facts), [entry, locks, facts]);
  const entryWin = useMemo(() => entryWindowOf(entry, locks), [entry, locks]);
  const lockWin = useMemo(() => lockWindowOf(locks), [locks]);
  const entryLane = useMemo(
    () => (grid.grid ? laneEntryOf(grid.grid, entry, locks, events) : null),
    [grid.grid, entry, locks, events],
  );
  const lockLane = useMemo(
    () => (grid.grid ? laneLockOf(grid.grid, locks, marks, events) : null),
    [grid.grid, locks, marks, events],
  );
  const bars = useMemo(() => memberBarsOf(facts, locks, entry), [facts, locks, entry]);
  // 보고서 응답 값이라 격자 로딩 · 에러와 무관하게 보인다(스케치 012-A).
  const lockRisk = useMemo(() => lockRiskRowsOf(locks), [locks]);

  const lockSpan = useMemo(() => {
    const lk = locks.filter((l) => l.start_ms != null);
    if (lk.length === 0) return null;
    const from = Math.min(...lk.map((l) => l.start_ms!));
    const open = lk.some((l) => l.end_ms == null);
    const to = open ? null : Math.max(...lk.map((l) => l.end_ms!));
    return `${kstClock(from)}~${to != null ? kstClock(to) : '15:30:00'}`;
  }, [locks]);

  const slotState = grid.status === 'error' ? 'error' : 'loading';
  // 다시 시도는 첫 레인 자리에만(두 레인이 같은 격자 파일을 쓴다).
  const retryOnLock = entryWin === null;

  return (
    <section
      id={`ev-${row.isin}`}
      aria-labelledby={labelledBy}
      data-slot="limitup-event-card"
      data-isin={row.isin}
      className="min-w-0 px-2 pt-1 pb-5"
    >
      {story !== null && (
        <div
          data-slot="limitup-story"
          className="mb-4 rounded-[var(--r)] bg-[color-mix(in_oklab,var(--muted)_55%,transparent)] px-3.5 py-3 text-[length:var(--t-sm)] leading-relaxed break-keep text-[var(--fg-2)]"
        >
          <p className="m-0">
            {story.parts.map((p, i) =>
              p.arrow ? (
                <span key={i} className="text-[var(--muted-fg)]">
                  {p.text}
                </span>
              ) : p.strong ? (
                <strong key={i} className="mono font-semibold text-[var(--fg)]">
                  {p.text}
                </strong>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </p>
          {story.sub !== null && <p className={cn(CAPTION, 'm-0 mt-0.5')}>{story.sub}</p>}
        </div>
      )}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* 왼쪽 — 레인 2개 · 창구 막대 */}
        <div className="flex min-w-0 flex-col gap-4">
          <div data-slot="limitup-lane-entry">
            {entryWin === null ? (
              <p className={FAINT}>진입 기준 시각이 없어요</p>
            ) : (
              <>
                <div className={LANE_HEAD}>
                  <h3 className={cn(SUBHEAD, 'm-0')}>상한가 도달까지</h3>
                  <span className={CAPTION}>{entryWin.range} · 가격(위) · 상한가까지 남은 매도벽(아래)</span>
                </div>
                {entryLane !== null ? (
                  <LimitupLane
                    lane={entryLane}
                    plotHeight={ENTRY_H}
                    ariaLabel={`${row.label} 상한가 도달까지 ${entryLane.summary}`}
                    hl={hl}
                    onHl={setHl}
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
                <div className={LANE_HEAD}>
                  <h3 className={cn(SUBHEAD, 'm-0')}>잠김 구간</h3>
                  <span className={CAPTION}>{lockSpan} · 상한가 매수잔량 금액 · 큰 매도 ▼ · 취소 ✕</span>
                </div>
                {lockRisk.length > 0 && <LockRiskChips rows={lockRisk} />}
                {lockLane !== null ? (
                  <LimitupLane
                    lane={lockLane}
                    plotHeight={LOCK_H}
                    ariaLabel={`${row.label} 잠김 구간 잔량 — ${lockLane.summary}`}
                    hl={hl}
                    onHl={setHl}
                  />
                ) : (
                  <LaneSlot
                    height={LOCK_H}
                    state={slotState}
                    onRetry={retryOnLock ? grid.retry : undefined}
                  />
                )}
                {lockRisk.length > 0 && (
                  <p data-slot="limitup-lock-risk-caption" className={cn(CAPTION, 'm-0 mt-1.5 break-keep')}>
                    위험도 = 그 시점까지 누적 매도 ÷ 그 시점 대기 금액 · 100% 를 넘을 수 있다
                  </p>
                )}
              </>
            )}
          </div>

          <div data-slot="limitup-members" className="grid min-w-0 gap-4 md:grid-cols-2">
            <MemberGroup title="상한가 직전 1분 매수 창구" group={bars.entry} tone="up" />
            {bars.sell !== null && <MemberGroup title="깨짐 직전 1분 매도 창구" group={bars.sell} tone="down" />}
          </div>
        </div>

        {/* 오른쪽 — 사실 문장(번호 = 차트 표시) */}
        <div data-slot="limitup-facts" className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className={cn(SUBHEAD, 'm-0')}>사실 문장</h3>
            <span className={CAPTION}>배치 생성 · 해석 없음 · 번호 = 차트 표시</span>
          </div>
          {events.length === 0 ? (
            <p className={cn(FAINT, 'mt-2')}>사실 문장이 없어요</p>
          ) : (
            <ol className="m-0 mt-1 list-none p-0">
              {events.map((e) => {
                const on = e.n !== null && hl === e.n;
                return (
                  <li
                    key={e.key}
                    data-event-n={e.n ?? undefined}
                    data-hl={on ? 'true' : undefined}
                    onMouseEnter={e.n !== null ? () => setHl(e.n) : undefined}
                    onMouseLeave={e.n !== null ? () => setHl(null) : undefined}
                    className={cn(
                      'grid grid-cols-[22px_64px_minmax(0,1fr)] gap-2 rounded-[var(--r)] px-1.5 py-1.5',
                      on && 'bg-[var(--muted)]',
                    )}
                  >
                    <span className="pt-px">
                      {e.n !== null && (
                        <span
                          data-slot="limitup-fact-n"
                          className={cn(
                            'mono inline-flex size-5 items-center justify-center rounded-full text-[11px] leading-none font-bold',
                            e.emph ? 'bg-[var(--fg)] text-[var(--card)]' : 'bg-[var(--muted)] text-[var(--fg)]',
                          )}
                        >
                          {e.n}
                        </span>
                      )}
                    </span>
                    <span className="mono pt-0.5 text-[length:var(--t-caption)] text-[var(--muted-fg)]">{e.clock}</span>
                    <span data-slot="limitup-fact-text" className="min-w-0 text-[length:var(--t-sm)] break-keep text-[var(--fg)]">
                      {e.text}
                      {e.source !== null && <SourceBadge>{e.source}</SourceBadge>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
