'use client';

import {
  validateLaunchPlanDraft,
  type AdminServerResult,
  type LaunchFire,
  type LaunchPlanEntry,
} from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import { sameOffsets, saveResultViewOf, type SaveTone } from '@/lib/launch-plan-view';
import { cn } from '@/lib/utils';

import { ADMIN_BUTTON_PRIMARY, ReflectChip } from './reflect-chip';

/**
 * 「계획 고치기」 편집 칸 — 경계 지도 패널 안(Phase 35 범위 7 · D-24 ~ D-28 · D-34 · 채택 목업
 * `mockup-launch-plan-edit.html` 편집 칸 A).
 *
 * 저장 단위 = 그 패널(서버 × 시장 × 지금 세그먼트 발사) 1칸. 상태는 부모(지도 탭)가 쥔다 — 이 컴포넌트는 그리기 · 이벤트만.
 * - `draft` = 칸마다 입력 원문 문자열. 검증은 shared `validateLaunchPlanDraft` 한 벌(웹에서 다시 쓰지 않는다).
 * - 「저장」 은 검증 통과 · 서버 값과 다름 · 저장 중 아님일 때만 켜진다.
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
  const check = validateLaunchPlanDraft(fire, draft);
  const changed = check.ok && !sameOffsets(check.values, entry.offsets_us);
  const canSave = check.ok && changed && !saving;
  const view = result === null ? null : saveResultViewOf(result.result, fire, result.at);

  const setAt = (i: number, v: string) => onDraft(draft.map((s, j) => (j === i ? v : s)));

  return (
    <div
      data-slot="launch-plan-editor"
      data-gateway={gateway}
      className="flex min-w-0 flex-col gap-3 rounded-[16px] bg-[var(--band)] px-4 py-3.5 text-[13px] text-[var(--fg-2)]"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="min-w-[52px] text-[12.5px] font-semibold text-[var(--muted-fg)]">조각 시각</span>
        <div className="flex min-w-0 flex-wrap gap-2">
          {draft.map((s, i) => (
            <label
              key={i}
              className="inline-flex h-9 w-[88px] shrink-0 items-center gap-1.5 rounded-[10px] bg-[var(--muted)] px-2.5"
            >
              <span className="text-[11.5px] font-bold text-[var(--muted-fg)]">{i + 1}</span>
              <input
                data-slot="launch-plan-input"
                data-idx={i}
                inputMode="numeric"
                aria-label={`${i + 1}번 조각 시각(µs)`}
                value={s}
                onChange={(e) => setAt(i, e.target.value)}
                className="w-full min-w-0 border-0 bg-transparent text-right text-[14px] font-semibold text-[var(--fg)] tabular-nums outline-none"
              />
              <small className="text-[11.5px] text-[var(--muted-fg)]">µs</small>
            </label>
          ))}
        </div>
      </div>
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
