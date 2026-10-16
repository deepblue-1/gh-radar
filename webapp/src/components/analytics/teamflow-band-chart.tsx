'use client';

import type { TeamflowBand } from '@gh-radar/shared';

import { useChartWidth } from '@/hooks/use-chart-width';
import { BAND_BAR_H, BAND_LABEL_W, BAND_ROW_H, BAND_VALUE_W, bandChartOf } from '@/lib/teamflow-chart';
import { fmtEok, fmtQty, fmtShare, isHotShare, type TeamflowTone } from '@/lib/teamflow-report';

/**
 * 등락 구간별 팀 순매수 — 구간 가로 막대 (Phase 33 · UI-SPEC T6 · D-12) — 순수 SVG · 차트 라이브러리 없음.
 *
 * - 래퍼 폭을 `useChartWidth` 로 재고(측정 전 · jsdom = 640) `viewBox="0 0 {W} {H}"` 를 그 폭과 **1:1** 로 둔다 —
 *   `<text>` 가 늘어나지 않아 폰에서도 11px. 높이 H = 24 + 행 수 × 28 고정(측정이 바뀌어도 세로 점프 없음).
 * - 행 = 「하루 합계」 를 뺀 bands(export 순서). 중앙 0선 · 「20~25%」 행 위 20% 점선(첫 행이면 없음) ·
 *   오른쪽 순매수 값 · 맨 오른쪽 매수 중 팀 %(≥30% `--team` 600 · 0% `--faint`) · 각주 「매수 중 팀」.
 * - 행마다 `<g>` = 전체 폭 투명 히트 rect + `<title>` 툴팁 · hover 시 막대 `opacity .75`.
 * - 색은 CSS 변수(+ `--up` · − `--down` · 반올림 0 `--faint`). 기하는 `bandChartOf`(골든이 잠근다).
 * - 행이 없으면(「하루 합계」 뿐) 차트 자리에 「구간 체결이 없어요」 — 표 토글은 부모가 그대로 둔다.
 */

const SUBHEAD = 'm-0 text-[length:var(--t-sm)] font-semibold text-[var(--fg)]';
const CAPTION = 'text-[length:var(--t-caption)] text-[var(--muted-fg)]';

const FILL: Record<TeamflowTone, string> = {
  up: 'var(--up)',
  down: 'var(--down)',
  flat: 'var(--faint)',
};

/** 글자 기준선 — 행 위끝에서 18(11px 글자를 행 28 가운데에). */
const TEXT_DY = 18;

function shareFill(share: number | null): { fill: string; weight: number } {
  if (isHotShare(share)) return { fill: 'var(--team)', weight: 600 };
  if (share === null || Math.round(share * 100) === 0) return { fill: 'var(--faint)', weight: 400 };
  return { fill: 'var(--muted-fg)', weight: 400 };
}

export function TeamflowBandChart({
  name,
  bands,
  below20,
  above20,
}: {
  name: string;
  bands: readonly TeamflowBand[];
  below20: number | null;
  above20: number | null;
}) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const g = bandChartOf(bands, width);
  const { W, H, cx, y20, rows } = g;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h3 className={SUBHEAD}>등락 구간별 팀 순매수</h3>
        <span className={CAPTION}>막대 = 팀 순매수 · 오른쪽 % = 매수 중 팀</span>
      </div>
      <div ref={ref}>
        {rows.length === 0 ? (
          <p className="m-0 text-[length:var(--t-caption)] text-[var(--faint)]">구간 체결이 없어요</p>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            role="img"
            aria-label={`${name} 등락 구간별 팀 순매수 — 20% 아래 ${fmtEok(below20, { signed: true })} · 20%~상한 ${fmtEok(above20, { signed: true })}`}
            data-slot="teamflow-band-chart"
            className="block"
            fontSize={11}
          >
            <line x1={cx} x2={cx} y1={rows[0]!.y} y2={rows.at(-1)!.y + BAND_ROW_H} stroke="var(--border-subtle)" />
            {rows.map((r) => {
              const sh = shareFill(r.share);
              return (
                <g key={r.label} className="group">
                  <title>
                    {`${r.label} · 팀 순매수 ${fmtEok(r.net, { signed: true })} · 매수 중 팀 ${fmtShare(r.share)} · 거래량 ${fmtQty(r.vol)}주`}
                  </title>
                  <rect x={0} y={r.y} width={W} height={BAND_ROW_H} fill="transparent" />
                  <text
                    x={BAND_LABEL_W - 8}
                    y={r.y + TEXT_DY}
                    textAnchor="end"
                    fill={r.isLimit ? 'var(--fg)' : 'var(--fg-2)'}
                    fontWeight={r.isLimit ? 600 : 400}
                  >
                    {r.label}
                  </text>
                  {r.barW > 0 && (
                    <rect
                      x={r.barX}
                      y={r.barY}
                      width={r.barW}
                      height={BAND_BAR_H}
                      rx={3}
                      fill={FILL[r.tone]}
                      className="transition-opacity group-hover:opacity-75"
                    />
                  )}
                  <text
                    x={W - BAND_VALUE_W + 8}
                    y={r.y + TEXT_DY}
                    fill={FILL[r.tone]}
                    fontWeight={600}
                    className="tabular-nums"
                  >
                    {fmtEok(r.net, { signed: true })}
                  </text>
                  <text
                    x={W - 4}
                    y={r.y + TEXT_DY}
                    textAnchor="end"
                    fill={sh.fill}
                    fontWeight={sh.weight}
                    className="tabular-nums"
                  >
                    {fmtShare(r.share)}
                  </text>
                </g>
              );
            })}
            {y20 !== null && (
              <g aria-hidden="true" pointerEvents="none">
                <line
                  x1={BAND_LABEL_W - 4}
                  x2={W - 4}
                  y1={y20}
                  y2={y20}
                  stroke="var(--muted-fg)"
                  strokeDasharray="3 3"
                />
                <text x={cx + 4} y={y20 - 3} fill="var(--muted-fg)">
                  20%
                </text>
              </g>
            )}
            <text x={W - 4} y={H - 4} textAnchor="end" fill="var(--muted-fg)">
              매수 중 팀
            </text>
          </svg>
        )}
      </div>
    </div>
  );
}
