import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { LaunchFire, LaunchPlanEntry } from '@gh-radar/shared';

import { LaunchPlanEditor, type LaunchPlanSaveState } from '../launch-plan-editor';

/**
 * Phase 35 (35-15) — 「계획 고치기」 편집 칸(D-26 · D-27 · D-34 · 채택 목업 편집 칸 A).
 * 문구는 계획 behavior 원문 그대로(U+2212 마이너스).
 */

const M = '−';
const Q_ENTRY: LaunchPlanEntry = { profile: 'Q16', market: 'Q', offsets_us: [-350, -345, -325] };
const N_ENTRY: LaunchPlanEntry = { profile: 'N', market: 'K', offsets_us: [-245] };

function Harness({
  fire = 'q16',
  entry = Q_ENTRY,
  onSave = () => {},
  saving = false,
  result = null,
}: {
  fire?: LaunchFire;
  entry?: LaunchPlanEntry;
  onSave?: () => void;
  saving?: boolean;
  result?: LaunchPlanSaveState | null;
}) {
  const [draft, setDraft] = useState<string[]>(entry.offsets_us.map(String));
  return (
    <LaunchPlanEditor
      gateway="KB120"
      fire={fire}
      entry={entry}
      draft={draft}
      onDraft={setDraft}
      onSave={onSave}
      saving={saving}
      result={result}
    />
  );
}

const inputs = () => Array.from(document.querySelectorAll<HTMLInputElement>('[data-slot="launch-plan-input"]'));
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const saveBtn = () => q('[data-slot="launch-plan-save"]') as HTMLButtonElement;
const revertBtn = () => q('[data-slot="launch-plan-revert"]') as HTMLButtonElement;
const plus = () => screen.getByRole('button', { name: '조각 하나 더하기' });
const minus = () => screen.getByRole('button', { name: '조각 하나 빼기' });
const type = (el: HTMLInputElement, v: string) => fireEvent.change(el, { target: { value: v } });

describe('LaunchPlanEditor — 16:00 스테퍼', () => {
  it('칸 3 · 「조각 수 3」 · + → 칸 4(마지막 값 복사) · − → 칸 2', () => {
    render(<Harness />);
    expect(inputs()).toHaveLength(3);
    const stepper = q('[data-slot="launch-plan-stepper"]')!;
    expect(stepper.textContent).toContain('3');
    expect(q('[data-slot="launch-plan-editor"]')!.textContent).toContain('조각 수');

    fireEvent.click(plus());
    expect(inputs()).toHaveLength(4);
    expect(inputs()[3]!.value).toBe('-325');
    expect(stepper.textContent).toContain('4');

    fireEvent.click(minus());
    fireEvent.click(minus());
    expect(inputs()).toHaveLength(2);
    expect(inputs().map((i) => i.value)).toEqual(['-350', '-345']);
  });

  it('1 에서 − 비활성 · 10 에서 + 비활성', () => {
    render(<Harness />);
    fireEvent.click(minus());
    fireEvent.click(minus());
    expect(inputs()).toHaveLength(1);
    expect(minus()).toBeDisabled();
    expect(plus()).toBeEnabled();
    for (let i = 0; i < 9; i++) fireEvent.click(plus());
    expect(inputs()).toHaveLength(10);
    expect(plus()).toBeDisabled();
    expect(minus()).toBeEnabled();
  });

  it('칸 번호 1..n · inputMode numeric · aria-label 「{n}번 조각 시각(µs)」', () => {
    render(<Harness />);
    expect(inputs().map((i) => i.getAttribute('aria-label'))).toEqual([
      '1번 조각 시각(µs)',
      '2번 조각 시각(µs)',
      '3번 조각 시각(µs)',
    ]);
    expect(inputs().every((i) => i.inputMode === 'numeric')).toBe(true);
  });
});

describe('LaunchPlanEditor — 검증 표시(D-26 · D-34)', () => {
  it('2번 −360 → 그 칸만 aria-invalid · role=alert 순서 문구 · 저장 비활성 · 입력값 유지', () => {
    render(<Harness />);
    type(inputs()[1]!, '-360');
    expect(inputs().map((i) => i.getAttribute('aria-invalid'))).toEqual([null, 'true', null]);
    expect(screen.getByRole('alert').textContent).toBe(
      `조각 시각은 앞 조각과 같거나 늦어야 해요 — 2번 ${M}360µs 가 1번 ${M}350µs 보다 이릅니다`,
    );
    expect(q('[data-slot="launch-plan-alert"]')).not.toBeNull();
    expect(saveBtn()).toBeDisabled();
    expect(inputs()[1]!.value).toBe('-360');
  });

  it('1번 −3500 → 범위 문구 · 「-」 → 정수 문구 · 고치면 alert 사라짐', () => {
    render(<Harness />);
    type(inputs()[0]!, '-3500');
    expect(screen.getByRole('alert').textContent).toBe(`조각 시각은 ${M}3000 ~ 1000µs 사이여야 해요`);
    expect(inputs()[0]!.getAttribute('aria-invalid')).toBe('true');
    type(inputs()[0]!, '-');
    expect(screen.getByRole('alert').textContent).toBe('조각 시각은 정수 µs 여야 해요 — 1번');
    expect(inputs()[0]!.value).toBe('-');
    type(inputs()[0]!, '-350');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(inputs().every((i) => i.getAttribute('aria-invalid') === null)).toBe(true);
  });

  it('「되돌리기」 → 서버 값 · 서버 값과 같으면 저장 · 되돌리기 비활성', () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    expect(saveBtn()).toBeDisabled();
    expect(revertBtn()).toBeDisabled();
    type(inputs()[1]!, '-340');
    expect(saveBtn()).toBeEnabled();
    expect(revertBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(plus());
    fireEvent.click(revertBtn());
    expect(inputs().map((i) => i.value)).toEqual(['-350', '-345', '-325']);
    expect(saveBtn()).toBeDisabled();
    expect(revertBtn()).toBeDisabled();
  });

  it('저장 중 → 「저장 중…」 · 저장 비활성 · 입력은 그대로 쓸 수 있다', () => {
    render(<Harness saving />);
    type(inputs()[1]!, '-340');
    expect(saveBtn().textContent).toBe('저장 중…');
    expect(saveBtn()).toBeDisabled();
    expect(inputs()[1]!.disabled).toBe(false);
    expect(inputs()[1]!.value).toBe('-340');
  });
});

describe('LaunchPlanEditor — 09:00:30 한 칸', () => {
  it('칸 1 · 스테퍼 없음 · 라벨 「발사 시각(µs)」 · 2500 → 범위 문구', () => {
    render(<Harness fire="n0930" entry={N_ENTRY} />);
    expect(inputs()).toHaveLength(1);
    expect(q('[data-slot="launch-plan-stepper"]')).toBeNull();
    expect(inputs()[0]!.getAttribute('aria-label')).toBe('발사 시각(µs)');
    expect(q('[data-slot="launch-plan-editor"]')!.textContent).toContain('발사 시각');
    type(inputs()[0]!, '2500');
    expect(screen.getByRole('alert').textContent).toBe(`발사 시각은 ${M}2000 ~ 2000µs 사이여야 해요`);
    expect(saveBtn()).toBeDisabled();
    type(inputs()[0]!, '-190');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(saveBtn()).toBeEnabled();
  });
});

describe('LaunchPlanEditor — 결과 줄(D-27)', () => {
  it('failed code 1 → 칩 「KB120 · 실패」 title 「서버 미지원 · …」 · 줄 「… — 서버 업데이트 뒤 다시 저장」', () => {
    render(
      <Harness
        result={{
          result: { server: 'KB120', outcome: 'failed', code: 1, message: '알 수 없는 명령입니다' },
          at: new Date('2026-10-27T13:41:00Z'),
        }}
      />,
    );
    const chip = q('[data-slot="launch-plan-result"] [data-slot="reflect-chip"]')!;
    expect(chip.textContent).toBe('KB120 · 실패');
    expect(chip.getAttribute('title')).toBe('서버 미지원 · 알 수 없는 명령입니다');
    expect(q('[data-slot="launch-plan-result-line"]')!.textContent).toBe(
      'KB120 실패: 서버 미지원 · 알 수 없는 명령입니다 — 서버 업데이트 뒤 다시 저장',
    );
  });

  it('ok → 칩 「KB120」 · 「저장됨 · 22:41 · 다음 16:00 발사부터」', () => {
    render(<Harness result={{ result: { server: 'KB120', outcome: 'ok' }, at: new Date('2026-10-27T13:41:00Z') }} />);
    expect(q('[data-slot="launch-plan-result"] [data-slot="reflect-chip"]')!.textContent).toBe('KB120');
    expect(q('[data-slot="launch-plan-result-line"]')!.textContent).toBe('저장됨 · 22:41 · 다음 16:00 발사부터');
  });
});
