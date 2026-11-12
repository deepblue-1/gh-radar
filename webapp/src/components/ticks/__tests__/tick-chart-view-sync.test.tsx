import { StrictMode, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';

import { tickBoundsOf } from '@/lib/ticks/tick-chart';
import { SYNTH_DATE, a3Msg, b6Msg, synthSession } from '@/test-fixtures/tick-synth';

import { TickChart } from '../tick-chart';

/**
 * Phase 42 Plan 08 Task 1 — 선 차트 선택 입력 둘(`initialView` · `onViewChange`) · `titleAddon` (D-24 · SC-1).
 *
 * 깨지면: 선 차트 ↔ 봉 차트를 바꿀 때 보던 구간을 잃거나, 새 입력을 안 줘도 선 차트 동작이 바뀐다.
 */

const B = tickBoundsOf(SYNTH_DATE);
const H5 = B.T0 + 5 * 3_600_000; // 13:00

/** tick-chart.test 와 같은 꼴의 짧은 하루(13:00 근처 체결 몇 개). */
const krx = synthSession([
  [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
  [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
  [1.5, b6Msg({ seq: 104, ask1: [16450, 10], bid1: [16400, 20] })],
  [2, a3Msg({ seq: 105, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000002000' })],
  [5, a3Msg({ seq: 107, bs: '1', px: 16300, qty: 400, time: '130000005000' })],
  [5.5, b6Msg({ seq: 108, ask1: [16400, 1], bid1: [16300, 2] })],
]);

type Snap = { t0: number; t1: number; preset: 'full' | 'reg' | 'last2h' | null };
type Props = Parameters<typeof TickChart>[0] & { initialView?: Snap; onViewChange?: (v: Snap) => void };

/** 새 선택 입력은 이 플랜이 더한다 — 그 전 타입에 없어도 렌더는 된다. */
const Chart = TickChart as unknown as (p: Props) => ReactElement;

function el(extra: Partial<Props> = {}) {
  return <Chart session={krx} cursorRec={1} onSeekMs={vi.fn()} onJumpRec={vi.fn()} {...extra} />;
}

function setup(extra: Partial<Props> = {}, strict = false) {
  const r = render(strict ? <StrictMode>{el(extra)}</StrictMode> : el(extra));
  const slot = (s: string) => r.container.querySelector(`[data-slot="${s}"]`) as HTMLElement | SVGElement;
  const span = () => slot('tick-chart-span').textContent;
  const svg = () => slot('tick-chart-svg') as SVGSVGElement;
  return { ...r, span, svg };
}

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

describe('TickChart — 보기 창 주고받기(D-24)', () => {
  it('새 입력을 안 주면 지금과 같다 — 숨김 없음 · 「하루 전체」', () => {
    const { span, svg } = setup();
    expect(svg().style.visibility).not.toBe('hidden');
    expect(span()).toBe('하루 전체');
  });

  it('initialView 1분 창 → 반영 전엔 svg 숨김 · 반영 뒤 「1분」 · 보임 · 첫 알림이 1분 창(하루 전체로 먼저 알리지 않음)', async () => {
    const onViewChange = vi.fn();
    const { span, svg } = setup({ initialView: { t0: H5, t1: H5 + 60_000, preset: null }, onViewChange });
    expect(svg().style.visibility).toBe('hidden');
    await waitFor(() => expect(span()).toBe('1분'));
    await waitFor(() => expect(svg().style.visibility).not.toBe('hidden'));
    await waitFor(() => expect(onViewChange).toHaveBeenCalled());
    const first = onViewChange.mock.calls[0]![0] as Snap;
    expect(first.t1 - first.t0).toBe(60_000);
    expect(first.t0).toBe(H5);
    expect(first.preset).toBeNull();
  });

  it("initialView preset 'full' → 적용할 것 없음 · 숨김 없음 · 알림이 preset 'full'", async () => {
    const onViewChange = vi.fn();
    const { span, svg } = setup({ initialView: { t0: H5, t1: H5 + 60_000, preset: 'full' }, onViewChange });
    expect(svg().style.visibility).not.toBe('hidden');
    expect(span()).toBe('하루 전체');
    await waitFor(() => expect(onViewChange).toHaveBeenCalled());
    expect((onViewChange.mock.calls[0]![0] as Snap).preset).toBe('full');
  });

  it('마운트 뒤 initialView 를 바꿔 다시 렌더해도 창은 그대로(다시 적용 안 함)', async () => {
    const { span, rerender } = setup({ initialView: { t0: H5, t1: H5 + 60_000, preset: null } });
    await waitFor(() => expect(span()).toBe('1분'));
    rerender(el({ initialView: { t0: H5, t1: H5 + 10_000, preset: null } }));
    await wait(40);
    expect(span()).toBe('1분');
    rerender(el({ initialView: { t0: H5, t1: H5 + 10_000, preset: 'full' } }));
    await wait(40);
    expect(span()).toBe('1분');
  });

  it("「1분」 버튼 → 알림 preset null · 폭 60초 · 「전체」 → preset 'full'", async () => {
    const onViewChange = vi.fn();
    const { getByRole, span } = setup({ onViewChange });
    const last = () => onViewChange.mock.calls.at(-1)?.[0] as Snap | undefined;
    fireEvent.click(getByRole('button', { name: '1분' }));
    await waitFor(() => expect(span()).toBe('1분'));
    await waitFor(() => expect(last()?.preset).toBeNull());
    expect(last()!.t1 - last()!.t0).toBe(60_000);
    fireEvent.click(getByRole('button', { name: '전체' }));
    await waitFor(() => expect(last()?.preset).toBe('full'));
    expect(span()).toBe('하루 전체');
  });

  it('최소 창(10초)보다 좁은 5초 창을 받으면 10초 창으로 연다', async () => {
    const onViewChange = vi.fn();
    const { span } = setup({ initialView: { t0: H5, t1: H5 + 5_000, preset: null }, onViewChange });
    await waitFor(() => expect(span()).toBe('10초'));
    await waitFor(() => expect(onViewChange).toHaveBeenCalled());
    const first = onViewChange.mock.calls[0]![0] as Snap;
    expect(first.t1 - first.t0).toBe(10_000);
  });

  it('StrictMode 이중 실행에도 받은 창으로 연다 · 숨김이 풀린다', async () => {
    const onViewChange = vi.fn();
    const { span, svg } = setup({ initialView: { t0: H5, t1: H5 + 60_000, preset: null }, onViewChange }, true);
    await waitFor(() => expect(span()).toBe('1분'));
    await waitFor(() => expect(svg().style.visibility).not.toBe('hidden'));
    for (const [v] of onViewChange.mock.calls as [Snap][]) expect(v.t1 - v.t0).toBe(60_000);
  });

  it('titleAddon → 「타임라인」 바로 다음 형제 · 데스크톱 폭이면 phone=false', () => {
    const r = render(
      <TickChart
        session={krx}
        cursorRec={1}
        onSeekMs={vi.fn()}
        onJumpRec={vi.fn()}
        titleAddon={(phone) => <span data-testid="addon">{String(phone)}</span>}
      />,
    );
    const addon = r.getByTestId('addon');
    expect(r.getByRole('heading', { name: '타임라인' }).nextElementSibling).toBe(addon);
    expect(addon.textContent).toBe('false');
  });
});
