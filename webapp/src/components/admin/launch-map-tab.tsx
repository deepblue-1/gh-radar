'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  LAUNCH_FIRES,
  LAUNCH_ORDER,
  launchDaysOf,
  launchPanelStatsOf,
  type LaunchDay,
  type LaunchFire,
  type LaunchMapPiece,
  type LaunchMapResponse,
  type LaunchPanelStats,
  type LaunchRange,
} from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchLaunchMap } from '@/lib/launch-api';
import { DASH, brokerMarketLabelOf, fmtUs } from '@/lib/launch-format';
import { launchRangeOf, mapNextOffsetOf } from '@/lib/launch-map';
import { cn } from '@/lib/utils';

import { LaunchGateChart } from './launch-gate-chart';
import { LaunchFireSeg } from './launch-orders-tab';

/**
 * 경계 지도 탭 (Phase 35 · D-15 ~ D-18 · 채택 목업 `mockup-launch-gate-map.html` — 프리셋 칩 · 리본 켬 · 09:00:30 합패널).
 *
 * - `LaunchMapTab` = 받기 · 상태(주문 내역 탭과 같은 alive effect 꼴). `fire` 또는 `range` 가 바뀔 때만 요청 1건 —
 *   칩 하나 · 세그먼트 하나 = 요청 1건(server 가 발사 기준 × 범위를 RPC 1회로 거른다).
 * - `LaunchMapView` = 순수 렌더. 컨트롤 줄(프리셋 칩 · 실제 범위 글 · 발사 기준 세그먼트) → 범례 → 요약 카드 4장 →
 *   서버 × 시장 4패널(LAUNCH_ORDER 순 `LaunchGateChart`) → 푸터 한 줄.
 * - 범위는 프리셋 칩만이다(시작 · 끝 날짜 입력 없음 — D-15 · CONTEXT Deferred). 범위 글은 응답 days 기준(실제 덮은 날).
 * - 다음 첫 조각은 늘 최신 머리 값(`mapNextOffsetOf`)이다 — 상수로 박지 않는다. 머리가 없거나 값이 null 이면 「—」 ·
 *   점선 없음(백필 머리 · gh-trade 발사 계획 어드민 전환 뒤).
 * - 폰 390: 요약 카드 2열 · 패널 SVG 는 640 고정 + 패널 래퍼 가로 스크롤(`LaunchGateChart`) · 부모 `min-w-0` 으로 페이지는
 *   넓어지지 않는다.
 */

export interface LaunchMapTabProps {
  fire: LaunchFire;
  range: LaunchRange;
  onFire: (f: LaunchFire) => void;
  onRange: (r: LaunchRange) => void;
}

type Phase = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; resp: LaunchMapResponse };

export function LaunchMapTab({ fire, range, onFire, onRange }: LaunchMapTabProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setPhase({ kind: 'loading' });
    fetchLaunchMap(fire, range).then(
      (resp) => {
        if (alive) setPhase({ kind: 'ready', resp });
      },
      () => {
        if (alive) setPhase({ kind: 'error' });
      },
    );
    return () => {
      alive = false;
    };
  }, [fire, range, attempt]);

  return (
    <LaunchMapView
      status={phase.kind}
      resp={phase.kind === 'ready' ? phase.resp : null}
      fire={fire}
      range={range}
      onFire={onFire}
      onRange={onRange}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 순수 렌더
// ─────────────────────────────────────────────────────────────────────────────

export interface LaunchMapViewProps {
  resp: LaunchMapResponse | null;
  fire: LaunchFire;
  range: LaunchRange;
  onFire: (f: LaunchFire) => void;
  onRange: (r: LaunchRange) => void;
  /** 기본 'ready'(resp 가 있으면). */
  status?: Phase['kind'];
  onRetry?: () => void;
}

const RANGE_CHIPS: readonly { value: LaunchRange; label: string }[] = [
  { value: '10d', label: '최근 10일' },
  { value: '20d', label: '20일' },
  { value: 'all', label: '전체' },
];

const FOOT: Record<LaunchFire, string> = {
  q16: '조각 간격은 10/12부터 0/+10/+20µs, 10/22부터 0/+10/+30µs. 금액 부족 등 기타 거부는 경계 계산에서 뺀다.',
  n0930: 'N 오프셋은 고정값 — 선은 최신 N 머리 값 · 재전송은 첫 발만 점 · 횟수는 툴팁',
};

interface MapPanel {
  gateway: string;
  market: string;
  days: LaunchDay<LaunchMapPiece>[];
  stats: LaunchPanelStats;
  next: number | null;
}

/** 응답 → LAUNCH_ORDER 순 4패널. 조각은 (서버, 시장)과 발사 거래소로 거른다(응답이 이미 발사 기준으로 걸러져 온다). */
function panelsOf(resp: LaunchMapResponse, fire: LaunchFire): MapPanel[] {
  const exchange = LAUNCH_FIRES[fire].fire_exchange;
  return LAUNCH_ORDER.map(([gateway, market]) => {
    const days = launchDaysOf(
      resp.pieces.filter((p) => p.gateway === gateway && p.market === market && p.fire_exchange === exchange),
    );
    return {
      gateway,
      market,
      days,
      stats: launchPanelStatsOf(days),
      next: mapNextOffsetOf(resp.heads, gateway, market, fire),
    };
  });
}

export function LaunchMapView({ resp, fire, range, onFire, onRange, status = 'ready', onRetry }: LaunchMapViewProps) {
  const panels = useMemo(() => (resp === null ? [] : panelsOf(resp, fire)), [resp, fire]);
  const rangeText = resp === null ? null : launchRangeOf(resp.days);
  const ready = status === 'ready' && resp !== null;
  const noHistory = ready && resp.days.length === 0;
  const sideless = ready && fire === 'n0930' && resp.pieces.some((p) => p.side === null);

  return (
    <div data-slot="launch-map" className="flex min-w-0 flex-col gap-3.5">
      <div data-slot="launch-controls" className="flex min-w-0 flex-wrap items-center gap-2.5">
        <div data-slot="launch-range" role="group" aria-label="범위" className="inline-flex flex-wrap items-center gap-1.5">
          {RANGE_CHIPS.map((c) => {
            const on = c.value === range;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={on}
                data-range={c.value}
                onClick={() => !on && onRange(c.value)}
                className={cn(
                  'inline-flex min-h-[26px] items-center rounded-full px-[11px] text-[12.5px] font-semibold whitespace-nowrap',
                  on ? 'bg-[var(--fg)] text-[var(--bg)]' : 'bg-[var(--muted)] text-[var(--fg-2)] hover:text-[var(--fg)]',
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <span data-slot="launch-range-text" className="text-[12.5px] whitespace-nowrap text-[var(--muted-fg)] tabular-nums">
          {rangeText ?? ''}
        </span>
        <div className="ml-auto">
          <LaunchFireSeg fire={fire} onFire={onFire} />
        </div>
      </div>

      {status === 'loading' && <MapSkeleton />}

      {status === 'error' && (
        <div
          data-slot="launch-error"
          role="alert"
          className={cn(CARD, 'flex flex-col items-center gap-2 px-4 py-12 text-center')}
        >
          <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">
            발사 기록을 불러오지 못했어요
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-8 text-[length:var(--t-caption)] font-semibold text-[var(--accent-fg)] hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {noHistory && (
        <div data-slot="launch-empty" className={cn(CARD, 'flex flex-col items-center gap-1 px-4 py-12 text-center')}>
          <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">
            아직 적재된 발사가 없어요 · 첫 적재는 16:00:01
          </p>
        </div>
      )}

      {ready && !noHistory && (
        <>
          <LaunchLegend fire={fire} sideless={sideless} />
          <div data-slot="launch-kpis" className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-4">
            {panels.map((p) => (
              <LaunchKpiCard key={`${p.gateway}|${p.market}`} {...p} />
            ))}
          </div>
          <div data-slot="launch-panels" className="flex min-w-0 flex-col gap-3">
            {panels.map((p) => (
              <LaunchGateChart
                key={`${p.gateway}|${p.market}`}
                gateway={p.gateway}
                market={p.market}
                fire={fire}
                days={p.days}
                next={p.next}
              />
            ))}
          </div>
          <p data-slot="launch-foot" className="px-1 text-[12px] leading-relaxed break-keep text-[var(--muted-fg)]">
            {FOOT[fire]}
          </p>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 범례
// ─────────────────────────────────────────────────────────────────────────────

const DOT = 'inline-block size-2.5 shrink-0 rounded-full';

function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {swatch}
      {children}
    </span>
  );
}

function LaunchLegend({ fire, sideless }: { fire: LaunchFire; sideless: boolean }) {
  return (
    <div
      data-slot="launch-legend"
      className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[12px] text-[var(--muted-fg)]"
    >
      <LegendItem swatch={<i className={cn(DOT, 'bg-[var(--launch-ok)]')} />}>접수</LegendItem>
      <LegendItem swatch={<i className={cn(DOT, 'bg-[var(--launch-bad)]')} />}>
        {fire === 'q16' ? '101 거부(너무 이름)' : '101·515 거부'}
      </LegendItem>
      <LegendItem swatch={<i className={cn(DOT, 'border-2 border-[var(--launch-other)]')} />}>
        기타 거부(시각과 무관)
      </LegendItem>
      {fire === 'n0930' && (
        <LegendItem swatch={<i className="inline-block size-2 shrink-0 rotate-45 bg-[var(--muted-fg)]" />}>
          마름모 = A 매도 · 동그라미 = N 매수
        </LegendItem>
      )}
      {sideless && (
        <LegendItem swatch={<i className={cn(DOT, 'border border-dashed border-[var(--muted-fg)]')} />}>
          구분 없음(백필)
        </LegendItem>
      )}
      <LegendItem
        swatch={
          <i className="inline-block h-2.5 w-4 shrink-0 rounded-[2px] border border-[var(--launch-gate)] bg-[var(--launch-gate-bg)]" />
        }
      >
        그날 경계(마지막 거부 ~ 첫 접수)
      </LegendItem>
      <LegendItem swatch={<i className="inline-block h-3.5 w-0.5 shrink-0 bg-[var(--primary)]" />}>
        다음 발사의 첫 조각
      </LegendItem>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 요약 카드
// ─────────────────────────────────────────────────────────────────────────────

const usOrDash = (v: number | null): string => (v === null ? DASH : `${fmtUs(v)}µs`);

const KPI_FACE = cn(CARD, 'flex min-w-0 flex-col gap-1 px-3.5 py-3 ring-1 ring-[var(--border-subtle)] ring-inset dark:ring-0');

function LaunchKpiCard({ gateway, market, stats, next }: MapPanel) {
  return (
    <div data-slot="launch-kpi" data-gateway={gateway} data-market={market} className={KPI_FACE}>
      <div className="text-[12px] font-semibold text-[var(--muted-fg)]">
        {brokerMarketLabelOf(gateway, market)} · {stats.days}일
      </div>
      <KpiRow label="접수된 가장 이른" tone="text-[var(--launch-ok)]" value={usOrDash(stats.min_accept)} slot="min-accept" />
      <KpiRow label="거부된 가장 늦은" tone="text-[var(--launch-bad)]" value={usOrDash(stats.max_reject)} slot="max-reject" />
      <KpiRow label="다음 첫 조각" tone="text-[var(--primary)]" value={usOrDash(next)} slot="next" />
    </div>
  );
}

function KpiRow({ label, value, tone, slot }: { label: string; value: string; tone: string; slot: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12.5px] text-[var(--muted-fg)]">
      <span className="break-keep">{label}</span>
      <b data-kpi={slot} className={cn('ml-auto font-semibold whitespace-nowrap tabular-nums', tone)}>
        {value}
      </b>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 로딩
// ─────────────────────────────────────────────────────────────────────────────

function MapSkeleton() {
  return (
    <div data-slot="launch-loading" aria-busy="true" aria-label="불러오는 중" className="flex min-w-0 flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={KPI_FACE}>
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-[16px]" />
    </div>
  );
}
