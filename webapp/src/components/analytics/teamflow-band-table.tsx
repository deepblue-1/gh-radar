'use client';

import type { TeamflowBand } from '@gh-radar/shared';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TONE_TEXT, fmtEok, fmtQty, fmtShare, isHotShare, toneOf } from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

/**
 * 「구간표 보기」 접힌 표 (Phase 33 · UI-SPEC T6 구간표 · D-14) — 차트 수치의 보조기기 · 폰 경로.
 *
 * - 6열 「구간 · 거래량 · 매수 중 팀 · 팀 매수 · 팀 매도 · 팀 순매수」 · 행 = bands 전부(export 순서 · 「하루 합계」 마지막 ·
 *   `--team-bg` 면 · 600).
 * - 숫자 열 오른쪽 정렬 `mono` · 팀 매수/매도 = 주 + 아랫줄 억(부호 없음) · 팀 순매수 = ±억(600 · 부호 색) + 아랫줄 ±주.
 * - 매수 중 팀 ≥ 30% `--team` 600 · 0% `--faint`. 좁으면 `Table` 래퍼(`overflow-x-auto`)가 가로 스크롤.
 */

const HEADS = ['구간', '거래량', '매수 중 팀', '팀 매수', '팀 매도', '팀 순매수'] as const;
const SUB = 'block text-[length:var(--t-caption)] font-normal text-[var(--muted-fg)]';

function shareClass(share: number | null): string {
  if (isHotShare(share)) return 'font-semibold text-[var(--team)]';
  if (share === null || Math.round(share * 100) === 0) return 'text-[var(--faint)]';
  return '';
}

export function TeamflowBandTable({ bands }: { bands: readonly TeamflowBand[] }) {
  return (
    <div data-slot="teamflow-band-table">
      <Table className="text-[length:var(--t-caption)]">
        <TableHeader>
          <TableRow>
            {HEADS.map((h, i) => (
              <TableHead key={h} scope="col" className={cn('whitespace-nowrap', i === 0 ? 'text-left' : 'text-right')}>
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {bands.map((b) => {
            const total = b.label === '하루 합계';
            return (
              <TableRow
                key={b.label}
                className={cn('text-[var(--fg)]', total && 'bg-[var(--team-bg)] font-semibold')}
              >
                <TableCell className="whitespace-nowrap">{b.label}</TableCell>
                <TableCell className="mono text-right">{fmtQty(b.vol)}</TableCell>
                <TableCell className={cn('mono text-right', shareClass(b.share))}>{fmtShare(b.share)}</TableCell>
                <TableCell className="mono text-right">
                  {fmtQty(b.team_buy)}
                  <span className={SUB}>{fmtEok(b.team_buy_val)}</span>
                </TableCell>
                <TableCell className="mono text-right">
                  {fmtQty(b.team_sell)}
                  <span className={SUB}>{fmtEok(b.team_sell_val)}</span>
                </TableCell>
                <TableCell className="mono text-right">
                  <span className={cn('font-semibold', TONE_TEXT[toneOf(b.net_val)])}>
                    {fmtEok(b.net_val, { signed: true })}
                  </span>
                  <span className={SUB}>{b.net === null ? fmtQty(null) : `${fmtQty(b.net, { signed: true })}주`}</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
