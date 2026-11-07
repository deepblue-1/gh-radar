import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import type { LaunchPlanServer, LaunchTailProbe, LaunchTailProbeChangeRow } from '@gh-radar/shared';

import type { LaunchPlanState } from '@/lib/launch-plan-view';

import { LaunchTailProbeBar, LaunchTailProbeEditor, type LaunchTailProbeEditorProps } from '../launch-tail-probe-bar';

/**
 * quick-261107-l7w — 「<서버> 뒤탐침」 줄 상태(absent · loading · unknown · unsupported · set · off) · 고치기 버튼 조건 ·
 * 변경 이력 접힘(그 서버 · 그 발사 행만).
 */

const NOW = new Date('2026-11-07T07:00:00Z'); // KST 16:00

function okServer(tail_probes?: LaunchTailProbe[]): LaunchPlanServer {
  return {
    status: 'ok',
    plan_rev: 7,
    updated_at: null,
    entries: [],
    ...(tail_probes ? { tail_probes } : {}),
  };
}

const TP: LaunchTailProbe[] = [
  { profile: 'Q16', count: 5, step_us: 10 },
  { profile: 'N', count: 0, step_us: 10 },
];

let nextId = 1;
function tpRow(over: Partial<LaunchTailProbeChangeRow> = {}): LaunchTailProbeChangeRow {
  return {
    id: nextId++,
    at: '2026-11-07T06:00:00Z',
    admin_email: 'a@b.c',
    gateway: 'KB120',
    fire: 'q16',
    before_count: 5,
    before_step_us: 10,
    after_count: 3,
    after_step_us: 20,
    outcome: 'ok',
    code: null,
    message: null,
    plan_rev: 8,
    ...over,
  };
}

function ready(servers: Record<string, LaunchPlanServer>, tail_probe_changes: LaunchTailProbeChangeRow[] = []): LaunchPlanState {
  return { kind: 'ready', resp: { servers, changes: [], tail_probe_changes } };
}

const q = (c: HTMLElement, slot: string) => c.querySelector<HTMLElement>(`[data-slot="${slot}"]`);

describe('LaunchTailProbeBar — 상태', () => {
  it('absent → 그리지 않는다', () => {
    const { container } = render(<LaunchTailProbeBar gateway="KB120" fire="q16" plan={{ kind: 'absent' }} />);
    expect(q(container, 'launch-tail-probe')).toBeNull();
  });

  it('loading → 스켈레톤(aria-busy) · 값 줄 없음', () => {
    const { container } = render(<LaunchTailProbeBar gateway="KB120" fire="q16" plan={{ kind: 'loading' }} />);
    const bar = q(container, 'launch-tail-probe')!;
    expect(bar.dataset.state).toBe('loading');
    expect(bar.getAttribute('aria-busy')).toBe('true');
    expect(q(container, 'launch-tail-probe-summary')).toBeNull();
  });

  it('error · 서버 non-ok → unknown 「뒤탐침 값을 읽지 못했어요」 · 고치기 버튼 없음', () => {
    for (const plan of [
      { kind: 'error' } as const,
      ready({ KB120: { status: 'failed', code: 1, message: 'x' } }),
      ready({}),
    ]) {
      const { container, unmount } = render(
        <LaunchTailProbeBar gateway="KB120" fire="q16" plan={plan} onToggle={vi.fn()} />,
      );
      expect(q(container, 'launch-tail-probe')!.dataset.state).toBe('unknown');
      expect(q(container, 'launch-tail-probe-summary')!.textContent).toBe('뒤탐침 값을 읽지 못했어요');
      expect(q(container, 'launch-tail-probe-toggle')).toBeNull();
      unmount();
    }
  });

  it('ok 인데 tail_probes 없음 → unsupported 경고 한 줄 원문 · data-tone warn · 고치기 버튼 없음', () => {
    const { container } = render(
      <LaunchTailProbeBar gateway="KB120" fire="q16" plan={ready({ KB120: okServer() })} onToggle={vi.fn()} />,
    );
    const summary = q(container, 'launch-tail-probe-summary')!;
    expect(q(container, 'launch-tail-probe')!.dataset.state).toBe('unsupported');
    expect(summary.dataset.tone).toBe('warn');
    expect(summary.textContent).toBe('이 서버 버전은 뒤탐침 설정을 몰라요 — gh-trade 업데이트 뒤 바꿀 수 있어요');
    expect(q(container, 'launch-tail-probe-toggle')).toBeNull();
  });

  it('set 5/10 → 머리 「KB120 뒤탐침」 + 부제 · 값 「5발 · 10µs 간격 · 마지막 조각 뒤 +10 ~ +50µs」 · 고치기 버튼', () => {
    const { container } = render(
      <LaunchTailProbeBar gateway="KB120" fire="q16" plan={ready({ KB120: okServer(TP) })} onToggle={vi.fn()} />,
    );
    expect(q(container, 'launch-tail-probe')!.dataset.state).toBe('set');
    expect(q(container, 'launch-tail-probe-title')!.textContent).toBe('KB120 뒤탐침');
    expect(container.textContent).toContain('코스피 · 코스닥 공통');
    expect(q(container, 'launch-tail-probe-summary')!.textContent).toBe('5발 · 10µs 간격 · 마지막 조각 뒤 +10 ~ +50µs');
    expect(q(container, 'launch-tail-probe-summary')!.dataset.tone).toBeUndefined();
    expect(q(container, 'launch-tail-probe-toggle')!.textContent).toBe('뒤탐침 고치기');
  });

  it('set 1/10 → 「… 마지막 조각 뒤 +10µs」', () => {
    const plan = ready({ KB120: okServer([{ profile: 'Q16', count: 1, step_us: 10 }]) });
    const { container } = render(<LaunchTailProbeBar gateway="KB120" fire="q16" plan={plan} />);
    expect(q(container, 'launch-tail-probe-summary')!.textContent).toBe('1발 · 10µs 간격 · 마지막 조각 뒤 +10µs');
  });

  it('n0930 · N 0발 → off 「꺼짐 · 0발」 · 고치기 버튼 있음(set 계열)', () => {
    const { container } = render(
      <LaunchTailProbeBar gateway="KB120" fire="n0930" plan={ready({ KB120: okServer(TP) })} onToggle={vi.fn()} />,
    );
    expect(q(container, 'launch-tail-probe')!.dataset.state).toBe('off');
    expect(q(container, 'launch-tail-probe-summary')!.textContent).toBe('꺼짐 · 0발');
    expect(q(container, 'launch-tail-probe-toggle')).not.toBeNull();
  });

  it('교보119 라벨 · onToggle 없으면 버튼 없음 · editing 이면 「닫기」 + children', () => {
    const plan = ready({ KYOBO119: okServer(TP) });
    const { container, rerender } = render(<LaunchTailProbeBar gateway="KYOBO119" fire="q16" plan={plan} />);
    expect(q(container, 'launch-tail-probe-title')!.textContent).toBe('교보119 뒤탐침');
    expect(q(container, 'launch-tail-probe-toggle')).toBeNull();
    rerender(
      <LaunchTailProbeBar gateway="KYOBO119" fire="q16" plan={plan} editing onToggle={vi.fn()}>
        <div data-slot="editor-slot" />
      </LaunchTailProbeBar>,
    );
    expect(q(container, 'launch-tail-probe-toggle')!.textContent).toBe('닫기');
    expect(q(container, 'editor-slot')).not.toBeNull();
  });
});

describe('LaunchTailProbeBar — 변경 이력', () => {
  it('그 서버 · 그 발사 행만 · 「변경 이력 n」 · 전 → 후 · 결과 알약', () => {
    const rows = [
      tpRow({ at: '2026-11-07T06:00:00Z' }),
      tpRow({
        at: '2026-11-07T05:00:00Z',
        outcome: 'failed',
        code: 1,
        message: '뒤탐침 발 수 범위 밖',
        before_count: null,
        before_step_us: null,
        after_count: 12,
      }),
      tpRow({ fire: 'n0930' }),
      tpRow({ gateway: 'KYOBO119' }),
    ];
    const { container } = render(
      <LaunchTailProbeBar gateway="KB120" fire="q16" plan={ready({ KB120: okServer(TP) }, rows)} now={NOW} />,
    );
    const fold = q(container, 'launch-tail-probe-history-fold')!;
    expect(fold.querySelector('summary')!.textContent).toBe('변경 이력 2');
    const trs = Array.from(fold.querySelectorAll('tbody tr'));
    expect(trs.map((tr) => tr.querySelectorAll('td')[2]!.textContent)).toEqual(['5발 · 10µs → 3발 · 20µs', '— → 12발 · 20µs']);
    const pills = Array.from(fold.querySelectorAll<HTMLElement>('[data-slot="launch-tail-probe-outcome"]'));
    expect(pills.map((p) => p.textContent)).toEqual(['저장됨', '실패']);
    expect(pills[1]!.title).toBe('뒤탐침 발 수 범위 밖');
    expect(trs[0]!.querySelectorAll('td')[0]!.textContent).toBe('15:00');
  });

  it('이력 없음 → 접힘 없음', () => {
    const { container } = render(<LaunchTailProbeBar gateway="KB120" fire="q16" plan={ready({ KB120: okServer(TP) })} />);
    expect(q(container, 'launch-tail-probe-history-fold')).toBeNull();
  });
});

describe('LaunchTailProbeEditor — 편집 칸', () => {
  function ed(over: Partial<LaunchTailProbeEditorProps> = {}) {
    const props: LaunchTailProbeEditorProps = {
      gateway: 'KB120',
      fire: 'q16',
      server: { count: 5, step_us: 10 },
      count: 5,
      stepRaw: '10',
      preview: { count: 5, step_us: 10 },
      onDraft: vi.fn(),
      onSave: vi.fn(),
      ...over,
    };
    return { ...render(<LaunchTailProbeEditor {...props} />), props };
  }
  const btn = (c: HTMLElement, slot: string) => q(c, slot) as HTMLButtonElement;

  it('스테퍼 −/+ 는 0 · 10 에서 비활성 · 누르면 onDraft(count ∓ 1, 원문) · 힌트 「0 ~ 10 · 0 = 끔」', () => {
    const a = ed({ count: 0, stepRaw: '10', preview: { count: 0, step_us: 10 } });
    expect(btn(a.container, 'launch-tail-probe-dec').disabled).toBe(true);
    expect(btn(a.container, 'launch-tail-probe-inc').disabled).toBe(false);
    expect(a.container.textContent).toContain('0 ~ 10 · 0 = 끔');
    fireEvent.click(btn(a.container, 'launch-tail-probe-inc'));
    expect(a.props.onDraft).toHaveBeenCalledWith(1, '10');
    a.unmount();
    const b = ed({ count: 10 });
    expect(btn(b.container, 'launch-tail-probe-inc').disabled).toBe(true);
    fireEvent.click(btn(b.container, 'launch-tail-probe-dec'));
    expect(b.props.onDraft).toHaveBeenCalledWith(9, '10');
  });

  it.each([
    ['0', '간격은 1 ~ 100µs 사이여야 해요'],
    ['101', '간격은 1 ~ 100µs 사이여야 해요'],
    ['1.5', '간격은 정수 µs 여야 해요'],
    ['', '간격은 정수 µs 여야 해요'],
  ])('간격 %j → alert 원문 · aria-invalid · 저장 비활성 · 칩은 직전 유효 값', (raw, msg) => {
    const { container } = ed({ count: 3, stepRaw: raw, preview: { count: 3, step_us: 20 } });
    expect(q(container, 'launch-tail-probe-alert')!.textContent).toBe(msg);
    expect(q(container, 'launch-tail-probe-step')!.getAttribute('aria-invalid')).toBe('true');
    expect(btn(container, 'launch-tail-probe-save').disabled).toBe(true);
    expect(Array.from(container.querySelectorAll('[data-slot="launch-tail-probe-chip"]')).map((c) => c.textContent)).toEqual([
      '+20µs',
      '+40µs',
      '+60µs',
    ]);
  });

  it('예정 칩 3/20 → +20 · +40 · +60µs / count 0 → 「뒤탐침을 쏘지 않아요」', () => {
    const a = ed({ count: 3, stepRaw: '20', preview: { count: 3, step_us: 20 } });
    expect(Array.from(a.container.querySelectorAll('[data-slot="launch-tail-probe-chip"]')).map((c) => c.textContent)).toEqual([
      '+20µs',
      '+40µs',
      '+60µs',
    ]);
    a.unmount();
    const b = ed({ count: 0, stepRaw: '10', preview: { count: 0, step_us: 10 } });
    expect(q(b.container, 'launch-tail-probe-preview-off')!.textContent).toBe('뒤탐침을 쏘지 않아요');
  });

  it('되돌리기 = 서버 값(같으면 비활성) · 저장 = 유효 · 다름 · 저장 중 아님일 때만 · 입력 onChange → onDraft', () => {
    const same = ed();
    expect(btn(same.container, 'launch-tail-probe-revert').disabled).toBe(true);
    expect(btn(same.container, 'launch-tail-probe-save').disabled).toBe(true);
    same.unmount();
    const diff = ed({ count: 3, stepRaw: '20', preview: { count: 3, step_us: 20 } });
    expect(btn(diff.container, 'launch-tail-probe-save').disabled).toBe(false);
    fireEvent.click(btn(diff.container, 'launch-tail-probe-save'));
    expect(diff.props.onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(btn(diff.container, 'launch-tail-probe-revert'));
    expect(diff.props.onDraft).toHaveBeenCalledWith(5, '10');
    fireEvent.change(q(diff.container, 'launch-tail-probe-step')!, { target: { value: '30' } });
    expect(diff.props.onDraft).toHaveBeenCalledWith(3, '30');
    diff.unmount();
    const saving = ed({ count: 3, stepRaw: '20', preview: { count: 3, step_us: 20 }, saving: true });
    expect(btn(saving.container, 'launch-tail-probe-save').disabled).toBe(true);
    expect(btn(saving.container, 'launch-tail-probe-save').textContent).toBe('저장 중…');
  });

  it('결과 줄 — ok 「저장됨 · HH:MM · 다음 09:00:30 발사부터」 · failed code 1 「알 수 없는 명령입니다」 → 서버 미지원', () => {
    const at = new Date('2026-11-07T06:02:00Z'); // KST 15:02
    const a = ed({ fire: 'n0930', result: { result: { server: 'KB120', outcome: 'ok' }, at } });
    expect(q(a.container, 'launch-tail-probe-result-line')!.textContent).toBe('저장됨 · 15:02 · 다음 09:00:30 발사부터');
    expect(q(a.container, 'reflect-chip')!.textContent).toBe('KB120');
    a.unmount();
    const b = ed({ result: { result: { server: 'KB120', outcome: 'failed', code: 1, message: '알 수 없는 명령입니다' }, at } });
    expect(q(b.container, 'launch-tail-probe-result-line')!.textContent).toContain('서버 미지원');
  });
});
