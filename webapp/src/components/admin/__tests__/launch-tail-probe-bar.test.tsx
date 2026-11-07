import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import type { LaunchPlanServer, LaunchTailProbe, LaunchTailProbeChangeRow } from '@gh-radar/shared';

import type { LaunchPlanState } from '@/lib/launch-plan-view';

import { LaunchTailProbeBar } from '../launch-tail-probe-bar';

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
