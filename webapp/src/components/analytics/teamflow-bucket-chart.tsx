'use client';

import type { TeamflowBucket, TeamflowWindow } from '@gh-radar/shared';

import { useChartWidth } from '@/hooks/use-chart-width';
import {
  BUCKET_GAP,
  BUCKET_H1,
  BUCKET_H2,
  BUCKET_L,
  BUCKET_R,
  BUCKET_T,
  bucketChartOf,
  type BucketBar,
  type BucketRate,
} from '@/lib/teamflow-chart';
import {
  bucketSlotsOf,
  fmtEok,
  fmtQty,
  fmtRangePct,
  fmtShare,
  kstHm,
  type TeamflowTone,
} from '@/lib/teamflow-report';

/**
 * 10분 단위 흐름 차트 (Phase 33 · UI-SPEC T8 · D-12 · D-13) — 순수 SVG · 차트 라이브러리 없음(스케치 015 bucketChart 이식).
 *
 * - 가로축 = 09:00~15:30 **고정 39칸**(`bucketSlotsOf` — key 54 … 92 · key 93 종가 단일가는 슬롯 38 에 합산 · 그 밖 key 버림).
 *   빈 버킷은 빈 칸(0선만) — 종목이 달라도 같은 자리에 같은 시각이 오고 잠김 · VI 공백이 빈자리로 보인다.
 * - 래퍼 폭을 `useChartWidth` 로 재고(측정 전 · jsdom = 640) `viewBox="0 0 {W} 228"` 를 그 폭과 **1:1** — 폰에서도 글자 11px.
 * - 레이어: 최대 매집 창 음영(`--team-bg` · 맨 아래) → 0선 → 20% 점선 → 칸마다 `<g>`(투명 히트 rect + `<title>` + 막대 + 등락률 띠)
 *   → 매수 중 팀 비중 선(`--team` 2px · 빈 칸 · null 에서 끊김 · 한 점 구간은 r 1.5 점) → 첫 상한가 세로선 + 라벨 → 축 글자.
 * - 팀 체결이 거의 없는 종목도 0선 · 축 · 띠 · 눈금이 그대로라 차트가 깨지지 않는다(별도 안내 없음).
 *   buckets 가 비면 축 · 0선 + 판 가운데 「10분 체결 기록이 없어요」.
 * - 범례 견본은 `<span>` — 상세 section 안 `<i>` 0 개 단언(33-01 RTL (j))을 지킨다.
 */

const SUBHEAD = 'm-0 text-[length:var(--t-sm)] font-semibold text-[var(--fg)]';
const CAPTION = 'text-[length:var(--t-caption)] text-[var(--muted-fg)]';
const SWATCH = 'inline-block size-2.5 rounded-[2px]';
const LINE_SWATCH = 'inline-block h-0.5 w-2.5 rounded-full';

const FILL: Record<TeamflowTone, string> = {
  up: 'var(--up)',
  down: 'var(--down)',
  flat: 'var(--faint)',
};

/** 두 판 위끝 · 아래끝(눈금 줄 제외). */
const PLOT_TOP = BUCKET_T;
const PLOT_BOTTOM = BUCKET_T + BUCKET_H1 + BUCKET_GAP + BUCKET_H2;

type Win = Pick<TeamflowWindow, 'start' | 'end' | 'net_val'>;

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className={swatch} />
      {label}
    </span>
  );
}

export function TeamflowBucketChart({
  name,
  buckets,
  window,
  firstLimitMs,
}: {
  name: string;
  buckets: readonly TeamflowBucket[];
  window: Win | null;
  firstLimitMs: number | null;
}) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const g = bucketChartOf(bucketSlotsOf(buckets), window, firstLimitMs, width);
  const { W, H, zero, y20, yTop, shade, firstLimit } = g;
  const right = W - BUCKET_R;

  const barOf = new Map<number, BucketBar>(g.bars.map((b) => [b.i, b]));
  const rateOf = new Map<number, BucketRate>(g.rates.map((r) => [r.i, r]));

  const limitHm = typeof firstLimitMs === 'number' && Number.isFinite(firstLimitMs) ? kstHm(firstLimitMs) : null;
  const ariaLabel = `${name} 10분 흐름 — ${
    window ? `최대 매집 ${window.start}~${window.end} ${fmtEok(window.net_val, { signed: true })}` : '최대 매집 창 없음'
  }${limitHm ? ` · 첫 상한가 ${limitHm}` : ''}`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h3 className={SUBHEAD}>10분 단위 흐름</h3>
        <span className={CAPTION}>
          {`09:00~15:30${
            window
              ? ` · 보라 음영 = 팀 순매수가 가장 크게 이어진 ${window.start}~${window.end} (${fmtEok(window.net_val, { signed: true })})`
              : ''
          }`}
        </span>
      </div>
      <div ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          aria-label={ariaLabel}
          data-slot="teamflow-bucket-chart"
          className="block"
          fontSize={11}
        >
          {shade && (
            <rect
              x={shade.x}
              y={PLOT_TOP}
              width={shade.w}
              height={PLOT_BOTTOM - PLOT_TOP}
              rx={4}
              fill="var(--team-bg)"
              aria-hidden="true"
            />
          )}
          <line x1={BUCKET_L} x2={right} y1={zero} y2={zero} stroke="var(--border-subtle)" />
          <line
            x1={BUCKET_L}
            x2={right}
            y1={y20}
            y2={y20}
            stroke="var(--muted-fg)"
            strokeDasharray="3 3"
            aria-hidden="true"
          />

          {g.hits.map(({ i, x, w, bucket }) => {
            const bar = barOf.get(i);
            const rate = rateOf.get(i);
            return (
              <g key={i} className="group">
                <title>
                  {`${bucket.start} · 등락 ${fmtRangePct(bucket.lo, bucket.hi)} · 팀 순매수 ${fmtEok(bucket.net_val, { signed: true })} · 매수 중 팀 ${fmtShare(bucket.share)} · 거래량 ${fmtQty(bucket.vol)}주`}
                </title>
                <rect x={x} y={PLOT_TOP} width={w} height={PLOT_BOTTOM - PLOT_TOP} fill="transparent" />
                {bar && (
                  <rect
                    x={bar.x}
                    y={bar.y}
                    width={bar.w}
                    height={bar.h}
                    rx={1.5}
                    fill={FILL[bar.tone]}
                    className="transition-opacity group-hover:opacity-75"
                  />
                )}
                {rate && <rect x={rate.x} y={rate.y} width={rate.w} height={rate.h} rx={1} fill="var(--faint)" />}
              </g>
            );
          })}

          <g aria-hidden="true" pointerEvents="none">
            {g.shareSegments.map((seg, k) =>
              seg.length === 1 ? (
                <circle key={k} cx={seg[0]!.x} cy={seg[0]!.y} r={1.5} fill="var(--team)" />
              ) : (
                <path
                  key={k}
                  d={seg.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join('')}
                  fill="none"
                  stroke="var(--team)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              ),
            )}

            {firstLimit && (
              <>
                <line
                  x1={firstLimit.x}
                  x2={firstLimit.x}
                  y1={PLOT_TOP}
                  y2={PLOT_BOTTOM}
                  stroke="var(--up)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                <text
                  x={firstLimit.anchor === 'start' ? firstLimit.x + 4 : firstLimit.x - 4}
                  y={PLOT_TOP + 10}
                  textAnchor={firstLimit.anchor}
                  fill="var(--up)"
                  fontWeight={600}
                >
                  {firstLimit.label}
                </text>
              </>
            )}

            <g fill="var(--muted-fg)" className="tabular-nums">
              <text x={BUCKET_L - 6} y={PLOT_TOP + 10} textAnchor="end">
                {`+${fmtEok(g.mx)}`}
              </text>
              <text x={BUCKET_L - 6} y={zero + 4} textAnchor="end">
                0
              </text>
              <text x={BUCKET_L - 6} y={y20 + 4} textAnchor="end">
                20%
              </text>
              <text x={BUCKET_L - 6} y={yTop + 8} textAnchor="end">
                {`${Math.round(g.rhi)}%`}
              </text>
            </g>
            <g fill="var(--team)" className="tabular-nums">
              <text x={right + 6} y={PLOT_TOP + 10}>
                60%
              </text>
              <text x={right + 6} y={PLOT_TOP + BUCKET_H1}>
                0%
              </text>
            </g>
            <g fill="var(--muted-fg)">
              {g.ticks.map((t) => (
                <text key={t.label} x={t.x} y={H - 4} textAnchor="middle">
                  {t.label}
                </text>
              ))}
            </g>

            {g.empty && (
              <text
                x={(BUCKET_L + right) / 2}
                y={PLOT_TOP + BUCKET_H1 / 2 + 4}
                textAnchor="middle"
                fill="var(--faint)"
              >
                10분 체결 기록이 없어요
              </text>
            )}
          </g>
        </svg>
      </div>
      <div
        data-slot="teamflow-bucket-legend"
        className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--t-caption)] text-[var(--muted-fg)]"
      >
        <LegendItem swatch={`${SWATCH} bg-[var(--up)]`} label="팀 순매수 +" />
        <LegendItem swatch={`${SWATCH} bg-[var(--down)]`} label="팀 순매수 −" />
        <LegendItem swatch={`${LINE_SWATCH} bg-[var(--team)]`} label="매수 중 팀 %" />
        <LegendItem swatch={`${SWATCH} bg-[var(--faint)]`} label="등락률 범위" />
        {window && <LegendItem swatch={`${SWATCH} bg-[var(--team-bg)]`} label="최대 매집 창" />}
        {limitHm && <LegendItem swatch={`${LINE_SWATCH} bg-[var(--up)]`} label="첫 상한가" />}
      </div>
    </div>
  );
}
