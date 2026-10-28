import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOUCH_HOLD_MS, TOUCH_SLOP_PX, TOUCH_TIP_GAP, createTouchInspect, touchTipTopOf } from '../touch-inspect';

/**
 * quick-261028-ggj — 차트 길게 누르기 살펴보기 상태기(300ms · 8px · 두 번째 손가락 취소) · 터치 툴팁 세로 자리.
 * 깨지면: 폰에서 원 정보를 못 보거나(h1 · h2), 끌기 · 스크롤이 살펴보기로 잘못 읽히거나(h3 · h8), 핀치가 막히거나(h6 · h7),
 * 손을 뗀 뒤에도 상자가 남는다(h5).
 */

const touch = (pointerId: number, clientX: number, clientY: number, pointerType = 'touch') => ({
  pointerId,
  pointerType,
  clientX,
  clientY,
});

let onStart: ReturnType<typeof vi.fn>;
let onEnd: ReturnType<typeof vi.fn>;
const make = () => createTouchInspect({ onStart, onEnd });

beforeEach(() => {
  vi.useFakeTimers();
  onStart = vi.fn();
  onEnd = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createTouchInspect — 길게 누르기 상태기', () => {
  it('상수 — 300ms · 8px · 툴팁 간격 32px', () => {
    expect(TOUCH_HOLD_MS).toBe(300);
    expect(TOUCH_SLOP_PX).toBe(8);
    expect(TOUCH_TIP_GAP).toBe(32);
  });

  it('(h1) down → 299ms 에는 없고 300ms 에 onStart(그 자리) 1회 · active true', () => {
    const t = make();
    t.down(touch(1, 100, 100));
    vi.advanceTimersByTime(299);
    expect(onStart).not.toHaveBeenCalled();
    expect(t.active()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith({ clientX: 100, clientY: 100 });
    expect(t.active()).toBe(true);
  });

  it('(h2) 활성 전 8px 안 떨림은 그대로 켜진다 · onStart 좌표는 마지막 떨림 자리', () => {
    const t = make();
    t.down(touch(1, 100, 100));
    expect(t.move(touch(1, 103, 100))).toBe(false);
    expect(t.move(touch(1, 103, 105))).toBe(false); // 시작점에서 √34 ≈ 5.8
    vi.advanceTimersByTime(300);
    expect(onStart).toHaveBeenCalledWith({ clientX: 103, clientY: 105 });
  });

  it('(h3) 활성 전 8px 넘게 움직이면 취소(끌기 · 스크롤) — move false · 1000ms 뒤에도 onStart 없음', () => {
    const t = make();
    t.down(touch(1, 100, 100));
    vi.advanceTimersByTime(100);
    expect(t.move(touch(1, 109, 100))).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(onStart).not.toHaveBeenCalled();
    expect(t.active()).toBe(false);
    expect(t.move(touch(1, 100, 100))).toBe(false);
  });

  it('(h4) 활성 뒤 move → true · onStart 를 다시 부르지 않는다', () => {
    const t = make();
    t.down(touch(1, 100, 100));
    vi.advanceTimersByTime(300);
    expect(t.move(touch(1, 200, 150))).toBe(true);
    expect(t.move(touch(1, 300, 150))).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('(h5) 활성 뒤 end → onEnd 1회 · active false · 같은 id end 를 또 불러도 onEnd 그대로(pointerup 뒤 lostpointercapture)', () => {
    const t = make();
    t.down(touch(1, 100, 100));
    vi.advanceTimersByTime(300);
    t.end({ pointerId: 1 });
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(t.active()).toBe(false);
    t.end({ pointerId: 1 });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('(h6) 활성 전 두 번째 손가락 → 타이머 취소 · onStart · onEnd 없음(핀치 그대로)', () => {
    const t = make();
    t.down(touch(1, 100, 100));
    vi.advanceTimersByTime(150);
    t.down(touch(2, 200, 100));
    vi.advanceTimersByTime(1000);
    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('(h7) 활성 뒤 두 번째 손가락 → onEnd 1회 · active false · 그 뒤 첫 손가락 move 는 false', () => {
    const t = make();
    t.down(touch(1, 100, 100));
    vi.advanceTimersByTime(300);
    t.down(touch(2, 200, 100));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(t.active()).toBe(false);
    expect(t.move(touch(1, 120, 100))).toBe(false);
  });

  it('(h8) 마우스 · 펜 down 은 무시한다(타이머 없음)', () => {
    const t = make();
    t.down(touch(1, 100, 100, 'mouse'));
    t.down(touch(2, 100, 100, 'pen'));
    vi.advanceTimersByTime(1000);
    expect(onStart).not.toHaveBeenCalled();
    expect(t.active()).toBe(false);
  });

  it('(h9) 다른 id 의 move 는 false · 상태 불변 · 모르는 id 의 end 는 아무것도 안 한다', () => {
    const t = make();
    t.down(touch(1, 100, 100));
    vi.advanceTimersByTime(300);
    expect(t.move(touch(5, 100, 100))).toBe(false);
    t.end({ pointerId: 5 });
    expect(onEnd).not.toHaveBeenCalled();
    expect(t.active()).toBe(true);
  });

  it('(h10) dispose → 대기 타이머 취소 · 콜백 없음', () => {
    const t = make();
    t.down(touch(1, 100, 100));
    t.dispose();
    vi.advanceTimersByTime(1000);
    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('(h11) 손가락을 모두 뗀 뒤 새 down 은 다시 300ms 를 센다', () => {
    const t = make();
    t.down(touch(1, 100, 100));
    t.down(touch(2, 200, 100));
    t.end({ pointerId: 1 });
    t.end({ pointerId: 2 });
    t.down(touch(3, 50, 60));
    vi.advanceTimersByTime(299);
    expect(onStart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStart).toHaveBeenCalledWith({ clientX: 50, clientY: 60 });
  });
});

describe('touchTipTopOf — 터치 툴팁 세로 자리(차트 안 · 손가락 위 우선)', () => {
  it('위 → 아래 → 안쪽 붙임', () => {
    expect(touchTipTopOf(200, 56, 472)).toBe(112);
    expect(touchTipTopOf(60, 56, 472)).toBe(92);
    expect(touchTipTopOf(300, 500, 472)).toBe(0);
    expect(touchTipTopOf(88, 56, 472)).toBe(0);
    expect(touchTipTopOf(420, 40, 472)).toBe(348);
  });
});
