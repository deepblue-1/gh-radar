'use client';

import { useCallback, useRef, useState } from 'react';

import { clampView, presetOf, type ChartPreset, type View } from '@/lib/accum-chart';

/**
 * 매집감지 상세 차트 보기 창 상태 (Phase 34 · UI-SPEC A5 · A6 · D-14).
 *
 * - 원본 = 채택 목업 C(`reference/mockup-accum-chart.html`) JS 의 `state.view` · `state.vp` · `setView` · `preset`.
 *   코드 analog 없음(PATTERNS 「No Analog」).
 * - **훅이 아는 것은 시각뿐 — 픽셀 변환은 차트가 넘긴다.** 창 = epoch ms `{ t0, t1 }` · 하루 경계는 `price.t0_ms` 에서 온다.
 * - 기본 창 = 「전체」(09:00~20:00) · 프리셋 전환은 애니메이션 없이 즉시 · 모든 창은 `clampView`(최소 10분 · 09:00~20:00 안)를
 *   거친다.
 * - `apply` = 제스처 · 키보드 경로 — 창을 바꾸면 프리셋 셋 다 꺼진다(목업 `vp = null` · 창이 우연히 프리셋과 같아져도 켜지 않는다).
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
  /** 프리셋 창으로 즉시 바꾸고 그 프리셋을 켠다. */
  setPreset: (name: ChartPreset) => void;
  /** 현재 창에 변환을 적용(clampView 경유)하고 프리셋을 끈다. */
  apply: (fn: (v: View) => View) => void;
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

  const commit = useCallback((view: View, preset: ChartPreset | null) => {
    viewRef.current = view;
    setState({ view, preset });
  }, []);

  const setPreset = useCallback(
    (name: ChartPreset) => commit(presetOf(name, bounds, lastTradeMs), name),
    [bounds, lastTradeMs, commit],
  );

  const apply = useCallback(
    (fn: (v: View) => View) => commit(clampView(fn(viewRef.current), bounds.T0, bounds.T2000), null),
    [bounds, commit],
  );

  return { view: state.view, preset: state.preset, bounds, setPreset, apply };
}
