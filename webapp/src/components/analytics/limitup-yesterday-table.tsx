'use client';

import { useMemo } from 'react';

import type { LimitupDate, LimitupLockRow } from '@gh-radar/shared';

import { CARD, ROW_DIVIDER } from '@/components/layout/page-layout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { yesterdayRowsOf } from '@/lib/limitup-lanes';
import { cn } from '@/lib/utils';

/**
 * 어제 결과 (UI-SPEC ④-6 · gh-trade `_section_yesterday`) — 바로 이전 적재 날짜의 잠김 종목을 한 행씩, D+1 시가 손익.
 *
 * - 손익 = `fmtRet(d1_ret × 100)`(「+2.5%」·「−1.6%」 U+2212) + 색 축(+ `--up` · − `--down` · 0/「—」 `--fg`).
 * - D+1 미도착(`d1_*` null) 칸은 「—」. 이전 보고서가 없거나 잠김 0 이면 「어제 보고서가 없어요」.
 */

const TONE = { up: 'text-[var(--up)]', down: 'text-[var(--down)]', fg: 'text-[var(--fg)]' } as const;

export function LimitupYesterdayTable({
  prev,
}: {
  prev: { date: LimitupDate; locks: readonly LimitupLockRow[] } | null;
}) {
  const y = useMemo(() => yesterdayRowsOf(prev), [prev]);
  const empty = y === null || y.rows.length === 0;

  return (
    <section data-slot="limitup-yesterday" aria-labelledby="limitup-yday-title" className={cn(CARD, 'p-4')}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="limitup-yday-title" className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          어제 결과
        </h2>
        {y !== null && (
          <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            {y.date} 잠김 → 다음 날 시가
          </span>
        )}
      </div>

      {empty ? (
        <p className="mt-3 text-[length:var(--t-caption)] text-[var(--faint)]">어제 보고서가 없어요</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {['종목', '상한가', 'D+1 시가', '손익'].map((h, i) => (
                  <TableHead key={h} scope="col" className={i === 0 ? 'text-left' : 'text-right'}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {y.rows.map((r) => (
                <TableRow key={r.isin} data-isin={r.isin} className={cn(ROW_DIVIDER, 'text-[var(--fg)]')}>
                  <TableCell className="max-w-[200px] truncate" title={r.label}>
                    {r.label}
                  </TableCell>
                  <TableCell className="mono text-right">{r.upper}</TableCell>
                  <TableCell className="mono text-right">{r.d1Open}</TableCell>
                  <TableCell data-tone={r.tone} className={cn('mono text-right', TONE[r.tone])}>
                    {r.pnl}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
