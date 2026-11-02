'use client';

import { useMemo, type ReactNode } from 'react';

import { A3_LAYOUT, decodeFields, fmtTickTime, payloadOf } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { fmtAmountC, fmtQty, fmtRate } from '@/lib/ticks/tick-format';
import type { TickSession } from '@/lib/ticks/tick-session';
import { cn } from '@/lib/utils';

/**
 * 틱 뷰어 「거래대금」 카드 (Phase 37 D-00 ① · 스케치 019 오른쪽 열).
 *
 * 커서 이하(거래소순) 마지막 A3 의 누적 거래대금(`cum_value` · 스케치 010 C 축약) · 체결가 · 등락률(기준가 = 체결
 * `px − 부호×chg` 최빈값 · shared DayRateTracker) · 누적 거래량(그 A3 하나만 `decodeFields` 로 푼다).
 * 아직 체결이 없으면 「아직 체결 없음」.
 */

export interface TickAmountCardProps {
  session: TickSession;
  cursorRec: number;
  className?: string;
}

const DIR_COLOR = { 1: 'text-[var(--up)]', 0: 'text-[var(--flat)]', [-1]: 'text-[var(--down)]' } as const;

export function TickAmountCard({ session, cursorRec, className }: TickAmountCardProps) {
  const j = cursorRec >= 0 ? session.lastA3[session.exPos[cursorRec]!]! : -1;
  const a3Rec = j >= 0 ? session.a3.rec[j]! : -1;
  const cumVolume = useMemo(() => {
    if (a3Rec < 0) return null;
    const { index, buf } = session;
    const row = decodeFields(A3_LAYOUT, payloadOf(buf, index, a3Rec), index.recvNs[a3Rec]!, index.label);
    const v = row['cum_volume'];
    return typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : null;
  }, [session, a3Rec]);

  let body: ReactNode;
  if (j < 0) {
    body = (
      <p data-slot="tick-amount-empty" className="m-0 py-3 text-center text-[12px] text-[var(--muted-fg)]">
        아직 체결 없음
      </p>
    );
  } else {
    const cumValue = session.a3.cumValue[j]!;
    const px = session.a3.px[j]!;
    const base = session.basePx;
    const rate = base !== null && base > 0 ? (px / base - 1) * 100 : null;
    const dir = rate === null || Math.round(rate * 10) === 0 ? 0 : rate > 0 ? 1 : -1;
    body = (
      <>
        <div data-slot="tick-amount-value" className="mono text-[20px] leading-tight font-semibold text-[var(--fg)]">
          {fmtAmountC(cumValue)}
        </div>
        <dl className="m-0 mt-2 grid grid-cols-3 gap-x-3 text-[11.5px]">
          <div className="min-w-0">
            <dt className="text-[10.5px] text-[var(--muted-fg)]">현재가</dt>
            <dd data-slot="tick-amount-px" className={cn('mono m-0 truncate font-semibold', DIR_COLOR[dir])}>
              {fmtQty(px)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10.5px] text-[var(--muted-fg)]">등락률</dt>
            <dd data-slot="tick-amount-rate" className={cn('mono m-0 truncate font-semibold', DIR_COLOR[dir])}>
              {fmtRate(rate)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10.5px] text-[var(--muted-fg)]">누적 거래량</dt>
            <dd data-slot="tick-amount-vol" className="mono m-0 truncate font-semibold text-[var(--fg)]">
              {cumVolume === null ? '—' : fmtQty(cumVolume)}
            </dd>
          </div>
        </dl>
      </>
    );
  }

  return (
    <section
      data-slot="tick-amount-card"
      aria-label="거래대금"
      className={cn(CARD, 'flex min-w-0 flex-col overflow-hidden', className)}
    >
      <div className="flex flex-none items-baseline gap-2 border-b border-[var(--border-subtle)] px-3 py-[9px]">
        <h2 className="m-0 text-[12.5px] font-bold text-[var(--fg)]">거래대금</h2>
        {a3Rec >= 0 && (
          <small className="mono truncate text-[11px] text-[var(--muted-fg)]">
            A3 {fmtTickTime(session.index.recvNs[a3Rec]!)} 기준
          </small>
        )}
      </div>
      <div className="px-3 pt-2.5 pb-3">{body}</div>
    </section>
  );
}
