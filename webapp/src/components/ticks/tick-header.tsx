'use client';

import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

import type { TickExchange, TickLiveState } from '@gh-radar/shared';

import { LimitupDateNav } from '@/components/analytics/limitup-date-nav';
import { cn } from '@/lib/utils';

/**
 * 틱 전문 뷰어 머리 줄 (Phase 37 D-16 · 진입 목업 A `.hdr` · 스케치 019 D 머리).
 *
 * 한 줄(넘치면 감김): 제목(진입 = 「틱 전문 뷰어」 · 열린 뒤 = ‹ 목록으로 + 종목명 + 코드 — 2026-11-03 사용자 요청) · 공급 배지(`grid` 「과거 격자 · GCS 원본」 ·
 * `live` 「당일 · 119 요청형」) → 종목 검색(피커 — 열린 뒤에도 머리에 남는다) → 날짜 알약 ‹ › (이동 단위 = 호출부가 준
 * prev/next — 격자가 있는 날짜 + 장중이면 오늘) · KRX|NXT 세그먼트 → 현재 틱 시각/seq 자리(37-10 이 값을 준다).
 * 당일(37-19 · D-06): 상태 delayed · blocked 면 공급 배지 옆 「당일 자료 지연 · n초 전 마지막 수신」(X-Tick-Last-Recv-Ns 기준) ·
 * 연속 오류가 쌓이면(`failing`) 머리 아래 줄 「당일 자료를 받지 못하고 있어요」.
 */

/** 당일 경로 상태(머리 표시용). */
export interface TickHeaderLive {
  state: TickLiveState | null;
  /** 마지막 레코드 recv epoch ns(십진) · 없으면 null. */
  lastRecvNs: string | null;
  /** 연속 오류가 상한을 넘었다. */
  failing: boolean;
}

/** 「당일 자료 지연 · n초 전 마지막 수신」 — 2분 이상이면 분 단위. */
export function liveDelayTextOf(lastRecvNs: string | null, nowMs: number): string {
  if (lastRecvNs === null) return '당일 자료 지연 · 아직 수신 없음';
  const sec = Math.max(0, Math.floor((nowMs - Number(BigInt(lastRecvNs) / 1_000_000n)) / 1000));
  const ago = sec < 120 ? `${sec}초` : `${Math.floor(sec / 60)}분`;
  return `당일 자료 지연 · ${ago} 전 마지막 수신`;
}

export interface TickHeaderProps {
  mode: 'entry' | 'loaded';
  stock: { code: string; name: string } | null;
  date: string | null;
  ex: TickExchange;
  supply: 'grid' | 'live' | null;
  prev: string | null;
  next: string | null;
  /** 날짜 알약 달력이 고를 수 있는 날(‹ › 판정과 같은 목록). */
  dates?: readonly string[];
  tickLabel?: { time: string; seq: number | null };
  onDate: (d: string) => void;
  onEx: (ex: TickExchange) => void;
  picker: ReactNode;
  /** 당일 경로 상태(37-19) — 과거 격자 · 진입이면 없음. */
  live?: TickHeaderLive | null;
  /** 열린 뒤 종목명 왼쪽 ‹ — 같은 날짜 · 거래소 목록으로(딥링크로 들어와도 동작하게 history.back 이 아니다). */
  onBack?: () => void;
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
  dates,
  tickLabel,
  onDate,
  onEx,
  picker,
  live = null,
  onBack,
}: TickHeaderProps) {
  const delayed = live !== null && (live.state === 'delayed' || live.state === 'blocked');
  return (
    <header data-slot="tick-header" data-mode={mode} className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <h1 className="m-0 flex min-w-0 items-center gap-2 text-[17px] font-bold text-[var(--fg)]">
        {mode === 'loaded' && onBack !== undefined && (
          <button
            type="button"
            data-slot="tick-back"
            aria-label="목록으로"
            title="목록으로"
            onClick={onBack}
            className="-mr-1 -ml-1.5 flex size-8 flex-none items-center justify-center rounded-[10px] text-[var(--fg)] transition-colors hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
        )}
        {mode === 'loaded' && stock !== null ? (
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate">{stock.name}</span>
            <small className="mono text-[length:var(--t-caption)] font-medium text-[var(--muted-fg)]">{stock.code}</small>
          </span>
        ) : (
          <span>틱뷰어</span>
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

      {delayed && (
        <span
          data-slot="tick-live-delay"
          role="status"
          className="-ml-2 inline-flex items-center rounded-[6px] bg-[var(--vi-bg)] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-[var(--vi)]"
        >
          {liveDelayTextOf(live.lastRecvNs, Date.now())}
        </span>
      )}

      {picker}

      <div className="flex flex-wrap items-center gap-1.5">
        <LimitupDateNav
          date={date}
          prev={prev}
          next={next}
          onGo={onDate}
          dates={dates}
          prevLabel="이전 날짜"
          nextLabel="다음 날짜"
        />
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

      {live?.failing && (
        <p
          data-slot="tick-live-failing"
          role="alert"
          className="m-0 basis-full text-[length:var(--t-caption)] font-medium text-[var(--destructive)]"
        >
          당일 자료를 받지 못하고 있어요
        </p>
      )}
    </header>
  );
}
