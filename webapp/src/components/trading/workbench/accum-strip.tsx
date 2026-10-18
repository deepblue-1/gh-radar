'use client';

/**
 * AccumStrip — `/trading` 작업대의 **매집 스트립 + 「더보기」 10열 표** (quick-261018-rfy · D-01).
 * 정본은 채택 목업 `.planning/quick/261018-rfy-accum-signal/mockup-workbench.html` 안 **A**.
 * `breakout-strip.tsx` · `vi-trigger-strip.tsx` 와 **같은 문법**이다 — 무테 카드 안에 스트립 줄(라벨 「매집」 · 칩 ·
 * 「더보기/접기」) → 펼친 표(행 있을 때만). 원천은 kind 16 매집감지(gh-trade Phase 34) — `useAccumSignals` 가 isin 별
 * 현재 상태를 준다(REST 복원 ∪ relay 별도 목록). 주문로그와는 무관하다.
 *
 * ① 시세 구독 없음 — 현재가 · 등락률은 행 자체 값(`lastPx` · `rateBp`)이다. kind 16 은 분당 갱신이라 충분하다
 *   (돌파의 `useBreakoutQuotes` 를 쓰지 않는다).
 * ② 거래소를 표시하지 않는다 — 돌파 D-07 동형. 카드는 행 `exchange`(늘 KRX)로 연다.
 * ③ 칩 = 이름 · 팀 순매수(억 · 부호 색) · 상태 배지(매집중 `--team` · 매도중 `--accum-sell`) · 이월 D+n(`--accum-carry` ·
 *   carryDays > 0 만). 청산(state 3)은 **칩에서 빠지고 펼친 표에만 회색**이다 — 배지는 「청산」 하나, 사유(청산 · 이월 탈락 ·
 *   이월 만료)는 행 툴팁(gh-trade 클라 동형 · 인박스 질문 1·2 답).
 * ④ 첫 채움 무강조 — REST 복원(`filled` 전 · 직후 첫 커밋)으로 들어온 행은 강조하지 않고, 그 뒤 새로 오른 키(새 isin · 같은 isin
 *   새 사이클)만 30초 `--new-bg` + 「신규」 다(돌파 규칙 · `HIGHLIGHT_MS`). 강조 계산은 `advanceAccumMeta` 순수 함수를 렌더에서 하고
 *   커밋 뒤 레이아웃 effect 가 기록을 옮긴다(돌파 ⑧). 강조 행이 있을 때만 tick 타이머 1개(돌파 ⑤).
 * ⑤ ✕ = 이 기기 · 오늘 · **사이클 단위** 숨김(`isin|cycle`) — 같은 종목의 새 사이클이 오면 다시 보인다.
 * ⑥ 이름 없는 행은 ISIN 을 고정폭 그대로 — `onAddCard` 에 이름을 싣지 않는다(돌파 ⑥). 코드는 행의 `stocks` 조인 값(없으면 relay 라벨)이라
 *   이름과 무관하게 싣는다. 이름 폴백은 relay 라벨 → 종목 마스터.
 */

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ACCUM_END_REASON_LABELS,
  ACCUM_STATE_LABELS,
  type AccumSignal,
  type RelayExchange,
} from '@gh-radar/shared';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  accumDismissKey,
  addAccumDismissed,
  advanceAccumMeta,
  readAccumDismissed,
  sortAccum,
  type AccumMeta,
} from '@/lib/accum-list';
import type { IsinLabel } from '@/lib/isin-labels';
import { kstClock } from '@/lib/limitup-report';
import { useStockNames } from '@/lib/stock-names';
import { fmtEok, toneOf } from '@/lib/teamflow-report';
import { readPanelsPref, writePanelsPref } from '@/lib/trading-layout';
import { cn } from '@/lib/utils';

import { BREAKOUT_TICK_MS } from './breakout-strip';

const NUM = new Intl.NumberFormat('ko-KR');

/** 빈 상태 — 활성(매집중 · 매도중) 칩이 0 일 때. */
export const ACCUM_EMPTY_TEXT = '아직 팀 매집으로 등록된 종목이 없어요';

export interface AccumStripProps {
  /** `useAccumSignals().signals` — isin 별 현재 상태(정렬 전). */
  signals: readonly AccumSignal[];
  /** 첫 복원 요청이 끝났는가 — 첫 채움 무강조 경계(④). */
  filled: boolean;
  /** 카드가 있는 종목(ISIN). 그 칩 · 행은 「거래중」 이다. */
  cards: ReadonlySet<string>;
  /** relay 라벨(`useIsinLabels`). */
  labels: ReadonlyMap<string, IsinLabel>;
  /** 카드가 없는 종목을 눌렀다 — 돌파 스트립과 같은 콜백. */
  onAddCard: (isin: string, name: string | undefined, code: string | undefined, exchange: RelayExchange) => void;
  /** 카드가 이미 있는 종목을 눌렀다 — 돌파 스트립과 같은 콜백. */
  onFocusCard: (isin: string, exchange: RelayExchange) => void;
  className?: string;
}

/** 렌더 사이 커밋 기록 — 강조 맵과 그 커밋의 filled. */
interface Committed {
  meta: AccumMeta;
  filled: boolean;
}

interface AccumView {
  sig: AccumSignal;
  key: string;
  label: string;
  named: boolean;
  code: string | undefined;
  exchange: RelayExchange;
  trading: boolean;
  highlighted: boolean;
  clock: string;
}

export function AccumStrip({ signals, filled, cards, labels, onAddCard, onFocusCard, className }: AccumStripProps) {
  const [open, setOpen] = useState(false);
  // 펼침은 기억한다 — 마운트 후에 읽는다(하이드레이션 · 돌파 동형).
  useEffect(() => {
    const saved = readPanelsPref().accum;
    if (saved !== undefined) setOpen(saved);
  }, []);
  const tableId = useId();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => readAccumDismissed());
  /** 강조 판정 기준 시각 — tick 타이머 1개가 올린다(④). */
  const [now, setNow] = useState(() => Date.now());

  // 이름 폴백 — relay 라벨에 이름이 없는 isin 만 마스터에서(⑥).
  const unnamed = useMemo(
    () => [...new Set(signals.map((s) => s.isin))].filter((isin) => !labels.get(isin)?.name),
    [signals, labels],
  );
  const masterNames = useStockNames(unnamed);

  const visible = useMemo(
    () => sortAccum(signals.filter((s) => !dismissed.has(accumDismissKey(s)))),
    [signals, dismissed],
  );

  // ④ 강조 기록 — 직전 커밋 기록 + 현재 입력(렌더 안 순수 계산) → 커밋 뒤 옮긴다. 첫 커밋은 filled 전으로 본다.
  const committedRef = useRef<Committed>({ meta: new Map(), filled: false });
  const meta = useMemo(
    () => advanceAccumMeta(committedRef.current.meta, signals, Date.now(), committedRef.current.filled),
    [signals],
  );
  useLayoutEffect(() => {
    committedRef.current = { meta, filled };
  }, [meta, filled]);

  const views = useMemo<AccumView[]>(
    () =>
      visible.map((sig) => {
        const key = accumDismissKey(sig);
        const relayName = labels.get(sig.isin)?.name;
        const name = relayName || masterNames.get(sig.isin);
        const named = name !== undefined && name !== '';
        const trading = cards.has(sig.isin);
        const until = meta.get(key) ?? null;
        return {
          sig,
          key,
          label: named ? (name as string) : sig.isin,
          named,
          code: sig.stockCode ?? labels.get(sig.isin)?.code ?? undefined,
          exchange: sig.exchange === 'NXT' ? 'NXT' : 'KRX',
          trading,
          // 「거래중」 · 청산 행은 신규로 칠하지 않는다.
          highlighted: until !== null && now < until && !trading && sig.state !== 3,
          clock: kstClock(sig.gwTimeMs),
        };
      }),
    [visible, labels, masterNames, cards, meta, now],
  );
  const chipViews = useMemo(() => views.filter((v) => v.sig.state !== 3), [views]);

  // ④ tick — 강조가 남은 키가 있을 때만 1개(돌파 ⑤).
  const ticking = [...meta.values()].some((until) => until !== null && now < until);
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), BREAKOUT_TICK_MS);
    return () => window.clearInterval(id);
  }, [ticking]);

  const activate = useCallback(
    (v: AccumView) => {
      if (cards.has(v.sig.isin)) {
        onFocusCard(v.sig.isin, v.exchange);
        return;
      }
      // 이름을 모르면 이름은 싣지 않는다(⑥). 코드는 행의 `stocks` 조인 값이라 이름과 무관하게 싣는다.
      onAddCard(v.sig.isin, v.named ? v.label : undefined, v.code, v.exchange);
    },
    [cards, onFocusCard, onAddCard],
  );

  const dismiss = useCallback((v: AccumView) => {
    setDismissed(addAccumDismissed([v.key]));
  }, []);

  const showTable = open && views.length > 0;

  return (
    <div
      data-slot="accum"
      className={cn(
        'min-w-0 overflow-hidden rounded-[var(--r-md)] border border-transparent bg-[var(--card)]',
        className,
      )}
    >
      {/* ── 스트립 줄 ── */}
      <section data-slot="accum-strip" aria-label="매집감지" className="flex min-w-0 items-center gap-2 px-2.5 py-2.5">
        <div className="flex flex-none items-center gap-1.5 text-[12px] font-bold text-[var(--fg)]">
          <span data-testid="accum-strip-label">매집</span>
        </div>

        <div
          data-slot="accum-chips"
          role="group"
          aria-label="매집 종목"
          tabIndex={0}
          className="flex min-w-0 flex-1 flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]"
        >
          {chipViews.length === 0 ? (
            <span data-slot="accum-empty" className="self-center text-[12px] whitespace-nowrap text-[var(--muted-fg)]">
              {ACCUM_EMPTY_TEXT}
            </span>
          ) : (
            chipViews.map((v) => <AccumChip key={v.key} view={v} onActivate={activate} />)
          )}
        </div>

        <button
          type="button"
          data-slot="accum-more"
          aria-expanded={open}
          aria-controls={showTable ? tableId : undefined}
          onClick={() => {
            const next = !open;
            setOpen(next);
            writePanelsPref({ accum: next });
          }}
          className="h-[26px] flex-none rounded-[var(--r)] border border-transparent bg-[var(--muted)] px-2.5 text-[11px] font-semibold whitespace-nowrap text-[var(--fg)] hover:bg-[var(--raised-2)]"
        >
          {open ? '접기' : '더보기'}
        </button>
      </section>

      {/* ── 펼친 표 — 행이 있을 때만 ── */}
      {showTable && (
        <section
          id={tableId}
          data-slot="accum-table"
          aria-label="매집감지 목록"
          className="min-w-0 border-t border-[var(--border-subtle)]"
        >
          <AccumTable views={views} onActivate={activate} onDismiss={dismiss} />
        </section>
      )}
    </div>
  );
}

/* ── 표시 파생 ───────────────────────────────────────────────────────── */

const TONE_CLASS = { up: 'text-[var(--up)]', down: 'text-[var(--down)]', flat: 'text-[var(--flat)]' } as const;

function netClass(won: number): string {
  return TONE_CLASS[toneOf(won)];
}

function signedRate(r: number): string {
  return `${r > 0 ? '+' : ''}${r.toFixed(2)}%`;
}

function rateClass(r: number): string {
  return r > 0 ? 'text-[var(--up)]' : r < 0 ? 'text-[var(--down)]' : 'text-[var(--flat)]';
}

function bandText(s: AccumSignal): string {
  return `${NUM.format(s.loPx)}~${NUM.format(s.hiPx)}`;
}

/** 칩 `title` — 「이름 코드 · 팀 순매수 · 평단 · 구간 lo~hi · 갱신 HH:MM:SS」. */
function chipTitle(v: AccumView): string {
  const head = v.named && v.code ? `${v.label} ${v.code}` : v.label;
  return `${head} · 팀 순매수 ${fmtEok(v.sig.netKrw, { signed: true })} · 평단 ${NUM.format(v.sig.avgPx)} · 구간 ${bandText(v.sig)} · 갱신 ${v.clock}`;
}

const BADGE = 'inline-flex h-4 flex-none items-center rounded-[4px] border border-transparent px-1 text-[9px] font-bold';

/** 상태 배지 — 매집중 --team · 매도중 --accum-sell · 청산 회색(③). */
function StateBadge({ state }: { state: AccumSignal['state'] }) {
  const tone =
    state === 1
      ? 'bg-[var(--team-bg)] text-[var(--team)]'
      : state === 2
        ? 'bg-[var(--accum-sell-bg)] text-[var(--accum-sell)]'
        : 'border-[var(--border-subtle)] bg-[var(--muted)] text-[var(--muted-fg)]';
  return (
    <span data-slot="accum-state" className={cn(BADGE, tone)}>
      {ACCUM_STATE_LABELS[state]}
    </span>
  );
}

function CarryBadge({ days }: { days: number }) {
  if (days <= 0) return null;
  return (
    <span data-slot="accum-carry" className={cn(BADGE, 'bg-[var(--accum-carry-bg)] text-[var(--accum-carry)]')}>
      이월 D+{days}
    </span>
  );
}

/* ── 칩 (목업 `.chip` · 안 A) ───────────────────────────────────────── */

const AccumChip = memo(function AccumChip({
  view: v,
  onActivate,
}: {
  view: AccumView;
  onActivate: (v: AccumView) => void;
}) {
  const fmtNet = fmtEok(v.sig.netKrw, { signed: true });
  return (
    <button
      type="button"
      data-slot="accum-chip"
      data-new={v.highlighted ? 'true' : undefined}
      data-trading={v.trading ? 'true' : undefined}
      title={chipTitle(v)}
      onClick={() => onActivate(v)}
      className={cn(
        'inline-flex h-[30px] max-w-[18rem] flex-none items-center gap-1.5 rounded-full border py-0 pr-2.5 pl-2 text-[12px] whitespace-nowrap',
        v.trading
          ? 'cursor-default border-dashed border-[var(--faint)] bg-transparent text-[var(--muted-fg)]'
          : v.highlighted
            ? 'border-[var(--new-bd)] bg-[var(--new-bg)]'
            : 'border-transparent bg-[var(--muted)]',
      )}
    >
      <b
        data-slot="accum-chip-name"
        className={cn('max-w-[8rem] min-w-0 truncate font-semibold', !v.named && 'mono font-medium')}
      >
        {v.label}
      </b>
      <span className={cn('mono font-bold', netClass(v.sig.netKrw))}>{fmtNet}</span>
      <StateBadge state={v.sig.state} />
      <CarryBadge days={v.sig.carryDays} />
      {v.highlighted && (
        <span data-slot="accum-new-badge" className="text-[10px] font-bold text-[var(--fg)]">
          신규
        </span>
      )}
      {v.trading && (
        <span data-slot="accum-chip-trading" className="text-[10px] text-[var(--muted-fg)]">
          거래중
        </span>
      )}
    </button>
  );
});

/* ── 표 (목업 `table` · 10열) ─────────────────────────────────────────── */

/**
 * 10열 — 종목 · 현재가 · 등락률 · 팀 순매수 · 평단 · 매집 구간 · 순수량 · 상태 · 갱신 · 액션.
 * 작업대 컨테이너(`@container/wb`) 폭으로 접는다(돌파 표 규칙 · 경계는 globals.css §2.2b 정본): 본문 <700 에서 평단 · 구간 ·
 * 순수량 · 갱신 열을 숨기고 종목 셀 아래 보조 줄 「HH:MM:SS · 평단 N · lo~hi」 를 세우고 코드를 숨긴다.
 */
const AccumTable = memo(function AccumTable({
  views,
  onActivate,
  onDismiss,
}: {
  views: readonly AccumView[];
  onActivate: (v: AccumView) => void;
  onDismiss: (v: AccumView) => void;
}) {
  const colNarrow = 'hidden @min-[700px]/wb:table-cell';
  const th =
    'h-auto bg-transparent px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)] @min-[700px]/wb:px-2.5';
  const td = 'h-9 px-2 py-0 whitespace-nowrap @min-[700px]/wb:px-2.5';

  return (
    <Table data-slot="accum-rows" className="text-[12px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col" className={th}>종목</TableHead>
          <TableHead scope="col" className={cn(th, 'text-right')}>현재가</TableHead>
          <TableHead scope="col" className={cn(th, 'text-right')}>등락률</TableHead>
          <TableHead scope="col" className={cn(th, 'text-right')}>팀 순매수</TableHead>
          <TableHead scope="col" className={cn(th, colNarrow, 'text-right')}>평단</TableHead>
          <TableHead scope="col" className={cn(th, colNarrow)}>매집 구간</TableHead>
          <TableHead scope="col" className={cn(th, colNarrow, 'text-right')}>순수량</TableHead>
          <TableHead scope="col" className={th}>상태</TableHead>
          <TableHead scope="col" className={cn(th, colNarrow)}>갱신</TableHead>
          <TableHead scope="col" className={th}>
            <span className="sr-only">액션</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {views.map((v) => {
          const ended = v.sig.state === 3;
          const rate = v.sig.rateBp / 100;
          return (
            <TableRow
              key={v.key}
              data-slot="accum-row"
              data-new={v.highlighted ? 'true' : undefined}
              data-trading={v.trading ? 'true' : undefined}
              title={ended ? (ACCUM_END_REASON_LABELS[v.sig.endReason] ?? '청산') : undefined}
              onClick={() => onActivate(v)}
              className={cn(
                v.trading ? 'cursor-default' : 'cursor-pointer',
                (v.trading || ended) && 'text-[var(--muted-fg)]',
                v.highlighted && 'bg-[var(--new-bg)] hover:bg-[var(--new-bg)]',
              )}
            >
              <TableCell className={cn(td, 'max-w-[200px]')}>
                <span className="flex max-w-[7rem] min-w-0 items-baseline gap-1 @min-[700px]/wb:max-w-none">
                  <span
                    data-slot="accum-row-name"
                    data-unnamed={v.named ? undefined : 'true'}
                    title={v.label}
                    className={cn(
                      'min-w-0 truncate font-semibold',
                      ended ? 'text-[var(--muted-fg)]' : 'text-[var(--fg)]',
                      !v.named && 'mono font-medium',
                    )}
                  >
                    {v.label}
                  </span>
                  {v.code && (
                    <span
                      data-slot="accum-row-code"
                      className="mono hidden flex-none text-[11px] text-[var(--muted-fg)] @min-[700px]/wb:inline"
                    >
                      {v.code}
                    </span>
                  )}
                  {v.highlighted && (
                    <span
                      data-slot="accum-new-badge"
                      className="inline-flex h-4 flex-none items-center rounded-[4px] border border-[var(--new-bd)] px-1 text-[9px] font-bold text-[var(--fg)]"
                    >
                      신규
                    </span>
                  )}
                </span>
                {/* 폰 밴드 보조 줄 — 숨긴 갱신 · 평단 · 구간 열의 사실을 여기서 말한다. */}
                <span
                  data-slot="accum-row-subline"
                  className="mono block truncate text-[10px] text-[var(--muted-fg)] @min-[700px]/wb:hidden"
                >
                  {`${v.clock} · 평단 ${NUM.format(v.sig.avgPx)} · ${bandText(v.sig)}`}
                </span>
              </TableCell>
              <TableCell className={cn(td, 'mono text-right', !ended && rateClass(rate))}>{NUM.format(v.sig.lastPx)}</TableCell>
              <TableCell className={cn(td, 'mono text-right font-bold', !ended && rateClass(rate))}>
                {signedRate(rate)}
              </TableCell>
              <TableCell className={cn(td, 'mono text-right font-bold', !ended && netClass(v.sig.netKrw))}>
                {fmtEok(v.sig.netKrw, { signed: true })}
              </TableCell>
              <TableCell data-col="avg" className={cn(td, colNarrow, 'mono text-right')}>
                {NUM.format(v.sig.avgPx)}
              </TableCell>
              <TableCell data-col="band" className={cn(td, colNarrow, 'mono')}>
                {bandText(v.sig)}
              </TableCell>
              <TableCell data-col="qty" className={cn(td, colNarrow, 'mono text-right')}>
                {NUM.format(v.sig.netQty)}
              </TableCell>
              <TableCell className={td}>
                <span className="inline-flex items-center gap-1">
                  <StateBadge state={v.sig.state} />
                  <CarryBadge days={v.sig.carryDays} />
                </span>
              </TableCell>
              <TableCell data-col="at" className={cn(td, colNarrow, 'mono')}>
                {v.clock}
              </TableCell>
              <TableCell className={cn(td, 'text-right')}>
                <span className="inline-flex items-center justify-end gap-1">
                  {ended ? null : v.trading ? (
                    <span
                      data-slot="accum-trading"
                      className="text-[11px] whitespace-nowrap text-[var(--muted-fg)] before:mr-1 before:text-[9px] before:text-[var(--led-armed)] before:content-['●']"
                    >
                      거래중
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-slot="accum-add"
                      onClick={(e) => {
                        e.stopPropagation();
                        onActivate(v);
                      }}
                      className={cn(
                        'h-[26px] rounded-[var(--r)] border px-2.5 text-[11px] font-semibold whitespace-nowrap',
                        v.highlighted
                          ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]'
                          : 'border-transparent bg-[var(--muted)] text-[var(--fg)]',
                      )}
                    >
                      추가
                    </button>
                  )}
                  <button
                    type="button"
                    data-slot="accum-dismiss"
                    aria-label={`${v.label} 숨기기`}
                    title="이 기기에서 오늘 이 사이클을 숨겨요"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(v);
                    }}
                    className="inline-flex size-[26px] items-center justify-center rounded-[var(--r)] text-[12px] text-[var(--muted-fg)] hover:bg-[var(--muted)] hover:text-[var(--fg)]"
                  >
                    ✕
                  </button>
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
});
