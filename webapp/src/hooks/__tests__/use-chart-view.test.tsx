import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { useEffect, useRef } from 'react';

import { MIN_VIEW_MS, dayBoundsOf, type View } from '@/lib/accum-chart';
import { ACCUM_DATE, accumKstMs } from '@/test-fixtures/accum-export';

import { useChartGestures, useChartView, type ChartViewControl } from '../use-chart-view';

/**
 * Phase 34 Plan 07 — 매집감지 상세 차트 보기 창 훅(휠 · 끌기 · 핀치 · 키보드 · rAF · D-14 · UI-SPEC A6 · Discretion 7 · 8).
 *
 * 각 케이스는 깨졌을 때 사용자가 겪는 일과 1:1 이다.
 *  1. 넘김 규칙      → 깨지면 차트 위에서 휠로 페이지를 못 내린다(472px 스크롤 갇힘)
 *  2. 휠 확대        → 깨지면 휠이 확대 대신 페이지만 스크롤한다
 *  3. ctrlKey 휠     → 깨지면 맥 트랙패드 핀치가 페이지 전체를 확대한다
 *  4. 가로 휠        → 깨지면 트랙패드 좌우 쓸기가 확대로 읽힌다
 *  5. 끌기 · 해제    → 깨지면 손을 뗀 뒤에도 마우스를 따라 창이 움직인다(폰 세로 스크롤 뒤 pointercancel 포함)
 *  6. 핀치           → 깨지면 폰에서 두 손가락 확대가 안 되거나 10분 아래로 뭉개진다
 *  7. 키보드         → 깨지면 마우스 없이 임의 구간을 못 본다 · 브라우저 단축키를 먹는다
 *  8. rAF 합치기     → 깨지면 트랙패드 관성 휠마다 전체 SVG 가 다시 그려져 끊긴다
 *
 * jsdom 에는 레이아웃 · PointerEvent 가 없다 — getBoundingClientRect 를 목(left 0 · width 640 = viewBox 1:1)하고
 * MouseEvent 에 pointerId 를 얹는다 · rAF 는 수동 큐로 프레임을 진행시킨다.
 */

const H = 3600e3;
const T0 = accumKstMs(ACCUM_DATE, '09:00:00');
const B = dayBoundsOf(T0);
const LAST = accumKstMs(ACCUM_DATE, '15:30:00');
/** 그림 영역 = [52, 640 − 56] → 폭 532 · 가운데 318. */
const L = 52;
const W = 640;
const PLOT_W = W - 56 - L;
const MID = (L + W - 56) / 2;

let ctl!: ChartViewControl;
let commits: View[] = [];
let rafQueue: FrameRequestCallback[] = [];
let rafCalls = 0;

function Harness() {
  const c = useChartView({ bounds: B, lastTradeMs: LAST });
  const ref = useRef<SVGSVGElement>(null);
  const { dragging } = useChartGestures(ref, { L, W, R: 56 }, c);
  ctl = c;
  useEffect(() => {
    commits.push(c.view);
  }, [c.view]);
  return (
    <div data-testid="wrap" tabIndex={0} onKeyDown={c.onKeyDown}>
      <svg ref={ref} data-testid="svg" data-dragging={dragging ? '1' : '0'} />
    </div>
  );
}

function setup() {
  const r = render(<Harness />);
  const svg = r.getByTestId('svg') as unknown as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: W, bottom: 472, width: W, height: 472, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  (svg as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = vi.fn();
  return { svg, wrap: r.getByTestId('wrap') };
}

function flushFrame() {
  act(() => {
    const q = rafQueue;
    rafQueue = [];
    for (const cb of q) cb(performance.now());
  });
}

/** 휠을 쏘고 preventDefault 여부를 돌려준다. */
function wheel(svg: Element, init: WheelEventInit): boolean {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: MID, ...init });
  svg.dispatchEvent(e);
  return e.defaultPrevented;
}

function ptr(svg: Element, type: string, pointerId: number, clientX: number) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 });
  Object.defineProperty(e, 'pointerId', { value: pointerId });
  Object.defineProperty(e, 'pointerType', { value: 'touch' });
  act(() => {
    svg.dispatchEvent(e);
  });
}

const width = (v: View) => v.t1 - v.t0;

beforeEach(() => {
  commits = [];
  rafQueue = [];
  rafCalls = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCalls += 1;
    rafQueue.push(cb);
    return rafCalls;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useChartView — 휠 넘김 규칙 · 확대 (D-14 · Discretion 7 · Pitfall 11)', () => {
  it('(w1) 전체 창에서 일반 휠 축소(deltaY +100) → 창 변화 없음 → preventDefault 없음(페이지 스크롤로 넘김) · rAF 예약 없음', () => {
    const { svg } = setup();
    expect(wheel(svg, { deltaY: 100 })).toBe(false);
    flushFrame();
    expect(rafCalls).toBe(0);
    expect(ctl.view).toEqual({ t0: T0, t1: B.T2000 });
    expect(ctl.preset).toBe('full');
  });

  it('(w2) 전체 창에서 deltaY −100(커서 = 그림 가운데) → preventDefault · 창 폭 < 11h · 가운데 기준 · 프리셋 꺼짐', () => {
    const { svg } = setup();
    expect(wheel(svg, { deltaY: -100 })).toBe(true);
    flushFrame();
    const v = ctl.view;
    expect(width(v)).toBeCloseTo(11 * H * Math.exp(-0.15), -1);
    expect(v.t0).toBeGreaterThan(T0);
    expect(v.t1).toBeLessThan(B.T2000);
    expect((v.t0 + v.t1) / 2).toBeCloseTo((T0 + B.T2000) / 2, -1);
    expect(ctl.preset).toBeNull();
  });

  it('(w3) ctrlKey 휠(맥 트랙패드 핀치) → 창이 안 바뀌어도 늘 preventDefault · 확대 경로는 같다', () => {
    const { svg } = setup();
    expect(wheel(svg, { deltaY: 100, ctrlKey: true })).toBe(true);
    flushFrame();
    expect(ctl.view).toEqual({ t0: T0, t1: B.T2000 });
    expect(wheel(svg, { deltaY: -100, ctrlKey: true })).toBe(true);
    flushFrame();
    expect(width(ctl.view)).toBeCloseTo(11 * H * Math.exp(-0.15), -1);
  });

  it('(w4) |deltaX| > |deltaY| → 좌우 이동(폭 그대로 · 픽셀 ÷ 그림 폭 × 창 폭) · 끝에서 더 이동은 넘김', () => {
    const { svg } = setup();
    act(() => ctl.setPreset('reg'));
    expect(wheel(svg, { deltaX: 100, deltaY: 10 })).toBe(true);
    flushFrame();
    const dt = (100 / PLOT_W) * 6.5 * H;
    expect(width(ctl.view)).toBeCloseTo(6.5 * H, -1);
    expect(ctl.view.t0).toBeCloseTo(T0 + dt, -1);
    // 왼쪽 끝(T0)에서 더 왼쪽으로 = 변화 없음 → 넘김
    act(() => ctl.setPreset('reg'));
    expect(wheel(svg, { deltaX: -100, deltaY: 0 })).toBe(false);
  });

  it('(w5) 10분 창에서 더 확대 → 창 변화 없음 → 넘김(창이 옆으로 밀리지 않는다)', () => {
    const { svg } = setup();
    act(() => ctl.apply(() => ({ t0: T0 + H, t1: T0 + H + MIN_VIEW_MS })));
    const before = ctl.view;
    expect(wheel(svg, { deltaY: -100, clientX: L + 10 })).toBe(false);
    flushFrame();
    expect(ctl.view).toEqual(before);
  });
});

describe('useChartView — 끌기 · 핀치 (Pointer Events · Pitfall 12)', () => {
  it('(p1) 포인터 1개 down → move(−100px) → 창이 뒤 시각으로 이동(폭 그대로) · 끌기 중 dragging · up 뒤 move 무시', () => {
    const { svg } = setup();
    act(() => ctl.setPreset('reg'));
    ptr(svg, 'pointerdown', 1, MID);
    expect(svg.getAttribute('data-dragging')).toBe('1');
    expect((svg as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture).toHaveBeenCalledWith(1);
    ptr(svg, 'pointermove', 1, MID - 100);
    flushFrame();
    const dt = (100 / PLOT_W) * 6.5 * H;
    expect(ctl.view.t0).toBeCloseTo(T0 + dt, -1);
    expect(width(ctl.view)).toBeCloseTo(6.5 * H, -1);
    expect(ctl.preset).toBeNull();
    ptr(svg, 'pointerup', 1, MID - 100);
    expect(svg.getAttribute('data-dragging')).toBe('0');
    const after = ctl.view;
    ptr(svg, 'pointermove', 1, MID - 300);
    flushFrame();
    expect(ctl.view).toEqual(after);
  });

  it('(p2) pointercancel(폰 세로 스크롤 시작) → 끌기 상태 해제 · 뒤 move 무시', () => {
    const { svg } = setup();
    act(() => ctl.setPreset('reg'));
    ptr(svg, 'pointerdown', 7, MID);
    ptr(svg, 'pointercancel', 7, MID);
    expect(svg.getAttribute('data-dragging')).toBe('0');
    ptr(svg, 'pointermove', 7, MID - 200);
    flushFrame();
    expect(ctl.view).toEqual({ t0: T0, t1: B.T1530 });
    expect(ctl.preset).toBe('reg');
  });

  it('(p3) 포인터 2개 → 거리 2배 → 창 폭 ½(중점 기준)', () => {
    const { svg } = setup();
    ptr(svg, 'pointerdown', 1, MID - 100);
    ptr(svg, 'pointerdown', 2, MID + 100);
    ptr(svg, 'pointermove', 1, MID - 200);
    ptr(svg, 'pointermove', 2, MID + 200);
    flushFrame();
    expect(width(ctl.view)).toBeCloseTo(5.5 * H, -1);
    expect((ctl.view.t0 + ctl.view.t1) / 2).toBeCloseTo((T0 + B.T2000) / 2, -1);
    expect(ctl.preset).toBeNull();
  });

  it('(p4) 핀치로 크게 벌려도 최소 창 10분', () => {
    const { svg } = setup();
    act(() => ctl.setPreset('reg'));
    ptr(svg, 'pointerdown', 1, MID - 1);
    ptr(svg, 'pointerdown', 2, MID + 1);
    ptr(svg, 'pointermove', 1, 0);
    ptr(svg, 'pointermove', 2, W);
    flushFrame();
    expect(width(ctl.view)).toBe(MIN_VIEW_MS);
  });
});

describe('useChartView — 키보드 · rAF 합치기 (UI-SPEC 접근성 보강)', () => {
  it('(k1) → = 창 폭 20% 뒤로 · + = 가운데 ×0.5 · − = ×2(최대 11h) · 0 = 「전체」 프리셋 · 처리 안 한 키 · 수정키는 넘김', () => {
    const { wrap } = setup();
    act(() => ctl.setPreset('reg'));
    fireEvent.keyDown(wrap, { key: 'ArrowRight' });
    flushFrame();
    expect(ctl.view).toEqual({ t0: T0 + 0.2 * 6.5 * H, t1: B.T1530 + 0.2 * 6.5 * H });
    expect(ctl.preset).toBeNull();
    fireEvent.keyDown(wrap, { key: 'ArrowLeft' });
    flushFrame();
    expect(ctl.view.t0).toBeCloseTo(T0, -1);

    const c0 = ctl.view;
    fireEvent.keyDown(wrap, { key: '+' });
    flushFrame();
    expect(width(ctl.view)).toBeCloseTo(width(c0) / 2, -1);
    expect((ctl.view.t0 + ctl.view.t1) / 2).toBeCloseTo((c0.t0 + c0.t1) / 2, -1);

    fireEvent.keyDown(wrap, { key: '-' });
    fireEvent.keyDown(wrap, { key: '-' });
    fireEvent.keyDown(wrap, { key: '_' });
    flushFrame();
    expect(width(ctl.view)).toBe(11 * H);

    act(() => ctl.setPreset('reg'));
    fireEvent.keyDown(wrap, { key: '0' });
    expect(ctl.view).toEqual({ t0: T0, t1: B.T2000 });
    expect(ctl.preset).toBe('full');

    expect(fireEvent.keyDown(wrap, { key: 'a' })).toBe(true); // 기본 동작 유지
    expect(fireEvent.keyDown(wrap, { key: '=', metaKey: true })).toBe(true); // 브라우저 확대 단축키
    expect(fireEvent.keyDown(wrap, { key: '=' })).toBe(false);
  });

  it('(r1) 한 프레임 안 휠 3번 → rAF 예약 1번 · setView 1회 · 결과 = 세 변환 합성', () => {
    const { svg } = setup();
    const before = commits.length;
    wheel(svg, { deltaY: -100 });
    wheel(svg, { deltaY: -100 });
    wheel(svg, { deltaY: -100 });
    expect(rafCalls).toBe(1);
    expect(ctl.view).toEqual({ t0: T0, t1: B.T2000 });
    flushFrame();
    expect(commits.length - before).toBe(1);
    expect(width(ctl.view)).toBeCloseTo(11 * H * Math.exp(-0.45), -1);
  });

  it('(r2) 언마운트 뒤 남은 프레임은 setState 하지 않는다', () => {
    const r = render(<Harness />);
    const svg = r.getByTestId('svg');
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: W, bottom: 472, width: W, height: 472, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    wheel(svg, { deltaY: -100 });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    r.unmount();
    flushFrame();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
