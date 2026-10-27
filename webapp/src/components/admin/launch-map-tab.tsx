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
import { fetchLaunchMap, fetchLaunchPlan } from '@/lib/launch-api';
import { DASH, brokerMarketLabelOf, fmtUs } from '@/lib/launch-format';
import { launchRangeOf } from '@/lib/launch-map';
import { panelPlanOf, type LaunchPlanState, type PanelPlan } from '@/lib/launch-plan-view';
import { cn } from '@/lib/utils';

import { LaunchGateChart } from './launch-gate-chart';
import { LaunchFireSeg } from './launch-orders-tab';
import { LaunchPlanBar } from './launch-plan-bar';

/**
 * 경계 지도 탭 (Phase 35 · D-15 ~ D-18 · 채택 목업 `mockup-launch-gate-map.html` — 프리셋 칩 · 리본 켬 · 09:00:30 합패널).
 *
 * - `LaunchMapTab` = 받기 · 상태(주문 내역 탭과 같은 alive effect 꼴). `fire` 또는 `range` 가 바뀔 때만 요청 1건 —
 *   칩 하나 · 세그먼트 하나 = 요청 1건(server 가 발사 기준 × 범위를 RPC 1회로 거른다).
 * - `LaunchMapView` = 순수 렌더. 컨트롤 줄(프리셋 칩 · 실제 범위 글 · 발사 기준 세그먼트) → 범례 → 요약 카드 4장 →
 *   서버 × 시장 4패널(LAUNCH_ORDER 순 `LaunchGateChart`) → 푸터 한 줄.
 * - 범위는 프리셋 칩만이다(시작 · 끝 날짜 입력 없음 — D-15 · CONTEXT Deferred). 범위 글은 응답 days 기준(실제 덮은 날).
 * - 다음 발사 계획(범위 7 · D-24 · D-25): 탭 진입 때 `GET /api/admin/launch/plan` 을 지도 요청과 병렬로 **한 번** 부른다
 *   (발사 세그먼트 · 범위 칩을 바꿔도 다시 부르지 않는다). 서버 계획이 ok 면 조각마다 점선 + 패널 「다음 발사 계획」 줄,
 *   서버 실패 · 조회 실패면 최신 머리 값(`mapNextOffsetOf`) 하나로 대신 그린다. 404(배포 전 · D-35)면 계획 기능을 숨기고
 *   35-08 그대로 머리 값 점선만. 상수로 박지 않는다 — 머리가 없거나 값이 null 이면 「—」 · 점선 없음.
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
  const [plan, setPlan] = useState<LaunchPlanState>({ kind: 'loading' });

  // 계획은 탭 진입 1회 — fire · range 와 무관(D-25). 404 → absent(배포 전) · 그 밖 실패 → error(대신 값).
  useEffect(() => {
    let alive = true;
    fetchLaunchPlan().then(
      (r) => {
        if (alive) setPlan(r.kind === 'ready' ? { kind: 'ready', resp: r.resp } : { kind: 'absent' });
      },
      () => {
        if (alive) setPlan({ kind: 'error' });
      },
    );
    return () => {
      alive = false;
    };
  }, []);

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
      plan={plan}
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
  /** 발사 계획 조회 상태(D-25) — 기본 absent(계획 기능 숨김 · 35-08 그대로). */
  plan?: LaunchPlanState;
}

const PLAN_ABSENT: LaunchPlanState = { kind: 'absent' };

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
  plan: PanelPlan;
}

/**
 * 응답 → LAUNCH_ORDER 순 4패널. 조각은 (서버, 시장)과 발사 거래소로 거른다(응답이 이미 발사 기준으로 걸러져 온다).
 * 패널 계획(점선 · 줄 · 이력)은 `panelPlanOf` 한 벌.
 */
function panelsOf(resp: LaunchMapResponse, fire: LaunchFire, plan: LaunchPlanState): MapPanel[] {
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
      plan: panelPlanOf(plan, resp.heads, gateway, market, fire),
    };
  });
}

export function LaunchMapView({
  resp,
  fire,
  range,
  onFire,
  onRange,
  status = 'ready',
  onRetry,
  plan = PLAN_ABSENT,
}: LaunchMapViewProps) {
  const panels = useMemo(() => (resp === null ? [] : panelsOf(resp, fire, plan)), [resp, fire, plan]);
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
          <LaunchLegend fire={fire} sideless={sideless} planned={plan.kind === 'ready'} />
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
                planLines={p.plan.lines}
              >
                <LaunchPlanBar fire={fire} plan={p.plan} />
              </LaunchGateChart>
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

/** 점선 범례 — 서버 계획을 읽었으면(ready) 목업 문구(16:00 조각마다 점선 · 09:00:30 시각), 아니면 35-08 그대로. */
function nextLegendOf(fire: LaunchFire, planned: boolean): string {
  if (!planned) return '다음 발사의 첫 조각';
  return fire === 'q16' ? '다음 발사 계획(조각마다 점선)' : '다음 발사 계획(시각)';
}

function LaunchLegend({ fire, sideless, planned }: { fire: LaunchFire; sideless: boolean; planned: boolean }) {
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
        {nextLegendOf(fire, planned)}
      </LegendItem>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 요약 카드
// ─────────────────────────────────────────────────────────────────────────────

const usOrDash = (v: number | null): string => (v === null ? DASH : `${fmtUs(v)}µs`);

const KPI_FACE = cn(CARD, 'flex min-w-0 flex-col gap-1 px-3.5 py-3 ring-1 ring-[var(--border-subtle)] ring-inset dark:ring-0');

function LaunchKpiCard({ gateway, market, stats, plan }: MapPanel) {
  const next = plan.lines[0] ?? null;
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
