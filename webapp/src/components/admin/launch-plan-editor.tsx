'use client';

import {
  LAUNCH_PLAN_LIMITS,
  validateLaunchPlanDraft,
  type AdminServerResult,
  type LaunchFire,
  type LaunchPlanEntry,
} from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import { sameOffsets, saveResultViewOf, type SaveTone } from '@/lib/launch-plan-view';
import { cn } from '@/lib/utils';

import { ADMIN_BUTTON_PRIMARY, ADMIN_BUTTON_SECONDARY, ReflectChip } from './reflect-chip';

/**
 * 「계획 고치기」 편집 칸 — 경계 지도 패널 안(Phase 35 범위 7 · D-24 ~ D-28 · D-34 · 채택 목업
 * `mockup-launch-plan-edit.html` 편집 칸 A).
 *
 * 저장 단위 = 그 패널(서버 × 시장 × 지금 세그먼트 발사) 1칸. 상태는 부모(지도 탭)가 쥔다 — 이 컴포넌트는 그리기 · 이벤트만.
 * - `draft` = 칸마다 입력 원문 문자열. 검증은 shared `validateLaunchPlanDraft` 한 벌(웹에서 다시 쓰지 않는다).
 * - 16:00 = 「조각 수」 −/+ 스테퍼(`LAUNCH_PLAN_LIMITS` · + 는 마지막 칸 값을 복사해 붙이고 − 는 마지막 칸을 뺀다) + 칸마다 µs.
 *   09:00:30 = 「발사 시각」 한 칸(스테퍼 없음). 「첫 시각 + 간격」 · 「고르게 채우기」 도우미는 없다(Deferred).
 * - 검증 위반 = 그 칸만 `aria-invalid` + 빨간 테두리 · `role=alert` 한 줄(shared 문구 원문) · 저장 비활성 · 입력값은 그대로.
 *   개수 위반(badIdx −1)은 칸 표시 없이 alert 만.
 * - 「저장」 은 검증 통과 · 서버 값과 다름 · 저장 중 아님일 때만 켜진다. 「되돌리기」 = 서버 현재 값(같으면 비활성).
 * - 저장 중에도 입력은 막지 않는다(값 유지 · 버튼만 「저장 중…」).
 * - 결과 = Admin 칩 한 벌(`ReflectChip`) + 결과 줄(`saveResultViewOf` — outcome · code 로만 가른다).
 */

export interface LaunchPlanSaveState {
  result: AdminServerResult;
  at: Date;
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
}

const LABEL = 'min-w-[52px] text-[12.5px] font-semibold text-[var(--muted-fg)]';
const STEP_BTN =
  'inline-flex size-8 items-center justify-center text-[16px] text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-40';

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
}: LaunchPlanEditorProps) {
  const lim = LAUNCH_PLAN_LIMITS[fire];
  const multi = lim.maxPieces > 1;
  const check = validateLaunchPlanDraft(fire, draft);
  const badIdx = check.ok ? null : check.badIdx;
  const changed = check.ok && !sameOffsets(check.values, entry.offsets_us);
  const canSave = check.ok && changed && !saving;
  const pristine = draft.length === entry.offsets_us.length && draft.every((s, i) => s === String(entry.offsets_us[i]));
  const view = result === null ? null : saveResultViewOf(result.result, fire, result.at);

  const setAt = (i: number, v: string) => onDraft(draft.map((s, j) => (j === i ? v : s)));
  const add = () => onDraft([...draft, draft[draft.length - 1] ?? String(entry.offsets_us[0] ?? 0)]);
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
                  'inline-flex h-9 w-[88px] shrink-0 items-center gap-1.5 rounded-[10px] bg-[var(--muted)] px-2.5',
                  bad && 'shadow-[inset_0_0_0_1.5px_var(--destructive)]',
                )}
              >
                {multi && <span className="text-[11.5px] font-bold text-[var(--muted-fg)]">{i + 1}</span>}
                <input
                  data-slot="launch-plan-input"
                  data-idx={i}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label={multi ? `${i + 1}번 조각 시각(µs)` : '발사 시각(µs)'}
                  aria-invalid={bad ? true : undefined}
                  value={s}
                  onChange={(e) => setAt(i, e.target.value)}
                  className="w-full min-w-0 border-0 bg-transparent text-right text-[14px] font-semibold text-[var(--fg)] tabular-nums outline-none"
                />
                <small className="text-[11.5px] text-[var(--muted-fg)]">µs</small>
              </label>
            );
          })}
        </div>
        {!multi && (
          <span className="text-[12px] break-keep text-[var(--muted-fg)]">
            코스피 · 코스닥 각각 한 값 — 이 시장 주문 전부가 이 시각에 붙어서 나가요
          </span>
        )}
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
          onClick={() => onDraft(entry.offsets_us.map(String))}
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
