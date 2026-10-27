'use client';

import type { LaunchCalcPiece, LaunchDay, LaunchFire, LaunchMarket } from '@gh-radar/shared';
import { launchPanelStatsOf } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { useChartWidth } from '@/hooks/use-chart-width';
import { brokerMarketLabelOf, fmtUs, resultToneOf } from '@/lib/launch-format';
import {
  LAUNCH_CHART,
  launchAxisOf,
  launchDateLabelOf,
  launchGateBandOf,
  launchStackOf,
  launchTicksOf,
  xOfUs,
  type LaunchBandKind,
} from '@/lib/launch-map';
import { cn } from '@/lib/utils';

/**
 * 발사 경계 지도 패널 하나 — 서버 × 시장 (Phase 35 · D-16 ~ D-19 · 순수 SVG · 차트 라이브러리 없음).
 *
 * - 정본: 첨부 `launch-gate-map.html` drawPanel() 의 읽기 그대로(왼쪽이 이름 · 날짜 행 · 그날 경계 띠 · 다음 첫 조각 점선)를
 *   gh-radar 토큰(`--launch-*` · `--primary`)으로 옮겼다. 기하는 `lib/launch-map.ts` 가 잠그고 여기는 그리기만 한다.
 * - 폭: 래퍼 `div` 실측(`useChartWidth` · jsdom 0 → 640) · W = max(640, 실측) 를 viewBox 와 1:1(글자 11px 고정, D-18).
 *   폰 390 은 640 고정 + 래퍼 가로 스크롤 — 폰 폭에 맞춰 줄이지 않는다.
 * - 레이어(아래 → 위): 눈금 세로 격자 → 날짜 행 줄 · 왼쪽 「MM/DD」 → 경계 띠(+ 전부 거부 날 「경계는 이보다 뒤 →」) →
 *   점(같은 µs 는 세로 4px 대칭 쌓기 · 각 점 `<title>`) → 다음 첫 조각 점선(next null 이면 없음) → x 눈금 글.
 * - 상호작용은 `<title>` 툴팁뿐(D-19) — 확대 · 끌기 · 마우스 상자 없음.
 * - 패널 머리 집계는 shared `launchPanelStatsOf` 한 벌(백필 머리 계산과 같은 규칙 · 판단 불가 날은 세지 않는다).
 */

/** 지도 점이 읽는 조각 모양 — shared `LaunchMapPiece` 가 만족한다. */
export type LaunchChartPiece = LaunchCalcPiece & { side: string | null; retry: number | null };

export interface LaunchGateChartProps {
  gateway: string;
  market: LaunchMarket | string;
  fire: LaunchFire;
  /** 이 패널 조각의 `launchDaysOf` 결과(날짜 오름차순). */
  days: readonly LaunchDay<LaunchChartPiece>[];
  /** 다음 발사 첫 조각(µs) — 없으면 null(점선 없음). */
  next: number | null;
}

const { W_MIN, L, R, T, RH, RIBBON_H, GAP_R, TICK_H, DOT_R } = LAUNCH_CHART;

const TONE_FILL = { ok: 'var(--launch-ok)', bad: 'var(--launch-bad)' } as const;

const BAND_STYLE: Record<LaunchBandKind, { fill: string; stroke?: string; opacity?: number }> = {
  gate: { fill: 'var(--launch-gate-bg)', stroke: 'var(--launch-gate)' },
  reject_after: { fill: 'var(--launch-bad-bg)', opacity: 0.7 },
  accept_before: { fill: 'var(--launch-ok-bg)', opacity: 0.7 },
};

const TEXT = { fontSize: 11, fill: 'var(--muted-fg)' } as const;

export function LaunchGateChart({ gateway, market, fire, days, next }: LaunchGateChartProps) {
  const title = brokerMarketLabelOf(gateway, market);
  const stats = launchPanelStatsOf(days);

  return (
    <section
      data-slot="launch-panel"
      data-gateway={gateway}
      data-market={market}
      className={cn(CARD, 'flex min-w-0 flex-col gap-2 px-3.5 py-3 ring-1 ring-[var(--border-subtle)] ring-inset dark:ring-0')}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-[14px] font-bold text-[var(--fg)]">{title}</h3>
        <span data-slot="launch-panel-stats" className="text-[12px] break-keep text-[var(--muted-fg)]">
          {days.length === 0
            ? '이 범위에 발사 없음'
            : `경계 잡힌 날 ${stats.n_gate} · 전부 접수 ${stats.n_all_accept} · 전부 거부 ${stats.n_all_reject}`}
        </span>
      </div>
      {days.length > 0 && <LaunchGateSvg title={title} fire={fire} days={days} next={next} />}
    </section>
  );
}

function LaunchGateSvg({
  title,
  fire,
  days,
  next,
}: {
  title: string;
  fire: LaunchFire;
  days: readonly LaunchDay<LaunchChartPiece>[];
  next: number | null;
}) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const W = Math.max(W_MIN, width);
  const left = L;
  const right = W - R;
  const rowsBottom = T + days.length * RH;
  const ry = rowsBottom + GAP_R;
  const H = ry + RIBBON_H + TICK_H;

  const axis = launchAxisOf(
    days.flatMap((d) => d.pieces.map((p) => p.sent_rel_us)),
    next,
    fire,
  );
  const x = (v: number) => xOfUs(v, axis, left, right);
  const ticks = launchTicksOf(axis, right - left);
  const nextX = next !== null && axis.offAxis(next) === null ? x(next) : null;

  return (
    <div ref={ref} className="min-w-0 overflow-x-auto">
      <svg
        data-slot="launch-chart"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={`${title} 발사 경계 지도`}
        className="block"
      >
        {/* 눈금 세로 격자 */}
        <g data-slot="launch-grid">
          {ticks.values.map((v) => (
            <line key={v} x1={x(v)} x2={x(v)} y1={T - 6} y2={rowsBottom} stroke="var(--launch-grid)" strokeWidth={1} />
          ))}
        </g>

        {days.map((d, i) => {
          const cy = T + i * RH + RH / 2;
          const band = launchGateBandOf(d, axis, left, right);
          const dys = launchStackOf(d.pieces);
          return (
            <g key={d.date} data-slot="launch-day" data-date={d.date}>
              <text x={L - 6} y={cy + 4} textAnchor="end" {...TEXT}>
                {launchDateLabelOf(d.date)}
              </text>
              <line x1={left} x2={right} y1={cy} y2={cy} stroke="var(--launch-grid)" strokeWidth={1} />
              {band && (
                <rect
                  data-band={band.kind}
                  x={band.x0}
                  y={cy - 9}
                  width={Math.max(band.x1 - band.x0, 0)}
                  height={18}
                  rx={3}
                  fill={BAND_STYLE[band.kind].fill}
                  stroke={BAND_STYLE[band.kind].stroke}
                  strokeWidth={BAND_STYLE[band.kind].stroke ? 1 : undefined}
                  opacity={BAND_STYLE[band.kind].opacity}
                />
              )}
              {band?.kind === 'reject_after' && (
                <text x={right - 4} y={cy + 4} textAnchor="end" fontSize={11} fill="var(--launch-bad)">
                  경계는 이보다 뒤 →
                </text>
              )}
              {d.pieces.map((p, j) => {
                const tone = resultToneOf(p.result);
                const cx = x(p.sent_rel_us);
                const py = cy + dys[j]!;
                const tip = `${launchDateLabelOf(d.date)} ${fmtUs(p.sent_rel_us)}µs · wire ${p.wire} · ${p.result}`;
                return tone === 'other' ? (
                  <circle
                    key={p.wire}
                    data-tone={tone}
                    cx={cx}
                    cy={py}
                    r={DOT_R - 0.7}
                    fill="none"
                    stroke="var(--launch-other)"
                    strokeWidth={1.6}
                  >
                    <title>{tip}</title>
                  </circle>
                ) : (
                  <circle
                    key={p.wire}
                    data-tone={tone}
                    cx={cx}
                    cy={py}
                    r={DOT_R}
                    fill={TONE_FILL[tone]}
                    stroke="var(--card)"
                    strokeWidth={1}
                  >
                    <title>{tip}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}

        {/* 다음 첫 조각 점선 */}
        {nextX !== null && (
          <path
            data-slot="launch-next"
            d={`M${nextX} ${T - 4} V${rowsBottom}`}
            stroke="var(--primary)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            fill="none"
          >
            <title>{`다음 첫 조각 ${fmtUs(next)}µs`}</title>
          </path>
        )}

        {/* x 눈금 글 — 위 · 아래 */}
        <g data-slot="launch-ticks">
          {ticks.values.map((v) => (
            <text key={`t${v}`} x={x(v)} y={T - 10} textAnchor="middle" {...TEXT}>
              {fmtUs(v)}
            </text>
          ))}
          {ticks.values.map((v) => (
            <text key={`b${v}`} x={x(v)} y={ry + RIBBON_H + 16} textAnchor="middle" {...TEXT}>
              {fmtUs(v)}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
