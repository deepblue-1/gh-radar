'use client';

import {
  LAUNCH_PLAN_LIMITS,
  launchPlanVerdictRows,
  validateLaunchPlanDraft,
  type AdminServerResult,
  type LaunchDay,
  type LaunchFire,
  type LaunchPlanEntry,
  type LaunchRibbonCell,
} from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import { DASH, fmtUs } from '@/lib/launch-format';
import { sameOffsets, saveResultViewOf, verdictCellText, type SaveTone } from '@/lib/launch-plan-view';
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
 * - 미리보기 P2(D-28 · 목업 `mockup-launch-plan-preview.html` `verdict()`): 조각마다 지금 / 바꿀 µs 와 「지난 N일에 쐈다면」
 *   접수 · 모름 · 거부 날 수(shared `launchPlanVerdictRows` — 리본과 같은 식). N = 그 패널 지금 범위의 날 수. 바꿀 값은
 *   `preview`(마지막 유효 값 · Pitfall S9) — 검증 오류 동안에도 지우지 않는다. 표는 자기 래퍼 안에서만 가로 스크롤.
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
  /** 그 패널 지금 범위의 날들(미리보기 표) — 비면 표 없음. */
  days?: readonly LaunchDay<unknown>[];
  /** 바꿀 값(마지막 유효 값 · S9) — 기본 서버 값. */
  preview?: readonly number[];
}

const NO_DAYS: readonly LaunchDay<unknown>[] = [];

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
  days = NO_DAYS,
  preview,
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
                  'inline-flex h-9 w-[104px] shrink-0 items-center gap-1.5 rounded-[10px] bg-[var(--muted)] px-2.5',
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
      {days.length > 0 && <LaunchPlanPreview days={days} cur={entry.offsets_us} next={preview ?? entry.offsets_us} />}
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

// ─────────────────────────────────────────────────────────────────────────────
// 미리보기 P2 — 조각별 「지난 N일에 쐈다면」
// ─────────────────────────────────────────────────────────────────────────────

const TH = 'bg-[var(--card)] px-2.5 py-2 text-left text-[11.5px] font-semibold text-[var(--muted-fg)]';
const TD = 'border-t border-[var(--border-subtle)] px-2.5 py-1.5';
const NUMERIC = 'text-right tabular-nums';

function VerdictCell({ cell }: { cell: LaunchRibbonCell | null }) {
  if (cell === null) return <>{DASH}</>;
  // 글자는 verdictCellText 와 같다(색만 나눈다).
  return (
    <span data-slot="launch-plan-verdict" data-text={verdictCellText(cell)} className="tabular-nums">
      <span className="font-bold text-[var(--launch-ok)]">{`접수 ${cell.ok}`}</span>
      {' · '}
      <span className="text-[var(--muted-fg)]">{`모름 ${cell.unknown}`}</span>
      {' · '}
      <span className="font-bold text-[var(--launch-bad)]">{`거부 ${cell.bad}`}</span>
    </span>
  );
}

function LaunchPlanPreview({
  days,
  cur,
  next,
}: {
  days: readonly LaunchDay<unknown>[];
  cur: readonly number[];
  next: readonly number[];
}) {
  const rows = launchPlanVerdictRows(days, cur, next);
  const n = days.length;
  return (
    <div data-slot="launch-plan-preview" className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-[12.5px] whitespace-nowrap text-[var(--fg)]">
        <thead>
          <tr>
            <th className={TH}>조각</th>
            <th className={cn(TH, 'text-right')}>지금 µs</th>
            <th className={cn(TH, 'text-right')}>바꿀 µs</th>
            <th className={TH}>{`지금 — 지난 ${n}일에 쐈다면`}</th>
            <th className={TH}>{`바꿀 — 지난 ${n}일에 쐈다면`}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.idx} data-idx={r.idx}>
              <td className={cn(TD, 'tabular-nums')}>{r.idx + 1}</td>
              <td className={cn(TD, NUMERIC)}>{fmtUs(r.cur)}</td>
              <td className={cn(TD, NUMERIC, 'font-bold text-[var(--launch-gate)]')}>{fmtUs(r.next)}</td>
              <td className={TD}>
                <VerdictCell cell={r.cur_cell} />
              </td>
              <td className={TD}>
                <VerdictCell cell={r.next_cell} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
