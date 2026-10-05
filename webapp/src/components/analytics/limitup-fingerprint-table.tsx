'use client';

import { useMemo, useState } from 'react';

import type { LimitupFingerprintRow } from '@gh-radar/shared';

import { CARD, ROW_DIVIDER } from '@/components/layout/page-layout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fingerprintRowsOf } from '@/lib/limitup-lanes';
import { cn } from '@/lib/utils';

/**
 * 창구 지문표 (UI-SPEC ④-5 · gh-trade D-11 `_section_c_fingerprint`).
 *
 * - 집계 = 적재 보존 창(최근 90일, D 까지)의 창구별 합계(28-10 RPC) — 평균 · 비율 표기는 `fingerprintRowsOf`.
 * - 사건 ≥ 10: 매수 비중 두 칸 `--up` · 매도 비중 `--down` · 상태 「—」(승격 라벨 전). 사건 < 10: 행 전체 `--muted-fg` +
 *   「관찰 중」 태그 — 수치는 흐리지 않고 그대로 보인다(gh-trade 「수치는 보이되 결론을 달지 않는다」).
 * - 정렬 = 사건 수 내림차순 · 상위 20행 + 「창구 {N}개 더 보기」(펼치면 전부 · 다시 접기 없음).
 * - 좁으면 래퍼 `overflow-x-auto` 로 가로 스크롤(열을 접지 않는다).
 */

const TOP_N = 20;
const DASH = '—';

// 「진입 1분 · 깨짐 전 1분」 → 「상한가 직전 1분 · 깨짐 직전 1분」(quick-261005-vk1 D-04 — 사건 카드 창구 막대와 같은 이름).
const HEADS = [
  '창구',
  '사건',
  '상한가 직전 1분 매수',
  '잠김 중 매수',
  '깨짐 직전 1분 매도',
  '매도 선행',
  '유지율',
  '상태',
] as const;

export function LimitupFingerprintTable({ rows }: { rows: readonly LimitupFingerprintRow[] }) {
  const view = useMemo(() => fingerprintRowsOf(rows), [rows]);
  const [all, setAll] = useState(false);
  const shown = all ? view : view.slice(0, TOP_N);
  const rest = view.length - shown.length;

  return (
    <section data-slot="limitup-fingerprint" aria-labelledby="limitup-fp-title" className={cn(CARD, 'p-4')}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="limitup-fp-title" className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          창구 지문표
        </h2>
        <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">사건 10건 미만은 관찰 중</span>
      </div>

      {view.length === 0 ? (
        <p className="mt-3 text-[length:var(--t-caption)] text-[var(--faint)]">집계할 창구가 없어요</p>
      ) : (
        <>
          <div className="mt-2 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {HEADS.map((h, i) => (
                    <TableHead key={h} scope="col" className={i === 0 ? 'text-left' : 'text-right'}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => {
                  const live = !r.observing;
                  const up = (v: string) => cn(live && v !== DASH && 'text-[var(--up)]');
                  const down = (v: string) => cn(live && v !== DASH && 'text-[var(--down)]');
                  return (
                    <TableRow
                      key={r.member}
                      data-member={r.member}
                      data-observing={r.observing ? 'true' : undefined}
                      className={cn(ROW_DIVIDER, r.observing ? 'text-[var(--muted-fg)]' : 'text-[var(--fg)]')}
                    >
                      <TableCell className="max-w-[160px] truncate" title={r.label}>
                        {r.label}
                      </TableCell>
                      <TableCell className="mono text-right">{r.n}</TableCell>
                      <TableCell className={cn('mono text-right', up(r.entry))}>{r.entry}</TableCell>
                      <TableCell className={cn('mono text-right', up(r.lockBuy))}>{r.lockBuy}</TableCell>
                      <TableCell className={cn('mono text-right', down(r.preSell))}>{r.preSell}</TableCell>
                      <TableCell className="mono text-right">{r.lead}</TableCell>
                      <TableCell className="mono text-right">{r.hold}</TableCell>
                      <TableCell className="text-right">
                        {r.observing ? (
                          <span className="inline-flex h-5 items-center rounded-full bg-[var(--muted)] px-2 text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)]">
                            관찰 중
                          </span>
                        ) : (
                          DASH
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {rest > 0 && (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="mt-2 text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)] hover:underline"
            >
              창구 {rest}개 더 보기
            </button>
          )}
        </>
      )}
    </section>
  );
}
