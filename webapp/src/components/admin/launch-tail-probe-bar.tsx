'use client';

import type { ReactNode } from 'react';

import { launchServerLabelOf, launchTailProbeStateOf, type LaunchFire } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LAUNCH_PLAN_HISTORY_MAX,
  TAIL_PROBE_UNKNOWN_TEXT,
  TAIL_PROBE_UNSUPPORTED_TEXT,
  changeAtText,
  changeOutcomeView,
  tailProbeChangesOf,
  tailProbeSummaryParts,
  tailProbeValueText,
  type LaunchPlanState,
} from '@/lib/launch-plan-view';
import { cn } from '@/lib/utils';

import { ADMIN_BUTTON_SECONDARY, ADMIN_CHIP_BASE, ADMIN_TONE_CLASS } from './reflect-chip';

/**
 * 「<서버> 뒤탐침」 줄 — 경계 지도 탭 요약 카드 아래 · 시장 패널 위(quick-261107-l7w · 채택 목업
 * `mockup-tail-probe-setting.html` 변형 C `.tp`). 고른 서버 · 고른 발사(16:00 Q16 / 09:00:30 N) 하나의 뒤탐침 개수 · 간격.
 * 코스피 · 코스닥 공통(gh-trade 계약 — 단위 = (서버, profile)).
 *
 * 상태(`data-state`):
 * - 계획 absent(배포 전 404) → 아무것도 그리지 않는다(계획 기능과 같이 숨김).
 * - loading → 값 자리 스켈레톤.
 * - unknown(계획을 못 읽음 — 서버 non-ok · 조회 실패) → muted 「뒤탐침 값을 읽지 못했어요」 · 고치기 버튼 없음.
 * - unsupported(ok 인데 tail_probes 없음 — 구 서버 · relay 와이어 대기) → 경고색(`data-tone="warn"` · `--led-latent`)
 *   「이 서버 버전은 뒤탐침 설정을 몰라요 — gh-trade 업데이트 뒤 바꿀 수 있어요」 · 고치기 버튼 없음.
 * - set(count > 0) → 「5발 · 10µs 간격」 굵은 `--primary` + 「 · 마지막 조각 뒤 +10 ~ +50µs」.
 * - off(count 0) → 「꺼짐」 굵은 muted + 「 · 0발」.
 *
 * 「뒤탐침 고치기」/「닫기」 는 `onToggle` 이 있고 set · off 일 때만 그린다. `children` = 편집 칸 자리(`editing` 일 때).
 * 이력이 있으면 「변경 이력 n」 접힘(그 서버 · 그 발사 행만 · 최근 `LAUNCH_PLAN_HISTORY_MAX` 행 · 결과 알약은 Admin 칩 한 벌).
 * 글자 12.5px · tabular-nums · flex-wrap · break-keep(폰 390 에서 줄바꿈 · 표는 가로 스크롤).
 */

export interface LaunchTailProbeBarProps {
  gateway: string;
  fire: LaunchFire;
  plan: LaunchPlanState;
  now?: Date;
  /** 편집 칸이 열려 있는가. */
  editing?: boolean;
  /** 「뒤탐침 고치기」/「닫기」 — 없으면 버튼을 그리지 않는다. */
  onToggle?: () => void;
  /** 편집 칸(열렸을 때). */
  children?: ReactNode;
}

export type LaunchTailProbeBarState = 'loading' | 'unknown' | 'unsupported' | 'set' | 'off';

const TH = 'bg-[var(--band)] px-2.5 py-2 text-left text-[11.5px] font-semibold text-[var(--muted-fg)]';
const TD = 'border-t border-[var(--border-subtle)] px-2.5 py-1.5';

export function LaunchTailProbeBar({
  gateway,
  fire,
  plan,
  now = new Date(),
  editing = false,
  onToggle,
  children,
}: LaunchTailProbeBarProps) {
  if (plan.kind === 'absent') return null;
  const st =
    plan.kind === 'loading'
      ? null
      : plan.kind === 'error'
        ? ({ kind: 'unknown' } as const)
        : launchTailProbeStateOf(plan.resp.servers[gateway], fire);
  const state: LaunchTailProbeBarState =
    st === null ? 'loading' : st.kind === 'set' ? (st.value.count > 0 ? 'set' : 'off') : st.kind;
  const editable = st !== null && st.kind === 'set';
  const changes = tailProbeChangesOf(plan, gateway, fire);
  const rows = changes.slice(0, LAUNCH_PLAN_HISTORY_MAX);

  return (
    <div
      data-slot="launch-tail-probe"
      data-state={state}
      data-gateway={gateway}
      data-fire={fire}
      aria-busy={state === 'loading' ? 'true' : undefined}
      className={cn(
        CARD,
        'flex min-w-0 flex-col gap-2 px-3.5 py-3 text-[12.5px] text-[var(--muted-fg)] ring-1 ring-[var(--border-subtle)] ring-inset dark:ring-0',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <h3 data-slot="launch-tail-probe-title" className="text-[14px] font-bold text-[var(--fg)]">
          {`${launchServerLabelOf(gateway)} 뒤탐침`}
        </h3>
        <small className="text-[11.5px] font-normal break-keep text-[var(--muted-fg)]">코스피 · 코스닥 공통</small>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        {state === 'loading' && <Skeleton className="h-3.5 w-48" />}
        {state !== 'loading' && (
          <span
            data-slot="launch-tail-probe-summary"
            data-tone={state === 'unsupported' ? 'warn' : undefined}
            className={cn(
              'break-keep tabular-nums',
              state === 'unsupported' && 'font-semibold text-[var(--led-latent)]',
            )}
          >
            {state === 'unknown' && TAIL_PROBE_UNKNOWN_TEXT}
            {state === 'unsupported' && TAIL_PROBE_UNSUPPORTED_TEXT}
            {st !== null && st.kind === 'set' && <SummaryValue count={st.value.count} stepUs={st.value.step_us} />}
          </span>
        )}
        {onToggle !== undefined && editable && (
          <>
            <span className="flex-1" />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-slot="launch-tail-probe-toggle"
              aria-expanded={editing}
              onClick={onToggle}
              className={ADMIN_BUTTON_SECONDARY}
            >
              {editing ? '닫기' : '뒤탐침 고치기'}
            </Button>
          </>
        )}
      </div>
      {editing && editable && children}
      {rows.length > 0 && (
        <details data-slot="launch-tail-probe-history-fold" className="min-w-0">
          <summary className="cursor-pointer font-semibold select-none">{`변경 이력 ${changes.length}`}</summary>
          <div className="mt-2 min-w-0 overflow-x-auto">
            <table
              data-slot="launch-tail-probe-history"
              className="w-full min-w-max border-collapse text-[12.5px] whitespace-nowrap text-[var(--fg)]"
            >
              <thead>
                <tr>
                  <th className={TH}>시각</th>
                  <th className={TH}>이메일</th>
                  <th className={TH}>전 → 후</th>
                  <th className={TH}>결과</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const out = changeOutcomeView(r);
                  const before =
                    r.before_count === null || r.before_step_us === null
                      ? null
                      : { count: r.before_count, step_us: r.before_step_us };
                  return (
                    <tr key={r.id}>
                      <td className={cn(TD, 'tabular-nums')}>{changeAtText(r.at, now)}</td>
                      <td className={TD}>{r.admin_email}</td>
                      <td className={cn(TD, 'tabular-nums')}>
                        {`${tailProbeValueText(before)} → ${tailProbeValueText({ count: r.after_count, step_us: r.after_step_us })}`}
                      </td>
                      <td className={TD}>
                        <span
                          data-slot="launch-tail-probe-outcome"
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

/** 값 줄 — set 은 굵은 `--primary` · off(「꺼짐」)는 굵은 muted. */
function SummaryValue({ count, stepUs }: { count: number; stepUs: number }) {
  const p = tailProbeSummaryParts({ count, step_us: stepUs });
  return (
    <>
      <b className={cn('font-bold', count > 0 ? 'text-[var(--primary)]' : 'text-[var(--muted-fg)]')}>{p.strong}</b>
      {p.rest}
    </>
  );
}
