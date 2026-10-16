'use client';

import type { TeamflowBucket, TeamflowWindow } from '@gh-radar/shared';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { windowKeysOf } from '@/lib/teamflow-chart';
import {
  BUCKET_KEY_CLOSE,
  BUCKET_KEY_LAST,
  TONE_TEXT,
  fmtEok,
  fmtQty,
  fmtRangePct,
  fmtShare,
  isHotShare,
  toneOf,
} from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

/**
 * 「10분 표 보기」 접힌 표 (Phase 33 · UI-SPEC T8 10분 표 · D-13 · D-14) — 10분 차트 수치의 보조기기 · 폰 경로.
 *
 * - 7열 「시각 · 등락 범위 · 거래량 · 팀 매수 · 팀 매도 · 팀 순매수 · 매수 중 팀」.
 * - 행 = `buckets[]` **전부**(key 오름차순) — 차트와 달리 key 92 · 93(종가 단일가) · 범위 밖 key 가 각자 행으로 남는다(원자료 보존).
 * - 최대 매집 창 칸 행(`windowKeysOf` 범위 = 축으로 자르지 않은 key · 창이 key 92 까지 닿으면 차트가 거기 합산하는 key 93 도)은 첫 칸에
 *   `inset 3px 0 0 var(--team)` 띠.
 * - 숫자 열 오른쪽 정렬 `mono` · 팀 순매수 ±억(600 · 부호 색) · 매수 중 팀 ≥ 30% `--team` 600 · 0% `--faint`.
 *   좁으면 `Table` 래퍼(`overflow-x-auto`)가 가로 스크롤 · 표 안 세로 스크롤 없음.
 */

const HEADS = ['시각', '등락 범위', '거래량', '팀 매수', '팀 매도', '팀 순매수', '매수 중 팀'] as const;
const WINDOW_STRIPE = 'shadow-[inset_3px_0_0_var(--team)]';

function shareClass(share: number | null): string {
  if (isHotShare(share)) return 'font-semibold text-[var(--team)]';
  if (share === null || Math.round(share * 100) === 0) return 'text-[var(--faint)]';
  return '';
}

/**
 * window → 띠를 그을 key 판정 함수(window null · 형식 오류면 항상 false).
 * 축으로 자르지 않은 key 범위로 판정한다 — 창이 09:00 이전 · 15:40 이후여도 실제 그 key 행에만 띠(IN-03).
 * 차트가 key 93 을 슬롯 38(key 92)에 합산하므로, 창이 key 92 까지 닿으면 key 93 행에도 띠(차트 음영과 같은 칸).
 */
function windowKeyTest(window: Pick<TeamflowWindow, 'start' | 'end'> | null): (key: number) => boolean {
  const ks = windowKeysOf(window);
  if (!ks) return () => false;
  const [k0, k1] = ks;
  const closeIn = k1 >= BUCKET_KEY_LAST && k0 <= BUCKET_KEY_CLOSE;
  return (key) => (key >= k0 && key <= k1) || (closeIn && key === BUCKET_KEY_CLOSE);
}

export function TeamflowBucketTable({
  buckets,
  window,
}: {
  buckets: readonly TeamflowBucket[];
  window: Pick<TeamflowWindow, 'start' | 'end'> | null;
}) {
  const inWindow = windowKeyTest(window);
  const rows = [...buckets].sort((a, b) => a.key - b.key);

  return (
    <div data-slot="teamflow-bucket-table">
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
          {rows.map((b) => (
            <TableRow key={b.key} className="text-[var(--fg)]">
              <TableCell className={cn('mono whitespace-nowrap', inWindow(b.key) && WINDOW_STRIPE)}>{b.start}</TableCell>
              <TableCell className="mono text-right whitespace-nowrap">{fmtRangePct(b.lo, b.hi)}</TableCell>
              <TableCell className="mono text-right">{fmtQty(b.vol)}</TableCell>
              <TableCell className="mono text-right">{fmtQty(b.team_buy)}</TableCell>
              <TableCell className="mono text-right">{fmtQty(b.team_sell)}</TableCell>
              <TableCell className={cn('mono text-right font-semibold', TONE_TEXT[toneOf(b.net_val)])}>
                {fmtEok(b.net_val, { signed: true })}
              </TableCell>
              <TableCell className={cn('mono text-right', shareClass(b.share))}>{fmtShare(b.share)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
