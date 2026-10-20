'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AccumCycleRowView } from '@/lib/accum-report';
import { TONE_TEXT } from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

/**
 * 매집감지 사이클 표 (Phase 34 · UI-SPEC A7 · D-20 · CR-01) — `cycles.length >= 2` 일 때만 차트 블록 다음에 기본 펼침(토글 없음).
 *
 * - 소제목 줄 「사이클」(14/600) + 캡션 「{n}개 · 값은 각 사이클 종료 시점(살아 있으면 마지막)」(12/400 --muted-fg) → 8px → 표.
 * - 9열 「# · 등록 · 종료 · 상태 · 등록가 · 평단 · 순매수 · 최고 순매수 · 매수 / 매도 수량」 · # = 나온 순서(차트 등록 라벨 「· k」 와 같다).
 * - 12px · 수 `mono` · 숫자 열 오른쪽 정렬 · 칸 `whitespace-nowrap` · 마지막 사이클 행 첫 칸 `inset 3px` --team 띠(teamflow 10분 표 문법).
 * - 「장 마감까지」 --muted-fg · 순매수만 부호 색 600 · 폰은 `Table` 래퍼(`tbl-wrap overflow-x-auto`)가 가로 스크롤.
 */

const HEADS = ['#', '등록', '종료', '상태', '등록가', '평단', '순매수', '최고 순매수', '매수 / 매도 수량'] as const;
/** 오른쪽 정렬(숫자) 열 — 등록가부터 끝까지. */
const NUM_FROM = 4;
const LAST_STRIPE = 'shadow-[inset_3px_0_0_var(--team)]';

export function AccumCycleTable({ rows, count }: { rows: readonly AccumCycleRowView[]; count: number }) {
  return (
    <section data-slot="accum-cycles" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="m-0 text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">사이클</h3>
        <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          {count}개 · 값은 각 사이클 종료 시점(살아 있으면 마지막)
        </span>
      </div>
      <Table className="text-[length:var(--t-caption)]">
        <TableHeader>
          <TableRow>
            {HEADS.map((h, i) => (
              <TableHead
                key={h}
                scope="col"
                className={cn(
                  'font-normal whitespace-nowrap text-[var(--muted-fg)]',
                  i >= NUM_FROM ? 'text-right' : 'text-left',
                )}
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.k} className="text-[var(--fg)]">
              <TableCell className={cn('mono whitespace-nowrap', i === rows.length - 1 && LAST_STRIPE)}>{r.k}</TableCell>
              <TableCell className="mono whitespace-nowrap">{r.reg}</TableCell>
              <TableCell className={cn('whitespace-nowrap', r.endIsOpen ? 'text-[var(--muted-fg)]' : 'mono')}>
                {r.end}
              </TableCell>
              <TableCell className="whitespace-nowrap">{r.status}</TableCell>
              <TableCell className="mono text-right whitespace-nowrap">{r.regPx}</TableCell>
              <TableCell className="mono text-right whitespace-nowrap">{r.avgPx}</TableCell>
              <TableCell className={cn('mono text-right font-semibold whitespace-nowrap', TONE_TEXT[r.netTone])}>
                {r.net}
              </TableCell>
              <TableCell className="mono text-right whitespace-nowrap">{r.peak}</TableCell>
              <TableCell className="mono text-right whitespace-nowrap">{r.qty}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
