import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

/** 넷째 판 경로 계산 횟수만 센다 — 계산 자체는 원래 함수 그대로(통과 감시). */
vi.mock('@/lib/ticks/tick-chart', async (importOriginal) => {
  const m = await importOriginal<typeof import('@/lib/ticks/tick-chart')>();
  return { ...m, turnoverPathsOf: vi.fn(m.turnoverPathsOf) };
});

import { CANDLE_CHART, candlePanelsOf } from '@/lib/ticks/candle-chart';
import { turnoverPathsOf } from '@/lib/ticks/tick-chart';
import { a3Msg, b6Msg, synthSession } from '@/test-fixtures/tick-synth';

import { CandleChart } from '../candle-chart';

/**
 * Phase 42 리뷰 WR-01 — 마우스 이동 재렌더는 넷째 판 경로(`turnoverPathsOf` — 창 안 체결 수만큼 돈다)를 다시 계산하지 않는다(SC-7).
 *
 * 깨지면: 큰 세션에서 마우스 1px 마다 창 안 체결 전체를 다시 돌고, 같은 계산을 아래 판과 값 점이 두 번 한다.
 */

const PD = candlePanelsOf(CANDLE_CHART.desktop);

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(turnoverPathsOf).mockClear();
});

const krx = synthSession([
  [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
  [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
  [1.1, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 200, time: '130000001100' })],
  [2, a3Msg({ seq: 105, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000002000' })],
  [5, a3Msg({ seq: 107, bs: '1', px: 16300, qty: 400, time: '130000005000' })],
]);

describe('봉 차트 — 넷째 판 경로 메모(WR-01)', () => {
  it('마우스를 여러 px 옮겨도 turnoverPathsOf 는 다시 돌지 않는다 · 값 점(팀 비중)은 그대로 그려진다', () => {
    const r = render(<CandleChart session={krx} cursorRec={2} onSeekMs={vi.fn()} onJumpRec={vi.fn()} />);
    const svg = r.container.querySelector('[data-slot="candle-chart-svg"]') as SVGSVGElement;
    const h = Number(svg.getAttribute('height'));
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 640, bottom: h, width: 640, height: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    // 그리기 한 번에 한 번(아래 판과 값 점이 같은 결과를 쓴다)
    const before = vi.mocked(turnoverPathsOf).mock.calls.length;
    expect(before).toBeGreaterThan(0);
    const y = (PD.y4a + PD.y4b) / 2;
    for (const cx of [200, 240, 280, 320]) fireEvent.pointerMove(svg, { clientX: cx, clientY: y, pointerType: 'mouse' });
    expect(r.container.querySelectorAll('[data-slot="candle-chart-hover-line"]')).toHaveLength(1);
    expect(vi.mocked(turnoverPathsOf).mock.calls.length).toBe(before);
    // 팀 비중 판 값 점(--team · 넷째 판 높이 안)은 메모한 경로로 여전히 그린다
    const share = Array.from(r.container.querySelectorAll('[data-slot="candle-chart-hover-dot"]')).filter((d) => {
      const cy = Number(d.getAttribute('cy'));
      return d.getAttribute('fill') === 'var(--team)' && cy >= PD.y4a && cy <= PD.y4b;
    });
    expect(share).toHaveLength(1);
  });
});
