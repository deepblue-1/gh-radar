import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import type { LaunchPlanChangeRow } from '@gh-radar/shared';

import type { PanelPlan } from '@/lib/launch-plan-view';

import { LaunchPlanBar } from '../launch-plan-bar';

/**
 * Phase 35 (35-14) — 「다음 발사 계획」 줄 · 마지막 변경 · 「변경 이력」 접힘(D-24 · D-25 · D-29).
 */

const M = '−';
const NOW = new Date('2026-10-27T15:00:00Z'); // KST 10/28 00:00
const SAME_DAY_NOW = new Date('2026-10-27T14:50:00Z'); // KST 10/27 23:50

let nextId = 1;
function row(over: Partial<LaunchPlanChangeRow> = {}): LaunchPlanChangeRow {
  return {
    id: nextId++,
    at: '2026-10-27T13:41:00Z',
    admin_email: 'a@b.c',
    gateway: 'KB120',
    fire: 'q16',
    market: 'Q',
    before_us: [-355, -350, -330],
    after_us: [-350, -345, -325],
    outcome: 'ok',
    code: null,
    message: null,
    plan_rev: 7,
    ...over,
  };
}

function plan(over: Partial<PanelPlan>): PanelPlan {
  return {
    source: 'server',
    lines: [-350, -345, -325],
    entry: { profile: 'Q16', market: 'Q', offsets_us: [-350, -345, -325] },
    fallbackUs: -337,
    lastChange: null,
    changes: [],
    ...over,
  };
}

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const qa = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));

describe('LaunchPlanBar', () => {
  it('source absent → 아무것도 그리지 않는다', () => {
    const { container } = render(<LaunchPlanBar fire="q16" plan={plan({ source: 'absent', entry: null })} />);
    expect(container.innerHTML).toBe('');
  });

  it('server → 라벨 「다음 발사 계획」 + 줄 「3조각 −350 · −345 · −325µs」', () => {
    render(<LaunchPlanBar fire="q16" plan={plan({})} now={SAME_DAY_NOW} />);
    expect(q('[data-slot="launch-plan-bar"]')!.textContent).toContain('다음 발사 계획');
    expect(q('[data-slot="launch-plan-line"]')!.textContent).toBe(`3조각 ${M}350 · ${M}345 · ${M}325µs`);
    expect(q('[data-slot="launch-plan-line"]')!.dataset.tone).toBeUndefined();
  });

  it('fallback → 「서버 연결 안 됨 · 마지막 발사 값 −337µs」(data-tone warn)', () => {
    render(<LaunchPlanBar fire="q16" plan={plan({ source: 'fallback', entry: null, lines: [-337] })} />);
    const line = q('[data-slot="launch-plan-line"]')!;
    expect(line.textContent).toBe(`서버 연결 안 됨 · 마지막 발사 값 ${M}337µs`);
    expect(line.dataset.tone).toBe('warn');
  });

  it('loading → 스켈레톤(aria-busy) · 줄 글 없음', () => {
    render(<LaunchPlanBar fire="q16" plan={plan({ source: 'loading', entry: null, lines: [-337] })} />);
    const bar = q('[data-slot="launch-plan-bar"]')!;
    expect(bar.getAttribute('aria-busy')).toBe('true');
    expect(q('[data-slot="launch-plan-line"]')).toBeNull();
  });

  it('server + lastChange → 「· 22:41 · a@b.c」 · 다른 날이면 「10/27 22:41」', () => {
    const r = row();
    const { unmount } = render(<LaunchPlanBar fire="q16" plan={plan({ lastChange: r, changes: [r] })} now={SAME_DAY_NOW} />);
    expect(q('[data-slot="launch-plan-last"]')!.textContent).toBe('· 22:41 · a@b.c');
    unmount();
    render(
      <LaunchPlanBar
        fire="q16"
        plan={plan({ lastChange: r, changes: [r] })}
        now={new Date('2026-10-28T01:00:00Z')}
      />,
    );
    expect(q('[data-slot="launch-plan-last"]')!.textContent).toBe('· 10/27 22:41 · a@b.c');
  });

  it('changes 12행 → 「변경 이력 12」 접힘 · 펼치면 10행 · 열 시각 · 이메일 · 전 → 후 · 결과 알약', () => {
    const changes = Array.from({ length: 12 }, (_, i) =>
      row({
        at: `2026-10-27T1${Math.floor(i / 6)}:${String((i % 6) * 10).padStart(2, '0')}:00Z`,
        outcome: i === 0 ? 'failed' : 'ok',
        code: i === 0 ? 1 : null,
        message: i === 0 ? '순서 위반' : null,
        before_us: i === 1 ? null : [-355, -350, -330],
      }),
    );
    render(<LaunchPlanBar fire="q16" plan={plan({ changes, lastChange: changes[1]! })} now={NOW} />);
    const details = q('details[data-slot="launch-plan-history-fold"]')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')!.textContent).toBe('변경 이력 12');
    fireEvent.click(details.querySelector('summary')!);
    const rows = qa('[data-slot="launch-plan-history"] tbody tr');
    expect(rows).toHaveLength(10);
    const cells = Array.from(rows[0]!.querySelectorAll('td')).map((td) => td.textContent);
    expect(cells[1]).toBe('a@b.c');
    expect(cells[2]).toBe(`${M}355 · ${M}350 · ${M}330 → ${M}350 · ${M}345 · ${M}325`);
    const pill = rows[0]!.querySelector<HTMLElement>('[data-slot="launch-plan-outcome"]')!;
    expect(pill.textContent).toBe('실패');
    expect(pill.dataset.tone).toBe('err');
    expect(pill.getAttribute('title')).toBe('순서 위반');
    expect(rows[1]!.querySelectorAll('td')[2]!.textContent).toBe(`— → ${M}350 · ${M}345 · ${M}325`);
    expect(rows[1]!.querySelector('[data-slot="launch-plan-outcome"]')!.textContent).toBe('저장됨');
  });

  it('changes 0 → 「변경 이력」 접힘 없음', () => {
    render(<LaunchPlanBar fire="q16" plan={plan({})} />);
    expect(q('[data-slot="launch-plan-history-fold"]')).toBeNull();
  });

  it('fallback 이어도 이력이 있으면 접힘을 보인다(서버 실패 원인 추적)', () => {
    const r = row({ outcome: 'offline' });
    render(<LaunchPlanBar fire="q16" plan={plan({ source: 'fallback', entry: null, lines: [-337], changes: [r] })} />);
    expect(q('[data-slot="launch-plan-history-fold"] summary')!.textContent).toBe('변경 이력 1');
    expect(q('[data-slot="launch-plan-last"]')).toBeNull();
  });
});
