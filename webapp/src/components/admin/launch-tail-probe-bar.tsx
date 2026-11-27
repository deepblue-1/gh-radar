'use client';

import type { ReactNode } from 'react';

import {
  LAUNCH_TAIL_PROBE_MAX_SHOTS,
  launchTailProbeChipText,
  launchTailProbeStateOf,
  parseLaunchTailProbeChip,
  shiftLaunchTailProbeDraft,
  validateLaunchTailProbeDraft,
  type LaunchMarket,
  type LaunchTailProbeFire,
} from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TAIL_PROBE_UNKNOWN_TEXT,
  TAIL_PROBE_UNSUPPORTED_TEXT,
  sameOffsets,
  saveResultViewOf,
  tailProbeAddChipOf,
  tailProbeGroupText,
  tailProbeLegacyText,
  tailProbeSummaryParts,
  type LaunchPlanState,
  type SaveTone,
} from '@/lib/launch-plan-view';
import { cn } from '@/lib/utils';

import type { LaunchPlanSaveState } from './launch-plan-editor';
import { ADMIN_BUTTON_PRIMARY, ADMIN_BUTTON_SECONDARY, ReflectChip } from './reflect-chip';

/**
 * 「탐침」 줄 · 편집 칸 · ⇄ — 경계 지도 시장 패널 안 「다음 발사 계획」 줄 바로 아래(quick-261125-lju · 채택 목업
 * `reference/mockup-probe-per-market-v4.html` 의 `panel()` · `editor()` 가 정본).
 * 값 = 정각 기준 부호 있는 µs 목록(시장별 · 0 ~ 10발 · 교보 09:00:30 N 은 공통 한 목록).
 *
 * `LaunchTailProbeLine` 상태(`data-state`):
 * - 계획 absent(배포 전 404) → 아무것도 그리지 않는다(계획 기능과 같이 숨김).
 * - loading → 값 자리 스켈레톤.
 * - unknown(계획을 못 읽음 — 서버 non-ok · 조회 실패) → muted 「탐침 값을 읽지 못했어요」 · 고치기 버튼 없음.
 * - unsupported(그 시장 목록이 94 에 없음 — 구 서버 · relay 와이어 대기) → 경고색(`data-tone="warn"` · `--led-latent`)
 *   「이 서버 버전은 시장별 탐침을 몰라요 — …」 + 옛 개수 · 간격 행이 있으면 「 · 지금 뒤탐침 5발 10µs 간격」 · 고치기 버튼 없음.
 * - set → 「탐침 」 + 굵은 `--primary` 「n발」 + 「 · 」 + 묶음(−270×2 · ⇄) + 「µs」.
 * - off(빈 목록) → 「탐침 」 + 굵은 muted 「꺼짐」 + 「 · 0발」.
 *
 * 「탐침 고치기」/「닫기」 는 `onToggle` 이 있고 set · off 일 때만. `children` = 편집 칸 자리(`editing` 일 때).
 * 탐침 변경 이력 표는 그리지 않는다(사용자 결정 261127).
 * 서버 라벨 제목 · 「코스피 · 코스닥 공통」 부제는 없다(패널 머리가 이미 서버 · 시장을 말한다).
 * 위치 경고(실조각 앞 · 사이 · 뒤)는 어디에도 없다(사용자 결정).
 * 글자 12.5px · tabular-nums · flex-wrap · break-keep(폰 390 에서 줄바꿈 · 칩 줄바꿈 · 표는 가로 스크롤).
 */

export type LaunchTailProbeLineState = 'loading' | 'unknown' | 'unsupported' | 'set' | 'off';

/** ⇄ 「다른 시장과 한 번에 쏨」 — 목업 `.ch`(10px 굵게 · `--primary` · 옅은 바탕 · 둥근 모서리). */
export function CombinedMark({ title }: { title: string }) {
  return (
    <span
      data-slot="launch-combined"
      title={title}
      aria-label={title}
      className="ml-[3px] inline-flex items-center justify-center rounded-[5px] bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] px-1 text-[10px] leading-4 font-bold text-[var(--primary)]"
    >
      ⇄
    </span>
  );
}

export interface LaunchTailProbeLineProps {
  gateway: string;
  /** q16 · n0930 만 — 08:30(G2)은 탐침이 없다(인박스 261125-sigan-ttaeng-g2 ⓑ · 지도 탭이 줄을 그리지 않는다). */
  fire: LaunchTailProbeFire;
  /** 패널 시장(data-market). */
  market: LaunchMarket;
  /** 상태 읽기 시장 — 교보 N 공통이면 K(`tailProbeSaveMarketOf`) · 아니면 패널 시장. */
  stateMarket: LaunchMarket;
  plan: LaunchPlanState;
  editing?: boolean;
  /** 「탐침 고치기」/「닫기」 — 없으면 버튼을 그리지 않는다. */
  onToggle?: () => void;
  /** ⇄ 를 붙일 µs 집합 — 없거나 비면 붙이지 않는다. */
  combined?: ReadonlySet<number> | null;
  combinedTitle?: string;
  children?: ReactNode;
}

export function LaunchTailProbeLine({
  gateway,
  fire,
  market,
  stateMarket,
  plan,
  editing = false,
  onToggle,
  combined = null,
  combinedTitle = '',
  children,
}: LaunchTailProbeLineProps) {
  if (plan.kind === 'absent') return null;
  const st =
    plan.kind === 'loading'
      ? null
      : plan.kind === 'error'
        ? ({ kind: 'unknown' } as const)
        : launchTailProbeStateOf(plan.resp.servers[gateway], fire, stateMarket);
  const state: LaunchTailProbeLineState =
    st === null ? 'loading' : st.kind === 'set' ? (st.offsets_us.length > 0 ? 'set' : 'off') : st.kind;
  const editable = st !== null && st.kind === 'set';

  return (
    <div
      data-slot="launch-tail-probe"
      data-state={state}
      data-gateway={gateway}
      data-fire={fire}
      data-market={market}
      aria-busy={state === 'loading' ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-1.5 text-[12.5px] text-[var(--muted-fg)]"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        {state === 'loading' && (
          <>
            <span className="whitespace-nowrap">탐침</span>
            <Skeleton className="h-3.5 w-40" />
          </>
        )}
        {state !== 'loading' && (
          <span
            data-slot="launch-tail-probe-summary"
            data-tone={state === 'unsupported' ? 'warn' : undefined}
            className={cn(
              'min-w-0 break-keep tabular-nums',
              state === 'unsupported' && 'font-semibold text-[var(--led-latent)]',
            )}
          >
            {state === 'unknown' && TAIL_PROBE_UNKNOWN_TEXT}
            {st !== null && st.kind === 'unsupported' && (
              <>
                {TAIL_PROBE_UNSUPPORTED_TEXT}
                {st.legacy !== null && ` · 지금 ${tailProbeLegacyText(st.legacy)}`}
              </>
            )}
            {st !== null && st.kind === 'set' && (
              <>
                {'탐침 '}
                <SummaryValue offsets={st.offsets_us} combined={combined} combinedTitle={combinedTitle} />
              </>
            )}
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
              {editing ? '닫기' : '탐침 고치기'}
            </Button>
          </>
        )}
      </div>
      {editing && editable && children}
    </div>
  );
}

/** 값 — set 은 굵은 `--primary` 「n발」 + 묶음(⇄) + 「µs」 · off 는 굵은 muted 「꺼짐」 + 「 · 0발」. */
function SummaryValue({
  offsets,
  combined,
  combinedTitle,
}: {
  offsets: readonly number[];
  combined: ReadonlySet<number> | null;
  combinedTitle: string;
}) {
  const p = tailProbeSummaryParts(offsets);
  if (p.groups.length === 0) {
    return (
      <>
        <b className="font-bold text-[var(--muted-fg)]">{p.strong}</b>
        {p.rest}
      </>
    );
  }
  return (
    <>
      <b className="font-bold text-[var(--primary)]">{p.strong}</b>
      {' · '}
      {p.groups.map((g, i) => (
        <span key={`${g.us}|${i}`} data-slot="launch-tail-probe-value" data-us={g.us}>
          {i > 0 && ' · '}
          {tailProbeGroupText(g)}
          {combined !== null && combined.has(g.us) && <CombinedMark title={combinedTitle} />}
        </span>
      ))}
      µs
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 편집 칸(목업 v4 `.ed`)
// ─────────────────────────────────────────────────────────────────────────────

/** 전체 이동 버튼 — 목업 SHIFTS(−10 −5 −3 −1 | +1 +3 +5 +10). */
const SHIFT_LEFT = [-10, -5, -3, -1] as const;
const SHIFT_RIGHT = [1, 3, 5, 10] as const;

const MARKET_NAME: Record<LaunchMarket, string> = { K: '코스피', Q: '코스닥' };

export interface LaunchTailProbeEditorProps {
  gateway: string;
  fire: LaunchTailProbeFire;
  /** 편집 칸이 열린 패널 시장(라벨 · 힌트). */
  market: LaunchMarket;
  /** 교보 09:00:30 N 공통 한 목록인가(힌트 「코스피 · 코스닥 공통」). */
  common?: boolean;
  /** 서버 현재 값(정렬) — 「되돌리기」 · 변경 없음 판정 기준. */
  server: readonly number[];
  /** 칩 원문(입력 중 자리 불변). */
  draft: readonly string[];
  /** 그 시장 계획 조각 — 「+ 추가」 기준(유효 칩이 없을 때). */
  planOffsets: readonly number[];
  /** ⇄ 를 붙일 µs 집합 — 없거나 비면 붙이지 않는다. */
  combined?: ReadonlySet<number> | null;
  combinedTitle?: string;
  onDraft: (draft: string[]) => void;
  onSave: () => void;
  saving?: boolean;
  /** 마지막 저장 결과(이 서버 · 이 발사 · 이 시장) — 없으면 null. */
  result?: LaunchPlanSaveState | null;
}

const LABEL = 'min-w-[44px] shrink-0 text-[12.5px] font-semibold text-[var(--muted-fg)]';
const HINT = 'text-[11.5px] break-keep text-[var(--muted-fg)]';
const SHIFT_BTN =
  'h-7 min-w-[34px] rounded-[7px] px-1 text-[12px] font-semibold text-[var(--fg)] tabular-nums enabled:hover:bg-[var(--card)] disabled:cursor-not-allowed disabled:opacity-35';
const LINE_TONE: Record<SaveTone, string> = {
  ok: 'text-[var(--muted-fg)]',
  err: 'text-[var(--destructive)]',
  warn: 'text-[var(--led-latent)]',
};

/** 입력값 거르기 — 숫자와 + 만 남긴다(폰 숫자 키패드 · 붙여넣기). */
const chipInputOf = (raw: string): string => raw.replace(/[^\d+]/g, '');

/**
 * 「탐침 고치기」 편집 칸(목업 v4 `.ed`) — 전체 이동 8버튼 · 칩 한 묶음(− 고정 접두 · + 는 정각 뒤 · × 삭제 · 「+ 추가」) · 힌트 ·
 * alert(shared 검증 문구) · 결과 줄 · 되돌리기 · 저장. 상태는 부모(지도 탭)가 쥔다.
 * - 전체 이동 = `shiftLaunchTailProbeDraft` 한 함수 — null 이면 그 버튼 비활성(한 발이라도 한도 밖 · 검증 오류 · 빈 초안).
 * - 입력 중 칩 순서는 바뀌지 않는다(정렬은 저장 값에만). 저장 중에도 입력은 막지 않는다(계획 편집 칸 규칙).
 * - 「저장」 은 검증 통과 · 정렬 값이 서버 값과 다름 · 저장 중 아님일 때만. 「되돌리기」 = 서버 칩(같으면 비활성).
 */
export function LaunchTailProbeEditor({
  gateway,
  fire,
  market,
  common = false,
  server,
  draft,
  planOffsets,
  combined = null,
  combinedTitle = '',
  onDraft,
  onSave,
  saving = false,
  result = null,
}: LaunchTailProbeEditorProps) {
  const check = validateLaunchTailProbeDraft(fire, draft);
  const bad = new Set(check.ok ? [] : check.badIdx);
  const changed = check.ok && !sameOffsets(check.values, server);
  const canSave = changed && !saving;
  const serverChips = server.map(launchTailProbeChipText);
  const pristine = draft.length === serverChips.length && draft.every((v, i) => v === serverChips[i]);
  const full = draft.length >= LAUNCH_TAIL_PROBE_MAX_SHOTS;
  const view = result === null ? null : saveResultViewOf(result.result, fire, result.at, result.reread);
  const name = MARKET_NAME[market];

  const shiftButton = (delta: number) => {
    const next = shiftLaunchTailProbeDraft(fire, draft, delta);
    const label = delta < 0 ? `−${-delta}` : `+${delta}`;
    return (
      <button
        key={delta}
        type="button"
        data-slot="launch-tail-probe-shift"
        data-delta={delta}
        aria-label={`전체 ${label}µs`}
        disabled={next === null || saving}
        onClick={() => next !== null && onDraft(next)}
        className={SHIFT_BTN}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      data-slot="launch-tail-probe-editor"
      data-gateway={gateway}
      data-market={market}
      className="flex min-w-0 flex-col gap-2.5 rounded-[12px] bg-[var(--band)] px-3 py-3 text-[12.5px] text-[var(--fg-2)]"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className={LABEL}>전체 이동</span>
        <span className="inline-flex flex-wrap items-stretch gap-px rounded-[9px] bg-[var(--muted)] p-0.5">
          {SHIFT_LEFT.map(shiftButton)}
          <span aria-hidden className="mx-0.5 my-[5px] w-px bg-[var(--border-subtle)]" />
          {SHIFT_RIGHT.map(shiftButton)}
        </span>
        <span className={HINT}>{`µs · ${common ? '코스피 · 코스닥 공통' : `${name} 탐침만`} · − 더 이르게 · + 더 늦게`}</span>
      </div>
      <div className="flex min-w-0 items-start gap-x-2.5">
        <span className={cn(LABEL, 'pt-[7px]')}>탐침</span>
        <div data-slot="launch-tail-probe-chips" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {draft.map((raw, i) => {
            const v = parseLaunchTailProbeChip(raw);
            const isBad = bad.has(i);
            return (
              <span
                key={i}
                data-slot="launch-tail-probe-chip"
                data-idx={i}
                data-bad={isBad ? 'true' : undefined}
                className={cn(
                  'inline-flex h-8 items-center gap-px rounded-[9px] bg-[var(--muted)] pr-0.5 pl-2',
                  isBad && 'shadow-[inset_0_0_0_1.5px_var(--destructive)]',
                )}
              >
                <span aria-hidden className="w-2 text-[13.5px] font-semibold text-[var(--fg)]">
                  {raw.trim().startsWith('+') ? '' : '−'}
                </span>
                <input
                  data-slot="launch-tail-probe-chip-input"
                  inputMode="tel"
                  autoComplete="off"
                  aria-label={`${name} 탐침 ${i + 1}번(정각 −µs)`}
                  aria-invalid={isBad ? true : undefined}
                  value={raw}
                  onChange={(e) => {
                    const next = [...draft];
                    next[i] = chipInputOf(e.target.value);
                    onDraft(next);
                  }}
                  className="w-10 border-0 bg-transparent text-right text-[13.5px] font-semibold text-[var(--fg)] tabular-nums outline-none"
                />
                <small className="ml-0.5 text-[10.5px] text-[var(--muted-fg)]">µs</small>
                {v !== null && !isBad && combined !== null && combined.has(v) && <CombinedMark title={combinedTitle} />}
                <button
                  type="button"
                  data-slot="launch-tail-probe-chip-del"
                  aria-label={`탐침 ${i + 1}번 지우기`}
                  onClick={() => onDraft(draft.filter((_, j) => j !== i))}
                  className="h-[26px] w-6 rounded-[7px] text-[13px] text-[var(--muted-fg)] hover:text-[var(--destructive)]"
                >
                  ×
                </button>
              </span>
            );
          })}
          <button
            type="button"
            data-slot="launch-tail-probe-add"
            disabled={full}
            onClick={() => onDraft([...draft, tailProbeAddChipOf(fire, draft, planOffsets)])}
            className="inline-flex h-8 items-center rounded-[9px] bg-[var(--muted)] px-[11px] text-[12.5px] font-semibold text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            + 추가
          </button>
        </div>
      </div>
      <div data-slot="launch-tail-probe-hint" className={HINT}>
        {`${draft.length} / ${LAUNCH_TAIL_PROBE_MAX_SHOTS}발 · 정각 기준 · 숫자만 치면 정각 −, 정각 뒤는 앞에 + · 저장할 때 이른 시각부터 정렬`}
      </div>
      {!check.ok && (
        <div data-slot="launch-tail-probe-alert" role="alert" className="text-[12.5px] break-keep text-[var(--destructive)]">
          {check.message}
        </div>
      )}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {view !== null && (
          <div data-slot="launch-tail-probe-result" className="flex min-w-0 flex-wrap items-center gap-2">
            <ReflectChip serverKey={gateway} tone={view.chip.tone} text={view.chip.text} message={view.chip.title} />
            <span
              data-slot="launch-tail-probe-result-line"
              data-tone={view.line.tone}
              role={view.line.tone === 'ok' ? 'status' : 'alert'}
              className={cn('text-[12.5px] break-keep', LINE_TONE[view.line.tone])}
            >
              {view.line.text}
            </span>
          </div>
        )}
        <span className="flex-1" />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-slot="launch-tail-probe-revert"
          disabled={pristine}
          onClick={() => onDraft(serverChips)}
          className={ADMIN_BUTTON_SECONDARY}
        >
          되돌리기
        </Button>
        <Button
          type="button"
          size="sm"
          data-slot="launch-tail-probe-save"
          disabled={!canSave}
          onClick={onSave}
          className={ADMIN_BUTTON_PRIMARY}
        >
          {saving ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  );
}
