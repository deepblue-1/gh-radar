'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, RefreshCw } from 'lucide-react';

import type { TickExchange, TickLiveState } from '@gh-radar/shared';

import { LimitupDateNav } from '@/components/analytics/limitup-date-nav';
import { kstClock } from '@/lib/limitup-report';
import type { OwnNavState } from '@/lib/ticks/use-own-nav';
import { cn } from '@/lib/utils';

/**
 * 틱 전문 뷰어 머리 줄 (Phase 37 D-16 · 진입 목업 A `.hdr` · 스케치 019 D 머리).
 *
 * 한 줄(넘치면 감김): 제목(진입 = 「틱 전문 뷰어」 · 열린 뒤 = ‹ 목록으로 + 종목명 + 코드 — 2026-11-03 사용자 요청) · 공급 배지(`grid` 「과거 격자 · GCS 원본」 ·
 * `live` 「당일 · 119 요청형」) → 종목 검색(피커 — 열린 뒤에도 머리에 남는다) → 날짜 알약 ‹ › (이동 단위 = 호출부가 준
 * prev/next — 격자가 있는 날짜 + 장중이면 오늘) · KRX|NXT 세그먼트 → 현재 틱 시각/seq 자리(37-10 이 값을 준다).
 * 당일(37-19 · D-06): 상태 delayed · blocked 면 공급 배지 옆 「당일 자료 지연 · n초 전 마지막 수신」(X-Tick-Last-Recv-Ns 기준) ·
 * 연속 오류가 쌓이면(`failing`) 머리 아래 줄 「당일 자료를 받지 못하고 있어요」. tickgw 가 08:00 부터 끊김을 안다(`X-Tick-Complete`
 * false · `incomplete`)면 「당일 자료 일부 빠짐」 배지 — 묶기 · 열린 주문 · 팀 손익이 구멍 위에서 계산된다(WR-63). 공급 배지 옆 「↻ 최신 받기」 = 증분 1회(자동 갱신
 * 없음 · 2026-11-03 사용자 요청) — 받는 중이면 아이콘이 돌고 눌리지 않는다 · 실패면 빨간 글자 · title = 마지막으로 받은 시각.
 * 우리 주문 · 체결(38-08 · D-09): KRX|NXT 뒤 · 현재 틱 자리 앞에 「◆ 우리 k/n · 주문 m ‹ ›」 알약(목업 `.mine-pill`) — ‹ › 는
 * 앞뒤 우리 근거 · 주문 줄 · 체결로(끝이면 비활성 · 키 `[` `]` 와 같다). 뷰어가 상태를 주지 않으면(우리 체결 · 주문 없음) 알약 없음.
 */

/** 당일 경로 상태(머리 표시용). */
export interface TickHeaderLive {
  state: TickLiveState | null;
  /** 마지막 레코드 recv epoch ns(십진) · 없으면 null. */
  lastRecvNs: string | null;
  /** 연속 오류가 상한을 넘었다. */
  failing: boolean;
  /** 「최신 받기」 — 증분 1회(자동 갱신 없음 · 2026-11-03 사용자 요청). 세션 전(하루치 받는 중)이면 없음. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** 마지막으로 받은 시각(epoch ms). */
  fetchedAt?: number | null;
  /** 마지막 받기가 실패했다(연속 오류 수 > 0). */
  refreshFailed?: boolean;
  /** 08:00 부터 끊김 없이 이어지지 않았다(`X-Tick-Complete` false · WR-63) — 「당일 자료 일부 빠짐」. */
  incomplete?: boolean;
}

/** 「당일 자료 일부 빠짐」 배지 title — 무엇이 불완전한지(WR-63). */
export const LIVE_GAP_TITLE = '119 에서 받는 중 끊긴 구간이 있어요 · 버스트 묶기 · 열린 주문 · 팀 손익 판정이 불완전할 수 있어요';

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
  /** 우리 주문 · 체결 탐색(38-08 · D-09) — 「◆ 우리 k/n · 주문 m ‹ ›」 알약 · 없으면 알약 없음. */
  ownNav?: OwnNavState | null;
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
  ownNav = null,
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

      {live?.onRefresh !== undefined && (
        <button
          type="button"
          data-slot="tick-live-refresh"
          onClick={live.onRefresh}
          disabled={live.refreshing === true}
          aria-busy={live.refreshing === true}
          title={
            live.refreshFailed
              ? '받지 못했어요 — 다시 눌러 주세요'
              : live.fetchedAt
                ? `마지막으로 받은 시각 ${kstClock(live.fetchedAt)}`
                : undefined
          }
          className={cn(
            '-ml-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap hover:bg-[var(--raised-2)] disabled:opacity-70',
            live.refreshFailed ? 'text-[var(--destructive)]' : 'text-[var(--fg-2)]',
          )}
        >
          <RefreshCw className={cn('size-3.5', live.refreshing && 'animate-spin')} aria-hidden="true" />
          {live.refreshing ? '받는 중' : live.refreshFailed ? '다시 받기' : '최신 받기'}
        </button>
      )}

      {delayed && (
        <span
          data-slot="tick-live-delay"
          role="status"
          className="-ml-2 inline-flex items-center rounded-[6px] bg-[var(--vi-bg)] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-[var(--vi)]"
        >
          {liveDelayTextOf(live.lastRecvNs, Date.now())}
        </span>
      )}

      {live?.incomplete && (
        <span
          data-slot="tick-live-gap"
          role="status"
          title={LIVE_GAP_TITLE}
          className="-ml-2 inline-flex items-center rounded-[6px] bg-[var(--vi-bg)] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-[var(--vi)]"
        >
          당일 자료 일부 빠짐
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

      {ownNav !== null && (
        <span
          data-slot="tick-own-nav"
          className="inline-flex items-center gap-[5px] rounded-full bg-[var(--mine-bg)] px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap text-[var(--mine-fg)]"
        >
          <span className="tabular-nums">{`◆ 우리 ${ownNav.k}/${ownNav.n} · 주문 ${ownNav.orders}`}</span>
          <button
            type="button"
            aria-label="이전 우리 근거 · 주문 · 체결"
            title="이전 우리 근거 · 주문 · 체결 ["
            disabled={ownNav.prev === null}
            onClick={ownNav.prev ?? undefined}
            className="-my-1 px-1 py-1 text-[11px] font-bold disabled:opacity-35"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="다음 우리 근거 · 주문 · 체결"
            title="다음 우리 근거 · 주문 · 체결 ]"
            disabled={ownNav.next === null}
            onClick={ownNav.next ?? undefined}
            className="-my-1 px-1 py-1 text-[11px] font-bold disabled:opacity-35"
          >
            ›
          </button>
        </span>
      )}

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
