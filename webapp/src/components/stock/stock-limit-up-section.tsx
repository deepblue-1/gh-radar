'use client';

/**
 * StockLimitUpSection — Phase 12 상한가 다음날 이력 (LIMIT-01, 목업 ②안 데이터 대시보드).
 *
 * 종목 상세(/stocks/[code]) co-movement 섹션 바로 다음에 마운트되는 신규 클라이언트 컴포넌트.
 * fetchStockLimitUp<LimitUpResponse> 로 사전계산 { hero, events, themes } 를 mount fetch 하고,
 * 목업 ② 레이아웃(KPI 4그리드 + 분포 spark / OHLC 8컬럼 표 / 테마 가로 풀링 바 / 면책)으로 렌더한다.
 *
 * 상태/패턴 = stock-comovement-section 미러:
 *   - mount fetch + AbortController, loaded/hasError state, 종목 간 내비게이션 시 state 리셋.
 *   - 에러 → 섹션 quiet fallback(return null, error.message 미노출 — console.error 만, T-12-05-01).
 *   - !loaded → null (레이아웃 점프 방지).
 *
 * 순수 로직(게이팅·spark 색·포맷)은 limit-up-format.ts 의 테스트 박제 함수를 import — 인라인 재구현 금지.
 *
 * ★ 색 규칙 (D-13): 수익=빨강 --up / 손실=파랑 --down / 보합 --flat.
 *   점상 태그 = --up-bg/--up, 일반 태그 = --muted/--muted-fg. globals.css oklch 토큰만(차트 아님 → 직접).
 */

import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { formatTradeAmount } from '@/lib/format';
import { fetchStockLimitUp } from '@/lib/limit-up-api';
import {
  shouldShowWinRate,
  sparkBucketTone,
  fmtRet,
  fmtTurnover,
} from '@/lib/limit-up-format';
import type {
  LimitUpEvent,
  LimitUpStockStats,
  LimitUpThemeStat,
} from '@gh-radar/shared';

const INITIAL_VISIBLE_EVENTS = 4;
const INITIAL_VISIBLE_THEMES = 4;

export interface StockLimitUpSectionProps {
  stockCode: string;
}

/** 수익률 방향색 클래스 (한국 관례: 상승 빨강 / 하락 파랑 / 보합·null 중립). */
function retColor(v: number | null): string {
  if (v == null || v === 0) return 'text-[var(--flat)]';
  return v > 0 ? 'text-[var(--up)]' : 'text-[var(--down)]';
}

/** ISO("2026-05-21") → "26.05.21" (목업 표 날짜 포맷). */
function fmtDate(iso: string): string {
  return `${iso.slice(2, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)}`;
}

/** 분포 spark — histogram 5버킷 카운트를 막대 높이 + 톤 색으로. */
function DistributionSpark({ histogram }: { histogram: number[] }) {
  const max = Math.max(1, ...histogram);
  return (
    <div className="mt-2 flex h-[30px] items-end gap-[3px]" aria-hidden="true">
      {histogram.map((count, i) => {
        const tone = sparkBucketTone(i);
        return (
          <span
            key={i}
            className={cn(
              'min-h-[2px] flex-1 rounded-t-[2px]',
              count === 0
                ? 'bg-[var(--muted)]'
                : tone === 'up'
                  ? 'bg-[var(--up)]'
                  : 'bg-[var(--down)]',
            )}
            style={{ height: `${Math.max(8, (count / max) * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

/** 상단 KPI 4그리드 — 시초가 익절 / 평균 시초가 / 최악 저가 / 분포 spark (목업 ② kpi-grid). */
function KpiGrid({ hero }: { hero: LimitUpStockStats }) {
  const showWinRate = shouldShowWinRate(hero);
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
      {/* ① 시초가 익절 — N≥3 이면 큰 %, 미만이면 카운트만 (D-09 게이팅) */}
      <div className="bg-[var(--card)] p-[13px_14px]">
        <div className="mb-[5px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          시초가 익절
        </div>
        <div className="text-[23px] font-extrabold leading-none text-[var(--up)]">
          {showWinRate && hero.winRate != null ? (
            <>
              {Math.round(hero.winRate * 100)}%{' '}
              <small className="text-[12px] font-semibold text-[var(--muted-fg)]">
                {hero.winCount}/{hero.resolvedEvents}
              </small>
            </>
          ) : (
            <span className="text-[var(--fg)]">
              {hero.winCount}/{hero.resolvedEvents}
              <small className="ml-1 text-[12px] font-semibold text-[var(--muted-fg)]">
                회
              </small>
            </span>
          )}
        </div>
      </div>

      {/* ② 평균 시초가 — 방향색, null → em-dash */}
      <div className="bg-[var(--card)] p-[13px_14px]">
        <div className="mb-[5px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          평균 시초가
        </div>
        <div
          className={cn(
            'text-[23px] font-extrabold leading-none',
            retColor(hero.avgOpenRet),
          )}
        >
          {fmtRet(hero.avgOpenRet)}
        </div>
      </div>

      {/* ③ 최악 저가 — --down 톤, null → em-dash */}
      <div className="bg-[var(--card)] p-[13px_14px]">
        <div className="mb-[5px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          최악 저가
        </div>
        <div
          className={cn(
            'text-[23px] font-extrabold leading-none',
            retColor(hero.worstLowRet),
          )}
        >
          {fmtRet(hero.worstLowRet)}
        </div>
      </div>

      {/* ④ 분포 spark */}
      <div className="bg-[var(--card)] p-[13px_14px]">
        <div className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          분포
        </div>
        <DistributionSpark histogram={hero.histogram} />
      </div>
    </div>
  );
}

/** OHLC 이벤트 표 1행 — 상한가일·구분·시·고·저·종·거래대금·회전율. */
function EventRow({ ev, faded }: { ev: LimitUpEvent; faded: boolean }) {
  return (
    <tr
      className={cn(
        'h-[38px] border-t border-[var(--border-subtle)] first:border-t-0 hover:bg-[color-mix(in_oklch,var(--muted)_60%,transparent)]',
        faded && 'opacity-50',
      )}
    >
      <td className="mono px-[10px] text-[length:var(--t-sm)]">
        {fmtDate(ev.date)}
      </td>
      <td className="px-[10px]">
        {ev.isJeomsang ? (
          <span className="whitespace-nowrap rounded-[var(--r)] bg-[var(--up-bg)] px-[6px] py-[2px] text-[10px] font-bold text-[var(--up)]">
            점상
          </span>
        ) : (
          <span className="whitespace-nowrap rounded-[var(--r)] bg-[var(--muted)] px-[6px] py-[2px] text-[10px] font-bold text-[var(--muted-fg)]">
            일반
          </span>
        )}
      </td>
      <td className={cn('mono px-[10px] text-right text-[length:var(--t-sm)]', retColor(ev.nextOpenRet))}>
        {fmtRet(ev.nextOpenRet)}
      </td>
      <td className={cn('mono px-[10px] text-right text-[length:var(--t-sm)]', retColor(ev.nextHighRet))}>
        {fmtRet(ev.nextHighRet)}
      </td>
      <td className={cn('mono px-[10px] text-right text-[length:var(--t-sm)]', retColor(ev.nextLowRet))}>
        {fmtRet(ev.nextLowRet)}
      </td>
      <td className={cn('mono px-[10px] text-right text-[length:var(--t-sm)]', retColor(ev.nextCloseRet))}>
        {fmtRet(ev.nextCloseRet)}
      </td>
      <td className="mono px-[10px] text-right text-[length:var(--t-sm)] text-[var(--muted-fg)]">
        {formatTradeAmount(ev.tradeAmount)}
      </td>
      <td className="mono px-[10px] text-right text-[length:var(--t-sm)] text-[var(--muted-fg)]">
        {fmtTurnover(ev.turnover)}
      </td>
    </tr>
  );
}

/** 테마 가로 풀링 바 1줄 — 테마명·진행바(익절률 폭)·익절률%·"N=… · 평균 ±x%". */
function ThemePoolBar({ theme }: { theme: LimitUpThemeStat }) {
  const trackPct =
    theme.winRate != null ? Math.max(4, Math.min(100, theme.winRate * 100)) : 0;
  const isStrong = theme.winRate != null && theme.winRate > 0.5;
  return (
    <div className="flex items-center gap-3 border-t border-[var(--border-subtle)] py-[9px] first:border-t-0">
      <div className="flex w-[108px] shrink-0 items-center gap-[7px] text-[length:var(--t-sm)] font-semibold">
        <span
          aria-hidden="true"
          className="size-[7px] shrink-0 rounded-full bg-[var(--flat)]"
        />
        <span className="truncate">{theme.themeName}</span>
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
        <span
          className="block h-full rounded-full bg-[var(--up)]"
          style={{ width: `${trackPct}%` }}
          aria-hidden="true"
        />
      </div>
      <div
        className={cn(
          'w-[42px] text-right text-[14px] font-bold',
          isStrong ? 'text-[var(--up)]' : 'text-[var(--fg)]',
        )}
      >
        {theme.winRate != null ? `${Math.round(theme.winRate * 100)}%` : '—'}
      </div>
      <div className="w-[120px] shrink-0 text-right text-[length:var(--t-caption)] text-[var(--muted-fg)]">
        N={theme.sampleN} · 평균 {fmtRet(theme.avgOpenRet)}
      </div>
    </div>
  );
}

export function StockLimitUpSection({ stockCode }: StockLimitUpSectionProps) {
  const [hero, setHero] = useState<LimitUpStockStats | null>(null);
  const [events, setEvents] = useState<LimitUpEvent[]>([]);
  const [themes, setThemes] = useState<LimitUpThemeStat[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 에러 시 섹션 조용히 숨김 — error.message 절대 미노출(quiet fallback, T-12-05-01).
  const [hasError, setHasError] = useState(false);
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [themesExpanded, setThemesExpanded] = useState(false);

  useEffect(() => {
    // 종목 간 내비게이션(remount 없이 props 갱신)에서 state sticky 방지:
    //   - hasError 리셋 없으면 한 번 실패 후 모든 종목에서 섹션 영구 숨김.
    //   - hero/events/themes 리셋 없으면 새 fetch 전 이전 종목 데이터 stale 노출.
    setLoaded(false);
    setHasError(false);
    setEventsExpanded(false);
    setThemesExpanded(false);
    setHero(null);
    setEvents([]);
    setThemes([]);
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetchStockLimitUp(stockCode, controller.signal);
        if (controller.signal.aborted) return;
        setHero(res.hero);
        setEvents(res.events);
        setThemes(res.themes);
        setLoaded(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        // 디버그는 console, 사용자 노출 0 (섹션 숨김).
        console.error('[StockLimitUpSection] fetch failed', err);
        setHasError(true);
        setLoaded(true);
      }
    })();
    return () => controller.abort();
  }, [stockCode]);

  const visibleEvents = useMemo(
    () => (eventsExpanded ? events : events.slice(0, INITIAL_VISIBLE_EVENTS)),
    [events, eventsExpanded],
  );
  const visibleThemes = useMemo(
    () => (themesExpanded ? themes : themes.slice(0, INITIAL_VISIBLE_THEMES)),
    [themes, themesExpanded],
  );

  // 로딩 전 레이아웃 점프 방지 (comovement 선례).
  if (!loaded) return null;
  // 에러 → 섹션 조용히 숨김 (quiet fallback, error.message 미노출).
  if (hasError || hero == null) return null;

  const totalEvents = hero.totalEvents;

  // 빈 상태 (이벤트 0회 — 대형주 정상) → 조용한 빈 박스 + 면책 톤.
  if (totalEvents === 0 || events.length === 0) {
    return (
      <section
        aria-label="상한가 다음날 이력"
        className="flex flex-col gap-[var(--s-3)]"
      >
        <h2 className="text-[length:var(--t-caption)] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
          상한가 다음날 이력
        </h2>
        <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center">
          <p className="text-[length:var(--t-base)] font-bold">
            아직 마감상한가 이력이 없습니다
          </p>
          <p className="mt-1 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            최근 24개월 내 마감 상한가 기록이 없는 종목입니다. 과거 통계이며
            미래 수익을 보장하지 않습니다. 출처 KRX.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="상한가 다음날 이력"
      className="flex flex-col gap-[var(--s-3)]"
    >
      {/* 헤더 */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex flex-col gap-[2px]">
          <h2 className="text-[14px] font-bold">상한가 다음날 이력</h2>
          <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            상한가 종가에 매수 → 다음 영업일 수익률 · 출처 KRX
          </p>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-[var(--muted)] px-2 py-[2px] text-[11px] font-semibold text-[var(--muted-fg)]">
          최근 24개월 · {totalEvents}회
        </span>
      </div>

      {/* KPI 4그리드 + 분포 spark */}
      <KpiGrid hero={hero} />

      {/* 최근 3회 보조 스탯 (D-10) */}
      <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
        최근 3회 {hero.recentWins}승 {hero.recentLosses}패
      </p>

      {/* OHLC 8컬럼 이벤트 표 */}
      <div className="overflow-hidden rounded-[var(--r-md)] border border-[var(--border)]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="bg-[var(--muted)] px-[10px] py-2 text-left text-[11px] font-semibold text-[var(--muted-fg)]">
                상한가일
              </th>
              <th className="bg-[var(--muted)] px-[10px] py-2 text-left text-[11px] font-semibold text-[var(--muted-fg)]">
                구분
              </th>
              <th className="bg-[var(--muted)] px-[10px] py-2 text-right text-[11px] font-semibold text-[var(--muted-fg)]">
                시가
              </th>
              <th className="bg-[var(--muted)] px-[10px] py-2 text-right text-[11px] font-semibold text-[var(--muted-fg)]">
                고가
              </th>
              <th className="bg-[var(--muted)] px-[10px] py-2 text-right text-[11px] font-semibold text-[var(--muted-fg)]">
                저가
              </th>
              <th className="bg-[var(--muted)] px-[10px] py-2 text-right text-[11px] font-semibold text-[var(--muted-fg)]">
                종가
              </th>
              <th className="bg-[var(--muted)] px-[10px] py-2 text-right text-[11px] font-semibold text-[var(--muted-fg)]">
                거래대금
              </th>
              <th className="bg-[var(--muted)] px-[10px] py-2 text-right text-[11px] font-semibold text-[var(--muted-fg)]">
                회전율
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleEvents.map((ev, i) => (
              <EventRow
                key={ev.date}
                ev={ev}
                faded={!eventsExpanded && i >= INITIAL_VISIBLE_EVENTS - 1 && events.length > INITIAL_VISIBLE_EVENTS}
              />
            ))}
          </tbody>
        </table>
      </div>
      {events.length > INITIAL_VISIBLE_EVENTS && (
        <button
          type="button"
          onClick={() => setEventsExpanded((v) => !v)}
          className="w-full rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-sm)] font-semibold text-[var(--muted-fg)] transition-colors hover:border-[color-mix(in_oklch,var(--primary)_30%,var(--border))] hover:text-[var(--fg)]"
        >
          {eventsExpanded
            ? '접기'
            : `+ ${events.length - INITIAL_VISIBLE_EVENTS}회 더보기`}
        </button>
      )}

      {/* legend */}
      <div className="flex flex-wrap gap-[14px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
        <span>
          <b className="font-bold text-[var(--up)]">점상</b> = 하루종일 상한가
          굳음(강한 매수세)
        </span>
        <span>회전율 = 거래량 / 상장주식수 (현재 상장주식수 기준 근사)</span>
      </div>

      {/* 테마 가로 풀링 바 (별도 카드) */}
      {themes.length > 0 && (
        <div className="mt-[var(--s-2)] rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-4)]">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-bold">
              소속 테마의 다음날 익절 경향
            </h3>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-[var(--muted)] px-2 py-[2px] text-[11px] font-semibold text-[var(--muted-fg)]">
              테마 풀링
            </span>
          </div>
          <p className="mb-[14px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            이 종목이 속한 테마의 멤버 전체가 상한가 갔을 때 다음날 시초가 익절률
          </p>
          {visibleThemes.map((theme) => (
            <ThemePoolBar key={theme.themeId} theme={theme} />
          ))}
          {themes.length > INITIAL_VISIBLE_THEMES && (
            <button
              type="button"
              onClick={() => setThemesExpanded((v) => !v)}
              className="mt-[var(--s-3)] w-full rounded-[var(--r)] border border-[var(--border)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-sm)] font-semibold text-[var(--muted-fg)] transition-colors hover:border-[color-mix(in_oklch,var(--primary)_30%,var(--border))] hover:text-[var(--fg)]"
            >
              {themesExpanded
                ? '접기'
                : `테마 ${themes.length - INITIAL_VISIBLE_THEMES}개 더보기`}
            </button>
          )}
        </div>
      )}

      {/* 면책 (D-14) */}
      <div className="flex items-start gap-[6px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
        <span aria-hidden="true" className="font-bold text-[var(--up)]">
          ⚠
        </span>
        <span>
          표본 {totalEvents}회로 적음. 과거 통계이며 미래 수익을 보장하지
          않습니다. 출처 KRX.
        </span>
      </div>
    </section>
  );
}
