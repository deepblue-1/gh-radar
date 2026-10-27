'use client';

import type { LaunchFire } from '@gh-radar/shared';

import { planLineText, type PanelPlan } from '@/lib/launch-plan-view';

/**
 * 「다음 발사 계획」 줄 — 경계 지도 패널 머리 아래(Phase 35 범위 7 · D-24 · 채택 목업 `mockup-launch-plan-place.html` 자리 B
 * `.pstrip`). source absent(배포 전 404 · D-35)면 아무것도 그리지 않는다.
 *
 * 글자 12.5px · 라벨 `--muted-fg` · 값 `--primary` 700(목업 `.pstrip b` — 점선과 같은 색) · tabular-nums · flex-wrap
 * (폰 390 에서 줄바꿈).
 */

export interface LaunchPlanBarProps {
  fire: LaunchFire;
  plan: PanelPlan;
}

export function LaunchPlanBar({ fire, plan }: LaunchPlanBarProps) {
  if (plan.source === 'absent') return null;
  return (
    <div
      data-slot="launch-plan-bar"
      data-source={plan.source}
      className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-[var(--muted-fg)]"
    >
      <span className="whitespace-nowrap">다음 발사 계획</span>
      {plan.source === 'server' && plan.entry !== null && (
        <b data-slot="launch-plan-line" className="font-bold break-keep text-[var(--primary)] tabular-nums">
          {planLineText(plan.entry, fire)}
        </b>
      )}
    </div>
  );
}
