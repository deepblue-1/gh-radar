'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import {
  formatManwon1,
  formatManwonFloor,
  formatPnlDay,
  formatPnlManwon,
  formatPnlRangeCaption,
  kstDateIso,
  pnlRangeOf,
  pnlToneOf,
  type PnlDayRow,
  type PnlGroup,
  type PnlRange,
  type PnlReport,
  type PnlStockRow,
} from '@gh-radar/shared';

import { CARD, ROW_DIVIDER } from '@/components/layout/page-layout';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * 일자별 매매손익 공통 부품 (Phase 36 · D-17 · D-18 · 채택 목업 ⑤ A 안 · UI-SPEC 「⑤ 공통 부품」 1~7).
 *
 * - `/me` 「손익」 탭(묶음 1장 · 머리 없음)과 `/admin/pnl`(묶음 여럿 · 머리 있음)이 **같은 부품**을 쓴다.
 * - 숫자는 shared 한 벌(`formatPnlManwon` · `formatManwon1` · `formatManwonFloor` · `formatPnlDay`) — 화면은 값을 보정하지
 *   않는다(옛 체결 0 · 평단 모르는 매도 = −(수수료 + 세금) 은 서버 값 그대로).
 * - 손익색은 실현손익에만(수익 `--up` · 손실 `--down` · 0 `--fg-2`). 수수료 · 세금 · 매수 · 매도에는 방향색이 없다.
 * - 7열 전환은 뷰포트 `lg`(1024 · UI-SPEC researcher decision 20). 폰은 일자 행 2줄 · 가로 스크롤 없음.
 * - 펼침은 행마다 따로(Set). 첫 묶음의 첫(최신) 행만 기본 열림 — 조회가 다시 돌면(기간 · 묶음 · 계좌 변경) 카드가 로딩
 *   상태로 내려갔다 새로 서므로 이 기본으로 되돌아간다.
 */

/** 기간 칩 라벨 — 세그먼트 · 요약 행 「{기간} 실현손익」 이 같은 낱말을 쓴다. */
export const PNL_RANGE_LABEL: Readonly<Record<PnlRange, string>> = {
  '7': '7일',
  '30': '30일',
  '90': '90일',
  month: '이달',
};

const PNL_SEGMENTS: readonly PnlRange[] = ['7', '30', '90'];

const TONE_CLASS = {
  up: 'text-[var(--up)]',
  down: 'text-[var(--down)]',
  flat: 'text-[var(--fg-2)]',
} as const;

/** 손익(원) → 색 클래스. */
export function pnlToneClass(krw: number): string {
  return TONE_CLASS[pnlToneOf(krw)];
}

/** 컨트롤 줄 캡션 범위 — 받은 응답의 기간 · 없으면(로딩 · 오류) 오늘 KST 기준 계산값. */
export function pnlCaptionRangeOf(range: PnlRange, report: PnlReport | null): { from: string; to: string } {
  return report ?? pnlRangeOf(range, kstDateIso());
}

// ─────────────────────────────────────────────────────────────────────────────
// 조회 상태 — /me 탭 · 어드민 페이지가 같은 꼴(launch-orders-tab 의 alive effect)
// ─────────────────────────────────────────────────────────────────────────────

export type PnlViewStatus = 'loading' | 'error' | 'ready';

/**
 * `key` 가 바뀔 때마다 `load` 를 1회 부른다(null = 부르지 않음 · 로딩 유지). `retry` = 같은 키로 새 요청.
 * 받는 동안 이전 응답은 버린다(로딩 = 카드 내림 → 펼침 기본 복원).
 */
export function usePnlReport(
  key: string | null,
  load: () => Promise<PnlReport>,
): { status: PnlViewStatus; report: PnlReport | null; retry: () => void } {
  const [state, setState] = useState<{ status: PnlViewStatus; report: PnlReport | null }>({
    status: 'loading',
    report: null,
  });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    setState({ status: 'loading', report: null });
    loadRef.current().then(
      (report) => {
        if (alive) setState({ status: 'ready', report });
      },
      () => {
        if (alive) setState({ status: 'error', report: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 기간 컨트롤 줄
// ─────────────────────────────────────────────────────────────────────────────

export interface PnlPeriodControlProps {
  range: PnlRange;
  onChange: (range: PnlRange) => void;
  from: string;
  to: string;
}

export function PnlPeriodControl({ range, onChange, from, to }: PnlPeriodControlProps) {
  const monthOn = range === 'month';
  return (
    <div data-slot="pnl-period" role="group" aria-label="기간" className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="inline-flex gap-0.5 rounded-[10px] bg-[var(--muted)] p-[3px]">
        {PNL_SEGMENTS.map((r) => {
          const on = r === range;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={on}
              data-range={r}
              onClick={() => !on && onChange(r)}
              className={cn(
                'min-h-8 rounded-[8px] px-3 text-[13px] font-semibold whitespace-nowrap',
                on
                  ? 'bg-[var(--seg-on-bg)] text-[var(--seg-on-fg)] shadow-[var(--seg-on-shadow)]'
                  : 'text-[var(--muted-fg)] hover:text-[var(--fg)]',
              )}
            >
              {PNL_RANGE_LABEL[r]}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={monthOn}
        data-range="month"
        onClick={() => !monthOn && onChange('month')}
        className={cn(
          'min-h-8 rounded-[10px] border px-3 text-[length:var(--t-caption)] font-semibold whitespace-nowrap',
          monthOn
            ? 'border-[var(--fg)] text-[var(--fg)]'
            : 'border-[var(--border)] text-[var(--muted-fg)] hover:text-[var(--fg)]',
        )}
      >
        {PNL_RANGE_LABEL.month}
      </button>
      <span
        data-slot="pnl-range-caption"
        className="ml-auto text-[length:var(--t-caption)] whitespace-nowrap text-[var(--muted-fg)] tabular-nums"
      >
        {formatPnlRangeCaption(from, to)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2~6. 묶음 카드 — [머리] → 요약 행 → [열 머리 ≥1024] → 일자 행(펼침)
// ─────────────────────────────────────────────────────────────────────────────

const CARD_FACE = cn(CARD, 'min-w-0 overflow-hidden ring-1 ring-[var(--border-subtle)] ring-inset dark:ring-0');

/** 데스크톱 일자 행 · 열 머리 공용 열 템플릿(8칸 · 합 692 ≤ lg 최소 본문 704). */
const DAY_COLS_LG =
  'lg:grid-cols-[96px_96px_72px_72px_minmax(104px,1fr)_minmax(104px,1fr)_48px_16px] lg:gap-x-3 lg:gap-y-0';

const CAPTION = 'text-[length:var(--t-caption)]';

export interface PnlGroupCardProps {
  group: PnlGroup;
  /** 묶음 머리(어드민만). 없으면 머리 띠 없음(/me). */
  header?: ReactNode;
  rangeLabel: string;
  defaultOpenFirst: boolean;
}

export function PnlGroupCard({ group, header, rangeLabel, defaultOpenFirst }: PnlGroupCardProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    const first = group.days[0];
    return defaultOpenFirst && first !== undefined ? new Set([first.date]) : new Set();
  });
  const toggle = (date: string): void =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  return (
    <section data-slot="pnl-group" data-key={group.key} className={CARD_FACE}>
      {header !== undefined && (
        <div
          data-slot="pnl-group-head"
          className="flex min-w-0 flex-col gap-0.5 border-b border-[var(--border-subtle)] bg-[var(--band)] px-4 pt-3 pb-2"
        >
          {header}
        </div>
      )}
      <PnlSummaryRow total={group.total} rangeLabel={rangeLabel} />
      <div
        data-slot="pnl-col-head"
        aria-hidden="true"
        className={cn(
          'hidden border-b border-[var(--border-subtle)] px-4 py-2 text-[var(--muted-fg)] lg:grid',
          CAPTION,
          DAY_COLS_LG,
        )}
      >
        <span>일자</span>
        <span className="text-right">실현손익</span>
        <span className="text-right">수수료</span>
        <span className="text-right">세금</span>
        <span className="text-right">매수</span>
        <span className="text-right">매도</span>
        <span className="text-right">체결</span>
        <span />
      </div>
      <ul className="min-w-0">
        {group.days.map((day) => (
          <PnlDayItem key={day.date} day={day} open={open.has(day.date)} onToggle={() => toggle(day.date)} />
        ))}
      </ul>
    </section>
  );
}

function PnlSummaryRow({ total, rangeLabel }: { total: PnlGroup['total']; rangeLabel: string }) {
  const cell = (label: string, value: string, slot: string) => (
    <div data-slot={slot} className="flex min-w-0 flex-col">
      <span className={cn(CAPTION, 'text-[var(--muted-fg)]')}>{label}</span>
      <span className="text-[length:var(--t-sm)] font-semibold whitespace-nowrap text-[var(--fg)] tabular-nums">
        {value}
      </span>
    </div>
  );
  return (
    <div
      data-slot="pnl-summary"
      className="grid min-w-0 grid-cols-3 gap-x-2 gap-y-3 border-b border-[var(--border-subtle)] px-4 py-3 lg:grid-cols-[1.2fr_repeat(5,1fr)_0.7fr] lg:items-end"
    >
      <div data-slot="pnl-summary-pnl" className="col-span-full flex min-w-0 flex-col lg:col-span-1">
        <span className={cn(CAPTION, 'text-[var(--muted-fg)]')}>{rangeLabel} 실현손익</span>
        <span
          data-tone={pnlToneOf(total.pnl)}
          className={cn(
            'text-[length:var(--t-lg)] leading-[1.2] font-semibold whitespace-nowrap tabular-nums',
            pnlToneClass(total.pnl),
          )}
        >
          {formatPnlManwon(total.pnl)}
        </span>
      </div>
      {cell('수수료', formatManwon1(total.fee), 'pnl-summary-fee')}
      {cell('세금', formatManwon1(total.tax), 'pnl-summary-tax')}
      {cell('매수', formatManwonFloor(total.buy), 'pnl-summary-buy')}
      {cell('매도', formatManwonFloor(total.sell), 'pnl-summary-sell')}
      {cell('체결', `${total.fills}건`, 'pnl-summary-fills')}
    </div>
  );
}

function PnlDayItem({ day, open, onToggle }: { day: PnlDayRow; open: boolean; onToggle: () => void }) {
  const bodyId = useId();
  const deskCell = cn('hidden text-right whitespace-nowrap text-[var(--muted-fg)] tabular-nums lg:block', CAPTION);
  return (
    <li data-slot="pnl-day" data-date={day.date} data-open={open ? 'true' : undefined} className={ROW_DIVIDER}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={onToggle}
        className={cn(
          'grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-x-2 gap-y-1 px-4 py-3 text-left',
          'hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
          open && 'bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
          DAY_COLS_LG,
        )}
      >
        <span
          data-slot="pnl-day-date"
          className="col-start-1 row-start-1 text-[length:var(--t-sm)] font-semibold whitespace-nowrap text-[var(--fg)] tabular-nums"
        >
          {formatPnlDay(day.date)}
        </span>
        <span
          data-slot="pnl-day-pnl"
          data-tone={pnlToneOf(day.pnl)}
          className={cn(
            'col-start-2 row-start-1 text-right text-[15px] font-semibold whitespace-nowrap tabular-nums lg:text-[length:var(--t-sm)]',
            pnlToneClass(day.pnl),
          )}
        >
          {formatPnlManwon(day.pnl)}
        </span>
        <span className={cn(deskCell, 'lg:col-start-3 lg:row-start-1')}>{formatManwon1(day.fee)}</span>
        <span className={cn(deskCell, 'lg:col-start-4 lg:row-start-1')}>{formatManwon1(day.tax)}</span>
        <span data-slot="pnl-day-buy" className={cn(deskCell, 'lg:col-start-5 lg:row-start-1')}>
          {formatManwonFloor(day.buy)}
        </span>
        <span data-slot="pnl-day-sell" className={cn(deskCell, 'lg:col-start-6 lg:row-start-1')}>
          {formatManwonFloor(day.sell)}
        </span>
        <span className={cn(deskCell, 'lg:col-start-7 lg:row-start-1')}>{day.fills}건</span>
        <ChevronDown
          aria-hidden="true"
          data-slot="pnl-day-chevron"
          className={cn(
            'col-start-3 row-start-1 size-4 shrink-0 justify-self-end text-[var(--muted-fg)] transition-transform duration-200 motion-reduce:transition-none lg:col-start-8',
            open && 'rotate-180',
          )}
        />
        <span
          data-slot="pnl-day-phone-line"
          className={cn(
            'col-span-full row-start-2 min-w-0 break-keep text-[var(--muted-fg)] tabular-nums lg:hidden',
            CAPTION,
          )}
        >
          매수 {formatManwonFloor(day.buy)} · 매도 {formatManwonFloor(day.sell)} · {day.fills}건
        </span>
      </button>
      {open && (
        <div id={bodyId} data-slot="pnl-day-body" className="px-4 pb-3">
          <p className={cn('pb-2 text-[var(--muted-fg)] tabular-nums', CAPTION)}>
            수수료 <b className="font-semibold text-[var(--fg-2)]">{formatManwon1(day.fee)}</b> · 세금{' '}
            <b className="font-semibold text-[var(--fg-2)]">{formatManwon1(day.tax)}</b> · 체결{' '}
            <b className="font-semibold text-[var(--fg-2)]">{day.fills}건</b>
          </p>
          {day.stocks.map((s) => (
            <PnlStockLine key={s.isin} stock={s} />
          ))}
        </div>
      )}
    </li>
  );
}

/** 종목 표시 이름 — 마스터 이름 → 코드 → ISIN(지어내지 않는다). */
export function pnlStockLabelOf(s: Pick<PnlStockRow, 'name' | 'code' | 'isin'>): string {
  return s.name || s.code || s.isin;
}

function PnlStockLine({ stock }: { stock: PnlStockRow }) {
  const label = pnlStockLabelOf(stock);
  return (
    <div
      data-slot="pnl-stock"
      data-isin={stock.isin}
      className={cn(
        'mb-1 grid min-w-0 grid-cols-[minmax(0,1fr)_80px] items-baseline gap-x-2 gap-y-0.5 rounded-[8px] bg-[var(--band)] px-3 py-2 lg:grid-cols-[minmax(0,1fr)_88px_minmax(0,184px)] lg:gap-2',
        CAPTION,
      )}
    >
      <span data-slot="pnl-stock-name" className="min-w-0 truncate text-[var(--fg)]" title={label}>
        {label}
      </span>
      <span
        data-slot="pnl-stock-pnl"
        data-tone={pnlToneOf(stock.pnl)}
        className={cn('text-right font-semibold whitespace-nowrap tabular-nums', pnlToneClass(stock.pnl))}
      >
        {formatPnlManwon(stock.pnl)}
      </span>
      <span className="col-span-full min-w-0 break-keep text-[var(--muted-fg)] tabular-nums lg:col-span-1 lg:text-right">
        매수 {formatManwonFloor(stock.buy)} · 매도 {formatManwonFloor(stock.sell)} · {stock.fills}건
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. 상태 4종 — loading · error · empty · data
// ─────────────────────────────────────────────────────────────────────────────

export interface PnlReportViewProps {
  status: PnlViewStatus;
  report: PnlReport | null;
  rangeLabel: string;
  onRetry: () => void;
  /** 묶음 머리 렌더러(어드민). 없으면 머리 없는 카드(/me). */
  renderHeader?: (group: PnlGroup) => ReactNode;
}

export function PnlReportView({ status, report, rangeLabel, onRetry, renderHeader }: PnlReportViewProps) {
  if (status === 'loading') return <PnlSkeleton />;

  if (status === 'error' || report === null) {
    return (
      <div
        data-slot="pnl-error"
        role="alert"
        className={cn(CARD, 'flex flex-col items-center gap-2 px-4 py-12 text-center')}
      >
        <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">
          매매손익을 불러오지 못했어요
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-8 text-[length:var(--t-caption)] font-semibold text-[var(--accent-fg)] hover:underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const groups = report.groups.filter((g) => g.days.length > 0);
  if (groups.length === 0) {
    return (
      <div data-slot="pnl-empty" className={cn(CARD, 'flex flex-col items-center gap-1 px-4 py-12 text-center')}>
        <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">
          이 기간에는 체결이 없어요
        </p>
        <p className="text-[length:var(--t-caption)] break-keep text-[var(--muted-fg)]">
          손익은 기록을 시작한 날부터 쌓여요 — 기간을 넓혀 보세요
        </p>
      </div>
    );
  }

  return (
    <div data-slot="pnl-groups" className="flex min-w-0 flex-col gap-4">
      {groups.map((g, i) => (
        <PnlGroupCard
          key={g.key === '' ? '__unknown__' : g.key}
          group={g}
          header={renderHeader?.(g)}
          rangeLabel={rangeLabel}
          defaultOpenFirst={i === 0}
        />
      ))}
    </div>
  );
}

function PnlSkeleton() {
  return (
    <div data-slot="pnl-loading" aria-busy="true" aria-label="불러오는 중" className={cn(CARD_FACE, 'flex flex-col')}>
      <div className="border-b border-[var(--border-subtle)] px-4 py-3">
        <Skeleton className="h-5 w-40" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
