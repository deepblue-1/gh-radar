import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { fmtTickTime, parseTickTime } from '@gh-radar/shared';

import { TICK_FIXTURE_DATE as D, TICK_FIXTURE_ISIN as ISIN, tickGridBytes } from '@/test-fixtures/tick-grid';

import { buildTickSession } from '../tick-session';
import { PLAY_MAX_GAP_MS, TICK_URL_THROTTLE_MS, useTickCursor } from '../use-tick-cursor';

/**
 * Phase 37 Plan 10 Task 2 — 커서 키(← → Shift Space) · 입력 포커스 무시 · 끝/처음 정지 · 재생(1× · 10× · 끝 정지) ·
 * 시각 점프 · 표시 순서 · URL `t` replaceState 250ms 스로틀. 입력 = 컷 13시 KRX 실 세션(11,990 레코드).
 */

const session = buildTickSession(tickGridBytes(), { date: D, ex: 'KRX', isin: ISIN });
const URL_STATE = { isin: ISIN, d: D, ex: 'KRX' as const };
const recvMs = (rec: number) => Number(session.index.recvNs[rec]!) / 1e6;

function key(k: string, opts: KeyboardEventInit = {}, target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
  });
}

function mount(initialT: string | null = null) {
  return renderHook(() => useTickCursor(session, { initialT, urlState: URL_STATE }));
}

let replaceSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  replaceSpy = vi.spyOn(window.history, 'replaceState');
});

afterEach(() => {
  replaceSpy.mockRestore();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('useTickCursor — 키', () => {
  it('→ = 표시 순서(거래소순) 다음 행 · ← = 이전 · Shift+→ = 10행', () => {
    const { result } = mount();
    const p0 = result.current.pos;
    expect(result.current.mode).toBe('exchange');
    key('ArrowRight');
    expect(result.current.pos).toBe(p0 + 1);
    expect(result.current.rec).toBe(session.exOrder[p0 + 1]);
    key('ArrowRight', { shiftKey: true });
    expect(result.current.pos).toBe(p0 + 11);
    key('ArrowLeft');
    expect(result.current.pos).toBe(p0 + 10);
    key('ArrowLeft', { shiftKey: true });
    expect(result.current.pos).toBe(p0);
  });

  it('처음 · 끝에서 멈춘다', () => {
    const { result } = mount();
    act(() => result.current.jumpToRec(session.exOrder[0]!));
    key('ArrowLeft');
    key('ArrowLeft', { shiftKey: true });
    expect(result.current.pos).toBe(0);
    const last = session.exOrder.length - 1;
    act(() => result.current.jumpToRec(session.exOrder[last - 3]!));
    key('ArrowRight', { shiftKey: true });
    expect(result.current.pos).toBe(last);
    key('ArrowRight');
    expect(result.current.pos).toBe(last);
  });

  it('입력창 · textarea · contenteditable 에 포커스가 있으면 가로채지 않는다', () => {
    const { result } = mount();
    const p0 = result.current.pos;
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(input, area, editable);
    for (const el of [input, area, editable]) {
      key('ArrowRight', {}, el);
      key(' ', {}, el);
    }
    expect(result.current.pos).toBe(p0);
    expect(result.current.playing).toBe(false);
  });

  it('Space = 재생/정지', () => {
    vi.useFakeTimers();
    const { result } = mount();
    key(' ');
    expect(result.current.playing).toBe(true);
    key(' ');
    expect(result.current.playing).toBe(false);
  });

  it('수신순 모드에서는 수신 순서로 움직인다', () => {
    const { result } = mount();
    act(() => result.current.setMode('recv'));
    const p0 = result.current.pos;
    expect(result.current.rec).toBe(session.recvOrder[p0]);
    key('ArrowRight');
    expect(result.current.rec).toBe(session.recvOrder[p0 + 1]);
  });
});

describe('useTickCursor — 재생', () => {
  it('1× = 다음 틱까지 실제 수신 간격(2초 상한) · 10× = 그 1/10', () => {
    vi.useFakeTimers();
    const { result } = mount();
    // 수신 간격이 1ms 이상인 수신순 자리를 찾는다
    act(() => result.current.setMode('recv'));
    let p = 0;
    while (recvMs(session.recvOrder[p + 1]!) - recvMs(session.recvOrder[p]!) < 5) p += 1;
    act(() => result.current.jumpToRec(session.recvOrder[p]!));
    const gap = Math.min(PLAY_MAX_GAP_MS, recvMs(session.recvOrder[p + 1]!) - recvMs(session.recvOrder[p]!));
    act(() => result.current.togglePlay());
    act(() => {
      vi.advanceTimersByTime(Math.max(0, gap - 2));
    });
    expect(result.current.pos).toBe(p);
    act(() => {
      vi.advanceTimersByTime(3);
    });
    expect(result.current.pos).toBe(p + 1);

    act(() => result.current.togglePlay());
    act(() => result.current.jumpToRec(session.recvOrder[p]!));
    act(() => result.current.setSpeed(10));
    act(() => result.current.togglePlay());
    act(() => {
      vi.advanceTimersByTime(gap / 10 + 1);
    });
    expect(result.current.pos).toBe(p + 1);
  });

  it('끝에 닿으면 정지', () => {
    vi.useFakeTimers();
    const { result } = mount();
    const last = session.exOrder.length - 1;
    act(() => result.current.jumpToRec(session.exOrder[last - 2]!));
    act(() => result.current.togglePlay());
    // 틱마다 효과가 다음 타이머를 건다 — act 한 번에 한 틱씩 흘린다.
    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(PLAY_MAX_GAP_MS + 5);
      });
    }
    expect(result.current.pos).toBe(last);
    expect(result.current.playing).toBe(false);
  });
});

describe('useTickCursor — 점프 · URL', () => {
  it('초기 = t 이후 첫 틱(수신순 lower_bound) · t 없으면 08:00 이후 첫 틱', () => {
    const a = mount('13:30:00.000');
    const t = parseTickTime('13:30:00.000', D)!;
    expect(session.index.recvNs[a.result.current.rec]! >= t).toBe(true);
    expect(session.index.recvNs[session.recvOrder[session.recvPos[a.result.current.rec]! - 1]!]! < t).toBe(true);
    const b = mount(null);
    expect(b.result.current.rec).toBe(session.recvOrder[0]);
  });

  it('「13:05:07.1」 → 그 시각 이후 첫 틱 · 잘못된 형식 → false · 커서 그대로', () => {
    const { result } = mount();
    let ok = false;
    act(() => {
      ok = result.current.jumpTo('13:05:07.1');
    });
    expect(ok).toBe(true);
    const r = result.current.rec;
    expect(session.index.recvNs[r]! >= parseTickTime('13:05:07.100', D)!).toBe(true);
    for (const bad of ['25:00:00', '13:5:07', 'abc', '13:05:07.1234']) {
      act(() => {
        ok = result.current.jumpTo(bad);
      });
      expect(ok).toBe(false);
      expect(result.current.rec).toBe(r);
    }
  });

  it('열기만 하면 URL 을 쓰지 않는다 · 키 연타는 250ms 스로틀(앞 1 + 뒤 1) · 히스토리 대신 replaceState', () => {
    vi.useFakeTimers();
    const { result } = mount();
    expect(replaceSpy).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i++) key('ArrowRight');
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(TICK_URL_THROTTLE_MS);
    });
    expect(replaceSpy).toHaveBeenCalledTimes(2);
    const last = replaceSpy.mock.calls[1]![2] as string;
    expect(last).toBe(
      `/analytics/ticks?isin=${ISIN}&d=${D}&t=${encodeURIComponent(fmtTickTime(session.index.recvNs[result.current.rec]!))}`,
    );
  });
});
