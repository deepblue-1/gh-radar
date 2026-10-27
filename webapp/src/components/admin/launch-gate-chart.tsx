'use client';

import { Fragment, useState, type ReactNode } from 'react';

import type { LaunchCalcPiece, LaunchDay, LaunchDayKind, LaunchFire, LaunchMarket } from '@gh-radar/shared';
import { launchPanelStatsOf } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { useChartWidth } from '@/hooks/use-chart-width';
import { DASH, brokerMarketLabelOf, fmtUs } from '@/lib/launch-format';
import {
  LAUNCH_CHART,
  diamondPathOf,
  launchAxisOf,
  launchDateLabelOf,
  launchGateBandOf,
  launchMarkOf,
  launchRibbonCellsOf,
  launchStackOf,
  launchHoverOf,
  launchTicksOf,
  launchTooltipOf,
  xOfUs,
  type LaunchBandKind,
  type LaunchOffAxis,
} from '@/lib/launch-map';
import { cn } from '@/lib/utils';

/**
 * 발사 경계 지도 패널 하나 — 서버 × 시장 (Phase 35 · D-16 ~ D-19 · 순수 SVG · 차트 라이브러리 없음).
 *
 * - 정본: 첨부 `launch-gate-map.html` drawPanel() 의 읽기 그대로(왼쪽이 이름 · 날짜 행 · 그날 경계 띠 · 다음 첫 조각 점선 ·
 *   「쐈다면」 리본 · 날짜별 표)를 gh-radar 토큰(`--launch-*` · `--primary`)으로 옮겼다. 기하는 `lib/launch-map.ts` 가 잠그고
 *   여기는 그리기만 한다.
 * - 폭: 래퍼 `div` 실측(`useChartWidth` · jsdom 0 → 640) · W = max(640, 실측) 를 viewBox 와 1:1(글자 11px 고정, D-18).
 *   폰 390 은 640 고정 + 래퍼 가로 스크롤 — 폰 폭에 맞춰 줄이지 않는다.
 * - 레이어(아래 → 위): 눈금 세로 격자 → 날짜 행 줄 · 왼쪽 「MM/DD」 → 경계 띠(+ 전부 거부 날 「경계는 이보다 뒤 →」) →
 *   점(같은 µs 는 세로 4px 대칭 쌓기 · 09:00:30 매도 = 마름모 · 각 점 `<title>`) → 「쐈다면」 리본(칸마다 접수 · 모름 · 거부
 *   세 겹) → 다음 발사 계획 점선(조각마다 1개 · 행과 리본을 지난다 · planLines 가 비면 없음) → x 눈금 글.
 * - 이상치(Pitfall 4): 축은 중앙값 ± 상한 안에서만 잡고, 밖의 점은 축 끝에 고정 + 옆에 「◂」/「▸」 · title 끝 「축 밖」.
 *   계획 값이 축 밖이면 그 값의 점선 대신 축 끝에 「▸ 다음 −245µs」 글(축 밖인 첫 값 하나만).
 * - `children` = 패널 머리 아래 슬롯(「다음 발사 계획」 줄 · D-24) — 날짜 없는 패널에도 그린다.
 * - 상호작용은 `<title>` 툴팁뿐(D-19) — 확대 · 끌기 · 마우스 상자 없음. 재전송은 첫 발 점 하나 · 횟수는 툴팁.
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
  /**
   * 다음 발사 계획 점선(µs · D-25) — 서버 계획이면 조각마다 하나 · 대신 값(최신 머리)이면 1개 · 없으면 빈 배열(점선 없음).
   */
  planLines: readonly number[];
  /** 패널 머리 아래 슬롯(「다음 발사 계획」 줄) — 날짜 없는 패널에도 렌더. */
  children?: ReactNode;
}

const { W_MIN, L, R, T, RH, RIBBON_H, GAP_R, TICK_H, DOT_R } = LAUNCH_CHART;

/** 마름모 꼭짓점 거리 — 원(r 4.5)과 눈으로 같은 크기. */
const DIAMOND_R = DOT_R + 1;

const TONE_FILL = { ok: 'var(--launch-ok)', bad: 'var(--launch-bad)', other: 'none' } as const;

const BAND_STYLE: Record<LaunchBandKind, { fill: string; stroke?: string; opacity?: number }> = {
  gate: { fill: 'var(--launch-gate-bg)', stroke: 'var(--launch-gate)' },
  reject_after: { fill: 'var(--launch-bad-bg)', opacity: 0.7 },
  accept_before: { fill: 'var(--launch-ok-bg)', opacity: 0.7 },
};

const TEXT = { fontSize: 11, fill: 'var(--muted-fg)' } as const;

/** 눈금 글 정렬 — 그림 오른쪽 끝 24px 안이면 'end'(오른쪽 여백 R 14px 로는 가운데 정렬 긴 글이 SVG 밖으로 잘린다). */
function tickAnchorOf(tx: number, right: number): 'middle' | 'end' {
  return tx > right - 24 ? 'end' : 'middle';
}
const OFF_GLYPH = { lo: '◂', hi: '▸' } as const;

export function LaunchGateChart({ gateway, market, fire, days, planLines, children }: LaunchGateChartProps) {
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
      {children}
      {days.length > 0 && (
        <>
          <LaunchGateSvg title={title} fire={fire} days={days} planLines={planLines} />
          <LaunchDayTable days={days} />
        </>
      )}
    </section>
  );
}

function LaunchGateSvg({
  title,
  fire,
  days,
  planLines,
}: {
  title: string;
  fire: LaunchFire;
  days: readonly LaunchDay<LaunchChartPiece>[];
  planLines: readonly number[];
}) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const [hover, setHover] = useState<HoverDot | null>(null);
  const W = Math.max(W_MIN, width);
  const left = L;
  const right = W - R;
  const rowsBottom = T + days.length * RH;
  const ry = rowsBottom + GAP_R;
  const H = ry + RIBBON_H + TICK_H;

  const axis = launchAxisOf(
    days.flatMap((d) => d.pieces.map((p) => p.sent_rel_us)),
    planLines[0] ?? null,
    fire,
  );
  const x = (v: number) => xOfUs(v, axis, left, right);
  const ticks = launchTicksOf(axis, right - left);
  const ribbon = launchRibbonCellsOf(days, axis, right - left);
  const onAxis = planLines.flatMap((v, i) => (axis.offAxis(v) === null ? [{ v, i }] : []));
  const offFirst = planLines.find((v) => axis.offAxis(v) !== null);
  const nextOff: LaunchOffAxis = offFirst === undefined ? null : axis.offAxis(offFirst);
  const single = planLines.length === 1;

  return (
    <div ref={ref} className="relative min-w-0 overflow-x-auto" onMouseLeave={() => setHover(null)}>
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
          const offSides = new Set(
            d.pieces.map((p) => axis.offAxis(p.sent_rel_us)).filter((s): s is 'lo' | 'hi' => s !== null),
          );
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
                const mark = launchMarkOf(p, fire);
                const cx = x(p.sent_rel_us);
                const py = cy + dys[j]!;
                const off = axis.offAxis(p.sent_rel_us) !== null;
                const tip = launchTooltipOf(d.date, p, fire, off);
                const show = () => setHover({ cx, cy: py, ...launchHoverOf(d.date, p, fire, off) });
                const hollow = mark.tone === 'other';
                const paint = hollow
                  ? { fill: 'none', stroke: 'var(--launch-other)', strokeWidth: 1.6 }
                  : { fill: TONE_FILL[mark.tone], stroke: 'var(--card)', strokeWidth: 1 };
                const dot = mark.shape === 'diamond' ? (
                  <path
                    data-shape="diamond"
                    data-tone={mark.tone}
                    d={diamondPathOf(cx, py, hollow ? DIAMOND_R - 0.7 : DIAMOND_R)}
                    {...paint}
                  >
                    <title>{tip}</title>
                  </path>
                ) : (
                  <circle
                    data-tone={mark.tone}
                    cx={cx}
                    cy={py}
                    r={hollow ? DOT_R - 0.7 : DOT_R}
                    {...paint}
                  >
                    <title>{tip}</title>
                  </circle>
                );
                // 점(r 4.5)은 맞추기 어렵고 속 빈 「기타」 점은 테두리만 잡혀서, 보이지 않는 넓은 감지 칸을 위에 둔다.
                return (
                  <Fragment key={j}>
                    {dot}
                    <rect
                      data-slot="launch-dot-hit"
                      x={cx - HIT}
                      y={py - HIT}
                      width={HIT * 2}
                      height={HIT * 2}
                      fill="transparent"
                      pointerEvents="all"
                      onMouseEnter={show}
                      onClick={show}
                    />
                  </Fragment>
                );
              })}
              {[...offSides].map((side) => (
                <text
                  key={side}
                  data-slot="launch-off-axis"
                  x={side === 'lo' ? left + 7 : right - 7}
                  y={cy + 3.5}
                  textAnchor={side === 'lo' ? 'start' : 'end'}
                  fontSize={10}
                  fill="var(--muted-fg)"
                >
                  {OFF_GLYPH[side]}
                </text>
              ))}
            </g>
          );
        })}

        {/* 「쐈다면」 리본 — 칸마다 위 접수 · 가운데 모름 · 아래 거부(날 수 비율) */}
        <text x={left} y={ry - 8} {...TEXT}>
          이 시각에 첫 조각을 쐈다면 — 접수 · 모름 · 거부 날 비율
        </text>
        <text x={L - 6} y={ry + RIBBON_H / 2 + 4} textAnchor="end" {...TEXT}>
          쐈다면
        </text>
        <g data-slot="launch-ribbon">
          {ribbon.cells.map((c) => {
            const x0 = x(c.v);
            const w = x(c.v + ribbon.stepR) - x0 + 0.4;
            const n = days.length;
            const hOk = (RIBBON_H * c.ok) / n;
            const hBad = (RIBBON_H * c.bad) / n;
            const hUnk = RIBBON_H - hOk - hBad;
            return (
              <Fragment key={c.v}>
                <rect x={x0} y={ry} width={w} height={hOk} fill="var(--launch-ok)" />
                <rect x={x0} y={ry + hOk} width={w} height={hUnk} fill="var(--launch-grid)" />
                <rect x={x0} y={ry + hOk + hUnk} width={w} height={hBad} fill="var(--launch-bad)" />
              </Fragment>
            );
          })}
        </g>
        <rect x={left} y={ry} width={right - left} height={RIBBON_H} fill="none" stroke="var(--border-subtle)" />

        {/* 다음 발사 계획 — 조각마다 축 안 = 점선(행 + 리본) · 축 밖 = 축 밖인 첫 값 하나만 끝에 글 */}
        {onAxis.map(({ v, i }) => {
          const nx = x(v);
          return (
            <path
              key={i}
              data-slot="launch-next"
              data-idx={i}
              d={`M${nx} ${T - 4} V${rowsBottom} M${nx} ${ry - 2} V${ry + RIBBON_H + 2}`}
              stroke="var(--primary)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="none"
            >
              <title>{single ? `다음 첫 조각 ${fmtUs(v)}µs` : `다음 발사 계획 ${i + 1}번 ${fmtUs(v)}µs`}</title>
            </path>
          );
        })}
        {nextOff !== null && offFirst !== undefined && (
          <text
            data-slot="launch-next-off"
            x={nextOff === 'lo' ? left : right}
            y={rowsBottom + 12}
            textAnchor={nextOff === 'lo' ? 'start' : 'end'}
            fontSize={11}
            fill="var(--primary)"
          >
            {`${OFF_GLYPH[nextOff]} 다음 ${fmtUs(offFirst)}µs`}
            <title>{`다음 첫 조각 ${fmtUs(offFirst)}µs · 축 밖`}</title>
          </text>
        )}

        {/* x 눈금 글 — 위 · 리본 아래. 오른쪽 여백(R)이 좁아 끝 눈금은 오른쪽 맞춤(「−20,136」 이 잘리지 않게). */}
        <g data-slot="launch-ticks">
          {ticks.values.map((v) => (
            <text key={`t${v}`} x={x(v)} y={T - 10} textAnchor={tickAnchorOf(x(v), right)} {...TEXT}>
              {fmtUs(v)}
            </text>
          ))}
          {ticks.values.map((v) => (
            <text key={`b${v}`} x={x(v)} y={ry + RIBBON_H + 16} textAnchor={tickAnchorOf(x(v), right)} {...TEXT}>
              {fmtUs(v)}
            </text>
          ))}
        </g>
      </svg>
      {hover && <LaunchDotTip hover={hover} left={left} right={right} />}
    </div>
  );
}

/** 감지 칸 반쪽 폭 — 점 사이 간격(세로 쌓기 4px)보다 넓어도 마지막에 그린 점이 이긴다. */
const HIT = 8;

interface HoverDot {
  cx: number;
  cy: number;
  value: string;
  detail: string;
}

/**
 * 점 위 즉시 툴팁 — svg 와 같은 px 좌표(viewBox = width)라 감싼 div 기준 절대 위치로 띄운다.
 * 첫 행 근처는 위가 잘리므로 점 아래로, 좌우 끝은 안쪽으로 붙인다.
 */
function LaunchDotTip({ hover, left, right }: { hover: HoverDot; left: number; right: number }) {
  const below = hover.cy < 48;
  const align = hover.cx < left + 70 ? 'start' : hover.cx > right - 70 ? 'end' : 'middle';
  const tx = align === 'start' ? '-12px' : align === 'end' ? 'calc(-100% + 12px)' : '-50%';
  const ty = below ? '12px' : 'calc(-100% - 10px)';
  return (
    <div
      data-slot="launch-dot-tip"
      role="tooltip"
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--popover)] px-2 py-1 text-[var(--popover-foreground)] shadow-md"
      style={{ left: hover.cx, top: hover.cy, transform: `translate(${tx}, ${ty})` }}
    >
      <div className="text-[13px] font-semibold tabular-nums">{hover.value}</div>
      <div className="text-[11px] text-[var(--muted-fg)]">{hover.detail}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 날짜별 표 — 접힘(첨부 · 목업 열 그대로)
// ─────────────────────────────────────────────────────────────────────────────

const KIND_PILL: Record<LaunchDayKind, { label: string; className: string }> = {
  gate: { label: '경계', className: 'bg-[var(--launch-gate-bg)] text-[var(--launch-gate)]' },
  all_accept: { label: '전부 접수', className: 'bg-[var(--launch-ok-bg)] text-[var(--launch-ok)]' },
  all_reject: { label: '전부 거부', className: 'bg-[var(--launch-bad-bg)] text-[var(--launch-bad)]' },
  unknown: { label: '판단 불가', className: 'bg-[var(--muted)] text-[var(--launch-other)]' },
};

const TH = 'bg-[var(--band)] px-2.5 py-2 text-left text-[11.5px] font-semibold text-[var(--muted-fg)]';
const TD = 'border-t border-[var(--border-subtle)] px-2.5 py-1.5';
const NUMERIC = 'text-right tabular-nums';

function gateRangeText(lo: number | null, hi: number | null): string {
  if (lo !== null && hi !== null) return `${fmtUs(lo)} ~ ${fmtUs(hi)}`;
  if (lo !== null) return `${fmtUs(lo)} 보다 뒤`;
  if (hi !== null) return `${fmtUs(hi)} 보다 앞`;
  return DASH;
}

function LaunchDayTable({ days }: { days: readonly LaunchDay<LaunchChartPiece>[] }) {
  return (
    <details className="min-w-0">
      <summary className="cursor-pointer text-[12.5px] font-semibold text-[var(--muted-fg)] select-none">
        날짜별 표 보기
      </summary>
      <div className="mt-2 min-w-0 overflow-x-auto">
        <table data-slot="launch-day-table" className="w-full min-w-max border-collapse text-[12.5px] whitespace-nowrap">
          <thead>
            <tr>
              <th className={TH}>날짜</th>
              <th className={cn(TH, 'text-right')}>첫 조각 µs</th>
              <th className={TH}>결과</th>
              <th className={cn(TH, 'text-right')}>처음 접수 µs</th>
              <th className={cn(TH, 'text-right')}>경계 µs</th>
              <th className={cn(TH, 'text-right')}>조각</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const pill = KIND_PILL[d.kind];
              return (
                <tr key={d.date}>
                  <td className={cn(TD, 'tabular-nums')}>{launchDateLabelOf(d.date)}</td>
                  <td className={cn(TD, NUMERIC)}>{fmtUs(d.first)}</td>
                  <td className={TD}>
                    <span
                      data-slot="launch-day-kind"
                      data-kind={d.kind}
                      className={cn('inline-flex h-5 items-center rounded-full px-[7px] text-[11.5px] font-bold', pill.className)}
                    >
                      {pill.label}
                    </span>
                  </td>
                  <td className={cn(TD, NUMERIC)}>{fmtUs(d.hi)}</td>
                  <td className={cn(TD, NUMERIC)}>{gateRangeText(d.lo, d.hi)}</td>
                  <td className={cn(TD, NUMERIC)}>{d.pieces.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
