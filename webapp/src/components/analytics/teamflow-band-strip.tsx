import { stripBarsOf } from '@/lib/teamflow-chart';
import { BAND_SLOTS, fmtEok, type TeamflowTone } from '@/lib/teamflow-report';

/**
 * 행 안 구간별 팀 순매수 미니막대 9칸 (Phase 33 · UI-SPEC T4 · D-11) — 순수 SVG · 라이브러리 없음.
 *
 * - `viewBox="0 0 178 28"` + `preserveAspectRatio="none"` 로 칸 폭(xl 열 · 폰 전폭)에 맞춰 늘고 준다. 선은
 *   `vector-effect: non-scaling-stroke` 라 늘어나도 1px. 높이 28 고정 — 극단값도 막대 최대 12(`stripBarsOf`).
 * - 0선(y 14) `--border-subtle` · 20% 점선 = 5번째 칸 앞 x 99 `--muted-fg` `2 2`.
 * - 칸 위치 고정(9칸 · `bandSlotsOf`) — 없는 구간은 1px 빈 선. 색 = 부호(반올림 0 은 `--faint`).
 * - `aria-hidden` — 값은 행 sr 설명(`rowDescriptionOf`)이 말한다. 칸 `<title>` 은 마우스 툴팁뿐.
 */

const FILL: Record<TeamflowTone, string> = {
  up: 'var(--up)',
  down: 'var(--down)',
  flat: 'var(--faint)',
};

export function TeamflowBandStrip({ slots }: { slots: readonly (number | null)[] }) {
  const bars = stripBarsOf(slots);
  return (
    <svg
      viewBox="0 0 178 28"
      preserveAspectRatio="none"
      className="block h-7 w-full"
      aria-hidden="true"
      focusable="false"
      data-slot="teamflow-strip"
    >
      <line x1={0} x2={178} y1={14} y2={14} stroke="var(--border-subtle)" vectorEffect="non-scaling-stroke" />
      <line
        x1={99}
        x2={99}
        y1={1}
        y2={27}
        stroke="var(--muted-fg)"
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />
      {bars.map((b, i) => {
        const label = BAND_SLOTS[i] ?? '';
        return (
          <g key={label || i}>
            <title>
              {b.empty ? `${label} · 체결 없음` : `${label} · 팀 순매수 ${fmtEok(slots[i], { signed: true })}`}
            </title>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={b.empty ? 0 : 1.5}
              fill={b.empty ? 'var(--border-subtle)' : FILL[b.tone]}
            />
          </g>
        );
      })}
    </svg>
  );
}
