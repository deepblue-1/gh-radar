import type { LimitupGridSummaryRow, LimitupLockRow } from '@gh-radar/shared';

import {
  SPARK_BASELINE_KRW,
  sparkPathOf,
  sparkPctOf,
  sparkWidthOf,
  sparkXOf,
  sparkYMaxOf,
  sparkYOf,
} from '@/lib/limitup-report';

/**
 * 하루 격자 행 스파크라인 — 상한가 매수잔량 금액 09:00~15:30 (UI-SPEC ④-3 · D-12 중립색 · inline SVG · 라이브러리 없음).
 *
 * - x = 09:00~15:30 공통 축(grid_summary `sec0` · `step_s` — 모든 행이 같은 viewBox 폭) · y = 0 ~ max(행 최대, 20억).
 * - 그리는 순서: 잠김 구간 음영(`--muted`) → 기준선 10억 점선(`--led-latent`) → 잔량 곡선(`--fg` 1.5px non-scaling).
 *   곡선에 `--up`/`--down` 을 쓰지 않는다(관례색은 깨짐 ● · 결과 태그에만) · 초록 상태 토큰 0 · 새 토큰 0.
 * - 깨짐 ●(`--up` · 6px — EX-2)은 SVG 밖 HTML 오버레이다 — `preserveAspectRatio="none"` 이 원을 타원으로 늘리지 않게.
 * - SVG 안에 글자 요소를 두지 않는다(R-9). 값은 행 글자에 있으므로 `aria-hidden`.
 * - grid_summary 가 없는 행 = 슬롯 안 11px `--faint` 「곡선 없음」(E7 error · 표 값은 그대로) · 점이 0개면 바닥선만(E7 loading).
 */
export function LimitupSparkline({
  summary,
  locks,
}: {
  summary: LimitupGridSummaryRow | null;
  locks: readonly LimitupLockRow[];
}) {
  if (summary === null) {
    return (
      <div data-slot="limitup-spark" data-state="none" className="flex h-8 w-full items-center">
        <span className="text-[11px] text-[var(--faint)]">곡선 없음</span>
      </div>
    );
  }

  const yMax = sparkYMaxOf(summary);
  const path = sparkPathOf(summary, yMax);
  if (path === '') {
    return (
      <div
        data-slot="limitup-spark"
        data-state="empty"
        aria-hidden="true"
        className="h-8 w-full border-b border-[var(--border-subtle)]"
      />
    );
  }

  const width = sparkWidthOf(summary.step_s);
  const baseY = sparkYOf(SPARK_BASELINE_KRW, yMax);
  const shades = locks
    .filter((l) => l.start_ms != null)
    .map((l) => {
      const x0 = sparkXOf(l.start_ms!, summary.step_s);
      // 장 끝까지 잠김(end_ms null) = 15:30 까지.
      const x1 = l.end_ms != null ? sparkXOf(l.end_ms, summary.step_s) : width;
      return { id: l.lock_id, x: x0, w: Math.max(x1 - x0, 1) };
    });
  const breaks = locks.filter((l) => l.broke === true && l.end_ms != null).map((l) => ({
    id: l.lock_id,
    pct: sparkPctOf(l.end_ms!),
  }));

  return (
    <div data-slot="limitup-spark" data-state="ready" className="relative h-8 w-full">
      <svg
        viewBox={`0 0 ${width} 100`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        className="block h-full w-full overflow-visible"
      >
        {shades.map((s) => (
          <rect key={s.id} x={s.x} y={0} width={s.w} height={100} fill="var(--muted)" />
        ))}
        <line
          x1={0}
          x2={width}
          y1={baseY}
          y2={baseY}
          stroke="var(--led-latent)"
          strokeWidth={1}
          strokeDasharray="2 4"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--fg)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {breaks.map((b) => (
        <span
          key={b.id}
          data-slot="limitup-spark-break"
          aria-hidden="true"
          style={{ left: `${b.pct}%` }}
          className="absolute bottom-0 size-1.5 -translate-x-1/2 rounded-full bg-[var(--up)]"
        />
      ))}
    </div>
  );
}
