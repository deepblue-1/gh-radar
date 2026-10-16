'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { CHART_FALLBACK_W, chartWidthOf } from '@/lib/teamflow-chart';

/**
 * 차트 래퍼 폭 측정 (Phase 33 · UI-SPEC T6 · T8 · Pitfall 8) — `limitup-lane.tsx` 와 같은 문법.
 *
 * - 첫 페인트는 폴백 폭 640(`CHART_FALLBACK_W`) → `useLayoutEffect` 에서 `clientWidth` 를 읽어 즉시 다시 그린다.
 *   측정 0(jsdom · 숨은 요소)은 `chartWidthOf` 가 640 으로 흡수한다.
 * - `ResizeObserver` 가 있으면 폭이 바뀔 때마다 다시 읽고, 없으면 한 번만 읽는다 · 언마운트 때 disconnect.
 * - 차트는 이 폭을 viewBox 와 1:1 로 쓴다(11px 글자가 늘어나지 않는다).
 */
export function useChartWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(CHART_FALLBACK_W);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(chartWidthOf(el.clientWidth));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
