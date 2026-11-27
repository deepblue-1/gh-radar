'use client';

import {
  LAUNCH_PLAN_LIMITS,
  launchTailProbeChipText,
  type AdminServerResult,
  type LaunchFire,
  type LaunchPlanEntry,
} from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import {
  commonPlanSplitText,
  planDraftCheck,
  sameOffsets,
  saveResultViewOf,
  type LaunchPlanReread,
  type SaveTone,
} from '@/lib/launch-plan-view';
import { cn } from '@/lib/utils';

import { ADMIN_BUTTON_PRIMARY, ADMIN_BUTTON_SECONDARY, ReflectChip } from './reflect-chip';

/**
 * 「계획 고치기」 편집 칸 — 경계 지도 패널 안(Phase 35 범위 7 · D-24 ~ D-28 · D-34 · 채택 목업
 * `mockup-launch-plan-edit.html` 편집 칸 A).
 *
 * 저장 단위 = 그 패널(서버 × 시장 × 지금 세그먼트 발사) 1칸. 상태는 부모(지도 탭)가 쥔다 — 이 컴포넌트는 그리기 · 이벤트만.
 * - `draft` = 칸마다 칩 원문(탐침 칩과 같은 꼴 · 261127) — 칸 앞에 − 가 고정으로 붙어 숫자만 치면 정각 앞, 정각 뒤는 앞에 +.
 *   검증은 `planDraftCheck`(칩 → 부호 있는 값 → shared `validateLaunchPlanDraft` 한 벌).
 * - 16:00 = 「조각 수」 −/+ 스테퍼(`LAUNCH_PLAN_LIMITS` · + 는 마지막 칸 값을 복사해 붙이고 − 는 마지막 칸을 뺀다) + 칸마다 µs.
 *   칸 순서는 자유 — 입력 중에는 칸을 움직이지 않고, 검증이 이른 시각부터 정렬한 값을 돌려줘 저장 · 미리보기는 정렬된 값이다
 *   (저장 뒤 칸이 정렬된 서버 값으로 다시 열린다 · fast-261125).
 *   09:00:30 = 「발사 시각」 한 칸(스테퍼 없음). 「첫 시각 + 간격」 · 「고르게 채우기」 도우미는 없다(Deferred).
 * - 검증 위반 = 그 칸만 `aria-invalid` + 빨간 테두리 · `role=alert` 한 줄(shared 문구 원문) · 저장 비활성 · 입력값은 그대로.
 *   개수 위반(badIdx −1)은 칸 표시 없이 alert 만. 폭 위반(16:00 마지막 − 첫 > 500µs)은 마지막 칸에 표시.
 * - 「저장」 은 검증 통과 · 서버 값과 다름 · 저장 중 아님일 때만 켜진다. 「되돌리기」 = 서버 현재 값(같으면 비활성).
 * - 저장 중에도 입력은 막지 않는다(값 유지 · 버튼만 「저장 중…」). 저장 중에 고친 입력은 응답이 와도 덮어쓰지 않는다 —
 *   지도 탭은 응답 때의 초안이 저장 요청 때와 같을 때만 칸을 저장 값으로 다시 연다(35 IN-03).
 * - 「지금 / 바꿀 / 쐈다면」 미리보기 표는 그리지 않는다(사용자 결정 261127 — 지도 리본 · 바꿀 계획 선이 같은 정보).
 * - 교보 09:00:30 N(`common` · 인박스 261109-kyobo-n-single-field): 안내 글이 「코스피 · 코스닥 공통 한 값」 으로 바뀌고, 서버 K · Q 가
 *   갈라져 있으면 경고색 한 줄 + 값이 같아도 「저장」 을 켠다(저장이 K → Q 두 번 보내 둘을 맞춘다 — 지도 탭 `onSave`).
 * - 결과 = Admin 칩 한 벌(`ReflectChip`) + 결과 줄(`saveResultViewOf` — outcome · code 로 가르고 code 1 은 「알 수 없는 명령입니다」 만 서버 미지원).
 */

export interface LaunchPlanSaveState {
  result: AdminServerResult;
  at: Date;
  /** 저장 뒤 다시 읽기의 대상 서버 결과(35 R3-WR-01) — 다시 읽지 않는 저장이면 없음. timeout 줄 꼬리만 바꾼다. */
  reread?: LaunchPlanReread;
}

export interface LaunchPlanEditorProps {
  gateway: string;
  fire: LaunchFire;
  /** 서버 현재 값(이 칸) — 「되돌리기」 · 변경 없음 판정 기준. */
  entry: LaunchPlanEntry;
  draft: readonly string[];
  onDraft: (draft: string[]) => void;
  onSave: () => void;
  saving?: boolean;
  /** 마지막 저장 결과(이 칸) — 없으면 null. */
  result?: LaunchPlanSaveState | null;
  /**
   * 교보 09:00:30 N 공통 칸(인박스 261109-kyobo-n-single-field) — 있으면 「코스피 · 코스닥 공통」 안내 · `entry` 는 N/K 값.
   * `split` = 서버 K · Q 가 갈라져 있을 때 두 값(안내 줄 · 값이 같아도 저장 켬 — 저장이 둘을 맞춘다).
   */
  common?: { split: { K: readonly number[]; Q: readonly number[] } | null } | null;
}

const LABEL = 'min-w-[52px] text-[12.5px] font-semibold text-[var(--muted-fg)]';
const STEP_BTN =
  'inline-flex size-8 items-center justify-center text-[16px] text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-40';

/** 입력값 거르기 — 숫자와 + 만 남긴다(탐침 칩과 같은 규칙 · 폰 숫자 키패드 · 붙여넣기). */
const chipInputOf = (raw: string): string => raw.replace(/[^\d+]/g, '');

const LINE_TONE: Record<SaveTone, string> = {
  ok: 'text-[var(--muted-fg)]',
  err: 'text-[var(--destructive)]',
  warn: 'text-[var(--led-latent)]',
};

export function LaunchPlanEditor({
  gateway,
  fire,
  entry,
  draft,
  onDraft,
  onSave,
  saving = false,
  result = null,
  common = null,
}: LaunchPlanEditorProps) {
  const lim = LAUNCH_PLAN_LIMITS[fire];
  const multi = lim.maxPieces > 1;
  const check = planDraftCheck(fire, draft);
  const badIdx = check.ok ? null : check.badIdx;
  const split = common?.split ?? null;
  const changed = check.ok && (split !== null || !sameOffsets(check.values, entry.offsets_us));
  const canSave = check.ok && changed && !saving;
  const serverChips = entry.offsets_us.map(launchTailProbeChipText);
  const pristine = draft.length === serverChips.length && draft.every((s, i) => s === serverChips[i]);
  const view = result === null ? null : saveResultViewOf(result.result, fire, result.at, result.reread);

  const setAt = (i: number, v: string) => onDraft(draft.map((s, j) => (j === i ? v : s)));
  const add = () => onDraft([...draft, draft[draft.length - 1] ?? serverChips[0] ?? '0']);
  const drop = () => onDraft(draft.slice(0, -1));

  return (
    <div
      data-slot="launch-plan-editor"
      data-gateway={gateway}
      className="flex min-w-0 flex-col gap-3 rounded-[16px] bg-[var(--band)] px-4 py-3.5 text-[13px] text-[var(--fg-2)]"
    >
      {multi && (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className={LABEL}>조각 수</span>
          <span data-slot="launch-plan-stepper" className="inline-flex items-center rounded-[10px] bg-[var(--muted)]">
            <button
              type="button"
              aria-label="조각 하나 빼기"
              disabled={draft.length <= lim.minPieces}
              onClick={drop}
              className={STEP_BTN}
            >
              −
            </button>
            <b className="min-w-7 text-center text-[14px] text-[var(--fg)] tabular-nums">{draft.length}</b>
            <button
              type="button"
              aria-label="조각 하나 더하기"
              disabled={draft.length >= lim.maxPieces}
              onClick={add}
              className={STEP_BTN}
            >
              +
            </button>
          </span>
          <span className="text-[12px] text-[var(--muted-fg)] tabular-nums">{`${lim.minPieces} ~ ${lim.maxPieces}`}</span>
        </div>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className={LABEL}>{multi ? '조각 시각' : '발사 시각'}</span>
        <div className="flex min-w-0 flex-wrap gap-2">
          {draft.map((s, i) => {
            const bad = badIdx === i;
            return (
              <label
                key={i}
                className={cn(
                  'inline-flex h-9 w-[112px] shrink-0 items-center gap-1.5 rounded-[10px] bg-[var(--muted)] px-2.5',
                  bad && 'shadow-[inset_0_0_0_1.5px_var(--destructive)]',
                )}
              >
                {multi && <span className="text-[11.5px] font-bold text-[var(--muted-fg)]">{i + 1}</span>}
                <span className="ml-auto inline-flex min-w-0 items-center">
                  <span aria-hidden className="text-[14px] font-semibold text-[var(--fg)]">
                    {s.trim().startsWith('+') ? '' : '−'}
                  </span>
                  <input
                    data-slot="launch-plan-input"
                    data-idx={i}
                    inputMode="tel"
                    autoComplete="off"
                    aria-label={multi ? `${i + 1}번 조각 시각(µs)` : '발사 시각(µs)'}
                    aria-invalid={bad ? true : undefined}
                    value={s}
                    onChange={(e) => setAt(i, chipInputOf(e.target.value))}
                    // 글자 수만큼만 넓혀 − 접두가 숫자에 붙는다(ch = 숫자 한 칸 · 0.5ch 여유는 오른쪽).
                    style={{ width: `${Math.max(s.length, 1) + 0.5}ch` }}
                    className="max-w-[52px] min-w-0 border-0 bg-transparent text-left text-[14px] font-semibold text-[var(--fg)] tabular-nums outline-none"
                  />
                </span>
                <small className="text-[11.5px] text-[var(--muted-fg)]">µs</small>
              </label>
            );
          })}
        </div>
        {!multi && (
          <span data-slot="launch-plan-scope" className="text-[12px] break-keep text-[var(--muted-fg)]">
            {common !== null
              ? '코스피 · 코스닥 공통 한 값 — 두 시장 주문이 한 묶음으로 이 시각에 나가요'
              : '코스피 · 코스닥 각각 한 값 — 이 시장 주문 전부가 이 시각에 붙어서 나가요'}
          </span>
        )}
      </div>
      {split !== null && (
        <div data-slot="launch-plan-split" className="text-[12.5px] break-keep text-[var(--led-latent)]">
          {commonPlanSplitText(split)}
        </div>
      )}
      <div data-slot="launch-plan-hint" className="text-[11.5px] break-keep text-[var(--muted-fg)]">
        정각 기준 · 숫자만 치면 정각 −, 정각 뒤는 앞에 +
      </div>
      {!check.ok && (
        <div data-slot="launch-plan-alert" role="alert" className="text-[12.5px] break-keep text-[var(--destructive)]">
          {check.message}
        </div>
      )}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {view !== null && (
          <div data-slot="launch-plan-result" className="flex min-w-0 flex-wrap items-center gap-2">
            <ReflectChip serverKey={gateway} tone={view.chip.tone} text={view.chip.text} message={view.chip.title} />
            <span
              data-slot="launch-plan-result-line"
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
          data-slot="launch-plan-revert"
          disabled={pristine}
          onClick={() => onDraft(serverChips)}
          className={ADMIN_BUTTON_SECONDARY}
        >
          되돌리기
        </Button>
        <Button
          type="button"
          size="sm"
          data-slot="launch-plan-save"
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
