import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { launchTailProbeChipText, type LaunchFire, type LaunchPlanEntry } from '@gh-radar/shared';

import { planEditOf, planEditWithDraft } from '@/lib/launch-plan-view';

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
  const [draft, setDraft] = useState<string[]>(entry.offsets_us.map(launchTailProbeChipText));
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
    expect(inputs()[3]!.value).toBe('325');
    expect(stepper.textContent).toContain('4');

    fireEvent.click(minus());
    fireEvent.click(minus());
    expect(inputs()).toHaveLength(2);
    expect(inputs().map((i) => i.value)).toEqual(['350', '345']);
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

  it('칸 번호 1..n · inputMode tel(+ 입력) · aria-label 「{n}번 조각 시각(µs)」', () => {
    render(<Harness />);
    expect(inputs().map((i) => i.getAttribute('aria-label'))).toEqual([
      '1번 조각 시각(µs)',
      '2번 조각 시각(µs)',
      '3번 조각 시각(µs)',
    ]);
    expect(inputs().every((i) => i.inputMode === 'tel')).toBe(true);
  });
});

describe('LaunchPlanEditor — 칸 순서 자유 · 저장 때 정렬(fast-261125)', () => {
  it('맨 뒤 칸에 가장 이른 값 → 칸을 벗어나도 그 자리 그대로 · 오류 없음 · 저장 가능', () => {
    render(<Harness />);
    type(inputs()[2]!, '400');
    fireEvent.blur(inputs()[2]!);
    expect(inputs().map((i) => i.value)).toEqual(['350', '345', '400']);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(saveBtn()).toBeEnabled();
  });

  it('순서만 바꾼 같은 값 → 바뀐 것 없음(저장 비활성)', () => {
    render(<Harness />);
    type(inputs()[0]!, '325');
    type(inputs()[2]!, '350');
    expect(inputs().map((i) => i.value)).toEqual(['325', '345', '350']);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(saveBtn()).toBeDisabled();
  });
});

describe('LaunchPlanEditor — 검증 표시(D-26 · D-34)', () => {
  it('1번 +200(폭 545 · 가장 늦은 값이 앞 칸) → 그 칸만 aria-invalid · 폭 문구 · 저장 비활성 · 입력값 유지', () => {
    render(<Harness />);
    type(inputs()[0]!, '+200');
    expect(inputs().map((i) => i.getAttribute('aria-invalid'))).toEqual(['true', null, null]);
    expect(screen.getByRole('alert').textContent).toBe(
      '조각 시각은 가장 이른 조각과 가장 늦은 조각 차이가 500µs 이하여야 해요 — 지금 545µs',
    );
    expect(q('[data-slot="launch-plan-alert"]')).not.toBeNull();
    expect(saveBtn()).toBeDisabled();
    expect(inputs()[0]!.value).toBe('+200');
  });

  it('1번 −3500 → 범위 문구 · 빈 칸 → 숫자 문구 · 고치면 alert 사라짐', () => {
    render(<Harness />);
    type(inputs()[0]!, '3500');
    expect(screen.getByRole('alert').textContent).toBe(`조각 시각은 ${M}3000 ~ 1000µs 사이여야 해요`);
    expect(inputs()[0]!.getAttribute('aria-invalid')).toBe('true');
    type(inputs()[0]!, '');
    expect(screen.getByRole('alert').textContent).toBe('조각 시각은 숫자만 써요 — 정각 뒤는 앞에 + (1번)');
    expect(inputs()[0]!.value).toBe('');
    type(inputs()[0]!, '350');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(inputs().every((i) => i.getAttribute('aria-invalid') === null)).toBe(true);
  });

  it('3번 +151(폭 501) → 마지막 칸만 aria-invalid · 폭 문구 · 저장 비활성 · 150 으로 고치면 저장 가능 (fix 노트)', () => {
    render(<Harness />);
    type(inputs()[2]!, '+151');
    expect(inputs().map((i) => i.getAttribute('aria-invalid'))).toEqual([null, null, 'true']);
    expect(screen.getByRole('alert').textContent).toBe(
      '조각 시각은 가장 이른 조각과 가장 늦은 조각 차이가 500µs 이하여야 해요 — 지금 501µs',
    );
    expect(saveBtn()).toBeDisabled();
    type(inputs()[2]!, '+150');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(saveBtn()).toBeEnabled();
  });

  it('「되돌리기」 → 서버 값 · 서버 값과 같으면 저장 · 되돌리기 비활성', () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    expect(saveBtn()).toBeDisabled();
    expect(revertBtn()).toBeDisabled();
    type(inputs()[1]!, '340');
    expect(saveBtn()).toBeEnabled();
    expect(revertBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(plus());
    fireEvent.click(revertBtn());
    expect(inputs().map((i) => i.value)).toEqual(['350', '345', '325']);
    expect(saveBtn()).toBeDisabled();
    expect(revertBtn()).toBeDisabled();
  });

  it('저장 중 → 「저장 중…」 · 저장 비활성 · 입력은 그대로 쓸 수 있다', () => {
    render(<Harness saving />);
    type(inputs()[1]!, '340');
    expect(saveBtn().textContent).toBe('저장 중…');
    expect(saveBtn()).toBeDisabled();
    expect(inputs()[1]!.disabled).toBe(false);
    expect(inputs()[1]!.value).toBe('340');
  });
});

describe('LaunchPlanEditor — 09:00:30 한 칸', () => {
  it('칸 1 · 스테퍼 없음 · 라벨 「발사 시각(µs)」 · +2500 → 범위 문구', () => {
    render(<Harness fire="n0930" entry={N_ENTRY} />);
    expect(inputs()).toHaveLength(1);
    expect(q('[data-slot="launch-plan-stepper"]')).toBeNull();
    expect(inputs()[0]!.getAttribute('aria-label')).toBe('발사 시각(µs)');
    expect(q('[data-slot="launch-plan-editor"]')!.textContent).toContain('발사 시각');
    type(inputs()[0]!, '+2500');
    expect(screen.getByRole('alert').textContent).toBe(`발사 시각은 ${M}2000 ~ 2000µs 사이여야 해요`);
    expect(saveBtn()).toBeDisabled();
    type(inputs()[0]!, '190');
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

  it('failed code 1 · 폭 거부 문구 → 칩 title 원문 · 줄 「KB120 실패: <원문>」 · 서버 미지원 아님', () => {
    const span = '시각 목록 폭 상한 밖(마지막 − 첫 ≤ 500µs)';
    render(
      <Harness result={{ result: { server: 'KB120', outcome: 'failed', code: 1, message: span }, at: new Date('2026-10-27T13:41:00Z') }} />,
    );
    const chip = q('[data-slot="launch-plan-result"] [data-slot="reflect-chip"]')!;
    expect(chip.textContent).toBe('KB120 · 실패');
    expect(chip.getAttribute('title')).toBe(span);
    expect(q('[data-slot="launch-plan-result-line"]')!.textContent).toBe(`KB120 실패: ${span}`);
    expect(q('[data-slot="launch-plan-result"]')!.textContent).not.toContain('서버 미지원');
  });

  it('ok → 칩 「KB120」 · 「저장됨 · 22:41 · 다음 16:00 발사부터」', () => {
    render(<Harness result={{ result: { server: 'KB120', outcome: 'ok' }, at: new Date('2026-10-27T13:41:00Z') }} />);
    expect(q('[data-slot="launch-plan-result"] [data-slot="reflect-chip"]')!.textContent).toBe('KB120');
    expect(q('[data-slot="launch-plan-result-line"]')!.textContent).toBe('저장됨 · 22:41 · 다음 16:00 발사부터');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// − 고정 접두 · 미리보기 표 없음(261127)
// ─────────────────────────────────────────────────────────────────────────────

/** 부모(지도 탭)처럼 편집 상태를 쥔다 — `planEditOf` 가 칩 원문으로 칸을 채운다. */
function EditHarness({ entry = Q_ENTRY }: { entry?: LaunchPlanEntry }) {
  const [edit, setEdit] = useState(() => planEditOf('KB120', 'Q', 'q16', entry.offsets_us));
  return (
    <>
      <LaunchPlanEditor
        gateway="KB120"
        fire="q16"
        entry={entry}
        draft={edit.draft}
        onDraft={(d) => setEdit((e) => planEditWithDraft(e, d))}
        onSave={() => {}}
      />
      <output data-slot="valid">{edit.valid.join(',')}</output>
    </>
  );
}

const prefixOf = (el: HTMLInputElement) => el.previousElementSibling!.textContent;

describe('LaunchPlanEditor — − 고정 접두(탐침 칩과 같은 규칙)', () => {
  it('서버 값은 절댓값 칩으로 열리고 칸 앞에 − · 「-」 를 쳐도 지워진다', () => {
    render(<EditHarness />);
    expect(inputs().map((i) => i.value)).toEqual(['350', '345', '325']);
    expect(inputs().map(prefixOf)).toEqual([M, M, M]);
    type(inputs()[0]!, '-348');
    expect(inputs()[0]!.value).toBe('348');
    expect(q('[data-slot="valid"]')!.textContent).toBe('-348,-345,-325');
  });

  it('+ 로 시작하면 정각 뒤(양수) · 접두 − 가 사라진다 · 「+」 만은 숫자 문구', () => {
    render(<EditHarness entry={{ profile: 'Q16', market: 'Q', offsets_us: [-100] }} />);
    type(inputs()[0]!, '+50');
    expect(prefixOf(inputs()[0]!)).toBe('');
    expect(q('[data-slot="valid"]')!.textContent).toBe('50');
    type(inputs()[0]!, '+');
    expect(screen.getByRole('alert').textContent).toBe('조각 시각은 숫자만 써요 — 정각 뒤는 앞에 + (1번)');
    expect(q('[data-slot="valid"]')!.textContent).toBe('50');
  });

  it('「지금 / 바꿀 / 쐈다면」 미리보기 표는 그리지 않는다', () => {
    render(<EditHarness />);
    expect(document.querySelector('[data-slot="launch-plan-preview"]')).toBeNull();
    expect(document.querySelector('table')).toBeNull();
  });
});
