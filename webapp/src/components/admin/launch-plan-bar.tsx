'use client';

import type { ReactNode } from 'react';

import type { LaunchFire } from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LAUNCH_PLAN_HISTORY_MAX,
  changeAtText,
  changeOutcomeView,
  changeValuesText,
  fallbackLineText,
  lastChangeText,
  planLineText,
  type PanelPlan,
} from '@/lib/launch-plan-view';
import { cn } from '@/lib/utils';

import { ADMIN_BUTTON_SECONDARY, ADMIN_CHIP_BASE, ADMIN_TONE_CLASS } from './reflect-chip';

/**
 * 「다음 발사 계획」 줄 — 경계 지도 패널 머리 아래(Phase 35 범위 7 · D-24 · D-25 · D-29 · 채택 목업
 * `mockup-launch-plan-place.html` 자리 B `.pstrip`).
 *
 * - source absent(배포 전 404 · D-35) → 아무것도 그리지 않는다.
 * - server → 계획 값(목업 `.pstrip b` — `--primary` 700 · 점선과 같은 색) + 마지막 성공 변경 「· 22:41 · 이메일」.
 * - fallback → 「서버 연결 안 됨 · 마지막 발사 값 −337µs」(`data-tone="warn"` · `--led-latent` 글자).
 * - loading → 값 자리 스켈레톤(aria-busy).
 * - 이력이 있으면 「변경 이력 n」 접힘(날짜별 표 꼴) — 최근 `LAUNCH_PLAN_HISTORY_MAX` 행 · 결과 알약은 Admin 칩 한 벌.
 *
 * 글자 12.5px · 라벨 `--muted-fg` · tabular-nums · flex-wrap(폰 390 에서 줄바꿈 · 표는 가로 스크롤).
 * `now` 는 「오늘이면 시각만」 판정 기준(테스트 주입 · 기본 지금).
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
}

/** 서버 계획을 못 읽은 패널의 「계획 고치기」 title. */
export const LAUNCH_PLAN_EDIT_BLOCKED = '서버 계획을 읽지 못해 고칠 수 없어요';

const TH = 'bg-[var(--band)] px-2.5 py-2 text-left text-[11.5px] font-semibold text-[var(--muted-fg)]';
const TD = 'border-t border-[var(--border-subtle)] px-2.5 py-1.5';

export function LaunchPlanBar({ fire, plan, now = new Date(), editing = false, onToggle, children }: LaunchPlanBarProps) {
  if (plan.source === 'absent') return null;
  const loading = plan.source === 'loading';
  const editable = plan.source === 'server' && plan.entry !== null;
  const rows = plan.changes.slice(0, LAUNCH_PLAN_HISTORY_MAX);

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
            {planLineText(plan.entry, fire)}
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
              title={editable ? undefined : LAUNCH_PLAN_EDIT_BLOCKED}
              onClick={onToggle}
              className={ADMIN_BUTTON_SECONDARY}
            >
              {editing && editable ? '닫기' : '계획 고치기'}
            </Button>
          </>
        )}
      </div>
      {editing && editable && children}
      {rows.length > 0 && (
        <details data-slot="launch-plan-history-fold" className="min-w-0">
          <summary className="cursor-pointer font-semibold select-none">{`변경 이력 ${plan.changes.length}`}</summary>
          <div className="mt-2 min-w-0 overflow-x-auto">
            <table
              data-slot="launch-plan-history"
              className="w-full min-w-max border-collapse text-[12.5px] whitespace-nowrap text-[var(--fg)]"
            >
              <thead>
                <tr>
                  <th className={TH}>시각</th>
                  <th className={TH}>이메일</th>
                  <th className={TH}>전 → 후 µs</th>
                  <th className={TH}>결과</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const out = changeOutcomeView(r);
                  return (
                    <tr key={r.id}>
                      <td className={cn(TD, 'tabular-nums')}>{changeAtText(r.at, now)}</td>
                      <td className={TD}>{r.admin_email}</td>
                      <td className={cn(TD, 'tabular-nums')}>{changeValuesText(r.before_us, r.after_us)}</td>
                      <td className={TD}>
                        <span
                          data-slot="launch-plan-outcome"
                          data-tone={out.tone}
                          title={out.title}
                          className={cn(ADMIN_CHIP_BASE, ADMIN_TONE_CLASS[out.tone])}
                        >
                          {out.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
