'use client';

import type { ReactNode } from 'react';

import type { TickExchange } from '@gh-radar/shared';

import { LimitupDateNav } from '@/components/analytics/limitup-date-nav';
import { cn } from '@/lib/utils';

/**
 * 틱 전문 뷰어 머리 줄 (Phase 37 D-16 · 진입 목업 A `.hdr` · 스케치 019 D 머리).
 *
 * 한 줄(넘치면 감김): 제목(진입 = 「틱 전문 뷰어」 · 열린 뒤 = 종목명 + 코드) · 공급 배지(`grid` 「과거 격자 · GCS 원본」 ·
 * `live` 「당일 · 119 요청형」) → 종목 검색(피커 — 열린 뒤에도 머리에 남는다) → 날짜 알약 ‹ › (이동 단위 = 호출부가 준
 * prev/next — 격자가 있는 날짜 + 장중이면 오늘) · KRX|NXT 세그먼트 → 현재 틱 시각/seq 자리(37-10 이 값을 준다).
 */

export interface TickHeaderProps {
  mode: 'entry' | 'loaded';
  stock: { code: string; name: string } | null;
  date: string | null;
  ex: TickExchange;
  supply: 'grid' | 'live' | null;
  prev: string | null;
  next: string | null;
  tickLabel?: { time: string; seq: number | null };
  onDate: (d: string) => void;
  onEx: (ex: TickExchange) => void;
  picker: ReactNode;
}

const SUPPLY_TEXT = { grid: '과거 격자 · GCS 원본', live: '당일 · 119 요청형' } as const;
const EXCHANGES: readonly TickExchange[] = ['KRX', 'NXT'];

export function TickHeader({
  mode,
  stock,
  date,
  ex,
  supply,
  prev,
  next,
  tickLabel,
  onDate,
  onEx,
  picker,
}: TickHeaderProps) {
  return (
    <header data-slot="tick-header" data-mode={mode} className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <h1 className="m-0 flex min-w-0 items-center gap-2 text-[17px] font-bold text-[var(--fg)]">
        {mode === 'loaded' && stock !== null ? (
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate">{stock.name}</span>
            <small className="mono text-[length:var(--t-caption)] font-medium text-[var(--muted-fg)]">{stock.code}</small>
          </span>
        ) : (
          <span>틱 전문 뷰어</span>
        )}
        {supply !== null && (
          <span
            data-slot="tick-supply"
            data-supply={supply}
            className={cn(
              'inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
              supply === 'live' ? 'bg-[var(--up-bg)] text-[var(--up)]' : 'bg-[var(--muted)] text-[var(--muted-fg)]',
            )}
          >
            {SUPPLY_TEXT[supply]}
          </span>
        )}
      </h1>

      {picker}

      <div className="flex flex-wrap items-center gap-1.5">
        <LimitupDateNav date={date} prev={prev} next={next} onGo={onDate} prevLabel="이전 날짜" nextLabel="다음 날짜" />
        <div role="group" aria-label="거래소" className="inline-flex rounded-full bg-[var(--muted)] p-0.5">
          {EXCHANGES.map((x) => (
            <button
              key={x}
              type="button"
              aria-pressed={x === ex}
              onClick={() => x !== ex && onEx(x)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11.5px] font-semibold',
                x === ex ? 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]' : 'text-[var(--fg-2)]',
              )}
            >
              {x}
            </button>
          ))}
        </div>
      </div>

      {tickLabel !== undefined && (
        <span data-slot="tick-current" className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          {tickLabel.time}
          {tickLabel.seq !== null && ` · #${tickLabel.seq}`}
        </span>
      )}
    </header>
  );
}
