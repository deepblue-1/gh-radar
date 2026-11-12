import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';

import { CANDLE_CHART, candlePanelsOf } from '@/lib/ticks/candle-chart';
import { tickBoundsOf } from '@/lib/ticks/tick-chart';
import { SYNTH_DATE, a3Msg, b6Msg, synthSession } from '@/test-fixtures/tick-synth';

import { CandleChart } from '../candle-chart';

/**
 * Phase 42 Plan 09 — 봉 차트 조작 · 겹침(D-19 · SC-6 · SC-4).
 *
 * 깨지면: 봉 차트에서 확대 · 클릭 점프 · Shift+끌기 구간 합계가 선 차트와 다르게 동작한다.
 *
 * 하루는 선 차트 테스트(`tick-chart.test.tsx`)와 같다 — 팀 매수 SMP 3조각(984만) · 일반 1조각 · 팀 매도 단독(652만).
 * 체결은 13:00:00.000 ~ 13:00:00.005 라 1분봉 하나(시 16,400 · 종 16,300)다.
 */

const B = tickBoundsOf(SYNTH_DATE);
const PD = candlePanelsOf(CANDLE_CHART.desktop);

const krx = synthSession([
  [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
  [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
  [1.1, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 200, time: '130000001100' })],
  [1.2, a3Msg({ seq: 103, bs: '2', px: 16400, qty: 300, time: '130000001200' })],
  [1.5, b6Msg({ seq: 104, ask1: [16450, 10], bid1: [16400, 20] })],
  [2, a3Msg({ seq: 105, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000002000' })],
  [2.5, b6Msg({ seq: 106, ask1: [16400, 1], bid1: [16350, 2] })],
  [5, a3Msg({ seq: 107, bs: '1', px: 16300, qty: 400, time: '130000005000' })],
  [5.5, b6Msg({ seq: 108, ask1: [16400, 1], bid1: [16300, 2] })],
]);

const recOfSeq = (s: typeof krx, seq: number) => {
  for (let r = 0; r < s.index.n; r++) if (s.index.seq[r] === seq) return r;
  throw new Error(`seq ${seq} 없음`);
};

type Props = Parameters<typeof CandleChart>[0];

function renderChart(props: Partial<Props> = {}) {
  const onSeekMs = vi.fn();
  const onJumpRec = vi.fn();
  const r = render(
    <CandleChart session={krx} cursorRec={recOfSeq(krx, 103)} onSeekMs={onSeekMs} onJumpRec={onJumpRec} {...props} />,
  );
  const q = (slot: string) => r.container.querySelectorAll(`[data-slot="${slot}"]`);
  const svg = q('candle-chart-svg')[0] as SVGSVGElement;
  const h = Number(svg.getAttribute('height'));
  // svg 상자 = viewBox 1:1(폭 640 · 높이 = 판 높이) — client 좌표 = viewBox 좌표
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 640, bottom: h, width: 640, height: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return { ...r, q, svg, onSeekMs, onJumpRec };
}

/** 하루 전체 창(08:00 ~ 20:00 · L 52 · 그림 끝 588)에서 13:00 의 x — 체결 봉 자리. */
const X1300 = 52 + (5 / 12) * (588 - 52);

describe('조작 — 클릭 · 확대 · 키 · 커서', () => {
  it('빈 곳 클릭 → 그 x 의 시각(onSeekMs) · 40px 끌고 클릭은 클릭이 아니다', () => {
    const { svg, onSeekMs } = renderChart();
    // L = 52 · 그림 끝 = 640 − 52 = 588 · 하루 전체 창 → 가운데 320 = 14:00
    fireEvent.click(svg, { clientX: 320, clientY: 50 });
    expect(onSeekMs).toHaveBeenCalledTimes(1);
    expect(onSeekMs.mock.calls[0]![0]).toBeCloseTo(B.T0 + 6 * 3_600_000, -2);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 50 });
    fireEvent.click(svg, { clientX: 140, clientY: 50 });
    expect(onSeekMs).toHaveBeenCalledTimes(1);
  });

  it('「10초」 · 「1분」 버튼 → 커서 중심 창 · 래퍼 「0」 키 = 하루 전체 · ← → 는 가로채지 않는다', async () => {
    const { getByRole, q } = renderChart();
    const span = () => q('candle-chart-span')[0]!.textContent;
    expect(span()).toBe('하루 전체');
    fireEvent.click(getByRole('button', { name: '10초' }));
    await waitFor(() => expect(span()).toBe('10초'));
    fireEvent.click(getByRole('button', { name: '1분' }));
    await waitFor(() => expect(span()).toBe('1분'));
    const wrap = q('candle-chart-wrap')[0]!;
    fireEvent.keyDown(wrap, { key: '0' });
    await waitFor(() => expect(span()).toBe('하루 전체'));
    expect(fireEvent.keyDown(wrap, { key: 'ArrowRight' })).toBe(true);
    // 확대 버튼은 래퍼 밖(제목 줄 — Pitfall 12)
    expect(wrap.contains(getByRole('button', { name: '확대' }))).toBe(false);
    expect(getByRole('button', { name: '축소' })).toBeDefined();
    expect(getByRole('button', { name: '전체' })).toBeDefined();
  });

  it('「확대」 · 「축소」 버튼 → 창 폭이 반 · 두 배', async () => {
    const { getByRole, q } = renderChart();
    const span = () => q('candle-chart-span')[0]!.textContent;
    fireEvent.click(getByRole('button', { name: '1분' }));
    await waitFor(() => expect(span()).toBe('1분'));
    fireEvent.click(getByRole('button', { name: '확대' }));
    await waitFor(() => expect(span()).toBe('30초'));
    fireEvent.click(getByRole('button', { name: '축소' }));
    await waitFor(() => expect(span()).toBe('1분'));
  });

  it('커서 선 · 아래 시각 라벨 — 커서 rec 의 수신 시각', () => {
    const { q } = renderChart();
    expect(q('candle-chart-cursor')).toHaveLength(1);
    expect(q('candle-chart-cursor-label')[0]?.textContent).toBe('13:00:00');
  });

  it('커서가 창 밖으로 나가면 창이 커서를 따라간다(창 폭 그대로)', async () => {
    const far = synthSession([
      [0, a3Msg({ seq: 1, bs: '2', px: 16400, qty: 100, time: '130000000000' })],
      [2 * 3_600_000, a3Msg({ seq: 2, bs: '2', px: 16450, qty: 100, time: '150000000000' })],
    ]);
    const onSeekMs = vi.fn();
    const onJumpRec = vi.fn();
    const r = render(<CandleChart session={far} cursorRec={0} onSeekMs={onSeekMs} onJumpRec={onJumpRec} />);
    const q = (slot: string) => r.container.querySelectorAll(`[data-slot="${slot}"]`);
    fireEvent.click(r.getByRole('button', { name: '10초' }));
    await waitFor(() => expect(q('candle-chart-span')[0]!.textContent).toBe('10초'));
    expect(q('candle-chart-cursor')).toHaveLength(1);
    r.rerender(<CandleChart session={far} cursorRec={1} onSeekMs={onSeekMs} onJumpRec={onJumpRec} />);
    await waitFor(() => expect(q('candle-chart-cursor-label')[0]?.textContent).toBe('15:00:00'));
    await waitFor(() => expect(q('candle-chart-cursor')).toHaveLength(1));
    expect(q('candle-chart-span')[0]!.textContent).toBe('10초');
  });

  it('마우스 세로선 · 값 점 — 호버 동안만 · 가격 판 점 = 그 봉 종가 y', () => {
    const { q, svg } = renderChart();
    // 1px ≈ 80초 — 13:00 봉 칸(1분) 안쪽(≈ 13:00:24)
    const cx = X1300 + 0.3;
    expect(q('candle-chart-hover-line')).toHaveLength(0);
    // 순매수 판 높이(원 묶음 상자 없이) · 13:00 봉 x
    fireEvent.pointerMove(svg, { clientX: cx, clientY: (PD.y2a + PD.y2b) / 2, pointerType: 'mouse' });
    expect(q('candle-chart-hover-line')).toHaveLength(1);
    const dots = Array.from(q('candle-chart-hover-dot'));
    // 가격(종가) · 매수 · 거울 매도 · 순 · 팀 비중
    expect(dots).toHaveLength(5);
    const px = dots.find((d) => d.getAttribute('fill') === 'var(--fg-2)')!;
    // 창 안 최저 = 종가 16,300 — 가격 축 최저 글자 y − 4 와 같다
    const axis = Array.from(q('candle-px-axis')[0]!.querySelectorAll('text'));
    expect(axis[1]!.textContent).toBe('16,300');
    expect(Number(px.getAttribute('cy'))).toBeCloseTo(Number(axis[1]!.getAttribute('y')) - 4, 6);
    expect(dots.map((d) => d.getAttribute('fill'))).toEqual(
      expect.arrayContaining(['var(--up)', 'var(--down)', 'var(--team)']),
    );
    fireEvent.pointerLeave(svg);
    expect(q('candle-chart-hover-line')).toHaveLength(0);
    expect(q('candle-chart-hover-dot')).toHaveLength(0);
  });
});

/**
 * 스케치 028 ③ — Shift+끌기 구간 합계(선 차트와 같은 결과 줄 `TickChartRange`).
 * 깨지면: 그냥 끌기가 구간을 만들어 창 이동이 막히거나, Shift+끌기 동안 창이 움직이거나, 구간을 지우는 클릭이 커서를 옮긴다.
 */
describe('조작 — Shift+끌기 구간 합계', () => {
  const setup = (props: Partial<Props> = {}) => {
    const r = renderChart(props);
    const cx = X1300;
    const drag = (x0: number, x1: number, shiftKey = true) => {
      fireEvent.pointerDown(r.svg, { shiftKey, button: 0, pointerType: 'mouse', pointerId: 1, clientX: x0, clientY: 50 });
      fireEvent.pointerMove(r.svg, { shiftKey, pointerType: 'mouse', pointerId: 1, clientX: (x0 + x1) / 2, clientY: 50 });
      fireEvent.pointerMove(r.svg, { shiftKey, pointerType: 'mouse', pointerId: 1, clientX: x1, clientY: 50 });
      fireEvent.pointerUp(r.svg, { shiftKey, button: 0, pointerType: 'mouse', pointerId: 1, clientX: x1, clientY: 50 });
      // 브라우저는 끌기 뒤에도 click 을 낸다 — 끌기 문턱이 걸러야 한다
      fireEvent.click(r.svg, { shiftKey, clientX: x1, clientY: 50 });
    };
    return { ...r, cx, drag };
  };

  it('Shift 누른 채 끌고 떼면 차트 아래 결과 줄 · 범위 띠 · 순 알약(수익률 판 위) · 시각 이동 없음', () => {
    const { q, cx, drag, onSeekMs } = setup();
    expect(q('tick-chart-range')).toHaveLength(0);
    drag(cx - 20, cx + 20);
    const rng = q('tick-chart-range')[0]!;
    expect(rng).toBeDefined();
    const txt = rng.textContent ?? '';
    expect(txt).toContain('팀 매수984만1건');
    expect(txt).toContain('팀 매도652만1건');
    expect(txt).toContain('팀 순매수+332만');
    expect(q('candle-range-band')).toHaveLength(1);
    const pill = q('candle-range-pill')[0]!;
    expect(pill.textContent).toBe('순 +332만');
    expect(Number(pill.querySelector('rect')!.getAttribute('y'))).toBeLessThan(PD.yRa);
    expect(onSeekMs).not.toHaveBeenCalled();
    const wrap = q('candle-chart-wrap')[0]!;
    expect(wrap.compareDocumentPosition(rng) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wrap.contains(rng)).toBe(false);
  });

  it('그냥 끌기(Shift 없음)는 구간을 만들지 않는다', () => {
    const { q, cx, drag } = setup();
    drag(cx - 20, cx + 20, false);
    expect(q('tick-chart-range')).toHaveLength(0);
    expect(q('candle-range-band')).toHaveLength(0);
  });

  it('✕ · Esc · 빈 곳 클릭으로 지운다 — 지우는 클릭은 시각 이동이 아니고 그다음 클릭은 이동', () => {
    const { q, cx, drag, svg, getByRole, onSeekMs } = setup();
    drag(cx - 20, cx + 20);
    fireEvent.click(getByRole('button', { name: '✕ 지우기 (Esc)' }));
    expect(q('tick-chart-range')).toHaveLength(0);

    drag(cx - 20, cx + 20);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(q('tick-chart-range')).toHaveLength(0);

    drag(cx - 20, cx + 20);
    fireEvent.click(svg, { clientX: 400, clientY: 50 });
    expect(q('tick-chart-range')).toHaveLength(0);
    expect(onSeekMs).not.toHaveBeenCalled();
    fireEvent.click(svg, { clientX: 400, clientY: 50 });
    expect(onSeekMs).toHaveBeenCalledTimes(1);
  });

  it('「1분」 창에서 Shift+끌기 — 창이 움직이지 않는다(커서 x 그대로)', async () => {
    const { q, getByRole, drag } = setup();
    fireEvent.click(getByRole('button', { name: '1분' }));
    await waitFor(() => expect(q('candle-chart-span')[0]!.textContent).toBe('1분'));
    const x1 = q('candle-chart-cursor')[0]!.getAttribute('x1');
    drag(200, 400);
    await new Promise((r) => setTimeout(r, 50));
    expect(q('candle-chart-cursor')[0]!.getAttribute('x1')).toBe(x1);
    expect(q('tick-chart-range')).toHaveLength(1);
  });

  it('폰(height 303) — Shift+끌기는 구간을 만들지 않고 안내 줄도 없다 · 데스크톱은 안내 줄', () => {
    const desk = setup();
    expect(desk.q('candle-chart-hint')).toHaveLength(1);
    expect(desk.q('candle-chart-hint')[0]!.textContent).toContain('Shift+끌기 구간 합계');
    desk.unmount();
    const ph = setup({ height: 303 });
    expect(ph.q('candle-chart-svg')[0]!.getAttribute('height')).toBe('303');
    ph.drag(ph.cx - 20, ph.cx + 20);
    expect(ph.q('tick-chart-range')).toHaveLength(0);
    expect(ph.q('candle-chart-hint')).toHaveLength(0);
  });
});
