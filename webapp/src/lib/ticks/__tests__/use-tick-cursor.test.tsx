import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { fmtTickTime, iterRecords, parseTickTime } from '@gh-radar/shared';

import { TICK_FIXTURE_DATE as D, TICK_FIXTURE_ISIN as ISIN, tickGridBytes } from '@/test-fixtures/tick-grid';

import { noteRouterTransitionStart } from '@/lib/router-transition';

// 이동 커밋 흉내(R3-IN-04) — 기본 null(앱 라우터 밖 · 실제 Next 와 같음). 시험이 값을 바꾸고 rerender 하면 커밋이 실린 것.
const nav = vi.hoisted(() => ({ search: null as URLSearchParams | null }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => nav.search,
}));

import { buildTickSession } from '../tick-session';
import { tickUrlOf } from '../tick-url';
import {
  PLAY_MAX_GAP_MS,
  TICK_URL_THROTTLE_MS,
  endRecOf,
  initialRecOf,
  isSameTickOpenKey,
  teamJumpRec,
  tickUrlPosOf,
  useTickCursor,
} from '../use-tick-cursor';

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
  nav.search = null;
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

  it('Shift+] = 다음 팀 주문의 첫 A3 조각 · Shift+[ = 이전 팀 주문의 첫 조각 · 같은 주문 조각은 건너뛴다 · 없으면 제자리 · 맨 [ ] 는 무시', () => {
    // 오라클 — 거래소순으로 팀 A3 조각을 훑어 주문마다 첫 조각 자리.
    const firsts: number[] = [];
    const seen = new Set<number>();
    session.exOrder.forEach((r, p) => {
      if (session.teamOfRec[r] !== 1 || session.a3Of[r]! < 0) return;
      const o = session.orderOfRec[r]!;
      if (!seen.has(o)) firsts.push(p);
      seen.add(o);
    });
    expect(firsts.length).toBeGreaterThan(2);
    const next = () => key('}', { code: 'BracketRight', shiftKey: true });
    const prev = () => key('{', { code: 'BracketLeft', shiftKey: true });
    const { result } = mount();
    act(() => result.current.jumpToRec(session.exOrder[0]!));
    key(']', { code: 'BracketRight' });
    expect(result.current.pos).toBe(0);
    next();
    expect(result.current.pos).toBe(firsts[0]);
    next();
    expect(result.current.pos).toBe(firsts[1]);
    next();
    expect(result.current.pos).toBe(firsts[2]);
    prev();
    expect(result.current.pos).toBe(firsts[1]);
    act(() => result.current.jumpToRec(session.exOrder[firsts.at(-1)!]!));
    next();
    expect(result.current.pos).toBe(firsts.at(-1));
    act(() => result.current.jumpToRec(session.exOrder[0]!));
    prev();
    expect(result.current.pos).toBe(0);
  });

  it('teamJumpRec — 모든 팀 주문 첫 조각을 차례로 밟는다(앞으로 · 뒤로)', () => {
    const firsts: number[] = [];
    const seen = new Set<number>();
    session.exOrder.forEach((r, p) => {
      if (session.teamOfRec[r] !== 1 || session.a3Of[r]! < 0) return;
      const o = session.orderOfRec[r]!;
      if (!seen.has(o)) firsts.push(session.exOrder[p]!);
      seen.add(o);
    });
    const fwd: number[] = [];
    for (let r = teamJumpRec(session, 'exchange', session.exOrder[0]!, 1); r >= 0; r = teamJumpRec(session, 'exchange', r, 1)) fwd.push(r);
    const bwd: number[] = [];
    const end = session.exOrder[session.exOrder.length - 1]!;
    for (let r = teamJumpRec(session, 'exchange', end, -1); r >= 0; r = teamJumpRec(session, 'exchange', r, -1)) bwd.push(r);
    expect(fwd).toEqual(firsts);
    expect(bwd.reverse()).toEqual(firsts);
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
    expect(last).toBe(tickUrlOf({ ...URL_STATE, ...tickUrlPosOf(session, result.current.rec) }));
    expect(last).toContain(`t=${encodeURIComponent(fmtTickTime(session.index.recvNs[result.current.rec]!))}`);
  });

  describe('이동 대기 중에는 URL 을 쓰지 않는다 — Next 가 대기 이동을 RESTORE 로 버리지 않게(WR-60 · R2-WR-30)', () => {
    const VIEWER = tickUrlOf(URL_STATE);
    const LIST = tickUrlOf({ d: D, ex: 'KRX' });
    /** 테스트가 주소를 옮긴다(Next 커밋 흉내) — 스파이 호출 수에서 뺀다. */
    const goTo = (href: string) => {
      window.history.replaceState(null, '', href);
      replaceSpy.mockClear();
    };
    const tick = (ms = TICK_URL_THROTTLE_MS * 4) =>
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    beforeEach(() => {
      vi.useFakeTimers();
      goTo(VIEWER);
    });
    afterEach(() => goTo('/'));

    it('다른 화면으로 가는 이동(사이드바 Link · go) → 대기 타이머 · 새 커서 · 커밋 뒤에도 쓰지 않는다', () => {
      mount();
      key('ArrowRight');
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      key('ArrowRight'); // 250ms 안 — 대기 타이머
      act(() => noteRouterTransitionStart('/', 'push'));
      tick();
      key('ArrowRight');
      tick();
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      goTo('/'); // 이동이 커밋됐다(뷰어가 내려가기 전 한 틈)
      key('ArrowRight');
      tick();
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe('/');
    });

    it('뒤로(traverse)로 목록 항목에 섰다 → 그 항목을 뷰어 URL 로 덮지 않는다', () => {
      mount();
      key('ArrowRight');
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      goTo(LIST); // popstate — 브라우저 현재 항목이 이미 목록
      act(() => noteRouterTransitionStart(window.location.href, 'traverse'));
      for (let i = 0; i < 5; i++) {
        key('ArrowRight');
        tick(TICK_URL_THROTTLE_MS);
      }
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(window.location.href).toBe(new URL(LIST, window.location.href).href);
    });

    it('같은 열기 키로 가는 이동은 끝날 때까지 기다렸다가(주소가 바뀜) 다시 쓴다', () => {
      const { result } = mount();
      key('ArrowRight');
      const target = tickUrlOf({ ...URL_STATE, t: '13:30:00.000' });
      act(() => noteRouterTransitionStart(target, 'push'));
      replaceSpy.mockClear();
      key('ArrowRight');
      tick();
      expect(replaceSpy).not.toHaveBeenCalled(); // 아직 대기 — 주소가 그대로
      goTo(target); // 커밋
      key('ArrowRight');
      tick();
      expect(replaceSpy).toHaveBeenCalled();
      expect(replaceSpy.mock.calls.at(-1)![2]).toBe(tickUrlOf({ ...URL_STATE, ...tickUrlPosOf(session, result.current.rec) }));
    });

    it('같은 열기 키로 가는 이동이 커밋되면 커서가 그대로여도 막혔던 쓰기를 한 번 다시 한다 — URL t 가 옛 자리에 머물지 않는다(R3-IN-04)', () => {
      const { result, rerender } = mount();
      key('ArrowRight');
      const target = tickUrlOf(URL_STATE); // 지금 날짜 칩 다시 누름 — t 없는 같은 키
      act(() => noteRouterTransitionStart(target, 'push'));
      replaceSpy.mockClear();
      key('ArrowRight'); // 이동 중 한 번 옮기고 그대로 둔다
      tick();
      expect(replaceSpy).not.toHaveBeenCalled(); // 대기 — 주소가 그대로
      goTo(target); // 커밋
      nav.search = new URL(target, window.location.href).searchParams;
      rerender();
      tick();
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      expect(replaceSpy.mock.calls[0]![2]).toBe(tickUrlOf({ ...URL_STATE, ...tickUrlPosOf(session, result.current.rec) }));
      // 우리 쓰기가 searchParams 를 또 바꿔도(Next 동기화) 막힌 쓰기가 없으니 더 쓰지 않는다
      nav.search = new URL(window.location.href).searchParams;
      rerender();
      tick();
      expect(replaceSpy).toHaveBeenCalledTimes(1);
    });

    it('다른 화면으로 가는 이동이 커밋돼도(searchParams 변화) 쓰지 않는다 — 막힌 쓰기는 그대로 막힌다(R3-IN-04)', () => {
      const { rerender } = mount();
      key('ArrowRight');
      key('ArrowRight'); // 대기 타이머
      act(() => noteRouterTransitionStart('/', 'push'));
      replaceSpy.mockClear();
      goTo('/?x=1');
      nav.search = new URLSearchParams('x=1');
      rerender();
      tick();
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it('같은 열기 키의 뒤로/앞으로 · 다른 키로 가던 이동을 덮고 이 키로 돌아옴 → 다시 쓴다', () => {
      mount();
      key('ArrowRight');
      act(() => noteRouterTransitionStart(window.location.href, 'traverse')); // 같은 키 항목 — 버려져도 결과가 같다
      replaceSpy.mockClear();
      key('ArrowRight');
      tick();
      expect(replaceSpy).toHaveBeenCalledTimes(1);

      act(() => noteRouterTransitionStart('/', 'push')); // 다른 화면으로 — 멈춤
      key('ArrowRight');
      tick();
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      goTo(tickUrlOf({ ...URL_STATE, t: '13:00:00.000' })); // 그 이동이 덮이고 이 키로 돌아왔다
      key('ArrowRight');
      tick();
      expect(replaceSpy).toHaveBeenCalledTimes(1);
    });

    it('언마운트하면 구독을 푼다 — 뒤의 이동 신호가 예외 없이 지나간다', () => {
      const { unmount } = mount();
      unmount();
      expect(() => noteRouterTransitionStart('/', 'push')).not.toThrow();
    });
  });

  it('당일 — 대기 타이머 중 증분 세션(끝 따라감)이 와도 예외 0 · 끝 틱이라 URL 에 t 없음(WR-61)', () => {
    vi.useFakeTimers();
    const raw = tickGridBytes();
    let cut = raw.length;
    let i = 0;
    for (const r of iterRecords(raw)) {
      if (i === 6_000) {
        cut = r.off - 16;
        break;
      }
      i += 1;
    }
    const a = buildTickSession(raw.subarray(0, cut), { date: D, ex: 'KRX', isin: ISIN });
    const b = buildTickSession(raw, { date: D, ex: 'KRX', isin: ISIN });
    const hook = renderHook((p: { s: typeof a }) => useTickCursor(p.s, { initialT: null, urlState: URL_STATE, live: true }), {
      initialProps: { s: a },
    });
    expect(hook.result.current.rec).toBe(endRecOf(a));
    key('ArrowLeft'); // 바로 씀 — t 붙음
    expect(new URL(window.location.href).searchParams.has('t')).toBe(true);
    key('ArrowRight'); // 250ms 안 — 끝 틱 쓰기는 대기 타이머
    hook.rerender({ s: b }); // 증분 — 끝이었으니 새 끝으로 따라간다
    expect(hook.result.current.rec).toBe(endRecOf(b));
    expect(() =>
      act(() => {
        vi.advanceTimersByTime(TICK_URL_THROTTLE_MS);
      }),
    ).not.toThrow();
    expect(new URL(window.location.href).searchParams.has('t')).toBe(false);
  });

  it('버스트 — 한 ms 안 여러 틱도 URL(t + k)로 같은 틱에 돌아온다 · 거래소순 · 수신순 모두(WR-65)', () => {
    // 픽스처에서 같은 ms 에 틱이 여럿인 자리(k ≥ 1)를 모두 왕복한다
    let checked = 0;
    for (let p = 1; p < session.recvOrder.length; p++) {
      const rec = session.recvOrder[p]!;
      const pos = tickUrlPosOf(session, rec);
      if (pos.k === null) continue;
      expect(initialRecOf(session, pos.t, false, pos.k)).toBe(rec);
      expect(initialRecOf(session, pos.t, true, pos.k)).toBe(rec);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
    // k 가 같은 ms 를 넘으면(손으로 고친 링크) 그 ms 첫 틱
    const first = session.recvOrder[0]!;
    const t0 = tickUrlPosOf(session, first).t;
    expect(initialRecOf(session, t0, false, 999_999)).toBe(initialRecOf(session, t0, false, null));
  });

  it('버스트 조각에서 쓴 URL 을 다시 열면 같은 rec(t 만 쓰던 옛 동작은 같은 ms 첫 틱으로 밀렸다 · WR-65)', () => {
    vi.useFakeTimers();
    let target = -1;
    for (let p = 1; p < session.recvOrder.length && target < 0; p++) {
      const rec = session.recvOrder[p]!;
      if (tickUrlPosOf(session, rec).k !== null) target = rec;
    }
    expect(target).toBeGreaterThanOrEqual(0);
    const { result } = mount();
    act(() => result.current.jumpToRec(target));
    const url = new URL(String(replaceSpy.mock.calls.at(-1)![2]), 'http://x');
    const k = url.searchParams.get('k');
    expect(k).not.toBeNull();
    const again = renderHook(() =>
      useTickCursor(session, { initialT: url.searchParams.get('t'), initialK: Number(k), urlState: URL_STATE }),
    );
    expect(again.result.current.rec).toBe(target);
  });
});

describe('isSameTickOpenKey (R2-WR-30)', () => {
  it('경로 · isin · d · ex 가 같으면 t · k · 순서와 무관하게 같은 키 · 하나라도 다르면 아님', () => {
    const base = `http://h${tickUrlOf(URL_STATE)}`;
    expect(isSameTickOpenKey(base, URL_STATE)).toBe(true);
    expect(isSameTickOpenKey(`${base}&t=13:00:00.000&k=2`, URL_STATE)).toBe(true);
    expect(isSameTickOpenKey(`/analytics/ticks?d=${D}&isin=${ISIN}&ex=KRX`, URL_STATE)).toBe(true);
    expect(isSameTickOpenKey(`/analytics/ticks?d=${D}`, URL_STATE)).toBe(false);
    expect(isSameTickOpenKey(`/analytics/ticks?isin=${ISIN}&d=${D}&ex=NXT`, URL_STATE)).toBe(false);
    expect(isSameTickOpenKey(`/analytics/ticks?isin=${ISIN}&d=20261015`, URL_STATE)).toBe(false);
    expect(isSameTickOpenKey('/', URL_STATE)).toBe(false);
  });
});
