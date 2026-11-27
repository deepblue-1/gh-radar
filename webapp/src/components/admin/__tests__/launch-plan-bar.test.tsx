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

  it('변경 이력 표는 그리지 않는다(261127) — 이력이 있어도 접힘 없음 · 마지막 변경 한 줄은 그대로', () => {
    const changes = [row({ outcome: 'failed', code: 1, message: '순서 위반' }), row({})];
    render(<LaunchPlanBar fire="q16" plan={plan({ changes, lastChange: changes[1]! })} now={NOW} />);
    expect(q('[data-slot="launch-plan-history-fold"]')).toBeNull();
    expect(document.querySelector('table')).toBeNull();
    expect(q('[data-slot="launch-plan-last"]')).not.toBeNull();
  });

  it('fallback 은 이력이 있어도 접힘 · 마지막 변경 줄 없음', () => {
    const r = row({ outcome: 'offline' });
    render(<LaunchPlanBar fire="q16" plan={plan({ source: 'fallback', entry: null, lines: [-337], changes: [r] })} />);
    expect(q('[data-slot="launch-plan-history-fold"]')).toBeNull();
    expect(q('[data-slot="launch-plan-last"]')).toBeNull();
  });
});

describe('LaunchPlanBar — ⇄ 다른 시장과 한 번에 쏨(quick-261125-lju)', () => {
  it('집합 없음 · 빈 집합 → planLineText 그대로(글자 하나 다르지 않음) · ⇄ 0', () => {
    const a = render(<LaunchPlanBar fire="q16" plan={plan({})} />);
    const text = q('[data-slot="launch-plan-line"]')!.textContent;
    expect(text).toBe(`3조각 ${M}350 · ${M}345 · ${M}325µs`);
    expect(qa('[data-slot="launch-combined"]')).toHaveLength(0);
    a.unmount();
    render(<LaunchPlanBar fire="q16" plan={plan({})} combined={new Set()} />);
    expect(q('[data-slot="launch-plan-line"]')!.textContent).toBe(text);
    expect(qa('[data-slot="launch-combined"]')).toHaveLength(0);
  });

  it('집합에 든 값 뒤에만 ⇄ · title · 같은 꼴(「3조각 」 + 값들 + µs)', () => {
    render(
      <LaunchPlanBar
        fire="q16"
        plan={plan({})}
        combined={new Set([-345, -999])}
        combinedTitle="코스닥과 같은 시각 — 한 번에 쏨"
      />,
    );
    const marks = qa('[data-slot="launch-combined"]');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.getAttribute('title')).toBe('코스닥과 같은 시각 — 한 번에 쏨');
    expect(marks[0]!.closest<HTMLElement>('[data-slot="launch-plan-value"]')!.dataset.us).toBe('-345');
    expect(q('[data-slot="launch-plan-line"]')!.textContent).toBe(`3조각 ${M}350 · ${M}345⇄ · ${M}325µs`);
  });

  it('옛 꼬리 슬롯은 없다', () => {
    render(<LaunchPlanBar fire="q16" plan={plan({ lastChange: row() })} now={SAME_DAY_NOW} />);
    expect(qa('[data-slot="launch-plan-tail"]')).toHaveLength(0);
  });
});

describe('LaunchPlanBar — 08:30 「이 서버는 08:30 발사를 모름」(quick-261125-c2i)', () => {
  it('source unsupported → 경고 줄 · 「계획 고치기」 비활성 · title 같은 문구 · 「서버 연결 안 됨」 없음 · 편집 칸 안 열림', () => {
    let toggled = 0;
    render(
      <LaunchPlanBar
        fire="g0830"
        plan={plan({ source: 'unsupported', entry: null, lines: [], fallbackUs: 9000 })}
        editing
        onToggle={() => {
          toggled++;
        }}
      >
        <div data-slot="editor-child" />
      </LaunchPlanBar>,
    );
    const line = q('[data-slot="launch-plan-line"]')!;
    expect(line.textContent).toBe('이 서버는 08:30 발사를 모름');
    expect(line.dataset.tone).toBe('warn');
    expect(q('[data-slot="launch-plan-bar"]')!.textContent).not.toContain('서버 연결 안 됨');
    const btn = q('[data-slot="launch-plan-edit-toggle"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe('이 서버는 08:30 발사를 모름');
    expect(btn.textContent).toBe('계획 고치기');
    fireEvent.click(btn);
    expect(toggled).toBe(0);
    expect(q('[data-slot="editor-child"]')).toBeNull();
  });

  it('g0830 server → 한 값 줄 「+12,000µs」 · 고치기 켜짐', () => {
    render(
      <LaunchPlanBar
        fire="g0830"
        plan={plan({ entry: { profile: 'G2', market: 'K', offsets_us: [12000] }, lines: [12000] })}
        onToggle={() => {}}
      />,
    );
    expect(q('[data-slot="launch-plan-line"]')!.textContent).toBe('+12,000µs');
    expect((q('[data-slot="launch-plan-edit-toggle"]') as HTMLButtonElement).disabled).toBe(false);
  });
});
