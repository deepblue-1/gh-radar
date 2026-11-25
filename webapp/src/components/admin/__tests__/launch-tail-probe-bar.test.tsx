import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import type { LaunchPlanServer, LaunchTailProbe, LaunchTailProbeChangeRow } from '@gh-radar/shared';

import type { LaunchPlanState } from '@/lib/launch-plan-view';

import {
  LaunchTailProbeEditor,
  LaunchTailProbeLine,
  type LaunchTailProbeEditorProps,
  type LaunchTailProbeLineProps,
} from '../launch-tail-probe-bar';

/**
 * quick-261125-lju — 시장 패널 안 「탐침」 줄(absent · loading · unknown · unsupported · set · off) · 묶음 표기 · 옛 값 꼬리 ·
 * 고치기 버튼 조건 · ⇄ · 이력 접힘(그 시장 + 옛 행) / 칩 편집 칸(− 접두 · + 정각 뒤 · 위반 · 전체 이동 · 추가 · 삭제 · 되돌리기 · 저장).
 */

const NOW = new Date('2026-11-07T07:00:00Z'); // KST 16:00
const M = '−';

function okServer(tail_probes?: LaunchTailProbe[]): LaunchPlanServer {
  return {
    status: 'ok',
    plan_rev: 7,
    updated_at: null,
    entries: [],
    ...(tail_probes ? { tail_probes } : {}),
  };
}

const FOUR: LaunchTailProbe[] = [
  { profile: 'Q16', count: 5, step_us: 0, market: 'K', offsets_us: [-210, -200, -190, -180, -170] },
  { profile: 'N', count: 0, step_us: 0, market: 'K', offsets_us: [] },
  { profile: 'Q16', count: 3, step_us: 0, market: 'Q', offsets_us: [-270, -270, -200] },
  { profile: 'N', count: 0, step_us: 0, market: 'Q', offsets_us: [] },
];
const LEGACY: LaunchTailProbe[] = [
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
    market: 'K',
    before_count: null,
    before_step_us: null,
    after_count: null,
    after_step_us: null,
    before_offsets_us: [-210],
    after_offsets_us: [],
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
const qa = (c: HTMLElement, slot: string) => Array.from(c.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`));

function line(over: Partial<LaunchTailProbeLineProps> = {}) {
  const props: LaunchTailProbeLineProps = {
    gateway: 'KB120',
    fire: 'q16',
    market: 'K',
    stateMarket: 'K',
    plan: ready({ KB120: okServer(FOUR) }),
    now: NOW,
    ...over,
  };
  return { ...render(<LaunchTailProbeLine {...props} />), props };
}

describe('LaunchTailProbeLine — 상태', () => {
  it('absent → 그리지 않는다', () => {
    const { container } = line({ plan: { kind: 'absent' } });
    expect(q(container, 'launch-tail-probe')).toBeNull();
  });

  it('loading → 스켈레톤(aria-busy) · 값 없음', () => {
    const { container } = line({ plan: { kind: 'loading' } });
    const bar = q(container, 'launch-tail-probe')!;
    expect(bar.dataset.state).toBe('loading');
    expect(bar.getAttribute('aria-busy')).toBe('true');
    expect(q(container, 'launch-tail-probe-summary')).toBeNull();
  });

  it('error · 서버 non-ok · 서버 없음 → unknown 「탐침 값을 읽지 못했어요」 · 고치기 버튼 없음', () => {
    for (const plan of [{ kind: 'error' } as const, ready({ KB120: { status: 'failed', code: 1, message: 'x' } }), ready({})]) {
      const { container, unmount } = line({ plan, onToggle: vi.fn() });
      expect(q(container, 'launch-tail-probe')!.dataset.state).toBe('unknown');
      expect(q(container, 'launch-tail-probe-summary')!.textContent).toBe('탐침 값을 읽지 못했어요');
      expect(q(container, 'launch-tail-probe-toggle')).toBeNull();
      unmount();
    }
  });

  it('unsupported — tail_probes 없음 → 경고색 문구만 · 옛 행 있으면 「 · 지금 뒤탐침 5발 10µs 간격」 · 버튼 없음', () => {
    const a = line({ plan: ready({ KB120: okServer() }), onToggle: vi.fn() });
    const s = q(a.container, 'launch-tail-probe-summary')!;
    expect(q(a.container, 'launch-tail-probe')!.dataset.state).toBe('unsupported');
    expect(s.dataset.tone).toBe('warn');
    expect(s.textContent).toBe('이 서버 버전은 시장별 탐침을 몰라요 — gh-trade 업데이트 뒤 바꿀 수 있어요');
    expect(q(a.container, 'launch-tail-probe-toggle')).toBeNull();
    a.unmount();
    const b = line({ plan: ready({ KB120: okServer(LEGACY) }), onToggle: vi.fn() });
    expect(q(b.container, 'launch-tail-probe-summary')!.textContent).toBe(
      '이 서버 버전은 시장별 탐침을 몰라요 — gh-trade 업데이트 뒤 바꿀 수 있어요 · 지금 뒤탐침 5발 10µs 간격',
    );
    expect(q(b.container, 'launch-tail-probe-toggle')).toBeNull();
  });

  it('set — 「탐침 5발 · −210 · −200 · −190 · −180 · −170µs」 · 같은 값은 「−270×2」 · 「탐침 고치기」/「닫기」', () => {
    const onToggle = vi.fn();
    const a = line({ onToggle });
    expect(q(a.container, 'launch-tail-probe')!.dataset.state).toBe('set');
    expect(q(a.container, 'launch-tail-probe-summary')!.textContent).toBe(
      `탐침 5발 · ${M}210 · ${M}200 · ${M}190 · ${M}180 · ${M}170µs`,
    );
    const t = q(a.container, 'launch-tail-probe-toggle')!;
    expect(t.textContent).toBe('탐침 고치기');
    fireEvent.click(t);
    expect(onToggle).toHaveBeenCalledTimes(1);
    a.unmount();
    const b = line({ market: 'Q', stateMarket: 'Q', onToggle, editing: true, children: <i data-slot="ed" /> });
    expect(q(b.container, 'launch-tail-probe-summary')!.textContent).toBe(`탐침 3발 · ${M}270×2 · ${M}200µs`);
    expect(q(b.container, 'launch-tail-probe-toggle')!.textContent).toBe('닫기');
    expect(q(b.container, 'ed')).not.toBeNull();
  });

  it('off — 「탐침 꺼짐 · 0발」 · 고치기 버튼 있음 · onToggle 없으면 버튼 없음', () => {
    const a = line({ fire: 'n0930', onToggle: vi.fn() });
    expect(q(a.container, 'launch-tail-probe')!.dataset.state).toBe('off');
    expect(q(a.container, 'launch-tail-probe-summary')!.textContent).toBe('탐침 꺼짐 · 0발');
    expect(q(a.container, 'launch-tail-probe-toggle')).not.toBeNull();
    a.unmount();
    const b = line({ fire: 'n0930' });
    expect(q(b.container, 'launch-tail-probe-toggle')).toBeNull();
  });

  it('stateMarket — 교보 N 공통이면 패널 Q 도 K 행을 읽는다', () => {
    const rows: LaunchTailProbe[] = [
      { profile: 'N', count: 1, step_us: 0, market: 'K', offsets_us: [-30] },
      { profile: 'N', count: 1, step_us: 0, market: 'Q', offsets_us: [-99] },
    ];
    const { container } = line({ gateway: 'KYOBO119', fire: 'n0930', market: 'Q', stateMarket: 'K', plan: ready({ KYOBO119: okServer(rows) }) });
    expect(q(container, 'launch-tail-probe-summary')!.textContent).toBe(`탐침 1발 · ${M}30µs`);
  });

  it('⇄ — 집합에 든 값 뒤에만 · title · 집합 없으면 0', () => {
    const a = line({ combined: new Set([-200, -170]), combinedTitle: '코스닥과 같은 시각 — 한 번에 쏨' });
    const marks = qa(a.container, 'launch-combined');
    expect(marks).toHaveLength(2);
    expect(marks[0]!.getAttribute('title')).toBe('코스닥과 같은 시각 — 한 번에 쏨');
    expect(marks.map((m) => m.closest<HTMLElement>('[data-slot="launch-tail-probe-value"]')!.dataset.us)).toEqual(['-200', '-170']);
    a.unmount();
    const b = line({ combined: null });
    expect(qa(b.container, 'launch-combined')).toHaveLength(0);
  });

  it('이력 접힘 「탐침 변경 이력 n」 — 그 시장 + 옛 행(market null)만 · 전 → 후 · 결과 알약', () => {
    const k = tpRow({ before_offsets_us: [-210], after_offsets_us: [] });
    const qRow = tpRow({ market: 'Q' });
    const legacy = tpRow({
      market: null,
      before_offsets_us: null,
      after_offsets_us: null,
      before_count: 3,
      before_step_us: 10,
      after_count: 5,
      after_step_us: 10,
      at: '2026-11-06T06:00:00Z',
    });
    const fail = tpRow({ outcome: 'failed', code: 1, message: '발 수는 0 ~ 10', at: '2026-11-07T05:00:00Z' });
    const n = tpRow({ fire: 'n0930' });
    const { container } = line({ plan: ready({ KB120: okServer(FOUR) }, [k, qRow, legacy, fail, n]) });
    const fold = q(container, 'launch-tail-probe-history-fold')!;
    expect(fold.querySelector('summary')!.textContent).toBe('탐침 변경 이력 3');
    const rows = Array.from(fold.querySelectorAll('tbody tr'));
    expect(rows.map((r) => r.querySelectorAll('td')[2]!.textContent)).toEqual([
      `1발 ${M}210µs → 꺼짐`,
      `1발 ${M}210µs → 꺼짐`,
      '뒤탐침 3발 10µs 간격 → 뒤탐침 5발 10µs 간격',
    ]);
    expect(qa(container, 'launch-tail-probe-outcome').map((o) => o.dataset.tone)).toEqual(['ok', 'err', 'ok']);
  });

  it('이력 없음 → 접힘 없음', () => {
    const { container } = line();
    expect(q(container, 'launch-tail-probe-history-fold')).toBeNull();
  });
});

describe('LaunchTailProbeEditor — 칩 편집 칸', () => {
  function ed(over: Partial<LaunchTailProbeEditorProps> = {}) {
    const props: LaunchTailProbeEditorProps = {
      gateway: 'KB120',
      fire: 'q16',
      market: 'K',
      server: [-210, -200],
      draft: ['210', '200'],
      planOffsets: [-260, -220],
      onDraft: vi.fn(),
      onSave: vi.fn(),
      ...over,
    };
    return { ...render(<LaunchTailProbeEditor {...props} />), props };
  }
  const btn = (c: HTMLElement, slot: string) => q(c, slot) as HTMLButtonElement;
  const shift = (c: HTMLElement, d: number) => c.querySelector<HTMLButtonElement>(`[data-slot="launch-tail-probe-shift"][data-delta="${d}"]`)!;
  const chips = (c: HTMLElement) => qa(c, 'launch-tail-probe-chip');
  const inputs = (c: HTMLElement) => qa(c, 'launch-tail-probe-chip-input') as HTMLInputElement[];

  it('칩 — 숫자만은 「−」 접두 · 「+30」 은 접두 없음 · aria-label · inputMode tel · 칩 순서 = 원문 순서', () => {
    const { container } = ed({ draft: ['+30', '210'] });
    const cs = chips(container);
    expect(cs.map((c) => c.firstElementChild!.textContent)).toEqual(['', M]);
    expect(inputs(container).map((i) => i.value)).toEqual(['+30', '210']);
    expect(inputs(container)[1]!.getAttribute('aria-label')).toBe('코스피 탐침 2번(정각 −µs)');
    expect(inputs(container)[0]!.getAttribute('inputmode')).toBe('tel');
  });

  it('입력 — 숫자와 + 만 남겨 onDraft(그 칸만 바뀐 배열)', () => {
    const { container, props } = ed();
    fireEvent.change(inputs(container)[1]!, { target: { value: '-1a95' } });
    expect(props.onDraft).toHaveBeenCalledWith(['210', '195']);
  });

  it('위반 — 칩 aria-invalid · 빨간 테두리 표식 · alert 한 줄(shared 문구) · 저장 비활성 · 전체 이동 8개 전부 비활성', () => {
    const { container } = ed({ draft: ['4000', 'x', '200'] });
    expect(inputs(container).map((i) => i.getAttribute('aria-invalid'))).toEqual(['true', 'true', null]);
    expect(chips(container).map((c) => c.dataset.bad ?? null)).toEqual(['true', 'true', null]);
    expect(q(container, 'launch-tail-probe-alert')!.textContent).toBe('탐침 시각은 −3000 ~ +1000µs 사이여야 해요');
    expect(btn(container, 'launch-tail-probe-save').disabled).toBe(true);
    expect(qa(container, 'launch-tail-probe-shift')).toHaveLength(8);
    expect(qa(container, 'launch-tail-probe-shift').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('전체 이동 — 한 발이라도 한도 밖이면 그 버튼만 비활성 · 누르면 onDraft(칸 순서 그대로 이동한 칩)', () => {
    const { container, props } = ed({ draft: ['2995', '+30'], server: [-2995, 30] });
    expect(shift(container, -10).disabled).toBe(true);
    expect(shift(container, -5).disabled).toBe(false);
    expect(shift(container, 10).disabled).toBe(false);
    expect(shift(container, -1).getAttribute('aria-label')).toBe('전체 −1µs');
    fireEvent.click(shift(container, 10));
    expect(props.onDraft).toHaveBeenCalledWith(['2985', '+40']);
  });

  it('전체 이동 — 빈 초안이면 전부 비활성', () => {
    const { container } = ed({ draft: [], server: [] });
    expect(qa(container, 'launch-tail-probe-shift').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('+ 추가 — 가장 늦은 유효 값 + 10 · 10칩이면 비활성 · 힌트 「n / 10발 …」', () => {
    const a = ed({ draft: ['210', 'x'] });
    fireEvent.click(btn(a.container, 'launch-tail-probe-add'));
    expect(a.props.onDraft).toHaveBeenCalledWith(['210', 'x', '200']);
    expect(q(a.container, 'launch-tail-probe-hint')!.textContent).toBe(
      '2 / 10발 · 정각 기준 · 숫자만 치면 정각 −, 정각 뒤는 앞에 + · 저장할 때 이른 시각부터 정렬',
    );
    a.unmount();
    const b = ed({ draft: Array(10).fill('100') });
    expect(btn(b.container, 'launch-tail-probe-add').disabled).toBe(true);
  });

  it('× 삭제 — 그 칩만 빠진 배열 · aria-label', () => {
    const { container, props } = ed({ draft: ['210', '200', '190'] });
    const del = qa(container, 'launch-tail-probe-chip-del');
    expect(del[1]!.getAttribute('aria-label')).toBe('탐침 2번 지우기');
    fireEvent.click(del[1]!);
    expect(props.onDraft).toHaveBeenCalledWith(['210', '190']);
  });

  it('되돌리기 = 서버 칩(같으면 비활성) · 저장 = 정렬 값이 서버와 다를 때만 · 입력 순서만 바뀐 같은 값은 비활성 · 저장 중 비활성', () => {
    const same = ed();
    expect(btn(same.container, 'launch-tail-probe-revert').disabled).toBe(true);
    expect(btn(same.container, 'launch-tail-probe-save').disabled).toBe(true);
    same.unmount();
    const reordered = ed({ draft: ['200', '210'] });
    expect(btn(reordered.container, 'launch-tail-probe-save').disabled).toBe(true);
    expect(btn(reordered.container, 'launch-tail-probe-revert').disabled).toBe(false);
    reordered.unmount();
    const diff = ed({ draft: ['210', '+30'] });
    expect(btn(diff.container, 'launch-tail-probe-save').disabled).toBe(false);
    fireEvent.click(btn(diff.container, 'launch-tail-probe-save'));
    expect(diff.props.onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(btn(diff.container, 'launch-tail-probe-revert'));
    expect(diff.props.onDraft).toHaveBeenCalledWith(['210', '200']);
    diff.unmount();
    const off = ed({ draft: [] });
    expect(btn(off.container, 'launch-tail-probe-save').disabled).toBe(false);
    off.unmount();
    const saving = ed({ draft: ['210', '+30'], saving: true });
    expect(btn(saving.container, 'launch-tail-probe-save').disabled).toBe(true);
    expect(btn(saving.container, 'launch-tail-probe-save').textContent).toBe('저장 중…');
  });

  it('힌트 — 「코스피 탐침만」 · 공통이면 「코스피 · 코스닥 공통」', () => {
    const a = ed();
    expect(a.container.textContent).toContain('µs · 코스피 탐침만 · − 더 이르게 · + 더 늦게');
    a.unmount();
    const b = ed({ gateway: 'KYOBO119', fire: 'n0930', market: 'Q', common: true, server: [-30], draft: ['30'], planOffsets: [-40] });
    expect(b.container.textContent).toContain('µs · 코스피 · 코스닥 공통 · − 더 이르게 · + 더 늦게');
  });

  it('⇄ — 유효 칩 값이 집합에 있으면 그 칩에만 · 위반 칩에는 없음', () => {
    const { container } = ed({ draft: ['210', '200', '4000'], combined: new Set([-200, -4000]), combinedTitle: 't' });
    expect(chips(container).map((c) => c.querySelector('[data-slot="launch-combined"]') !== null)).toEqual([false, true, false]);
  });

  it('결과 줄 — ok 「저장됨 · HH:MM · 다음 09:00:30 발사부터」 · failed 원문', () => {
    const at = new Date('2026-11-07T06:02:00Z'); // KST 15:02
    const a = ed({ fire: 'n0930', server: [-30], draft: ['30'], result: { result: { server: 'KB120', outcome: 'ok' }, at } });
    expect(q(a.container, 'launch-tail-probe-result-line')!.textContent).toBe('저장됨 · 15:02 · 다음 09:00:30 발사부터');
    expect(q(a.container, 'reflect-chip')!.textContent).toBe('KB120');
    a.unmount();
    const b = ed({ result: { result: { server: 'KB120', outcome: 'failed', code: 1, message: '오프셋은 작은 값부터 차례로' }, at } });
    expect(q(b.container, 'launch-tail-probe-result-line')!.textContent).toContain('오프셋은 작은 값부터 차례로');
  });
});
