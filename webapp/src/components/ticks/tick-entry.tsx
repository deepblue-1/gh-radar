'use client';

import { useMemo } from 'react';

import type { TickExchange, TickGridRow, TickGridSource, TickTodayRow } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { fmtRate } from '@/lib/ticks/tick-format';
import { cn } from '@/lib/utils';

/**
 * 틱 전문 뷰어 진입 · 빈 상태 목록 (Phase 37 D-15 · D-16 · 진입 목업 A `.panel` + `table.lst`).
 *
 * - 과거 날짜: 「{M/D} 격자 종목 · n종목」 — 그날 격자가 있는 (종목, 거래소) 행. 클릭하면 바로 열린다(변환 없음).
 * - 오늘(D-15): 「오늘 종목 · n종목」 — 오늘 매집감지 등록 ∪ 고가 +15% 종목(`/api/ticks/today`) · 「라이브」 칩.
 * - 정렬: 기본 등락률순(그날 고가 등락률 `high_rate` 내림차순 · 없는 행은 뒤) · 「이름순」 토글.
 * - 출처 칩: accum 「매집감지」(팀 보라) · up15 「15%↑」(빨강) · request 「요청 변환」 · promoted 「승격」(회색) ·
 *   거래소 NXT 「NXT」(선택 파랑).
 * - 아래 캡션(과거 날짜만): 목록에 없는 종목은 머리 검색으로 — 그 종목만 변환해서 연다(약 N분 = 거래소 예상 대기).
 */

export type TickEntrySort = 'rate' | 'name';

export interface TickEntryProps {
  /** 목록 날짜(`YYYYMMDD`) — 패널 머리 「M/D」. */
  date: string;
  rows: readonly TickGridRow[];
  /** 주면 오늘 목록(라이브)으로 그린다 — rows 는 무시. */
  todayRows?: readonly TickTodayRow[];
  sort: TickEntrySort;
  onSort: (s: TickEntrySort) => void;
  onOpen: (isin: string, ex: TickExchange) => void;
  /** 요청 변환 예상 소요(분) — 캡션 「약 N분」. */
  etaMin: number;
}

interface EntryRow {
  key: string;
  isin: string;
  code: string | null;
  name: string | null;
  ex: TickExchange;
  rate: number | null;
  sources: readonly TickGridSource[];
  live: boolean;
}

const SOURCE_CHIP: Record<TickGridSource, { label: string; cls: string }> = {
  accum: { label: '매집감지', cls: 'bg-[var(--team-bg)] text-[var(--team)]' },
  up15: { label: '15%↑', cls: 'bg-[var(--up-bg)] text-[var(--up)]' },
  request: { label: '요청 변환', cls: 'bg-[var(--muted)] text-[var(--muted-fg)]' },
  promoted: { label: '승격', cls: 'bg-[var(--muted)] text-[var(--muted-fg)]' },
};

const TAG = 'mr-1 inline-flex h-[18px] items-center rounded-[5px] px-1.5 text-[10px] font-bold whitespace-nowrap';

const COLLATOR = new Intl.Collator('ko-KR');

function sortRows(rows: EntryRow[], sort: TickEntrySort): EntryRow[] {
  const nameOf = (r: EntryRow) => r.name ?? r.code ?? r.isin;
  return [...rows].sort((a, b) => {
    if (sort === 'rate') {
      if (a.rate === null && b.rate !== null) return 1;
      if (b.rate === null && a.rate !== null) return -1;
      if (a.rate !== null && b.rate !== null && a.rate !== b.rate) return b.rate - a.rate;
    }
    return COLLATOR.compare(nameOf(a), nameOf(b)) || a.ex.localeCompare(b.ex);
  });
}

const mdOf = (ymd: string) => `${Number(ymd.slice(4, 6))}/${Number(ymd.slice(6, 8))}`;

export function TickEntry({ date, rows, todayRows, sort, onSort, onOpen, etaMin }: TickEntryProps) {
  const isToday = todayRows !== undefined;
  const list = useMemo(() => {
    const base: EntryRow[] = isToday
      ? todayRows.map((r) => ({
          key: `${r.isin}:KRX`,
          isin: r.isin,
          code: r.code,
          name: r.name,
          ex: 'KRX' as const,
          rate: r.high_rate ?? r.rate,
          sources: r.sources,
          live: true,
        }))
      : rows.map((r) => ({
          key: `${r.isin}:${r.exchange}`,
          isin: r.isin,
          code: r.code,
          name: r.name,
          ex: r.exchange,
          rate: r.high_rate,
          sources: r.sources,
          live: false,
        }));
    return sortRows(base, sort);
  }, [isToday, todayRows, rows, sort]);

  return (
    <div data-slot="tick-entry" className="flex flex-col">
      <section aria-labelledby="tick-entry-title" className={cn(CARD, 'overflow-hidden rounded-[14px]')}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-3.5 py-2.5 text-[12.5px] font-bold">
          <h2 id="tick-entry-title" className="m-0 text-[12.5px] font-bold text-[var(--fg)]">
            {isToday ? '오늘 종목' : `${mdOf(date)} 격자 종목`}
          </h2>
          <small className="text-[11px] font-medium text-[var(--muted-fg)]">
            {list.length}종목 · {isToday ? '매집감지 등록 + 15%↑ · 라이브' : '매집감지 등록 + 15%↑ 자동 · 요청 변환분'}
          </small>
          <div role="group" aria-label="정렬" className="ml-auto inline-flex rounded-full bg-[var(--muted)] p-0.5">
            {(
              [
                ['rate', '등락률순'],
                ['name', '이름순'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={sort === k}
                onClick={() => sort !== k && onSort(k)}
                className={cn(
                  'rounded-full px-2.5 py-[3px] text-[11px] font-semibold',
                  sort === k ? 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]' : 'text-[var(--fg-2)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {list.length === 0 ? (
          <p data-slot="tick-entry-empty" className="m-0 px-4 py-10 text-center text-[12.5px] text-[var(--muted-fg)]">
            {isToday ? '오늘 아직 목록에 오른 종목이 없어요' : '이 날짜 격자 종목이 없어요'}
          </p>
        ) : (
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="bg-[var(--muted)] px-3 py-1.5 text-left text-[10.5px] font-semibold whitespace-nowrap text-[var(--muted-fg)]">
                  종목
                </th>
                <th className="bg-[var(--muted)] px-3 py-1.5 text-right text-[10.5px] font-semibold whitespace-nowrap text-[var(--muted-fg)]">
                  등락률
                </th>
                <th className="hidden bg-[var(--muted)] px-3 py-1.5 text-left text-[10.5px] font-semibold whitespace-nowrap text-[var(--muted-fg)] sm:table-cell">
                  출처
                </th>
                <th className="w-6 bg-[var(--muted)]" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr
                  key={r.key}
                  data-slot="tick-entry-row"
                  data-isin={r.isin}
                  data-ex={r.ex}
                  onClick={() => onOpen(r.isin, r.ex)}
                  className="cursor-pointer hover:bg-[color-mix(in_oklab,var(--muted)_70%,transparent)]"
                >
                  <td className="h-10 border-t border-[var(--border-subtle)] px-3 whitespace-nowrap">
                    <button type="button" className="text-left" aria-label={`${r.name ?? r.code ?? r.isin} ${r.ex} 열기`}>
                      <b className="font-semibold text-[var(--fg)]">{r.name ?? r.code ?? r.isin}</b>
                      <small className="block text-[11px] text-[var(--muted-fg)] sm:ml-1.5 sm:inline">
                        {r.code ?? r.isin} · {r.ex}
                      </small>
                    </button>
                  </td>
                  <td
                    title="그날 고가 기준"
                    className={cn(
                      'h-10 border-t border-[var(--border-subtle)] px-3 text-right font-bold whitespace-nowrap tabular-nums',
                      r.rate === null || r.rate === 0
                        ? 'text-[var(--muted-fg)]'
                        : r.rate > 0
                          ? 'text-[var(--up)]'
                          : 'text-[var(--down)]',
                    )}
                  >
                    {fmtRate(r.rate)}
                  </td>
                  <td className="hidden h-10 border-t border-[var(--border-subtle)] px-3 whitespace-nowrap sm:table-cell">
                    {r.sources.map((s) => (
                      <span key={s} data-chip={s} className={cn(TAG, SOURCE_CHIP[s].cls)}>
                        {SOURCE_CHIP[s].label}
                      </span>
                    ))}
                    {r.ex === 'NXT' && (
                      <span data-chip="nxt" className={cn(TAG, 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]')}>
                        NXT
                      </span>
                    )}
                    {r.live && (
                      <span data-chip="live" className={cn(TAG, 'bg-[var(--up-bg)] text-[var(--up)]')}>
                        라이브
                      </span>
                    )}
                  </td>
                  <td
                    aria-hidden="true"
                    className="h-10 w-6 border-t border-[var(--border-subtle)] pr-3 text-right text-[var(--faint)]"
                  >
                    ›
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {!isToday && (
        <p data-slot="tick-entry-caption" className="m-0 px-0.5 pt-2.5 text-[11px] text-[var(--faint)]">
          목록에 없는 종목은 위 검색으로 — 그 종목만 변환해서 열어요(약 {etaMin}분)
        </p>
      )}
    </div>
  );
}
