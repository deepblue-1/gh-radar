'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

import { MIN_VIEW_MS, clampView, panBy, presetOf, zoomAt, type ChartPreset, type View } from '@/lib/accum-chart';

/**
 * 매집감지 상세 차트 보기 창 — 상태 · 프리셋 · 휠 · 끌기 · 핀치 · 키보드 (Phase 34 · UI-SPEC A5 · A6 · D-14 · Discretion 7 · 8).
 *
 * - 원본 = 채택 목업 C(`reference/mockup-accum-chart.html`) JS 의 `state.view` · `state.vp` · `setView` · `preset` · `tAt` ·
 *   wheel · pointerdown/move/up. 코드 analog 없음(PATTERNS 「No Analog」).
 * - **훅이 아는 것은 시각뿐 — 픽셀 변환은 차트가 넘긴다**(`useChartGestures` 의 `geom` = 가격 축 폭 L · viewBox 폭 W).
 *   창 = epoch ms `{ t0, t1 }` · 하루 경계는 `price.t0_ms` 에서 온다 · 모든 창은 `clampView`(최소 10분 · 09:00~20:00 안).
 * - 기본 창 = 「전체」. 프리셋 전환은 애니메이션 없이 즉시. 휠 · 끌기 · 키보드로 창을 바꾸면 프리셋 셋 다 꺼진다
 *   (목업 `vp = null` — 창이 우연히 프리셋과 같아져도 켜지 않는다).
 * - **rAF 합치기:** 휠 · 포인터 · 키 이벤트는 `schedule` 로 대기 창에 합성되고 프레임당 한 번만 setState 한다(트랙패드 관성 휠이
 *   프레임마다 수십 번 와도 SVG 는 한 번 그린다). rAF 가 없으면 setTimeout 16ms.
 * - **넘김 규칙(Discretion 7):** 창이 바뀌지 않는 일반 휠(전체 창에서 더 축소 · 10분 창에서 더 확대 · 끝에서 더 이동)은
 *   preventDefault 하지 않아 페이지 스크롤로 넘어간다. ctrlKey 휠(맥 트랙패드 핀치)은 넘기면 브라우저가 페이지를 확대하므로
 *   늘 preventDefault.
 * - **휠은 네이티브 리스너 `{ passive: false }`**(React onWheel 은 passive 라 preventDefault 가 안 먹는다 — Pitfall 11).
 * - **끌기 · 핀치 = Pointer Events + setPointerCapture.** 포인터 1개 = 좌우 이동 · 2개 = 두 점 거리 비로 확대하면서 손가락
 *   중점 아래 시각을 중점에 붙인다. pointerup · pointercancel(폰에서 브라우저가 세로 스크롤을 가져갈 때 — Pitfall 12) ·
 *   lostpointercapture 에서 푼다. SVG 의 `touch-action: pan-y` 는 차트가 단다.
 */

export interface ChartBounds {
  T0: number;
  T1530: number;
  T2000: number;
}

export interface ChartViewControl {
  view: View;
  /** 켜진 프리셋 — 휠 · 끌기 · 키보드로 창을 바꾸면 null */
  preset: ChartPreset | null;
  bounds: ChartBounds;
  /** 프리셋 창으로 즉시 바꾸고 그 프리셋을 켠다(대기 중인 제스처 프레임은 버린다). */
  setPreset: (name: ChartPreset) => void;
  /** 현재 창에 변환을 즉시 적용(clampView 경유)하고 프리셋을 끈다. */
  apply: (fn: (v: View) => View) => void;
  /** 다음 프레임에 창 변환을 예약(대기 창에 합성) — 창이 바뀌지 않으면 false(호출 쪽이 이벤트를 넘긴다). */
  schedule: (fn: (v: View) => View) => boolean;
  /** 차트 래퍼 키보드 — ← / → 창 폭 20% 이동 · + / = ×0.5 · − / _ ×2 · 0 「전체」 · 처리한 키만 preventDefault. */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

/** 키 이동 비율 · 휠 확대 계수 · 휠 deltaMode(줄 · 쪽) → 픽셀. */
const KEY_PAN = 0.2;
const WHEEL_K = 0.0015;
const LINE_PX = 16;
const PAGE_PX = 400;
/** 이 차이(ms) 안이면 같은 창 — zoomAt 부동소수 오차로 「바뀜」 판정이 나지 않게. */
const SAME_EPS_MS = 1;

const sameView = (a: View, b: View) => Math.abs(a.t0 - b.t0) < SAME_EPS_MS && Math.abs(a.t1 - b.t1) < SAME_EPS_MS;

/**
 * tc 기준 k 배 확대/축소 — 폭은 [10분, 하루] 로 먼저 자른 정확한 값(10분 창에서 더 확대해도 창이 옆으로 밀리지 않고
 * 「변화 없음」 이 되어 휠이 페이지로 넘어간다).
 */
function zoomView(v: View, tc: number, k: number, b: ChartBounds): View {
  const span = v.t1 - v.t0;
  const w = Math.min(b.T2000 - b.T0, Math.max(MIN_VIEW_MS, span * k));
  const z = zoomAt(v, tc, w / span);
  return { t0: z.t0, t1: z.t0 + w };
}

type FrameHandle = { kind: 'raf' | 'timeout'; id: number };

function requestFrame(cb: () => void): FrameHandle {
  if (typeof requestAnimationFrame === 'function') return { kind: 'raf', id: requestAnimationFrame(() => cb()) };
  return { kind: 'timeout', id: setTimeout(cb, 16) as unknown as number };
}

function cancelFrame(h: FrameHandle) {
  if (h.kind === 'raf') {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(h.id);
  } else clearTimeout(h.id);
}

export function useChartView({
  bounds,
  lastTradeMs,
}: {
  bounds: ChartBounds;
  lastTradeMs: number | null;
}): ChartViewControl {
  const [state, setState] = useState<{ view: View; preset: ChartPreset | null }>(() => ({
    view: presetOf('full', bounds, lastTradeMs),
    preset: 'full',
  }));
  /** 핸들러가 렌더를 기다리지 않고 최신 창을 읽는 거울(setter 안에서만 쓴다). */
  const viewRef = useRef(state.view);
  /** 다음 프레임에 그릴 대기 창 · 예약 핸들(null = 예약 없음 · 'pending' = 동기 rAF 폴리필 대비 예약 중 표시). */
  const pendingRef = useRef<View | null>(null);
  const frameRef = useRef<FrameHandle | 'pending' | null>(null);
  const aliveRef = useRef(true);

  const commit = useCallback((view: View, preset: ChartPreset | null) => {
    viewRef.current = view;
    setState({ view, preset });
  }, []);

  const dropPending = useCallback(() => {
    pendingRef.current = null;
    const f = frameRef.current;
    if (f !== null && f !== 'pending') cancelFrame(f);
    frameRef.current = null;
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      dropPending();
    };
  }, [dropPending]);

  const setPreset = useCallback(
    (name: ChartPreset) => {
      dropPending();
      commit(presetOf(name, bounds, lastTradeMs), name);
    },
    [bounds, lastTradeMs, commit, dropPending],
  );

  const apply = useCallback(
    (fn: (v: View) => View) => {
      dropPending();
      commit(clampView(fn(viewRef.current), bounds.T0, bounds.T2000), null);
    },
    [bounds, commit, dropPending],
  );

  const flush = useCallback(() => {
    frameRef.current = null;
    const next = pendingRef.current;
    pendingRef.current = null;
    if (next !== null && aliveRef.current) commit(next, null);
  }, [commit]);

  const schedule = useCallback(
    (fn: (v: View) => View) => {
      const base = pendingRef.current ?? viewRef.current;
      const next = clampView(fn(base), bounds.T0, bounds.T2000);
      if (sameView(next, base)) return false;
      pendingRef.current = next;
      if (frameRef.current === null) {
        frameRef.current = 'pending';
        const h = requestFrame(flush);
        // 동기 rAF(테스트 폴리필)면 flush 가 이미 null 로 돌려놓았다
        if (frameRef.current === 'pending') frameRef.current = h;
      }
      return true;
    },
    [bounds, flush],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return; // 브라우저 확대(⌘ = · ⌘ 0) 등 단축키는 넘긴다
      const center = (v: View) => (v.t0 + v.t1) / 2;
      switch (e.key) {
        case 'ArrowLeft':
          schedule((v) => panBy(v, -(v.t1 - v.t0) * KEY_PAN));
          break;
        case 'ArrowRight':
          schedule((v) => panBy(v, (v.t1 - v.t0) * KEY_PAN));
          break;
        case '+':
        case '=':
          schedule((v) => zoomView(v, center(v), 0.5, bounds));
          break;
        case '-':
        case '_':
        case '−':
          schedule((v) => zoomView(v, center(v), 2, bounds));
          break;
        case '0':
          setPreset('full');
          break;
        default:
          return;
      }
      e.preventDefault();
    },
    [bounds, schedule, setPreset],
  );

  return { view: state.view, preset: state.preset, bounds, setPreset, apply, schedule, onKeyDown };
}

/** 차트 그림 영역 기하 — L = 왼쪽 가격 축 폭 · W = viewBox 폭(측정 폭 1:1) · 그림 영역 = [L, W − 56]. */
export interface ChartGeom {
  L: number;
  W: number;
  /** 오른쪽 축 폭(ACCUM_CHART.R) */
  R: number;
}

/**
 * SVG 에 휠 · 포인터 리스너를 단다. `ctl` 이 null 이면 아무것도 달지 않는다(정적 차트).
 * 반환 `dragging` = 포인터가 눌린 동안 true(커서 grab → grabbing).
 */
export function useChartGestures(
  svgRef: RefObject<SVGSVGElement | null>,
  geom: ChartGeom,
  ctl: ChartViewControl | null,
): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  const geomRef = useRef(geom);
  const ctlRef = useRef(ctl);
  useLayoutEffect(() => {
    geomRef.current = geom;
    ctlRef.current = ctl;
  });
  const enabled = ctl !== null;

  useEffect(() => {
    const el = svgRef.current;
    if (!el || !enabled) return;

    /** 화면 x(clientX) → 그림 영역 비율(0 = 왼쪽 끝 L · 1 = 오른쪽 끝 W − R). */
    const fracAt = (clientX: number) => {
      const { L, W, R } = geomRef.current;
      const rect = el.getBoundingClientRect();
      const scale = rect.width > 0 ? W / rect.width : 1;
      return ((clientX - rect.left) * scale - L) / (W - L - R);
    };
    /** 화면 픽셀 거리 → 창 폭 비율. */
    const fracOfPx = (px: number) => {
      const { L, W, R } = geomRef.current;
      const rect = el.getBoundingClientRect();
      const scale = rect.width > 0 ? W / rect.width : 1;
      return (px * scale) / (W - L - R);
    };

    const onWheel = (e: WheelEvent) => {
      const c = ctlRef.current;
      if (!c) return;
      const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const changed =
        Math.abs(dx) > Math.abs(dy)
          ? c.schedule((v) => panBy(v, fracOfPx(dx) * (v.t1 - v.t0)))
          : c.schedule((v) => {
              const tc = v.t0 + fracAt(e.clientX) * (v.t1 - v.t0);
              return zoomView(v, tc, Math.exp(dy * WHEEL_K), c.bounds);
            });
      if (changed || e.ctrlKey) e.preventDefault();
    };

    /** 활성 포인터 id → clientX. */
    const pointers = new Map<number, number>();
    const pair = () => {
      const xs = [...pointers.values()];
      return { dist: Math.abs(xs[1]! - xs[0]!), mid: (xs[0]! + xs[1]!) / 2 };
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, e.clientX);
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        // 이미 풀린 포인터 — 캡처 없이도 끌기는 된다
      }
      setDragging(true);
    };

    const onMove = (e: PointerEvent) => {
      const c = ctlRef.current;
      const prevX = pointers.get(e.pointerId);
      if (!c || prevX === undefined) return;
      if (pointers.size >= 2) {
        const before = pair();
        pointers.set(e.pointerId, e.clientX);
        const after = pair();
        if (before.dist <= 0 || after.dist <= 0) return;
        const fPrev = fracAt(before.mid);
        const fCur = fracAt(after.mid);
        c.schedule((v) => {
          // 손가락 중점 아래 시각(tA)을 기준으로 거리 비만큼 확대한 뒤, tA 를 새 중점 자리로 옮긴다
          const tA = v.t0 + fPrev * (v.t1 - v.t0);
          const z = zoomView(v, tA, before.dist / after.dist, c.bounds);
          return panBy(z, (fPrev - fCur) * (z.t1 - z.t0));
        });
        return;
      }
      pointers.set(e.pointerId, e.clientX);
      const dx = e.clientX - prevX;
      if (dx !== 0) c.schedule((v) => panBy(v, -fracOfPx(dx) * (v.t1 - v.t0)));
    };

    const onEnd = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size === 0) setDragging(false);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
    el.addEventListener('lostpointercapture', onEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
      el.removeEventListener('lostpointercapture', onEnd);
    };
  }, [svgRef, enabled]);

  return { dragging };
}
