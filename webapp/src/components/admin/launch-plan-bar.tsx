'use client';

import type { ReactNode } from 'react';

import type { LaunchFire } from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LAUNCH_PLAN_G2_UNKNOWN,
  fallbackLineText,
  lastChangeText,
  planLineText,
  type PanelPlan,
} from '@/lib/launch-plan-view';
import { fmtUs } from '@/lib/launch-format';

import { CombinedMark } from './launch-tail-probe-bar';
import { ADMIN_BUTTON_SECONDARY } from './reflect-chip';

/**
 * 「다음 발사 계획」 줄 — 경계 지도 패널 머리 아래(Phase 35 범위 7 · D-24 · D-25 · D-29 · 채택 목업
 * `mockup-launch-plan-place.html` 자리 B `.pstrip`).
 *
 * - source absent(배포 전 404 · D-35) → 아무것도 그리지 않는다.
 * - server → 계획 값(목업 `.pstrip b` — `--primary` 700 · 점선과 같은 색) + 마지막 성공 변경 「· 22:41 · 이메일」.
 * - fallback → 「서버 연결 안 됨 · 마지막 발사 값 −337µs」(`data-tone="warn"` · `--led-latent` 글자).
 * - unsupported(08:30 전용 · quick-261125-c2i) → 「이 서버는 08:30 발사를 모름」(fallback 줄과 같은 글자 꼴) · 「계획 고치기」 비활성 ·
 *   title 도 같은 문구(서버 ok 인데 94 에 G2 행 없음 = 08:30 스위치 꺼짐 · 구 서버).
 * - loading → 값 자리 스켈레톤(aria-busy).
 * - 변경 이력 표는 그리지 않는다(사용자 결정 261127 — 마지막 변경 한 줄만).
 *
 * 글자 12.5px · 라벨 `--muted-fg` · tabular-nums · flex-wrap(폰 390 에서 줄바꿈).
 * `now` 는 「오늘이면 시각만」 판정 기준(테스트 주입 · 기본 지금).
 *
 * ⇄(`combined` · quick-261125-lju 목업 v4 `.ch`) — 교보 16:00 합친 레인이 켜졌을 때 다른 시장의 실조각 · 탐침과 같은 µs 인 계획 값
 * 뒤에 「⇄」(title = `combinedTitle`). 집합이 없거나 비면 지금과 글자 하나 다르지 않은 `planLineText` 그대로다.
 *
 * 「계획 고치기」/「닫기」(35-15 · D-24) — `onToggle` 이 있을 때만 첫 줄 끝에 붙는다. 서버 계획(source server)일 때만 켜지고,
 * 대신 값 · 조회 중이면 비활성 + title(지금 서버 값을 모르면 고칠 기준이 없다). `children` = 편집 칸 자리(첫 줄 바로 아래).
 */

export interface LaunchPlanBarProps {
  fire: LaunchFire;
  plan: PanelPlan;
  now?: Date;
  /** 이 패널 편집 칸이 열려 있는가. */
  editing?: boolean;
  /** 「계획 고치기」/「닫기」 — 없으면 버튼을 그리지 않는다. */
  onToggle?: () => void;
  /** 편집 칸(열렸을 때). */
  children?: ReactNode;
  /** ⇄ 를 붙일 µs 집합(`tailProbeCombinedSetOf`) — 없거나 비면 붙이지 않는다. */
  combined?: ReadonlySet<number> | null;
  /** ⇄ title(`tailProbeCombinedTitleOf`). */
  combinedTitle?: string;
}

/** 서버 계획을 못 읽은 패널의 「계획 고치기」 title. */
export const LAUNCH_PLAN_EDIT_BLOCKED = '서버 계획을 읽지 못해 고칠 수 없어요';

export function LaunchPlanBar({
  fire,
  plan,
  now = new Date(),
  editing = false,
  onToggle,
  children,
  combined = null,
  combinedTitle = '',
}: LaunchPlanBarProps) {
  if (plan.source === 'absent') return null;
  const loading = plan.source === 'loading';
  const editable = plan.source === 'server' && plan.entry !== null;

  return (
    <div
      data-slot="launch-plan-bar"
      data-source={plan.source}
      aria-busy={loading ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-1.5 text-[12.5px] text-[var(--muted-fg)]"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="whitespace-nowrap">다음 발사 계획</span>
        {plan.source === 'server' && plan.entry !== null && (
          <b data-slot="launch-plan-line" className="font-bold break-keep text-[var(--primary)] tabular-nums">
            {combined === null || combined.size === 0 ? (
              planLineText(plan.entry, fire)
            ) : (
              <CombinedPlanLine offsets={plan.entry.offsets_us} fire={fire} combined={combined} title={combinedTitle} />
            )}
          </b>
        )}
        {plan.source === 'fallback' && (
          <span
            data-slot="launch-plan-line"
            data-tone="warn"
            className="font-semibold break-keep text-[var(--led-latent)] tabular-nums"
          >
            {fallbackLineText(plan.fallbackUs)}
          </span>
        )}
        {plan.source === 'unsupported' && (
          <span
            data-slot="launch-plan-line"
            data-tone="warn"
            className="font-semibold break-keep text-[var(--led-latent)] tabular-nums"
          >
            {LAUNCH_PLAN_G2_UNKNOWN}
          </span>
        )}
        {loading && <Skeleton className="h-3.5 w-40" />}
        {plan.source === 'server' && plan.lastChange !== null && (
          <span data-slot="launch-plan-last" className="break-keep tabular-nums">
            {`· ${lastChangeText(plan.lastChange, now)}`}
          </span>
        )}
        {onToggle !== undefined && (
          <>
            <span className="flex-1" />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-slot="launch-plan-edit-toggle"
              aria-expanded={editable ? editing : undefined}
              disabled={!editable}
              title={
                editable ? undefined : plan.source === 'unsupported' ? LAUNCH_PLAN_G2_UNKNOWN : LAUNCH_PLAN_EDIT_BLOCKED
              }
              onClick={onToggle}
              className={ADMIN_BUTTON_SECONDARY}
            >
              {editing && editable ? '닫기' : '계획 고치기'}
            </Button>
          </>
        )}
      </div>
      {editing && editable && children}
    </div>
  );
}

/** ⇄ 가 붙는 계획 줄 — `planLineText` 와 같은 꼴(q16 「n조각 」 + 값들 · 그 밖 한 값)을 값마다 그리고 해당 값 뒤에 ⇄. */
function CombinedPlanLine({
  offsets,
  fire,
  combined,
  title,
}: {
  offsets: readonly number[];
  fire: LaunchFire;
  combined: ReadonlySet<number>;
  title: string;
}) {
  const xs = fire === 'q16' ? offsets : offsets.slice(0, 1);
  return (
    <>
      {fire === 'q16' && `${offsets.length}조각 `}
      {xs.map((v, i) => (
        <span key={i} data-slot="launch-plan-value" data-us={v}>
          {i > 0 && ' · '}
          {fmtUs(v)}
          {combined.has(v) && <CombinedMark title={title} />}
        </span>
      ))}
      µs
    </>
  );
}
