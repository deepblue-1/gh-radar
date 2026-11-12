'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ChartViewControl } from '@/hooks/use-chart-view';
import type { ChartPreset } from '@/lib/accum-chart';

/**
 * 보기 창 주고받기 (Phase 42 D-24 · UI-SPEC S1 · RESEARCH Pattern 5 · Pitfall 1 · 2 · 3) — 선 차트 · 봉 차트 공용.
 *
 * - 훅 `useChartView` 는 고치지 않는다 — 마운트 effect 로 적용한다(초기 상태는 늘 「전체」).
 * - 받은 창은 마운트 때 한 번만 쓴다. 「전체」 프리셋이면 이름으로 받고 아무것도 안 한다(기본이 「전체」 라 당일 화면에서
 *   새 틱을 따라 늘어나는 동작이 그대로). 숫자 창은 `schedule` 이 받는 차트의 최소 창 · 하루 경계로 자른다(`clampView`).
 * - 반영 전에는 알리지 않는다(기억한 창을 하루 전체로 덮어쓰지 않게) · 반영 전에는 `pending` 으로 svg 를 숨겨
 *   하루 전체가 한 프레임 비치지 않게 한다.
 * - StrictMode(개발 모드) 가상 해제는 `useChartView` 정리가 예약 프레임을 버린다 — 반영 전에 해제됐으면 다시 붙을 때 한 번
 *   더 예약한다(실제 적용은 한 번).
 */

/** 보기 창 한 장 — `preset` 이 켜져 있으면 받는 쪽은 숫자 대신 그 프리셋을 쓴다. */
export interface ChartViewSnap {
  t0: number;
  t1: number;
  preset: ChartPreset | null;
}

export function useViewSync(
  ctl: ChartViewControl,
  initialView?: ChartViewSnap,
  onViewChange?: (v: ChartViewSnap) => void,
): { pending: boolean } {
  /** 마운트 때 값만 — 그 뒤 바뀌어도 다시 적용하지 않는다. */
  const initRef = useRef(initialView);
  const [pending, setPending] = useState(() => {
    const iv = initRef.current;
    return iv != null && iv.preset !== 'full';
  });
  /** 마운트 때 창(「전체」) — 이것과 달라지면 반영된 것이다. */
  const firstViewRef = useRef(ctl.view);
  /** 적용 한 번 표시(StrictMode 이중 실행 방어) · 반영 완료 표시. */
  const appliedRef = useRef(false);
  const doneRef = useRef(false);

  useLayoutEffect(() => {
    const iv = initRef.current;
    if (appliedRef.current || iv == null || iv.preset === 'full') return;
    appliedRef.current = true;
    if (iv.preset !== null) {
      ctl.setPreset(iv.preset); // 동기 commit
      return;
    }
    // false = 이미 같은 창(반영할 것 없음)
    if (!ctl.schedule(() => ({ t0: iv.t0, t1: iv.t1 }))) {
      setPending(false);
      return;
    }
    return () => {
      // 반영 전 해제(StrictMode 가상 해제) — 예약 프레임이 버려졌으니 다시 붙을 때 다시 예약한다
      if (!doneRef.current) appliedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 때 한 번만
  }, []);

  useEffect(() => {
    if (pending && ctl.view !== firstViewRef.current) {
      doneRef.current = true;
      setPending(false);
    }
  }, [pending, ctl.view]);

  useEffect(() => {
    if (!onViewChange || pending) return;
    onViewChange({ t0: ctl.view.t0, t1: ctl.view.t1, preset: ctl.preset });
  }, [ctl.view, ctl.preset, onViewChange, pending]);

  return { pending };
}
