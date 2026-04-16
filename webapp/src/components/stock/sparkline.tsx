/**
 * Sparkline — Phase 06.2 Plan 05 Task 1.
 *
 * 등락률 부호 방향(up/down/flat)에 따라 고정된 3종 SVG path 중 1종을 렌더한다.
 * UI-SPEC §4.3 / RESEARCH §Pattern 12 (v1 3 프리셋 전략 — intraday 실 데이터
 * 연결은 후속 Phase).
 *
 * 계약:
 * - 60×24 고정 크기, `viewBox="0 0 60 24"`
 * - `stroke-width` 1.4, `stroke-linecap` round, fill none
 * - 색상: `var(--up)` / `var(--down)` / `var(--flat)` (Scanner / Watchlist 공용 토큰)
 * - 장식용 요소로 `aria-hidden="true"` — 방향 정보는 인접한 등락률 텍스트에서 읽힘
 */

export type SparklineDirection = 'up' | 'down' | 'flat';

const PATHS: Record<SparklineDirection, string> = {
  up: 'M0 20 C 15 18, 25 14, 35 12 S 50 6, 60 4',
  down: 'M0 4 C 15 6, 25 10, 35 12 S 50 18, 60 20',
  flat: 'M0 12 C 15 13, 25 11, 35 12 S 50 13, 60 12',
};

const COLORS: Record<SparklineDirection, string> = {
  up: 'var(--up)',
  down: 'var(--down)',
  flat: 'var(--flat)',
};

export interface SparklineProps {
  direction: SparklineDirection;
}

export function Sparkline({ direction }: SparklineProps) {
  return (
    <svg
      width={60}
      height={24}
      viewBox="0 0 60 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d={PATHS[direction]}
        stroke={COLORS[direction]}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
